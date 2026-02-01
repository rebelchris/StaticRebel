/**
 * Discord Integration for StaticRebel
 * Provides Discord bot functionality including:
 * - Slash commands (/log, /stats, /challenge)
 * - Message-based logging
 * - Nudges and notifications
 * - Challenge leaderboards
 * - Streak announcements
 * - Webhook support
 */

import { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  REST, 
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
  WebhookClient,
  ActivityType
} from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DiscordIntegration {
  constructor(options = {}) {
    this.config = {
      token: process.env.DISCORD_BOT_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID,
      guildId: process.env.DISCORD_GUILD_ID, // Optional for global commands
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      prefix: process.env.DISCORD_PREFIX || 'sr!',
      defaultChannel: process.env.DISCORD_DEFAULT_CHANNEL,
      ...options
    };

    this.client = null;
    this.webhook = null;
    this.isReady = false;
    this.commandMap = new Map();
    
    // Initialize webhooks if URL is provided
    if (this.config.webhookUrl) {
      try {
        this.webhook = new WebhookClient({ url: this.config.webhookUrl });
      } catch (error) {
        console.error('Failed to initialize Discord webhook:', error);
      }
    }

    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
    this.sendNudge = this.sendNudge.bind(this);
  }

  /**
   * Initialize and start the Discord bot
   */
  async start() {
    if (!this.config.token) {
      throw new Error('Discord bot token is required. Set DISCORD_BOT_TOKEN environment variable.');
    }

    if (this.isReady) {
      console.log('Discord bot is already running');
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
      ]
    });

    // Set up event handlers
    this.setupEventHandlers();
    
    // Register slash commands
    await this.registerCommands();

    // Start the bot
    await this.client.login(this.config.token);
    
    console.log('Discord integration started successfully');
    return this;
  }

  /**
   * Stop the Discord bot
   */
  async stop() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
    this.isReady = false;
    console.log('Discord integration stopped');
  }

  /**
   * Set up Discord event handlers
   */
  setupEventHandlers() {
    this.client.once('ready', () => {
      console.log(`Discord bot logged in as ${this.client.user.tag}`);
      this.client.user.setActivity('StaticRebel AI Assistant', { type: ActivityType.Watching });
      this.isReady = true;
    });

    // Handle slash commands
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      
      try {
        await this.handleSlashCommand(interaction);
      } catch (error) {
        console.error('Error handling slash command:', error);
        const errorMessage = 'There was an error executing this command.';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    });

    // Handle prefix commands and message logging
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      try {
        await this.handleMessage(message);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    // Error handling
    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    this.client.on('warn', (warning) => {
      console.warn('Discord client warning:', warning);
    });
  }

  /**
   * Register slash commands
   */
  async registerCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName('log')
        .setDescription('Log an activity or entry')
        .addStringOption(option =>
          option.setName('entry')
            .setDescription('The log entry to record')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Category for the log entry')
            .setRequired(false)
            .addChoices(
              { name: 'Work', value: 'work' },
              { name: 'Exercise', value: 'exercise' },
              { name: 'Learning', value: 'learning' },
              { name: 'Personal', value: 'personal' },
              { name: 'Health', value: 'health' }
            )),

      new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your statistics and progress')
        .addStringOption(option =>
          option.setName('period')
            .setDescription('Time period for stats')
            .setRequired(false)
            .addChoices(
              { name: 'Today', value: 'today' },
              { name: 'This Week', value: 'week' },
              { name: 'This Month', value: 'month' },
              { name: 'All Time', value: 'all' }
            )),

      new SlashCommandBuilder()
        .setName('challenge')
        .setDescription('Challenge and leaderboard commands')
        .addSubcommand(subcommand =>
          subcommand
            .setName('leaderboard')
            .setDescription('View the challenge leaderboard')
            .addStringOption(option =>
              option.setName('type')
                .setDescription('Type of challenge')
                .setRequired(false)
                .addChoices(
                  { name: 'All', value: 'all' },
                  { name: 'Daily', value: 'daily' },
                  { name: 'Weekly', value: 'weekly' },
                  { name: 'Monthly', value: 'monthly' }
                )))
        .addSubcommand(subcommand =>
          subcommand
            .setName('join')
            .setDescription('Join a challenge')
            .addStringOption(option =>
              option.setName('challenge')
                .setDescription('Challenge to join')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('create')
            .setDescription('Create a new challenge')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Challenge name')
                .setRequired(true))
            .addStringOption(option =>
              option.setName('description')
                .setDescription('Challenge description')
                .setRequired(true))
            .addIntegerOption(option =>
              option.setName('duration')
                .setDescription('Duration in days')
                .setRequired(true))),

      new SlashCommandBuilder()
        .setName('streak')
        .setDescription('View your current streak information')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of streak to check')
            .setRequired(false)),

      new SlashCommandBuilder()
        .setName('nudge')
        .setDescription('Set up nudge notifications')
        .addSubcommand(subcommand =>
          subcommand
            .setName('schedule')
            .setDescription('Schedule a nudge')
            .addStringOption(option =>
              option.setName('message')
                .setDescription('Nudge message')
                .setRequired(true))
            .addStringOption(option =>
              option.setName('time')
                .setDescription('Time for nudge (HH:MM format)')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('list')
            .setDescription('List active nudges'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('cancel')
            .setDescription('Cancel a nudge')
            .addIntegerOption(option =>
              option.setName('id')
                .setDescription('Nudge ID to cancel')
                .setRequired(true)))
    ];

    const rest = new REST({ version: '10' }).setToken(this.config.token);

    try {
      console.log('Refreshing Discord slash commands...');
      
      if (this.config.guildId) {
        // Register commands for specific guild (faster for development)
        await rest.put(
          Routes.applicationGuildCommands(this.config.clientId, this.config.guildId),
          { body: commands }
        );
        console.log('Successfully registered guild-specific slash commands');
      } else {
        // Register global commands (takes up to 1 hour to propagate)
        await rest.put(
          Routes.applicationCommands(this.config.clientId),
          { body: commands }
        );
        console.log('Successfully registered global slash commands');
      }
    } catch (error) {
      console.error('Error registering slash commands:', error);
      throw error;
    }
  }

  /**
   * Handle slash command interactions
   */
  async handleSlashCommand(interaction) {
    const { commandName } = interaction;

    switch (commandName) {
      case 'log':
        await this.handleLogCommand(interaction);
        break;
      case 'stats':
        await this.handleStatsCommand(interaction);
        break;
      case 'challenge':
        await this.handleChallengeCommand(interaction);
        break;
      case 'streak':
        await this.handleStreakCommand(interaction);
        break;
      case 'nudge':
        await this.handleNudgeCommand(interaction);
        break;
      default:
        await interaction.reply({ 
          content: 'Unknown command!', 
          ephemeral: true 
        });
    }
  }

  /**
   * Handle /log command
   */
  async handleLogCommand(interaction) {
    await interaction.deferReply();

    const entry = interaction.options.getString('entry');
    const category = interaction.options.getString('category') || 'general';
    const userId = interaction.user.id;
    const username = interaction.user.username;

    try {
      // Create log entry
      const logEntry = {
        id: Date.now().toString(),
        userId,
        username,
        entry,
        category,
        timestamp: new Date().toISOString(),
        source: 'discord',
        channelId: interaction.channelId,
        guildId: interaction.guildId
      };

      // Save to tracking system
      await this.saveLogEntry(logEntry);

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle('✅ Log Entry Recorded')
        .setDescription(entry)
        .addFields(
          { name: 'Category', value: category, inline: true },
          { name: 'Time', value: new Date().toLocaleString(), inline: true }
        )
        .setFooter({ text: `Logged by ${username}` });

      await interaction.editReply({ embeds: [embed] });

      // Update streak if applicable
      await this.updateStreak(userId, category);

    } catch (error) {
      console.error('Error saving log entry:', error);
      await interaction.editReply({ 
        content: 'Failed to save log entry. Please try again.' 
      });
    }
  }

  /**
   * Handle /stats command
   */
  async handleStatsCommand(interaction) {
    await interaction.deferReply();

    const period = interaction.options.getString('period') || 'week';
    const userId = interaction.user.id;
    const username = interaction.user.username;

    try {
      const stats = await this.getUserStats(userId, period);
      
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`📊 ${username}'s Statistics`)
        .setDescription(`Stats for: ${this.formatPeriod(period)}`)
        .addFields(
          { name: 'Total Entries', value: stats.totalEntries.toString(), inline: true },
          { name: 'Current Streak', value: `${stats.currentStreak} days`, inline: true },
          { name: 'Longest Streak', value: `${stats.longestStreak} days`, inline: true },
          { name: 'Categories', value: this.formatCategoryStats(stats.categories), inline: false }
        )
        .setTimestamp();

      if (stats.weeklyProgress) {
        embed.addFields(
          { name: 'Weekly Progress', value: stats.weeklyProgress, inline: false }
        );
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error fetching stats:', error);
      await interaction.editReply({ 
        content: 'Failed to fetch statistics. Please try again.' 
      });
    }
  }

  /**
   * Handle /challenge command
   */
  async handleChallengeCommand(interaction) {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'leaderboard':
          await this.handleChallengeLeaderboard(interaction);
          break;
        case 'join':
          await this.handleChallengeJoin(interaction);
          break;
        case 'create':
          await this.handleChallengeCreate(interaction);
          break;
      }
    } catch (error) {
      console.error('Error handling challenge command:', error);
      await interaction.editReply({ 
        content: 'Failed to process challenge command. Please try again.' 
      });
    }
  }

  /**
   * Handle challenge leaderboard
   */
  async handleChallengeLeaderboard(interaction) {
    const type = interaction.options.getString('type') || 'all';
    const leaderboard = await this.getChallengeLeaderboard(type);

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🏆 Challenge Leaderboard - ${type.toUpperCase()}`)
      .setTimestamp();

    if (leaderboard.length === 0) {
      embed.setDescription('No challenge data available yet!');
    } else {
      const leaderboardText = leaderboard
        .slice(0, 10) // Top 10
        .map((entry, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          return `${medal} **${entry.username}** - ${entry.score} points`;
        })
        .join('\n');

      embed.setDescription(leaderboardText);
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle streak command
   */
  async handleStreakCommand(interaction) {
    await interaction.deferReply();

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const streakType = interaction.options.getString('type');

    try {
      const streakInfo = await this.getStreakInfo(userId, streakType);

      const embed = new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle(`🔥 ${username}'s Streak Information`)
        .addFields(
          { name: 'Current Streak', value: `${streakInfo.current} days`, inline: true },
          { name: 'Longest Streak', value: `${streakInfo.longest} days`, inline: true },
          { name: 'Last Activity', value: streakInfo.lastActivity || 'None', inline: true }
        )
        .setTimestamp();

      if (streakInfo.milestones) {
        embed.addFields(
          { name: 'Milestones', value: streakInfo.milestones, inline: false }
        );
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error fetching streak info:', error);
      await interaction.editReply({ 
        content: 'Failed to fetch streak information. Please try again.' 
      });
    }
  }

  /**
   * Handle nudge command
   */
  async handleNudgeCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'schedule':
        await this.handleNudgeSchedule(interaction);
        break;
      case 'list':
        await this.handleNudgeList(interaction);
        break;
      case 'cancel':
        await this.handleNudgeCancel(interaction);
        break;
    }
  }

  /**
   * Handle regular messages (prefix commands and auto-logging)
   */
  async handleMessage(message) {
    const content = message.content.trim();
    
    // Check for prefix commands
    if (content.startsWith(this.config.prefix)) {
      await this.handlePrefixCommand(message);
      return;
    }

    // Auto-logging detection (optional feature)
    if (await this.shouldAutoLog(message)) {
      await this.handleAutoLog(message);
    }
  }

  /**
   * Handle prefix-based commands
   */
  async handlePrefixCommand(message) {
    const args = message.content.slice(this.config.prefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    switch (command) {
      case 'ping':
        await message.reply('🏓 Pong! StaticRebel Discord integration is active.');
        break;
      case 'help':
        await this.sendHelpMessage(message);
        break;
      case 'quick-log':
        await this.handleQuickLog(message, args);
        break;
      default:
        await message.reply(`Unknown command: \`${command}\`. Use \`${this.config.prefix}help\` for available commands.`);
    }
  }

  /**
   * Send help message
   */
  async sendHelpMessage(message) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('StaticRebel Discord Commands')
      .setDescription('Available commands for StaticRebel integration')
      .addFields(
        { 
          name: 'Slash Commands', 
          value: [
            '`/log` - Log an activity or entry',
            '`/stats` - View your statistics',
            '`/challenge` - Challenge commands',
            '`/streak` - View streak information',
            '`/nudge` - Manage nudge notifications'
          ].join('\n'),
          inline: false 
        },
        { 
          name: 'Prefix Commands', 
          value: [
            `\`${this.config.prefix}ping\` - Test bot connection`,
            `\`${this.config.prefix}help\` - Show this help message`,
            `\`${this.config.prefix}quick-log\` - Quick log entry`
          ].join('\n'),
          inline: false 
        }
      )
      .setFooter({ text: 'StaticRebel AI Assistant' });

    await message.reply({ embeds: [embed] });
  }

  /**
   * Send message to Discord channel or DM
   */
  async sendMessage(content, options = {}) {
    if (!this.isReady) {
      throw new Error('Discord bot is not ready');
    }

    const {
      channelId,
      userId,
      embed,
      files,
      ephemeral = false
    } = options;

    let target;

    if (channelId) {
      target = await this.client.channels.fetch(channelId);
    } else if (userId) {
      const user = await this.client.users.fetch(userId);
      target = await user.createDM();
    } else if (this.config.defaultChannel) {
      target = await this.client.channels.fetch(this.config.defaultChannel);
    } else {
      throw new Error('No target channel or user specified');
    }

    const messageOptions = {
      content: typeof content === 'string' ? content : null,
      embeds: embed ? [embed] : (content.embeds || []),
      files: files || []
    };

    return await target.send(messageOptions);
  }

  /**
   * Send nudge notification
   */
  async sendNudge(nudgeConfig) {
    const { userId, channelId, message, type = 'reminder' } = nudgeConfig;

    const embed = new EmbedBuilder()
      .setColor(0xFF9500)
      .setTitle('🔔 Nudge Reminder')
      .setDescription(message)
      .setTimestamp()
      .setFooter({ text: `Type: ${type}` });

    try {
      await this.sendMessage(null, {
        userId,
        channelId,
        embed
      });
      
      console.log(`Nudge sent successfully to ${userId || channelId}`);
    } catch (error) {
      console.error('Failed to send nudge:', error);
    }
  }

  /**
   * Send streak announcement
   */
  async sendStreakAnnouncement(streakData) {
    const { userId, streak, milestone, category } = streakData;

    let color = 0xFF6B35;
    let title = `🔥 Streak Update!`;
    let description = `Congratulations! You've maintained your ${category} streak for ${streak} days!`;

    if (milestone) {
      color = 0xFFD700;
      title = `🎉 Milestone Achievement!`;
      description = `Amazing! You've reached a ${streak}-day streak in ${category}! ${milestone.message}`;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    try {
      await this.sendMessage(null, {
        userId,
        embed
      });
    } catch (error) {
      console.error('Failed to send streak announcement:', error);
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhookNotification(content, options = {}) {
    if (!this.webhook) {
      console.warn('No webhook configured');
      return;
    }

    try {
      await this.webhook.send({
        content,
        username: options.username || 'StaticRebel',
        avatarURL: options.avatarURL,
        embeds: options.embeds || []
      });
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
    }
  }

  // ============================================================================
  // Data Management Methods
  // ============================================================================

  /**
   * Save log entry to persistent storage
   */
  async saveLogEntry(logEntry) {
    const dataDir = path.join(process.cwd(), 'data', 'discord');
    const filePath = path.join(dataDir, 'entries.jsonl');
    
    // Ensure directory exists
    await fs.mkdir(dataDir, { recursive: true });
    
    // Append to JSONL file
    const line = JSON.stringify(logEntry) + '\n';
    await fs.appendFile(filePath, line);
    
    console.log(`Log entry saved: ${logEntry.id}`);
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId, period = 'week') {
    // This is a placeholder implementation
    // In a real implementation, you'd query your database
    const stats = {
      totalEntries: 42,
      currentStreak: 7,
      longestStreak: 21,
      categories: {
        work: 15,
        exercise: 12,
        learning: 8,
        personal: 7
      },
      weeklyProgress: '▓▓▓▓▓▓░ 6/7 days'
    };

    return stats;
  }

  /**
   * Get challenge leaderboard
   */
  async getChallengeLeaderboard(type = 'all') {
    // Placeholder implementation
    return [
      { username: 'Alice', score: 150 },
      { username: 'Bob', score: 120 },
      { username: 'Charlie', score: 90 }
    ];
  }

  /**
   * Get streak information
   */
  async getStreakInfo(userId, type) {
    // Placeholder implementation
    return {
      current: 7,
      longest: 21,
      lastActivity: 'Today at 2:30 PM',
      milestones: '🎯 7 days, 🏆 14 days, 💎 21 days'
    };
  }

  /**
   * Update user streak
   */
  async updateStreak(userId, category) {
    // Placeholder for streak update logic
    console.log(`Updating streak for user ${userId} in category ${category}`);
  }

  /**
   * Format period string
   */
  formatPeriod(period) {
    const periods = {
      today: 'Today',
      week: 'This Week',
      month: 'This Month',
      all: 'All Time'
    };
    return periods[period] || 'This Week';
  }

  /**
   * Format category statistics
   */
  formatCategoryStats(categories) {
    return Object.entries(categories)
      .map(([category, count]) => `${category}: ${count}`)
      .join('\n') || 'No categories yet';
  }

  /**
   * Check if message should be auto-logged
   */
  async shouldAutoLog(message) {
    // Implement auto-logging detection logic
    // This could check for keywords, patterns, or user preferences
    return false;
  }

  /**
   * Handle auto-logging
   */
  async handleAutoLog(message) {
    // Implement auto-logging functionality
    console.log('Auto-logging detected for message:', message.content);
  }

  /**
   * Handle quick log via prefix command
   */
  async handleQuickLog(message, args) {
    if (args.length === 0) {
      await message.reply('Usage: `sr!quick-log <entry> [category]`');
      return;
    }

    const entry = args.slice(0, -1).join(' ') || args.join(' ');
    const category = args.length > 1 && args[args.length - 1].startsWith('--') 
      ? args[args.length - 1].substring(2) 
      : 'general';

    const logEntry = {
      id: Date.now().toString(),
      userId: message.author.id,
      username: message.author.username,
      entry,
      category,
      timestamp: new Date().toISOString(),
      source: 'discord-prefix',
      channelId: message.channel.id,
      guildId: message.guild?.id
    };

    try {
      await this.saveLogEntry(logEntry);
      await message.reply(`✅ Quick log saved: "${entry}" (${category})`);
    } catch (error) {
      await message.reply('❌ Failed to save log entry');
    }
  }

  /**
   * Handle nudge scheduling
   */
  async handleNudgeSchedule(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const message = interaction.options.getString('message');
    const time = interaction.options.getString('time');
    
    // Implement nudge scheduling logic
    // This would integrate with a scheduler/cron system
    
    await interaction.editReply({
      content: `📅 Nudge scheduled: "${message}" at ${time}`
    });
  }

  /**
   * Handle nudge listing
   */
  async handleNudgeList(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    // Implement nudge listing logic
    await interaction.editReply({
      content: 'Your scheduled nudges:\n• No nudges scheduled'
    });
  }

  /**
   * Handle nudge cancellation
   */
  async handleNudgeCancel(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const id = interaction.options.getInteger('id');
    
    // Implement nudge cancellation logic
    await interaction.editReply({
      content: `❌ Cancelled nudge #${id}`
    });
  }

  /**
   * Handle challenge join
   */
  async handleChallengeJoin(interaction) {
    const challengeName = interaction.options.getString('challenge');
    
    // Implement challenge join logic
    await interaction.editReply({
      content: `🎯 Joined challenge: ${challengeName}`
    });
  }

  /**
   * Handle challenge creation
   */
  async handleChallengeCreate(interaction) {
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    const duration = interaction.options.getInteger('duration');
    
    // Implement challenge creation logic
    await interaction.editReply({
      content: `🏆 Created challenge: ${name} (${duration} days)`
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create and configure Discord integration instance
 */
export function createDiscordIntegration(options = {}) {
  return new DiscordIntegration(options);
}

/**
 * Initialize Discord integration with default configuration
 */
export async function initializeDiscordIntegration() {
  const integration = createDiscordIntegration();
  
  try {
    await integration.start();
    return integration;
  } catch (error) {
    console.error('Failed to initialize Discord integration:', error);
    throw error;
  }
}

// ============================================================================
// Configuration Utilities
// ============================================================================

/**
 * Validate Discord configuration
 */
export function validateDiscordConfig() {
  const required = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required Discord configuration: ${missing.join(', ')}`);
  }
  
  return true;
}

/**
 * Get Discord configuration help
 */
export function getDiscordConfigHelp() {
  return {
    DISCORD_BOT_TOKEN: 'Bot token from Discord Developer Portal',
    DISCORD_CLIENT_ID: 'Application ID from Discord Developer Portal',
    DISCORD_GUILD_ID: '(Optional) Guild ID for development/testing',
    DISCORD_WEBHOOK_URL: '(Optional) Webhook URL for notifications',
    DISCORD_PREFIX: '(Optional) Prefix for text commands (default: sr!)',
    DISCORD_DEFAULT_CHANNEL: '(Optional) Default channel ID for notifications'
  };
}

// Default export
export default DiscordIntegration;