/**
 * Email Integration for StaticRebel
 * Supports SMTP, SendGrid, and Resend providers
 */

import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import nodemailer from 'nodemailer';
import { loadConfig, saveConfig } from '../configManager.js';
// import { getDB } from '../db.js'; // Temporarily disabled - not needed for core functionality

const EMAIL_CONFIG_KEY = 'email_settings';
const TEMPLATES_DIR = path.join(process.cwd(), 'lib', 'integrations', 'templates');

export class EmailProvider {
  constructor(config) {
    this.config = config;
    this.transporter = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      if (this.config.provider === 'smtp') {
        this.transporter = nodemailer.createTransporter({
          host: this.config.smtp.host,
          port: this.config.smtp.port,
          secure: this.config.smtp.secure || false,
          auth: {
            user: this.config.smtp.user,
            pass: this.config.smtp.password
          }
        });
      } else if (this.config.provider === 'sendgrid') {
        this.transporter = nodemailer.createTransporter({
          service: 'SendGrid',
          auth: {
            user: 'apikey',
            pass: this.config.sendgrid.apiKey
          }
        });
      } else if (this.config.provider === 'resend') {
        this.transporter = nodemailer.createTransporter({
          host: 'smtp.resend.com',
          port: 587,
          secure: false,
          auth: {
            user: 'resend',
            pass: this.config.resend.apiKey
          }
        });
      }

      // Verify connection
      await this.transporter.verify();
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize email provider: ${error.message}`);
    }
  }

  async sendEmail(options) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const emailOptions = {
      from: this.config.fromEmail || this.config.smtp?.user,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    try {
      const result = await this.transporter.sendMail(emailOptions);
      return result;
    } catch (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

export class EmailService {
  constructor() {
    this.provider = null;
    this.config = null;
  }

  async loadConfig() {
    const config = await loadConfig();
    this.config = config[EMAIL_CONFIG_KEY];
    
    if (this.config && this.config.provider) {
      this.provider = new EmailProvider(this.config);
    }
  }

  async saveConfig(emailConfig) {
    const config = await loadConfig();
    config[EMAIL_CONFIG_KEY] = emailConfig;
    await saveConfig(config);
    this.config = emailConfig;
    this.provider = new EmailProvider(emailConfig);
  }

  isConfigured() {
    return this.config && this.config.provider;
  }

  async testConnection() {
    if (!this.isConfigured()) {
      throw new Error('Email not configured. Run `sr email setup` first.');
    }

    try {
      await this.provider.initialize();
      return true;
    } catch (error) {
      throw error;
    }
  }

  async sendDailySummary(userEmail, data) {
    if (!this.isConfigured()) return false;

    try {
      const template = await this.getTemplate('daily-summary', data);
      await this.provider.sendEmail({
        to: userEmail,
        subject: `Daily Summary - ${new Date().toDateString()}`,
        text: template.text,
        html: template.html
      });
      return true;
    } catch (error) {
      console.error('Failed to send daily summary:', error.message);
      return false;
    }
  }

  async sendWeeklyDigest(userEmail, data) {
    if (!this.isConfigured()) return false;

    try {
      const template = await this.getTemplate('weekly-digest', data);
      await this.provider.sendEmail({
        to: userEmail,
        subject: `Weekly Digest - Week of ${new Date().toDateString()}`,
        text: template.text,
        html: template.html
      });
      return true;
    } catch (error) {
      console.error('Failed to send weekly digest:', error.message);
      return false;
    }
  }

  async sendStreakMilestone(userEmail, data) {
    if (!this.isConfigured()) return false;

    try {
      const template = await this.getTemplate('streak-milestone', data);
      await this.provider.sendEmail({
        to: userEmail,
        subject: `🔥 Streak Milestone Reached: ${data.milestone} days!`,
        text: template.text,
        html: template.html
      });
      return true;
    } catch (error) {
      console.error('Failed to send streak milestone:', error.message);
      return false;
    }
  }

  async sendGoalCompletion(userEmail, data) {
    if (!this.isConfigured()) return false;

    try {
      const template = await this.getTemplate('goal-completion', data);
      await this.provider.sendEmail({
        to: userEmail,
        subject: `🎉 Goal Completed: ${data.goalName}`,
        text: template.text,
        html: template.html
      });
      return true;
    } catch (error) {
      console.error('Failed to send goal completion:', error.message);
      return false;
    }
  }

  async getTemplate(templateName, data) {
    const htmlPath = path.join(TEMPLATES_DIR, `${templateName}.html`);
    const textPath = path.join(TEMPLATES_DIR, `${templateName}.txt`);

    let htmlTemplate = '';
    let textTemplate = '';

    try {
      htmlTemplate = await fsPromises.readFile(htmlPath, 'utf8');
    } catch (error) {
      // Use fallback HTML template
      htmlTemplate = this.getFallbackHtmlTemplate(templateName, data);
    }

    try {
      textTemplate = await fsPromises.readFile(textPath, 'utf8');
    } catch (error) {
      // Use fallback text template
      textTemplate = this.getFallbackTextTemplate(templateName, data);
    }

    // Simple template engine - replace {{variable}} with data values
    const html = this.renderTemplate(htmlTemplate, data);
    const text = this.renderTemplate(textTemplate, data);

    return { html, text };
  }

  renderTemplate(template, data) {
    let rendered = template;
    
    if (data) {
      Object.keys(data).forEach(key => {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        rendered = rendered.replace(placeholder, data[key] || '');
      });
    }

    // Add common variables
    rendered = rendered.replace(/{{date}}/g, new Date().toDateString());
    rendered = rendered.replace(/{{year}}/g, new Date().getFullYear());
    
    return rendered;
  }

  getFallbackHtmlTemplate(templateName, data) {
    const templates = {
      'daily-summary': `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #2c3e50;">Daily Summary - {{date}}</h1>
              <p>Here's your daily summary from StaticRebel:</p>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3>Today's Activities</h3>
                <p>{{summary}}</p>
              </div>
              <p style="color: #666; font-size: 14px;">
                Keep up the great work! 🚀
              </p>
            </div>
          </body>
        </html>
      `,
      'weekly-digest': `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #2c3e50;">Weekly Digest - {{date}}</h1>
              <p>Your week in review:</p>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3>This Week's Highlights</h3>
                <p>{{weekSummary}}</p>
                <h3>Goals Progress</h3>
                <p>{{goalsProgress}}</p>
              </div>
              <p style="color: #666; font-size: 14px;">
                Another productive week! 📈
              </p>
            </div>
          </body>
        </html>
      `,
      'streak-milestone': `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
              <h1 style="color: #e74c3c;">🔥 Streak Milestone! 🔥</h1>
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin: 20px 0;">
                <h2 style="margin: 0; font-size: 2.5em;">{{milestone}} Days!</h2>
                <p style="font-size: 1.2em; margin: 10px 0;">{{streakType}} Streak</p>
              </div>
              <p style="font-size: 1.1em; margin: 20px 0;">
                Congratulations on reaching this amazing milestone! Your consistency is paying off.
              </p>
              <p style="color: #666; font-size: 14px;">
                Keep the momentum going! 🚀
              </p>
            </div>
          </body>
        </html>
      `,
      'goal-completion': `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
              <h1 style="color: #27ae60;">🎉 Goal Completed! 🎉</h1>
              <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; border-radius: 10px; margin: 20px 0;">
                <h2 style="margin: 0; font-size: 1.8em;">{{goalName}}</h2>
                <p style="font-size: 1.1em; margin: 10px 0;">Completed on {{date}}</p>
              </div>
              <p style="font-size: 1.1em; margin: 20px 0;">
                Fantastic work! You've achieved another goal. Time to celebrate and set the next one!
              </p>
              <p style="color: #666; font-size: 14px;">
                On to the next achievement! 🏆
              </p>
            </div>
          </body>
        </html>
      `
    };
    
    return templates[templateName] || '<p>{{content}}</p>';
  }

  getFallbackTextTemplate(templateName, data) {
    const templates = {
      'daily-summary': `
Daily Summary - {{date}}

Here's your daily summary from StaticRebel:

Today's Activities:
{{summary}}

Keep up the great work! 🚀
      `.trim(),
      'weekly-digest': `
Weekly Digest - {{date}}

Your week in review:

This Week's Highlights:
{{weekSummary}}

Goals Progress:
{{goalsProgress}}

Another productive week! 📈
      `.trim(),
      'streak-milestone': `
🔥 STREAK MILESTONE! 🔥

{{milestone}} Days - {{streakType}} Streak

Congratulations on reaching this amazing milestone! Your consistency is paying off.

Keep the momentum going! 🚀
      `.trim(),
      'goal-completion': `
🎉 GOAL COMPLETED! 🎉

Goal: {{goalName}}
Completed: {{date}}

Fantastic work! You've achieved another goal. Time to celebrate and set the next one!

On to the next achievement! 🏆
      `.trim()
    };
    
    return templates[templateName] || '{{content}}';
  }

  async getEmailStats() {
    // const db = getDB(); // Temporarily disabled
    
    // Return default stats while DB functionality is disabled
    return {
      total_sent: 0,
      daily_summaries: 0,
      weekly_digests: 0,
      streak_notifications: 0,
      goal_alerts: 0,
      last_sent: null
    };
  }

  async logEmailSent(type, recipient, success) {
    // const db = getDB(); // Temporarily disabled
    
    // Skip logging while DB functionality is disabled
    return { success: true, message: 'Email logging temporarily disabled' };
    
    /*
    try {
      // Create table if it doesn't exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          recipient TEXT NOT NULL,
          success INTEGER NOT NULL,
          sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          error_message TEXT
        )
      `);

      db.prepare(`
        INSERT INTO email_log (type, recipient, success, error_message)
        VALUES (?, ?, ?, ?)
      `).run(type, recipient, success ? 1 : 0, success ? null : 'Send failed');
      
    } catch (error) {
      console.error('Failed to log email:', error.message);
    }
    */
  }
}

// Singleton instance
let emailService = null;

export async function getEmailService() {
  if (!emailService) {
    emailService = new EmailService();
    await emailService.loadConfig();
  }
  return emailService;
}

export async function sendDailySummary(userEmail, summaryData) {
  const service = await getEmailService();
  const success = await service.sendDailySummary(userEmail, summaryData);
  await service.logEmailSent('daily-summary', userEmail, success);
  return success;
}

export async function sendWeeklyDigest(userEmail, digestData) {
  const service = await getEmailService();
  const success = await service.sendWeeklyDigest(userEmail, digestData);
  await service.logEmailSent('weekly-digest', userEmail, success);
  return success;
}

export async function sendStreakMilestone(userEmail, streakData) {
  const service = await getEmailService();
  const success = await service.sendStreakMilestone(userEmail, streakData);
  await service.logEmailSent('streak-milestone', userEmail, success);
  return success;
}

export async function sendGoalCompletion(userEmail, goalData) {
  const service = await getEmailService();
  const success = await service.sendGoalCompletion(userEmail, goalData);
  await service.logEmailSent('goal-completion', userEmail, success);
  return success;
}