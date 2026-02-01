/**
 * Email CLI Commands for StaticRebel
 */

import readline from 'readline';
import chalk from 'chalk';
import { getEmailService } from './email.js';

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

async function setupEmailProvider() {
  const rl = createReadlineInterface();
  
  try {
    console.log(chalk.blue('\n📧 Email Integration Setup\n'));
    
    console.log('Available email providers:');
    console.log('1. SMTP (Custom mail server)');
    console.log('2. SendGrid');
    console.log('3. Resend');
    console.log('');
    
    const providerChoice = await askQuestion(rl, 'Choose provider (1-3): ');
    
    let config = {};
    
    switch (providerChoice) {
      case '1': {
        console.log(chalk.yellow('\nSetting up SMTP provider...\n'));
        
        const host = await askQuestion(rl, 'SMTP Host (e.g., smtp.gmail.com): ');
        const port = await askQuestion(rl, 'SMTP Port (587 for TLS, 465 for SSL, 25 for unsecured): ');
        const secure = await askQuestion(rl, 'Use SSL? (y/n): ');
        const user = await askQuestion(rl, 'Email address: ');
        const password = await askQuestion(rl, 'Password/App Password: ');
        
        config = {
          provider: 'smtp',
          fromEmail: user,
          smtp: {
            host,
            port: parseInt(port) || 587,
            secure: secure.toLowerCase() === 'y',
            user,
            password
          }
        };
        break;
      }
      
      case '2': {
        console.log(chalk.yellow('\nSetting up SendGrid provider...\n'));
        
        const apiKey = await askQuestion(rl, 'SendGrid API Key: ');
        const fromEmail = await askQuestion(rl, 'From email address: ');
        
        config = {
          provider: 'sendgrid',
          fromEmail,
          sendgrid: {
            apiKey
          }
        };
        break;
      }
      
      case '3': {
        console.log(chalk.yellow('\nSetting up Resend provider...\n'));
        
        const apiKey = await askQuestion(rl, 'Resend API Key: ');
        const fromEmail = await askQuestion(rl, 'From email address: ');
        
        config = {
          provider: 'resend',
          fromEmail,
          resend: {
            apiKey
          }
        };
        break;
      }
      
      default:
        throw new Error('Invalid provider choice');
    }
    
    // Get user email for receiving notifications
    const userEmail = await askQuestion(rl, 'Your email (for receiving notifications): ');
    config.userEmail = userEmail;
    
    // Ask about notification preferences
    console.log(chalk.yellow('\nNotification Preferences:\n'));
    
    const dailySummary = await askQuestion(rl, 'Enable daily summary emails? (y/n): ');
    const weeklyDigest = await askQuestion(rl, 'Enable weekly digest emails? (y/n): ');
    const streakMilestones = await askQuestion(rl, 'Enable streak milestone notifications? (y/n): ');
    const goalCompletion = await askQuestion(rl, 'Enable goal completion alerts? (y/n): ');
    
    config.notifications = {
      dailySummary: dailySummary.toLowerCase() === 'y',
      weeklyDigest: weeklyDigest.toLowerCase() === 'y',
      streakMilestones: streakMilestones.toLowerCase() === 'y',
      goalCompletion: goalCompletion.toLowerCase() === 'y'
    };
    
    // Save configuration
    console.log(chalk.yellow('\nSaving configuration...\n'));
    
    const emailService = await getEmailService();
    await emailService.saveConfig(config);
    
    // Test connection
    console.log(chalk.yellow('Testing email connection...\n'));
    
    try {
      await emailService.testConnection();
      console.log(chalk.green('✅ Email setup completed successfully!\n'));
      
      // Show next steps
      console.log(chalk.blue('Next steps:'));
      console.log('• Use `sr email test` to send a test email');
      console.log('• Use `sr email status` to check configuration');
      console.log('• Use `sr email schedule` to set up automated emails');
      console.log('');
      
      return 'Email integration configured successfully!';
    } catch (error) {
      console.log(chalk.red(`❌ Connection test failed: ${error.message}\n`));
      console.log(chalk.yellow('Configuration saved, but please check your settings.\n'));
      return 'Email configuration saved but connection test failed. Please verify your settings.';
    }
    
  } finally {
    rl.close();
  }
}

async function testEmail() {
  try {
    const emailService = await getEmailService();
    
    if (!emailService.isConfigured()) {
      return 'Email not configured. Run `sr email setup` first.';
    }
    
    await emailService.testConnection();
    
    // Send a test email
    const success = await emailService.provider.sendEmail({
      to: emailService.config.userEmail,
      subject: '🧪 StaticRebel Email Test',
      text: 'This is a test email from StaticRebel to verify your email integration is working correctly!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50;">🧪 StaticRebel Email Test</h2>
          <p>This is a test email from StaticRebel to verify your email integration is working correctly!</p>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>✅ Your email integration is working!</strong></p>
          </div>
          <p style="color: #666; font-size: 14px;">
            Sent on ${new Date().toLocaleString()}
          </p>
        </div>
      `
    });
    
    if (success) {
      return chalk.green('✅ Test email sent successfully! Check your inbox.');
    } else {
      return chalk.red('❌ Failed to send test email. Please check your configuration.');
    }
    
  } catch (error) {
    return chalk.red(`❌ Email test failed: ${error.message}`);
  }
}

async function showEmailStatus() {
  try {
    const emailService = await getEmailService();
    
    if (!emailService.isConfigured()) {
      return chalk.yellow('📧 Email integration is not configured.\n\nRun `sr email setup` to get started.');
    }
    
    const config = emailService.config;
    const stats = await emailService.getEmailStats();
    
    let status = chalk.blue('📧 Email Integration Status\n\n');
    
    status += chalk.green('✅ Configured\n\n');
    
    status += `${chalk.bold('Provider:')} ${config.provider}\n`;
    status += `${chalk.bold('From Email:')} ${config.fromEmail}\n`;
    status += `${chalk.bold('User Email:')} ${config.userEmail}\n\n`;
    
    status += chalk.bold('Notification Settings:\n');
    status += `• Daily Summary: ${config.notifications?.dailySummary ? '✅' : '❌'}\n`;
    status += `• Weekly Digest: ${config.notifications?.weeklyDigest ? '✅' : '❌'}\n`;
    status += `• Streak Milestones: ${config.notifications?.streakMilestones ? '✅' : '❌'}\n`;
    status += `• Goal Completion: ${config.notifications?.goalCompletion ? '✅' : '❌'}\n\n`;
    
    status += chalk.bold('Email Statistics (Last 30 days):\n');
    status += `• Total Sent: ${stats.total_sent}\n`;
    status += `• Daily Summaries: ${stats.daily_summaries}\n`;
    status += `• Weekly Digests: ${stats.weekly_digests}\n`;
    status += `• Streak Notifications: ${stats.streak_notifications}\n`;
    status += `• Goal Alerts: ${stats.goal_alerts}\n`;
    status += `• Last Sent: ${stats.last_sent ? new Date(stats.last_sent).toLocaleString() : 'Never'}\n`;
    
    return status;
    
  } catch (error) {
    return chalk.red(`❌ Failed to get email status: ${error.message}`);
  }
}

async function scheduleEmails() {
  const rl = createReadlineInterface();
  
  try {
    console.log(chalk.blue('\n📅 Schedule Automated Emails\n'));
    
    const emailService = await getEmailService();
    
    if (!emailService.isConfigured()) {
      return 'Email not configured. Run `sr email setup` first.';
    }
    
    const config = emailService.config;
    
    console.log('Available schedules:');
    console.log('1. Daily summary (every day at 6 PM)');
    console.log('2. Weekly digest (every Sunday at 9 AM)');
    console.log('3. Custom schedule');
    console.log('');
    
    const scheduleChoice = await askQuestion(rl, 'Choose schedule (1-3): ');
    
    // Import cron scheduler
    const { addCronJob } = await import('../cronScheduler.js');
    
    switch (scheduleChoice) {
      case '1': {
        if (!config.notifications?.dailySummary) {
          console.log(chalk.yellow('Daily summary notifications are disabled in your settings.'));
          const enable = await askQuestion(rl, 'Enable daily summary notifications? (y/n): ');
          if (enable.toLowerCase() === 'y') {
            config.notifications.dailySummary = true;
            await emailService.saveConfig(config);
          } else {
            return 'Daily summary scheduling cancelled.';
          }
        }
        
        await addCronJob('daily-email-summary', '0 18 * * *', {
          type: 'email',
          action: 'daily-summary',
          userEmail: config.userEmail
        });
        
        return chalk.green('✅ Daily email summary scheduled for 6:00 PM every day');
      }
      
      case '2': {
        if (!config.notifications?.weeklyDigest) {
          console.log(chalk.yellow('Weekly digest notifications are disabled in your settings.'));
          const enable = await askQuestion(rl, 'Enable weekly digest notifications? (y/n): ');
          if (enable.toLowerCase() === 'y') {
            config.notifications.weeklyDigest = true;
            await emailService.saveConfig(config);
          } else {
            return 'Weekly digest scheduling cancelled.';
          }
        }
        
        await addCronJob('weekly-email-digest', '0 9 * * 0', {
          type: 'email',
          action: 'weekly-digest',
          userEmail: config.userEmail
        });
        
        return chalk.green('✅ Weekly email digest scheduled for 9:00 AM every Sunday');
      }
      
      case '3': {
        const cronPattern = await askQuestion(rl, 'Enter cron pattern (e.g., "0 18 * * *" for daily at 6 PM): ');
        const emailType = await askQuestion(rl, 'Email type (daily-summary/weekly-digest): ');
        
        if (!['daily-summary', 'weekly-digest'].includes(emailType)) {
          return 'Invalid email type. Use daily-summary or weekly-digest.';
        }
        
        const jobName = `custom-email-${Date.now()}`;
        
        await addCronJob(jobName, cronPattern, {
          type: 'email',
          action: emailType,
          userEmail: config.userEmail
        });
        
        return chalk.green(`✅ Custom email schedule created: ${emailType} with pattern ${cronPattern}`);
      }
      
      default:
        return 'Invalid schedule choice.';
    }
    
  } finally {
    rl.close();
  }
}

function showEmailHelp() {
  return `
${chalk.blue('📧 StaticRebel Email Integration')}

${chalk.bold('Commands:')}
  ${chalk.green('sr email setup')}        Configure email provider and settings
  ${chalk.green('sr email test')}         Send a test email
  ${chalk.green('sr email status')}       Show configuration and statistics
  ${chalk.green('sr email schedule')}     Set up automated email schedules
  ${chalk.green('sr email help')}         Show this help

${chalk.bold('Supported Providers:')}
  • SMTP (Custom mail servers, Gmail, etc.)
  • SendGrid (Transactional email service)
  • Resend (Developer-friendly email API)

${chalk.bold('Email Types:')}
  • Daily Summary - Daily overview of activities
  • Weekly Digest - Weekly summary and goals progress
  • Streak Milestones - Notifications when you hit streak milestones
  • Goal Completion - Alerts when you complete goals

${chalk.bold('Examples:')}
  ${chalk.dim('sr email setup')}          # Initial configuration
  ${chalk.dim('sr email test')}           # Verify setup works
  ${chalk.dim('sr email schedule')}       # Set up daily/weekly emails

${chalk.bold('Notes:')}
  • Templates are customizable in lib/integrations/templates/
  • Email schedules use cron patterns for flexibility
  • All sent emails are logged for statistics
`;
}

export async function emailCommand(args) {
  const command = args[0];
  
  switch (command) {
    case 'setup':
      return await setupEmailProvider();
    
    case 'test':
      return await testEmail();
    
    case 'status':
      return await showEmailStatus();
    
    case 'schedule':
      return await scheduleEmails();
    
    case 'help':
    case undefined:
      return showEmailHelp();
    
    default:
      return chalk.red(`Unknown email command: ${command}\n\n`) + showEmailHelp();
  }
}