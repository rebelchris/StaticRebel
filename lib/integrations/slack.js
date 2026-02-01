/**
 * Slack Integration for StaticRebel
 * 
 * Features:
 * - Bot token authentication
 * - Socket mode for real-time events
 * - Slash commands (/log, /stats, /remind)
 * - Send nudges/reminders to Slack
 * - Log entries via Slack messages
 * - View stats via slash command
 * - Daily summary posts to channel
 * - Incoming webhooks for notifications
 */

import { WebClient } from '@slack/web-api';
import { SocketModeClient } from '@slack/socket-mode';
import { createServer } from 'http';
import { URL } from 'url';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import chalk from 'chalk';

export class SlackIntegration {
  constructor(options = {}) {
    this.botToken = options.botToken || process.env.SLACK_BOT_TOKEN;
    this.appToken = options.appToken || process.env.SLACK_APP_TOKEN;
    this.signingSecret = options.signingSecret || process.env.SLACK_SIGNING_SECRET;
    this.webhookUrl = options.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    
    this.webClient = null;
    this.socketClient = null;
    this.isConnected = false;
    this.defaultChannel = options.defaultChannel || 'general';
    this.reminderChannel = options.reminderChannel || 'general';
    
    // Callback handlers
    this.onLogEntry = options.onLogEntry || null;
    this.onStatsRequest = options.onStatsRequest || null;
    this.onReminderRequest = options.onReminderRequest || null;
    
    // Data tracking
    this.logEntries = [];
    this.configPath = options.configPath || './config/slack.json';
    
    // Load existing configuration if available
    this.loadConfig();
  }

  /**
   * Initialize Slack integration
   */
  async init() {
    if (!this.botToken || !this.appToken) {
      console.log(chalk.yellow('⚠️  Slack tokens not configured. Run setup first.'));
      return false;
    }

    try {
      // Initialize Web API client
      this.webClient = new WebClient(this.botToken);
      
      // Test connection
      const auth = await this.webClient.auth.test();
      console.log(chalk.green(`✅ Connected to Slack as ${auth.user} in ${auth.team}`));
      
      // Initialize Socket Mode client for real-time events
      this.socketClient = new SocketModeClient({
        appToken: this.appToken,
        logLevel: 'warn'
      });
      
      this.setupEventHandlers();
      await this.socketClient.start();
      
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize Slack integration:'), error.message);
      return false;
    }
  }

  /**
   * Setup event handlers for Socket Mode
   */
  setupEventHandlers() {
    if (!this.socketClient) return;

    // Handle slash commands
    this.socketClient.on('slash_command', async ({ command, ack, respond }) => {
      await ack();
      
      switch (command.command) {
        case '/log':
          await this.handleLogCommand(command, respond);
          break;
        case '/stats':
          await this.handleStatsCommand(command, respond);
          break;
        case '/remind':
          await this.handleRemindCommand(command, respond);
          break;
      }
    });

    // Handle app mentions and direct messages
    this.socketClient.on('message', async ({ event, ack }) => {
      await ack();
      
      if (event.type === 'message' && !event.bot_id) {
        await this.handleMessage(event);
      }
    });

    // Handle interactive components (buttons, modals, etc.)
    this.socketClient.on('interactive', async ({ payload, ack }) => {
      await ack();
      await this.handleInteractiveComponent(payload);
    });
  }

  /**
   * Handle /log slash command
   */
  async handleLogCommand(command, respond) {
    const text = command.text.trim();
    
    if (!text) {
      await respond({
        text: 'Please provide log details. Example: `/log drank 500ml water`',
        response_type: 'ephemeral'
      });
      return;
    }

    try {
      // Parse log entry
      const entry = this.parseLogEntry(text);
      this.logEntries.push({
        ...entry,
        timestamp: new Date().toISOString(),
        userId: command.user_id,
        channelId: command.channel_id
      });

      // Call external handler if provided
      if (this.onLogEntry) {
        await this.onLogEntry(entry);
      }

      await respond({
        text: `✅ Logged: ${text}`,
        response_type: 'ephemeral'
      });
    } catch (error) {
      await respond({
        text: `❌ Failed to log entry: ${error.message}`,
        response_type: 'ephemeral'
      });
    }
  }

  /**
   * Handle /stats slash command
   */
  async handleStatsCommand(command, respond) {
    try {
      let stats;
      
      if (this.onStatsRequest) {
        stats = await this.onStatsRequest(command.user_id);
      } else {
        stats = this.generateBasicStats();
      }

      await respond({
        blocks: this.formatStatsBlocks(stats),
        response_type: 'ephemeral'
      });
    } catch (error) {
      await respond({
        text: `❌ Failed to get stats: ${error.message}`,
        response_type: 'ephemeral'
      });
    }
  }

  /**
   * Handle /remind slash command
   */
  async handleRemindCommand(command, respond) {
    const text = command.text.trim();
    
    if (!text) {
      await respond({
        text: 'Please provide reminder details. Example: `/remind drink water in 30 minutes`',
        response_type: 'ephemeral'
      });
      return;
    }

    try {
      if (this.onReminderRequest) {
        await this.onReminderRequest(text, command.user_id);
      }

      await respond({
        text: `⏰ Reminder set: ${text}`,
        response_type: 'ephemeral'
      });
    } catch (error) {
      await respond({
        text: `❌ Failed to set reminder: ${error.message}`,
        response_type: 'ephemeral'
      });
    }
  }

  /**
   * Handle direct messages and mentions
   */
  async handleMessage(event) {
    // Skip if message is from bot
    if (event.bot_id) return;
    
    const message = event.text.toLowerCase();
    
    // Auto-detect log entries in natural language
    if (this.isLogEntry(message)) {
      const entry = this.parseLogEntry(event.text);
      this.logEntries.push({
        ...entry,
        timestamp: new Date().toISOString(),
        userId: event.user,
        channelId: event.channel,
        source: 'message'
      });

      // React to acknowledge the log
      await this.webClient.reactions.add({
        channel: event.channel,
        timestamp: event.ts,
        name: 'white_check_mark'
      });

      if (this.onLogEntry) {
        await this.onLogEntry(entry);
      }
    }
  }

  /**
   * Handle interactive components
   */
  async handleInteractiveComponent(payload) {
    // Handle button clicks, modal submissions, etc.
    console.log('Interactive component:', payload.type);
  }

  /**
   * Send nudge/reminder to Slack
   */
  async sendNudge(message, channel = null, options = {}) {
    if (!this.isConnected) {
      console.error('Slack not connected');
      return false;
    }

    try {
      const channelId = channel || this.reminderChannel;
      
      await this.webClient.chat.postMessage({
        channel: channelId,
        text: message,
        blocks: options.blocks,
        attachments: options.attachments,
        ...options
      });
      
      return true;
    } catch (error) {
      console.error('Failed to send Slack nudge:', error.message);
      return false;
    }
  }

  /**
   * Send daily summary to channel
   */
  async sendDailySummary(summary, channel = null) {
    if (!this.isConnected) return false;

    try {
      const channelId = channel || this.defaultChannel;
      const blocks = this.formatDailySummaryBlocks(summary);
      
      await this.webClient.chat.postMessage({
        channel: channelId,
        text: '📊 Daily Summary',
        blocks
      });
      
      return true;
    } catch (error) {
      console.error('Failed to send daily summary:', error.message);
      return false;
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhook(payload) {
    if (!this.webhookUrl) {
      console.error('Webhook URL not configured');
      return false;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      return response.ok;
    } catch (error) {
      console.error('Failed to send webhook:', error.message);
      return false;
    }
  }

  /**
   * Parse log entry from text
   */
  parseLogEntry(text) {
    // Basic parsing - can be extended with NLP
    const patterns = {
      water: /(?:drank|drink|water)\s+(\d+(?:\.\d+)?)\s*(ml|l|oz|cups?)/i,
      exercise: /(?:exercised|workout|ran|walked)\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)/i,
      sleep: /(?:slept|sleep)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?)/i,
      mood: /(?:mood|feeling)\s+(1|2|3|4|5|good|bad|okay|great|terrible)/i
    };

    const entry = {
      text: text,
      type: 'general',
      value: null,
      unit: null
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        entry.type = type;
        entry.value = parseFloat(match[1]) || match[1];
        entry.unit = match[2] || null;
        break;
      }
    }

    return entry;
  }

  /**
   * Check if message is a log entry
   */
  isLogEntry(message) {
    const logKeywords = [
      'drank', 'drink', 'water', 'exercised', 'workout', 'ran', 'walked',
      'slept', 'sleep', 'mood', 'feeling', 'ate', 'calories'
    ];
    
    return logKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Generate basic stats from logged entries
   */
  generateBasicStats() {
    const today = new Date().toDateString();
    const todayEntries = this.logEntries.filter(entry => 
      new Date(entry.timestamp).toDateString() === today
    );

    const stats = {
      totalEntries: this.logEntries.length,
      todayEntries: todayEntries.length,
      categories: {}
    };

    // Aggregate by category
    for (const entry of this.logEntries) {
      if (!stats.categories[entry.type]) {
        stats.categories[entry.type] = [];
      }
      stats.categories[entry.type].push(entry);
    }

    return stats;
  }

  /**
   * Format stats as Slack blocks
   */
  formatStatsBlocks(stats) {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Your Stats'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Total Entries:* ${stats.totalEntries}\n*Today:* ${stats.todayEntries}`
        }
      }
    ];

    // Add category breakdown
    if (stats.categories && Object.keys(stats.categories).length > 0) {
      blocks.push({
        type: 'divider'
      });

      for (const [category, entries] of Object.entries(stats.categories)) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${category.charAt(0).toUpperCase() + category.slice(1)}:* ${entries.length} entries`
          }
        });
      }
    }

    return blocks;
  }

  /**
   * Format daily summary as Slack blocks
   */
  formatDailySummaryBlocks(summary) {
    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Daily Summary'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: summary.text || 'No summary available'
        }
      }
    ];
  }

  /**
   * Load configuration from file
   */
  loadConfig() {
    try {
      if (existsSync(this.configPath)) {
        const config = JSON.parse(readFileSync(this.configPath, 'utf8'));
        this.defaultChannel = config.defaultChannel || this.defaultChannel;
        this.reminderChannel = config.reminderChannel || this.reminderChannel;
        this.logEntries = config.logEntries || [];
      }
    } catch (error) {
      console.error('Failed to load Slack config:', error.message);
    }
  }

  /**
   * Save configuration to file
   */
  saveConfig() {
    try {
      const config = {
        defaultChannel: this.defaultChannel,
        reminderChannel: this.reminderChannel,
        logEntries: this.logEntries
      };
      writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to save Slack config:', error.message);
    }
  }

  /**
   * Setup wizard for first-time configuration
   */
  static async setup() {
    console.log(chalk.blue('\n🔧 Slack Integration Setup\n'));
    
    const config = {
      botToken: '',
      appToken: '',
      signingSecret: '',
      webhookUrl: '',
      defaultChannel: 'general',
      reminderChannel: 'general'
    };

    // This would typically use readline for interactive setup
    console.log('Please configure the following in your environment:');
    console.log(chalk.yellow('SLACK_BOT_TOKEN') + ' - Bot User OAuth Token');
    console.log(chalk.yellow('SLACK_APP_TOKEN') + ' - App-Level Token (starts with xapp-)');
    console.log(chalk.yellow('SLACK_SIGNING_SECRET') + ' - Signing Secret');
    console.log(chalk.yellow('SLACK_WEBHOOK_URL') + ' - Incoming Webhook URL (optional)');
    
    return config;
  }

  /**
   * Disconnect from Slack
   */
  async disconnect() {
    if (this.socketClient) {
      await this.socketClient.disconnect();
    }
    this.isConnected = false;
    this.saveConfig();
    console.log(chalk.green('✅ Disconnected from Slack'));
  }
}

/**
 * CLI interface for Slack integration
 */
export async function slackCommand(args) {
  const command = args[0];
  
  switch (command) {
    case 'setup':
      return await SlackIntegration.setup();
      
    case 'test':
      const slack = new SlackIntegration();
      const connected = await slack.init();
      if (connected) {
        console.log(chalk.green('✅ Slack integration test successful'));
        await slack.disconnect();
      } else {
        console.log(chalk.red('❌ Slack integration test failed'));
      }
      break;
      
    case 'nudge':
      const message = args.slice(1).join(' ');
      if (message) {
        const slackInstance = new SlackIntegration();
        await slackInstance.init();
        await slackInstance.sendNudge(message);
        await slackInstance.disconnect();
      } else {
        console.log('Usage: slack nudge <message>');
      }
      break;
      
    default:
      console.log('Available commands:');
      console.log('  setup  - Configure Slack integration');
      console.log('  test   - Test Slack connection');
      console.log('  nudge  - Send a nudge message');
  }
}

export default SlackIntegration;