/**
 * Gmail CLI Commands for StaticRebel
 */

import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { getGmailService } from './gmail.js';

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function setupGmail() {
  const rl = createReadlineInterface();
  
  try {
    console.log(chalk.blue('\n📧 Gmail Integration Setup\n'));
    
    console.log('To set up Gmail integration, you need:');
    console.log('1. A Google Cloud Platform project with Gmail API enabled');
    console.log('2. OAuth 2.0 credentials downloaded from Google Cloud Console');
    console.log('');
    console.log('Setup instructions:');
    console.log('1. Go to https://console.cloud.google.com/');
    console.log('2. Create a new project or select existing one');
    console.log('3. Enable the Gmail API');
    console.log('4. Create OAuth 2.0 credentials (Desktop application type)');
    console.log('5. Download the credentials JSON file');
    console.log('');

    const credentialsPath = await askQuestion(rl, 'Path to your credentials JSON file: ');
    
    if (!credentialsPath || !fs.existsSync(credentialsPath)) {
      throw new Error('Credentials file not found. Please provide a valid path.');
    }

    const gmailService = await getGmailService();
    
    // Setup OAuth
    console.log(chalk.yellow('\nSetting up OAuth authentication...\n'));
    const authUrl = await gmailService.setupOAuth(credentialsPath);
    
    const authCode = await askQuestion(rl, '\nEnter the authorization code: ');
    
    if (!authCode) {
      throw new Error('Authorization code is required.');
    }

    console.log(chalk.yellow('\nCompleting OAuth setup...\n'));
    const result = await gmailService.completeOAuth(authCode);
    
    if (result.success) {
      console.log(chalk.green('✅ Gmail integration setup completed successfully!\n'));
      console.log(`${chalk.bold('Email Account:')} ${result.email}`);
      console.log(`${chalk.bold('Total Messages:')} ${result.messagesTotal}`);
      console.log('');
      
      console.log(chalk.blue('Next steps:'));
      console.log('• Use `sr gmail inbox` to list recent emails');
      console.log('• Use `sr gmail unread` to check unread emails');
      console.log('• Use `sr gmail send` to send emails');
      console.log('• Use `sr gmail watch` to set up real-time notifications');
      console.log('');
      
      return 'Gmail integration configured successfully!';
    } else {
      throw new Error('OAuth setup failed');
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Setup failed: ${error.message}\n`));
    return `Gmail setup failed: ${error.message}`;
  } finally {
    rl.close();
  }
}

async function showInbox() {
  try {
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return chalk.yellow('Gmail not configured. Run `sr gmail setup` first.');
    }

    console.log(chalk.blue('📧 Loading inbox...'));
    
    const messages = await gmailService.listMessages({
      maxResults: 10,
      includeDetails: true
    });
    
    if (messages.length === 0) {
      return chalk.yellow('No messages found in inbox.');
    }

    let output = chalk.blue(`\n📧 Inbox (${messages.length} recent messages)\n`);
    output += '='.repeat(60) + '\n\n';
    
    for (const message of messages) {
      const unreadFlag = message.unread ? chalk.red('● ') : '  ';
      const subject = message.subject.length > 50 
        ? message.subject.substring(0, 47) + '...'
        : message.subject;
      
      output += `${unreadFlag}${chalk.bold(subject)}\n`;
      output += `  From: ${message.from}\n`;
      output += `  Date: ${message.date}\n`;
      output += `  ${message.snippet}\n`;
      output += `  ID: ${chalk.dim(message.id)}\n\n`;
    }

    return output;
    
  } catch (error) {
    return chalk.red(`❌ Failed to load inbox: ${error.message}`);
  }
}

async function showUnreadEmails() {
  try {
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return chalk.yellow('Gmail not configured. Run `sr gmail setup` first.');
    }

    const summary = await gmailService.summarizeUnreadEmails();
    return chalk.blue('📧 Unread Emails\n') + '='.repeat(40) + '\n\n' + summary;
    
  } catch (error) {
    return chalk.red(`❌ Failed to get unread emails: ${error.message}`);
  }
}

async function readEmail(args) {
  if (!args || args.length === 0) {
    return chalk.red('❌ Message ID required. Usage: sr gmail read <message-id>');
  }

  const messageId = args[0];
  
  try {
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return chalk.yellow('Gmail not configured. Run `sr gmail setup` first.');
    }

    const message = await gmailService.getMessage(messageId);
    
    let output = chalk.blue('\n📧 Email Details\n');
    output += '='.repeat(50) + '\n\n';
    output += `${chalk.bold('Subject:')} ${message.subject}\n`;
    output += `${chalk.bold('From:')} ${message.from}\n`;
    output += `${chalk.bold('To:')} ${message.to}\n`;
    output += `${chalk.bold('Date:')} ${message.date}\n`;
    output += `${chalk.bold('Labels:')} ${message.labelIds.join(', ')}\n`;
    output += `${chalk.bold('Thread ID:')} ${message.threadId}\n\n`;
    output += `${chalk.bold('Body:')}\n`;
    output += '-'.repeat(40) + '\n';
    output += message.body + '\n';

    return output;
    
  } catch (error) {
    return chalk.red(`❌ Failed to read email: ${error.message}`);
  }
}

async function sendEmail(args) {
  const rl = createReadlineInterface();
  
  try {
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return chalk.yellow('Gmail not configured. Run `sr gmail setup` first.');
    }

    // Parse command line arguments
    let to = '';
    let subject = '';
    let body = '';
    
    // Look for --to, --subject flags
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--to' && i + 1 < args.length) {
        to = args[i + 1];
        i++; // Skip next argument
      } else if (args[i] === '--subject' && i + 1 < args.length) {
        subject = args[i + 1];
        i++; // Skip next argument
      } else if (args[i] === '--body' && i + 1 < args.length) {
        body = args[i + 1];
        i++; // Skip next argument
      }
    }

    // Interactive prompts for missing information
    if (!to) {
      to = await askQuestion(rl, 'To (email address): ');
    }
    
    if (!subject) {
      subject = await askQuestion(rl, 'Subject: ');
    }
    
    if (!body) {
      console.log('Enter email body (press Ctrl+D when finished):');
      body = await new Promise((resolve) => {
        let content = '';
        rl.on('line', (line) => {
          content += line + '\n';
        });
        rl.on('close', () => {
          resolve(content.trim());
        });
      });
      rl.close();
    }

    if (!to || !subject) {
      throw new Error('To and subject are required');
    }

    console.log(chalk.yellow('\nSending email...'));
    
    const result = await gmailService.sendMessage(to, subject, body);
    
    return chalk.green(`✅ Email sent successfully!\nMessage ID: ${result.id}`);
    
  } catch (error) {
    return chalk.red(`❌ Failed to send email: ${error.message}`);
  } finally {
    if (!rl.closed) {
      rl.close();
    }
  }
}

async function searchEmails(args) {
  if (!args || args.length === 0) {
    return chalk.red('❌ Search query required. Usage: sr gmail search <query>');
  }

  const query = args.join(' ');
  
  try {
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return chalk.yellow('Gmail not configured. Run `sr gmail setup` first.');
    }

    console.log(chalk.blue(`🔍 Searching for: "${query}"`));
    
    const messages = await gmailService.searchMessages(query, 10);
    
    if (messages.length === 0) {
      return chalk.yellow('No messages found matching your search.');
    }

    let output = chalk.blue(`\n🔍 Search Results (${messages.length} found)\n`);
    output += '='.repeat(60) + '\n\n';
    
    for (const message of messages) {
      const subject = message.subject.length > 50 
        ? message.subject.substring(0, 47) + '...'
        : message.subject;
      
      output += `${chalk.bold(subject)}\n`;
      output += `  From: ${message.from}\n`;
      output += `  Date: ${message.date}\n`;
      output += `  ${message.snippet}\n`;
      output += `  ID: ${chalk.dim(message.id)}\n\n`;
    }

    return output;
    
  } catch (error) {
    return chalk.red(`❌ Search failed: ${error.message}`);
  }
}

async function createDraft(args) {
  const rl = createReadlineInterface();
  
  try {
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return chalk.yellow('Gmail not configured. Run `sr gmail setup` first.');
    }

    // Parse command line arguments
    let to = '';
    let subject = '';
    let body = '';
    
    // Look for --to, --subject flags
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--to' && i + 1 < args.length) {
        to = args[i + 1];
        i++;
      } else if (args[i] === '--subject' && i + 1 < args.length) {
        subject = args[i + 1];
        i++;
      } else if (args[i] === '--body' && i + 1 < args.length) {
        body = args[i + 1];
        i++;
      }
    }

    // Interactive prompts for missing information
    if (!to) {
      to = await askQuestion(rl, 'To (email address): ');
    }
    
    if (!subject) {
      subject = await askQuestion(rl, 'Subject: ');
    }
    
    if (!body) {
      body = await askQuestion(rl, 'Body: ');
    }

    if (!to || !subject) {
      throw new Error('To and subject are required');
    }

    console.log(chalk.yellow('\nCreating draft...'));
    
    const result = await gmailService.createDraft(to, subject, body);
    
    return chalk.green(`✅ Draft created successfully!\nDraft ID: ${result.id}`);
    
  } catch (error) {
    return chalk.red(`❌ Failed to create draft: ${error.message}`);
  } finally {
    rl.close();
  }
}

async function listLabels() {
  try {
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return chalk.yellow('Gmail not configured. Run `sr gmail setup` first.');
    }

    const labels = await gmailService.listLabels();
    
    let output = chalk.blue('\n🏷️  Gmail Labels\n');
    output += '='.repeat(40) + '\n\n';
    
    // Group by type
    const systemLabels = labels.filter(l => l.type === 'system');
    const userLabels = labels.filter(l => l.type === 'user');
    
    if (systemLabels.length > 0) {
      output += chalk.bold('System Labels:\n');
      for (const label of systemLabels) {
        output += `  • ${label.name} (${label.id})\n`;
      }
      output += '\n';
    }
    
    if (userLabels.length > 0) {
      output += chalk.bold('User Labels:\n');
      for (const label of userLabels) {
        output += `  • ${label.name} (${label.id})\n`;
      }
    }

    return output;
    
  } catch (error) {
    return chalk.red(`❌ Failed to list labels: ${error.message}`);
  }
}

async function watchEmails(args) {
  try {
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return chalk.yellow('Gmail not configured. Run `sr gmail setup` first.');
    }

    // Check if already watching
    const status = await gmailService.getWatchStatus();
    
    if (status.active) {
      return chalk.yellow(`Gmail watch is already active.\nTopic: ${status.topicName}\nExpires: ${status.expiration}`);
    }

    // Default topic name
    const topicName = args[0] || 'projects/your-project-id/topics/gmail-staticrebel';
    
    console.log(chalk.yellow('Starting Gmail watch...'));
    console.log(chalk.dim('Note: This requires a Google Cloud Pub/Sub topic to be configured.'));
    
    const result = await gmailService.startWatch(topicName);
    
    return chalk.green(`✅ Gmail watch started successfully!\nHistory ID: ${result.historyId}\nExpires: ${new Date(parseInt(result.expiration)).toISOString()}`);
    
  } catch (error) {
    return chalk.red(`❌ Failed to start watch: ${error.message}`);
  }
}

async function showGmailStatus() {
  try {
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return chalk.yellow('📧 Gmail integration is not configured.\n\nRun `sr gmail setup` to get started.');
    }

    const profile = await gmailService.getProfile();
    const stats = await gmailService.getEmailStats();
    const watchStatus = await gmailService.getWatchStatus();
    
    let status = chalk.blue('📧 Gmail Integration Status\n\n');
    status += chalk.green('✅ Configured\n\n');
    
    status += `${chalk.bold('Email Account:')} ${profile.emailAddress}\n`;
    status += `${chalk.bold('Total Messages:')} ${profile.messagesTotal?.toLocaleString()}\n`;
    status += `${chalk.bold('Total Threads:')} ${profile.threadsTotal?.toLocaleString()}\n\n`;
    
    status += chalk.bold('Watch Status:\n');
    if (watchStatus.active) {
      status += `• Status: ${chalk.green('Active')}\n`;
      status += `• Topic: ${watchStatus.topicName}\n`;
      status += `• Expires: ${watchStatus.expiration}\n`;
      status += `• History ID: ${watchStatus.historyId}\n`;
    } else {
      status += `• Status: ${chalk.yellow('Inactive')}\n`;
      if (watchStatus.expired) {
        status += `• Last expired: ${watchStatus.expiration}\n`;
      }
    }
    
    status += `\n${chalk.bold('Last checked:')} ${new Date().toLocaleString()}\n`;
    
    return status;
    
  } catch (error) {
    return chalk.red(`❌ Failed to get Gmail status: ${error.message}`);
  }
}

function showGmailHelp() {
  return `
${chalk.blue('📧 StaticRebel Gmail Integration')}

${chalk.bold('Commands:')}
  ${chalk.green('sr gmail setup')}              Set up Gmail API integration
  ${chalk.green('sr gmail inbox')}              Show recent inbox messages
  ${chalk.green('sr gmail unread')}             Show unread emails summary
  ${chalk.green('sr gmail read <id>')}          Read a specific email
  ${chalk.green('sr gmail send')}               Send an email (interactive)
  ${chalk.green('sr gmail search <query>')}     Search emails
  ${chalk.green('sr gmail draft')}              Create a draft email
  ${chalk.green('sr gmail labels')}             List all labels
  ${chalk.green('sr gmail watch [topic]')}      Start real-time email watching
  ${chalk.green('sr gmail status')}             Show configuration and stats
  ${chalk.green('sr gmail help')}               Show this help

${chalk.bold('Email Send/Draft Options:')}
  --to <email>              Recipient email address
  --subject <text>          Email subject
  --body <text>             Email body content

${chalk.bold('Search Examples:')}
  ${chalk.dim('sr gmail search "from:github.com"')}          # Emails from GitHub
  ${chalk.dim('sr gmail search "subject:invoice"')}          # Emails with "invoice" in subject
  ${chalk.dim('sr gmail search "is:unread important"')}      # Unread important emails
  ${chalk.dim('sr gmail search "after:2024/1/1"')}          # Emails after Jan 1, 2024

${chalk.bold('Setup Requirements:')}
  • Google Cloud Platform project with Gmail API enabled
  • OAuth 2.0 credentials (Desktop application type)
  • Downloaded credentials JSON file

${chalk.bold('Example Workflow:')}
  ${chalk.dim('sr gmail setup')}                   # Initial setup with OAuth
  ${chalk.dim('sr gmail inbox')}                   # Check recent emails
  ${chalk.dim('sr gmail unread')}                  # Quick unread summary
  ${chalk.dim('sr gmail send --to "test@example.com" --subject "Hello"')}  # Send email

${chalk.bold('LLM Integration:')}
  • "Check my email" - Gets unread email summary
  • "Send an email to X about Y" - Composes and sends email
  • "Search for emails from GitHub" - Searches emails
  • "What are my latest emails?" - Shows recent inbox
`;
}

export async function gmailCommand(args) {
  const command = args[0];
  
  switch (command) {
    case 'setup':
      return await setupGmail();
    
    case 'inbox':
      return await showInbox();
    
    case 'unread':
      return await showUnreadEmails();
    
    case 'read':
      return await readEmail(args.slice(1));
    
    case 'send':
      return await sendEmail(args.slice(1));
    
    case 'search':
      return await searchEmails(args.slice(1));
    
    case 'draft':
      return await createDraft(args.slice(1));
    
    case 'labels':
      return await listLabels();
    
    case 'watch':
      return await watchEmails(args.slice(1));
    
    case 'status':
      return await showGmailStatus();
    
    case 'help':
    case undefined:
      return showGmailHelp();
    
    default:
      return chalk.red(`Unknown Gmail command: ${command}\n\n`) + showGmailHelp();
  }
}