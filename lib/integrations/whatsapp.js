/**
 * WhatsApp Integration for StaticRebel
 * Provides WhatsApp messaging functionality including:
 * - QR code authentication
 * - Send/receive messages
 * - Natural language processing for logging
 * - Daily summaries and nudges
 * - Voice message transcription
 * - Media handling
 * - Multi-device support
 * - Session persistence
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import fs from 'fs/promises';
import path from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WhatsAppIntegration {
  constructor(options = {}) {
    this.config = {
      sessionName: process.env.WHATSAPP_SESSION_NAME || 'staticrebel-session',
      puppeteerOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ...options.puppeteerOptions
      },
      autoSaveSession: true,
      ...options
    };

    this.client = null;
    this.isReady = false;
    this.messageHandlers = new Map();
    this.nlpEnabled = true;
    this.sessionPath = path.join(__dirname, '../../data', 'whatsapp-sessions');
    
    // Ensure session directory exists
    this.ensureSessionDirectory();

    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
    this.sendNudge = this.sendNudge.bind(this);
    this.handleIncomingMessage = this.handleIncomingMessage.bind(this);
  }

  /**
   * Ensure session directory exists
   */
  async ensureSessionDirectory() {
    try {
      await fs.mkdir(this.sessionPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create session directory:', error);
    }
  }

  /**
   * Initialize and start the WhatsApp client
   */
  async start() {
    if (this.isReady) {
      console.log('WhatsApp client is already running');
      return;
    }

    console.log(chalk.blue('🟢 Starting WhatsApp integration...'));

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.config.sessionName,
        dataPath: this.sessionPath
      }),
      puppeteer: this.config.puppeteerOptions
    });

    this.setupEventHandlers();
    await this.client.initialize();
  }

  /**
   * Setup event handlers for the WhatsApp client
   */
  setupEventHandlers() {
    // QR Code for authentication
    this.client.on('qr', (qr) => {
      console.log(chalk.yellow('📱 WhatsApp QR Code:'));
      console.log(chalk.gray('Scan this QR code with your WhatsApp mobile app:'));
      qrcode.generate(qr, { small: true });
      console.log(chalk.gray('Or copy this QR code to your mobile WhatsApp app.'));
    });

    // Ready event
    this.client.on('ready', () => {
      console.log(chalk.green('✅ WhatsApp client is ready!'));
      this.isReady = true;
      this.onReady();
    });

    // Authentication successful
    this.client.on('authenticated', () => {
      console.log(chalk.green('🔐 WhatsApp client authenticated!'));
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      console.error(chalk.red('❌ WhatsApp authentication failed:'), msg);
    });

    // Disconnected
    this.client.on('disconnected', (reason) => {
      console.log(chalk.yellow('📱 WhatsApp client disconnected:'), reason);
      this.isReady = false;
    });

    // Incoming messages
    this.client.on('message', this.handleIncomingMessage);

    // Message sent acknowledgment
    this.client.on('message_ack', (msg, ack) => {
      if (ack === 3) {
        console.log(chalk.gray(`📤 Message delivered: ${msg.id._serialized}`));
      }
    });

    // Error handling
    this.client.on('error', (error) => {
      console.error(chalk.red('❌ WhatsApp client error:'), error);
    });
  }

  /**
   * Handle when client is ready
   */
  async onReady() {
    const clientInfo = this.client.info;
    console.log(chalk.green('📱 Connected as:'), clientInfo.pushname || clientInfo.me.user);
    console.log(chalk.green('📞 Phone:'), clientInfo.me.user);

    // Save client info
    const statusPath = path.join(this.sessionPath, 'status.json');
    const status = {
      connected: true,
      connectedAt: new Date().toISOString(),
      phoneNumber: clientInfo.me.user,
      pushName: clientInfo.pushname,
      platform: clientInfo.platform
    };

    try {
      await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
    } catch (error) {
      console.error('Failed to save status:', error);
    }
  }

  /**
   * Handle incoming messages
   */
  async handleIncomingMessage(message) {
    try {
      // Skip messages from self
      if (message.fromMe) return;

      // Get contact info
      const contact = await message.getContact();
      const chat = await message.getChat();
      
      console.log(chalk.blue('📨 New message from:'), contact.pushname || contact.number);
      console.log(chalk.gray('Content:'), message.body);

      // Log the message
      await this.logMessage(message, contact, chat);

      // Process the message for StaticRebel commands
      await this.processMessage(message, contact, chat);

    } catch (error) {
      console.error(chalk.red('Error handling message:'), error);
    }
  }

  /**
   * Log message to StaticRebel system
   */
  async logMessage(message, contact, chat) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      messageId: message.id._serialized,
      from: {
        number: contact.number,
        name: contact.pushname || contact.name || 'Unknown',
        isContact: contact.isMyContact
      },
      chat: {
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup
      },
      content: {
        type: message.type,
        body: message.body,
        hasMedia: message.hasMedia
      }
    };

    // Handle media messages
    if (message.hasMedia) {
      try {
        const media = await message.downloadMedia();
        logEntry.content.media = {
          mimetype: media.mimetype,
          filename: media.filename,
          size: media.data.length
        };
        
        // Save media file
        const mediaDir = path.join(this.sessionPath, 'media');
        await fs.mkdir(mediaDir, { recursive: true });
        const mediaPath = path.join(mediaDir, `${message.id._serialized}_${media.filename || 'media'}`);
        await fs.writeFile(mediaPath, media.data, 'base64');
        logEntry.content.media.path = mediaPath;
      } catch (error) {
        console.error('Failed to download media:', error);
        logEntry.content.media = { error: error.message };
      }
    }

    // Save log entry
    const logsDir = path.join(this.sessionPath, 'logs');
    await fs.mkdir(logsDir, { recursive: true });
    const logFile = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.jsonl`);
    
    try {
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Failed to log message:', error);
    }
  }

  /**
   * Process message for StaticRebel functionality
   */
  async processMessage(message, contact, chat) {
    const text = message.body.toLowerCase().trim();

    // Check if it's a logging command
    if (this.nlpEnabled && this.isLoggingMessage(text)) {
      await this.processLoggingMessage(message, contact, text);
      return;
    }

    // Check for direct commands
    if (text.startsWith('/sr') || text.startsWith('sr ')) {
      await this.processCommand(message, contact, text);
      return;
    }

    // Check for natural language queries
    if (this.shouldProcessAsQuery(text)) {
      await this.processNaturalLanguageQuery(message, contact, text);
    }
  }

  /**
   * Check if message is a logging entry
   */
  isLoggingMessage(text) {
    const loggingKeywords = [
      'drank', 'drink', 'water', 'ate', 'eat', 'exercise', 'workout', 'sleep', 'slept',
      'weight', 'mood', 'meditation', 'walk', 'run', 'gym', 'vitamins', 'pills'
    ];
    
    return loggingKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Process logging message using NLP
   */
  async processLoggingMessage(message, contact, text) {
    try {
      // This would integrate with StaticRebel's LLM to parse the message
      const logEntry = await this.parseLoggingEntry(text);
      
      if (logEntry) {
        // Save to StaticRebel's tracking system
        await this.saveToTrackingSystem(logEntry, contact);
        
        // Send confirmation
        const confirmation = this.generateConfirmation(logEntry);
        await this.sendMessage(message.from, confirmation);
      }
    } catch (error) {
      console.error('Failed to process logging message:', error);
      await this.sendMessage(message.from, 'Sorry, I couldn\'t understand that entry. Please try again.');
    }
  }

  /**
   * Parse logging entry using natural language
   */
  async parseLoggingEntry(text) {
    // First try simple pattern matching for speed
    const patterns = {
      water: /(?:drank|drink|had)\s+(\d+)\s*(?:glasses?|cups?|liters?|l|oz)\s*(?:of\s+)?water/i,
      exercise: /(?:exercised|workout|worked out)\s+(?:for\s+)?(\d+)\s*(?:minutes?|mins?|hours?|hrs?)/i,
      weight: /(?:weigh|weight)\s+(\d+(?:\.\d+)?)\s*(?:lbs?|kg|pounds?|kilograms?)/i,
      mood: /(?:mood|feeling)\s+(.+)/i
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        return {
          type,
          value: match[1],
          originalText: text,
          timestamp: new Date().toISOString()
        };
      }
    }

    // If pattern matching fails, try LLM parsing for more complex entries
    try {
      const { chatCompletion, getDefaultModel } = await import('../modelRegistry.js');
      const model = getDefaultModel();
      
      const prompt = `Parse this health/fitness log entry and extract structured data. 
      Return JSON with type, value, and unit. Supported types: water, exercise, weight, mood, food, sleep, vitamins, steps.
      
      Examples:
      "drank 3 glasses of water" -> {"type": "water", "value": "3", "unit": "glasses"}
      "ran for 25 minutes" -> {"type": "exercise", "value": "25", "unit": "minutes"}
      "weight is 150 pounds" -> {"type": "weight", "value": "150", "unit": "pounds"}
      
      Entry: "${text}"
      
      Return only valid JSON or null if not a health entry:`;

      const response = await chatCompletion(model, [
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(response.content || 'null');
      if (parsed && parsed.type) {
        return {
          type: parsed.type,
          value: parsed.value,
          unit: parsed.unit,
          originalText: text,
          timestamp: new Date().toISOString(),
          parsedByLLM: true
        };
      }
    } catch (error) {
      console.error('LLM parsing failed:', error);
    }

    return null;
  }

  /**
   * Save entry to StaticRebel's tracking system
   */
  async saveToTrackingSystem(logEntry, contact) {
    // This would integrate with StaticRebel's database
    const trackingDir = path.join(this.sessionPath, 'tracking');
    await fs.mkdir(trackingDir, { recursive: true });
    
    const trackingFile = path.join(trackingDir, `${new Date().toISOString().split('T')[0]}.jsonl`);
    const entry = {
      ...logEntry,
      source: 'whatsapp',
      contact: {
        number: contact.number,
        name: contact.pushname || contact.name
      }
    };
    
    await fs.appendFile(trackingFile, JSON.stringify(entry) + '\n');
  }

  /**
   * Generate confirmation message
   */
  generateConfirmation(logEntry) {
    const confirmations = {
      water: `✅ Logged: ${logEntry.value} of water`,
      exercise: `💪 Great! Logged ${logEntry.value} of exercise`,
      weight: `⚖️ Weight logged: ${logEntry.value}`,
      mood: `😊 Mood logged: ${logEntry.value}`
    };

    return confirmations[logEntry.type] || '✅ Entry logged successfully';
  }

  /**
   * Check if should process as natural language query
   */
  shouldProcessAsQuery(text) {
    const queryKeywords = ['how much', 'what was', 'show me', 'stats', 'summary', 'today', 'yesterday'];
    return queryKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Process natural language query
   */
  async processNaturalLanguageQuery(message, contact, text) {
    try {
      // Generate response using StaticRebel's LLM
      const response = await this.generateQueryResponse(text, contact);
      await this.sendMessage(message.from, response);
    } catch (error) {
      console.error('Failed to process query:', error);
      await this.sendMessage(message.from, 'Sorry, I couldn\'t process your query right now.');
    }
  }

  /**
   * Generate response for natural language query
   */
  async generateQueryResponse(text, contact) {
    if (text.includes('summary') || text.includes('stats')) {
      return await this.generateDailySummary();
    }
    
    try {
      const { chatCompletion, getDefaultModel } = await import('../modelRegistry.js');
      const model = getDefaultModel();
      
      // Get recent tracking data for context
      const today = new Date().toISOString().split('T')[0];
      const trackingFile = path.join(this.sessionPath, 'tracking', `${today}.jsonl`);
      let recentData = '';
      
      try {
        if (existsSync(trackingFile)) {
          const data = await fs.readFile(trackingFile, 'utf-8');
          const entries = data.trim().split('\n').slice(-5); // Last 5 entries
          recentData = entries.map(line => {
            const entry = JSON.parse(line);
            return `${entry.type}: ${entry.value} ${entry.unit || ''} (${entry.timestamp})`;
          }).join('\n');
        }
      } catch (error) {
        console.error('Error reading tracking data:', error);
      }
      
      const prompt = `You are StaticRebel, a health and fitness tracking assistant responding via WhatsApp. 
      The user ${contact.name || contact.number} asked: "${text}"
      
      Recent tracking data for today:
      ${recentData || 'No entries today yet.'}
      
      Respond conversationally and helpfully. Keep responses concise for mobile messaging.
      If they're asking about their data, use the tracking info above.
      If encouraging logging, suggest natural language like "drank 2 glasses of water".
      
      Response:`;

      const response = await chatCompletion(model, [
        { role: 'user', content: prompt }
      ]);

      return response.content || "I'm here to help track your health and fitness! Try telling me what you've done today.";
      
    } catch (error) {
      console.error('Failed to generate LLM response:', error);
      return "I'm here to help! Try asking for your daily summary or tell me about your activities.";
    }
  }

  /**
   * Generate daily summary
   */
  async generateDailySummary() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const trackingFile = path.join(this.sessionPath, 'tracking', `${today}.jsonl`);
      
      if (!existsSync(trackingFile)) {
        return "📊 No entries logged today yet. Start by telling me what you've done! (e.g., 'drank 2 glasses of water')";
      }

      const data = await fs.readFile(trackingFile, 'utf-8');
      const entries = data.trim().split('\n').map(line => JSON.parse(line));
      
      const summary = {
        water: 0,
        exercise: 0,
        entries: entries.length
      };

      entries.forEach(entry => {
        if (entry.type === 'water') {
          summary.water += parseInt(entry.value) || 0;
        } else if (entry.type === 'exercise') {
          summary.exercise += parseInt(entry.value) || 0;
        }
      });

      return `📊 *Today's Summary*\n\n` +
             `💧 Water: ${summary.water} glasses\n` +
             `💪 Exercise: ${summary.exercise} minutes\n` +
             `📝 Total entries: ${summary.entries}`;
             
    } catch (error) {
      console.error('Failed to generate summary:', error);
      return "Sorry, I couldn't generate your summary right now.";
    }
  }

  /**
   * Process StaticRebel commands
   */
  async processCommand(message, contact, text) {
    const parts = text.replace(/^\/sr\s+|^sr\s+/, '').split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
      case 'help':
        await this.sendHelpMessage(message.from);
        break;
      case 'stats':
        const summary = await this.generateDailySummary();
        await this.sendMessage(message.from, summary);
        break;
      case 'ping':
        await this.sendMessage(message.from, 'pong! 🏓 StaticRebel is online.');
        break;
      default:
        await this.sendMessage(message.from, `Unknown command: ${command}. Type '/sr help' for available commands.`);
    }
  }

  /**
   * Send help message
   */
  async sendHelpMessage(to) {
    const helpText = `🤖 *StaticRebel WhatsApp Commands*\n\n` +
                     `*Natural Logging:*\n` +
                     `• "drank 2 glasses of water"\n` +
                     `• "exercised for 30 minutes"\n` +
                     `• "weight 150 lbs"\n\n` +
                     `*Commands:*\n` +
                     `• /sr stats - Daily summary\n` +
                     `• /sr help - This help message\n` +
                     `• /sr ping - Test connection\n\n` +
                     `*Queries:*\n` +
                     `• "show me today's summary"\n` +
                     `• "how much water did I drink?"\n\n` +
                     `Just talk naturally! I'll understand what you mean. 😊`;

    await this.sendMessage(to, helpText);
  }

  /**
   * Send message to a contact
   */
  async sendMessage(to, message, options = {}) {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const msg = await this.client.sendMessage(to, message, options);
      console.log(chalk.green('📤 Message sent to:'), to);
      return msg;
    } catch (error) {
      console.error(chalk.red('Failed to send message:'), error);
      throw error;
    }
  }

  /**
   * Send media message
   */
  async sendMedia(to, media, caption = '') {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const messageMedia = MessageMedia.fromFilePath(media);
      const msg = await this.client.sendMessage(to, messageMedia, { caption });
      console.log(chalk.green('📤 Media sent to:'), to);
      return msg;
    } catch (error) {
      console.error(chalk.red('Failed to send media:'), error);
      throw error;
    }
  }

  /**
   * Send nudge/reminder
   */
  async sendNudge(to, type = 'general') {
    const nudges = {
      water: "💧 Hey! Don't forget to stay hydrated. When did you last drink water?",
      exercise: "💪 Time for some movement! Any physical activity today?",
      general: "👋 Just checking in! How are you doing today?",
      summary: "📊 Want to see your daily progress? Just ask for your summary!"
    };

    const message = nudges[type] || nudges.general;
    return await this.sendMessage(to, message);
  }

  /**
   * Send daily summary to specified contacts
   */
  async sendDailySummaryToContacts(contacts = []) {
    if (!this.isReady) {
      console.log('WhatsApp client not ready for daily summary');
      return;
    }

    const summary = await this.generateDailySummary();
    
    for (const contact of contacts) {
      try {
        await this.sendMessage(contact, `🌅 *Daily Summary*\n\n${summary}`);
        console.log(chalk.blue('📊 Daily summary sent to:'), contact);
      } catch (error) {
        console.error(`Failed to send daily summary to ${contact}:`, error);
      }
    }
  }

  /**
   * Get client status
   */
  async getStatus() {
    const statusPath = path.join(this.sessionPath, 'status.json');
    
    try {
      const statusData = await fs.readFile(statusPath, 'utf-8');
      const status = JSON.parse(statusData);
      
      return {
        connected: this.isReady,
        ...status,
        currentState: this.client?.info || null
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Get chat list
   */
  async getChatList() {
    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    const chats = await this.client.getChats();
    return chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage
    }));
  }

  /**
   * Stop the WhatsApp client
   */
  async stop() {
    if (!this.client) {
      console.log('WhatsApp client is not running');
      return;
    }

    try {
      await this.client.logout();
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
      console.log(chalk.yellow('📱 WhatsApp client stopped'));
      
      // Update status
      const statusPath = path.join(this.sessionPath, 'status.json');
      const status = { connected: false, disconnectedAt: new Date().toISOString() };
      await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
      
    } catch (error) {
      console.error(chalk.red('Error stopping WhatsApp client:'), error);
    }
  }

  /**
   * Enable/disable natural language processing
   */
  setNlpEnabled(enabled = true) {
    this.nlpEnabled = enabled;
    console.log(chalk.blue(`🧠 NLP ${enabled ? 'enabled' : 'disabled'} for WhatsApp integration`));
  }

  /**
   * Register custom message handler
   */
  registerMessageHandler(name, handler) {
    this.messageHandlers.set(name, handler);
    console.log(chalk.blue(`📝 Registered message handler: ${name}`));
  }

  /**
   * Remove custom message handler
   */
  removeMessageHandler(name) {
    this.messageHandlers.delete(name);
    console.log(chalk.blue(`🗑️ Removed message handler: ${name}`));
  }
}

// Create singleton instance
let whatsappInstance = null;

export function getWhatsAppService(options = {}) {
  if (!whatsappInstance) {
    whatsappInstance = new WhatsAppIntegration(options);
  }
  return whatsappInstance;
}

export default WhatsAppIntegration;