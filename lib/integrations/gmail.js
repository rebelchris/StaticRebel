/**
 * Gmail Integration for StaticRebel
 * Full Gmail API integration with OAuth2, email operations, and watch functionality
 */

import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import https from 'https';
import http from 'http';
import { google } from 'googleapis';
import { loadConfig, saveConfig } from '../configManager.js';
import chalk from 'chalk';

const GMAIL_CONFIG_KEY = 'gmail_settings';
const GMAIL_CREDENTIALS_PATH = path.join(process.cwd(), 'config', 'gmail_credentials.json');
const GMAIL_TOKEN_PATH = path.join(process.cwd(), 'config', 'gmail_token.json');

// Gmail API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels'
];

export class GmailService {
  constructor() {
    this.auth = null;
    this.gmail = null;
    this.config = null;
    this.isAuthenticated = false;
  }

  async loadConfig() {
    const config = await loadConfig();
    this.config = config[GMAIL_CONFIG_KEY] || {};
  }

  async saveConfig(gmailConfig) {
    const config = await loadConfig();
    config[GMAIL_CONFIG_KEY] = gmailConfig;
    await saveConfig(config);
    this.config = gmailConfig;
  }

  isConfigured() {
    return fs.existsSync(GMAIL_CREDENTIALS_PATH) && fs.existsSync(GMAIL_TOKEN_PATH);
  }

  async authenticate() {
    if (this.isAuthenticated && this.auth && this.gmail) {
      return true;
    }

    try {
      // Load client credentials
      if (!fs.existsSync(GMAIL_CREDENTIALS_PATH)) {
        throw new Error('Gmail credentials not found. Please run setup first.');
      }

      const credentials = JSON.parse(await fsPromises.readFile(GMAIL_CREDENTIALS_PATH, 'utf8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

      this.auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      // Load access token
      if (!fs.existsSync(GMAIL_TOKEN_PATH)) {
        throw new Error('Gmail token not found. Please run setup first.');
      }

      const token = JSON.parse(await fsPromises.readFile(GMAIL_TOKEN_PATH, 'utf8'));
      this.auth.setCredentials(token);

      // Refresh token if needed
      if (this.auth.isTokenExpiring()) {
        const { credentials: newCredentials } = await this.auth.refreshAccessToken();
        this.auth.setCredentials(newCredentials);
        await fsPromises.writeFile(GMAIL_TOKEN_PATH, JSON.stringify(newCredentials, null, 2));
      }

      this.gmail = google.gmail({ version: 'v1', auth: this.auth });
      this.isAuthenticated = true;
      return true;

    } catch (error) {
      console.error('Gmail authentication failed:', error.message);
      this.isAuthenticated = false;
      return false;
    }
  }

  async setupOAuth(credentialsPath) {
    try {
      // Create config directory if it doesn't exist
      const configDir = path.dirname(GMAIL_CREDENTIALS_PATH);
      if (!fs.existsSync(configDir)) {
        await fsPromises.mkdir(configDir, { recursive: true });
      }

      // Copy credentials file
      if (credentialsPath && fs.existsSync(credentialsPath)) {
        await fsPromises.copyFile(credentialsPath, GMAIL_CREDENTIALS_PATH);
      } else if (!fs.existsSync(GMAIL_CREDENTIALS_PATH)) {
        throw new Error('Credentials file required for setup');
      }

      // Load credentials
      const credentials = JSON.parse(await fsPromises.readFile(GMAIL_CREDENTIALS_PATH, 'utf8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

      this.auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      // Generate auth URL
      const authUrl = this.auth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
      });

      console.log('\n' + chalk.blue('Gmail OAuth Setup'));
      console.log('='.repeat(50));
      console.log(chalk.yellow('\n1. Open this URL in your browser:'));
      console.log(chalk.cyan(authUrl));
      console.log(chalk.yellow('\n2. Complete the authorization process'));
      console.log(chalk.yellow('3. Copy the authorization code from the URL or callback page'));

      return authUrl;

    } catch (error) {
      throw new Error(`OAuth setup failed: ${error.message}`);
    }
  }

  async completeOAuth(code) {
    try {
      if (!this.auth) {
        throw new Error('OAuth not initialized. Run setup first.');
      }

      const { tokens } = await this.auth.getToken(code);
      this.auth.setCredentials(tokens);

      // Save tokens
      await fsPromises.writeFile(GMAIL_TOKEN_PATH, JSON.stringify(tokens, null, 2));

      // Test authentication
      this.gmail = google.gmail({ version: 'v1', auth: this.auth });
      const profile = await this.gmail.users.getProfile({ userId: 'me' });

      this.isAuthenticated = true;

      // Save config
      await this.saveConfig({
        email: profile.data.emailAddress,
        setupDate: new Date().toISOString(),
        totalMessages: profile.data.messagesTotal,
        threadsTotal: profile.data.threadsTotal
      });

      return {
        success: true,
        email: profile.data.emailAddress,
        messagesTotal: profile.data.messagesTotal
      };

    } catch (error) {
      throw new Error(`OAuth completion failed: ${error.message}`);
    }
  }

  async getProfile() {
    await this.authenticate();
    try {
      const response = await this.gmail.users.getProfile({ userId: 'me' });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get profile: ${error.message}`);
    }
  }

  async listMessages(options = {}) {
    await this.authenticate();
    
    const query = {
      userId: 'me',
      maxResults: options.maxResults || 10,
      q: options.query || '',
      labelIds: options.labelIds || undefined,
      includeSpamTrash: options.includeSpamTrash || false,
    };

    try {
      const response = await this.gmail.users.messages.list(query);
      const messages = response.data.messages || [];

      // Get full message details if requested
      if (options.includeDetails && messages.length > 0) {
        const detailedMessages = await Promise.all(
          messages.map(async (message) => {
            const detail = await this.getMessage(message.id);
            return detail;
          })
        );
        return detailedMessages;
      }

      return messages;
    } catch (error) {
      throw new Error(`Failed to list messages: ${error.message}`);
    }
  }

  async getMessage(messageId) {
    await this.authenticate();
    
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      
      // Extract useful information
      const headers = message.payload.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const from = headers.find(h => h.name === 'From')?.value || 'unknown';
      const to = headers.find(h => h.name === 'To')?.value || 'unknown';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      
      // Extract body
      let body = '';
      if (message.payload.body.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString();
      } else if (message.payload.parts) {
        const textPart = message.payload.parts.find(part => 
          part.mimeType === 'text/plain' || part.mimeType === 'text/html'
        );
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString();
        }
      }

      return {
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds,
        snippet: message.snippet,
        subject,
        from,
        to,
        date,
        body: body.substring(0, 2000), // Truncate for safety
        sizeEstimate: message.sizeEstimate,
        unread: message.labelIds?.includes('UNREAD') || false
      };

    } catch (error) {
      throw new Error(`Failed to get message: ${error.message}`);
    }
  }

  async searchMessages(query, maxResults = 10) {
    return this.listMessages({
      query,
      maxResults,
      includeDetails: true
    });
  }

  async getUnreadMessages(maxResults = 20) {
    return this.listMessages({
      query: 'is:unread',
      maxResults,
      includeDetails: true
    });
  }

  async sendMessage(to, subject, body, options = {}) {
    await this.authenticate();

    try {
      const profile = await this.getProfile();
      const fromEmail = profile.emailAddress;

      // Create email content
      const email = [
        `From: ${fromEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        body
      ].join('\r\n');

      // Encode email
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const request = {
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
          threadId: options.threadId || undefined
        }
      };

      const response = await this.gmail.users.messages.send(request);
      return {
        id: response.data.id,
        threadId: response.data.threadId,
        labelIds: response.data.labelIds
      };

    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  async createDraft(to, subject, body) {
    await this.authenticate();

    try {
      const profile = await this.getProfile();
      const fromEmail = profile.emailAddress;

      // Create email content
      const email = [
        `From: ${fromEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        body
      ].join('\r\n');

      // Encode email
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const request = {
        userId: 'me',
        requestBody: {
          message: {
            raw: encodedEmail
          }
        }
      };

      const response = await this.gmail.users.drafts.create(request);
      return response.data;

    } catch (error) {
      throw new Error(`Failed to create draft: ${error.message}`);
    }
  }

  async listLabels() {
    await this.authenticate();

    try {
      const response = await this.gmail.users.labels.list({ userId: 'me' });
      return response.data.labels || [];
    } catch (error) {
      throw new Error(`Failed to list labels: ${error.message}`);
    }
  }

  async createLabel(name, labelListVisibility = 'labelShow', messageListVisibility = 'show') {
    await this.authenticate();

    try {
      const request = {
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility,
          messageListVisibility
        }
      };

      const response = await this.gmail.users.labels.create(request);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create label: ${error.message}`);
    }
  }

  async markAsRead(messageIds) {
    await this.authenticate();
    
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    
    try {
      for (const messageId of ids) {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            removeLabelIds: ['UNREAD']
          }
        });
      }
      return { success: true, processed: ids.length };
    } catch (error) {
      throw new Error(`Failed to mark as read: ${error.message}`);
    }
  }

  async markAsUnread(messageIds) {
    await this.authenticate();
    
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    
    try {
      for (const messageId of ids) {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            addLabelIds: ['UNREAD']
          }
        });
      }
      return { success: true, processed: ids.length };
    } catch (error) {
      throw new Error(`Failed to mark as unread: ${error.message}`);
    }
  }

  async addLabels(messageIds, labelIds) {
    await this.authenticate();
    
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    const labels = Array.isArray(labelIds) ? labelIds : [labelIds];
    
    try {
      for (const messageId of ids) {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            addLabelIds: labels
          }
        });
      }
      return { success: true, processed: ids.length };
    } catch (error) {
      throw new Error(`Failed to add labels: ${error.message}`);
    }
  }

  async removeLabels(messageIds, labelIds) {
    await this.authenticate();
    
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    const labels = Array.isArray(labelIds) ? labelIds : [labelIds];
    
    try {
      for (const messageId of ids) {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            removeLabelIds: labels
          }
        });
      }
      return { success: true, processed: ids.length };
    } catch (error) {
      throw new Error(`Failed to remove labels: ${error.message}`);
    }
  }

  async startWatch(topicName) {
    await this.authenticate();

    try {
      const request = {
        userId: 'me',
        requestBody: {
          topicName,
          labelIds: ['INBOX'], // Watch inbox by default
          labelFilterAction: 'include'
        }
      };

      const response = await this.gmail.users.watch(request);
      
      // Save watch configuration
      await this.saveConfig({
        ...this.config,
        watch: {
          topicName,
          historyId: response.data.historyId,
          expiration: response.data.expiration,
          setupDate: new Date().toISOString()
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to start watch: ${error.message}`);
    }
  }

  async stopWatch() {
    await this.authenticate();

    try {
      await this.gmail.users.stop({ userId: 'me' });
      
      // Remove watch configuration
      const newConfig = { ...this.config };
      delete newConfig.watch;
      await this.saveConfig(newConfig);

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to stop watch: ${error.message}`);
    }
  }

  async getWatchStatus() {
    if (!this.config.watch) {
      return { active: false };
    }

    const expiration = parseInt(this.config.watch.expiration);
    const now = Date.now();
    const isExpired = expiration < now;

    return {
      active: !isExpired,
      topicName: this.config.watch.topicName,
      historyId: this.config.watch.historyId,
      expiration: new Date(expiration).toISOString(),
      expiresIn: Math.max(0, expiration - now),
      expired: isExpired
    };
  }

  async summarizeUnreadEmails() {
    try {
      const unreadMessages = await this.getUnreadMessages(10);
      
      if (unreadMessages.length === 0) {
        return 'No unread emails found.';
      }

      let summary = `📧 ${unreadMessages.length} unread email${unreadMessages.length > 1 ? 's' : ''}:\n\n`;
      
      for (const message of unreadMessages) {
        const truncatedSubject = message.subject.length > 50 
          ? message.subject.substring(0, 47) + '...'
          : message.subject;
        
        summary += `• **${truncatedSubject}**\n`;
        summary += `  From: ${message.from}\n`;
        summary += `  ${message.snippet}\n\n`;
      }

      return summary.trim();
    } catch (error) {
      throw new Error(`Failed to summarize emails: ${error.message}`);
    }
  }

  async getEmailStats() {
    try {
      const profile = await this.getProfile();
      const unreadMessages = await this.getUnreadMessages(1);
      
      return {
        email: profile.emailAddress,
        totalMessages: profile.messagesTotal,
        totalThreads: profile.threadsTotal,
        unreadCount: unreadMessages.length > 0 ? parseInt(profile.messagesTotal) : 0, // This is approximated
        lastChecked: new Date().toISOString(),
        watchActive: (await this.getWatchStatus()).active
      };
    } catch (error) {
      throw new Error(`Failed to get email stats: ${error.message}`);
    }
  }
}

// Singleton instance
let gmailService = null;

export async function getGmailService() {
  if (!gmailService) {
    gmailService = new GmailService();
    await gmailService.loadConfig();
  }
  return gmailService;
}

// Helper functions for easier access
export async function checkEmail() {
  const service = await getGmailService();
  return await service.summarizeUnreadEmails();
}

export async function sendEmail(to, subject, body) {
  const service = await getGmailService();
  return await service.sendMessage(to, subject, body);
}

export async function searchEmails(query, maxResults = 10) {
  const service = await getGmailService();
  return await service.searchMessages(query, maxResults);
}