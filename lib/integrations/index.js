/**
 * Integration Manager for StaticRebel
 * 
 * Central hub for managing external integrations like Discord, Slack, etc.
 */

import { createDiscordIntegration } from './discord.js';
import { EventEmitter } from 'events';

export class IntegrationManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.integrations = new Map();
    this.config = options;
    this.isInitialized = false;
  }

  /**
   * Initialize all configured integrations
   */
  async initialize() {
    console.log('🔌 Initializing integrations...');

    try {
      // Initialize Discord integration if configured
      if (this.shouldInitializeDiscord()) {
        await this.initializeDiscord();
      }

      // Add other integrations here as needed
      // if (this.shouldInitializeSlack()) {
      //   await this.initializeSlack();
      // }

      this.isInitialized = true;
      this.emit('initialized', { integrations: Array.from(this.integrations.keys()) });
      
      console.log(`✅ Initialized ${this.integrations.size} integration(s)`);
    } catch (error) {
      console.error('❌ Failed to initialize integrations:', error);
      throw error;
    }
  }

  /**
   * Check if Discord integration should be initialized
   */
  shouldInitializeDiscord() {
    return !!(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CLIENT_ID);
  }

  /**
   * Initialize Discord integration
   */
  async initializeDiscord() {
    try {
      console.log('🤖 Starting Discord integration...');
      
      const discord = createDiscordIntegration(this.config.discord || {});
      await discord.start();
      
      this.integrations.set('discord', discord);
      this.emit('discord:ready', discord);
      
      console.log('✅ Discord integration ready');
      return discord;
    } catch (error) {
      console.error('❌ Discord integration failed:', error);
      throw error;
    }
  }

  /**
   * Get an integration by name
   */
  getIntegration(name) {
    return this.integrations.get(name);
  }

  /**
   * Get Discord integration
   */
  getDiscord() {
    return this.getIntegration('discord');
  }

  /**
   * Check if an integration is available
   */
  hasIntegration(name) {
    return this.integrations.has(name);
  }

  /**
   * Send notification across all available integrations
   */
  async sendNotification(message, options = {}) {
    const { platforms = ['discord'], ...notificationOptions } = options;
    const results = [];

    for (const platform of platforms) {
      const integration = this.getIntegration(platform);
      if (integration && integration.sendMessage) {
        try {
          const result = await integration.sendMessage(message, notificationOptions);
          results.push({ platform, success: true, result });
        } catch (error) {
          console.error(`Failed to send notification via ${platform}:`, error);
          results.push({ platform, success: false, error: error.message });
        }
      }
    }

    return results;
  }

  /**
   * Send nudge across platforms
   */
  async sendNudge(nudgeConfig) {
    const discord = this.getDiscord();
    if (discord) {
      return await discord.sendNudge(nudgeConfig);
    }
    throw new Error('No integration available for sending nudges');
  }

  /**
   * Send streak announcement
   */
  async sendStreakAnnouncement(streakData) {
    const discord = this.getDiscord();
    if (discord) {
      return await discord.sendStreakAnnouncement(streakData);
    }
    throw new Error('No integration available for streak announcements');
  }

  /**
   * Log activity across platforms
   */
  async logActivity(logEntry, platforms = ['discord']) {
    const results = [];

    for (const platform of platforms) {
      const integration = this.getIntegration(platform);
      if (integration && integration.saveLogEntry) {
        try {
          await integration.saveLogEntry(logEntry);
          results.push({ platform, success: true });
        } catch (error) {
          console.error(`Failed to log activity via ${platform}:`, error);
          results.push({ platform, success: false, error: error.message });
        }
      }
    }

    return results;
  }

  /**
   * Get user statistics from integrations
   */
  async getUserStats(userId, period = 'week', platforms = ['discord']) {
    const stats = {};

    for (const platform of platforms) {
      const integration = this.getIntegration(platform);
      if (integration && integration.getUserStats) {
        try {
          stats[platform] = await integration.getUserStats(userId, period);
        } catch (error) {
          console.error(`Failed to get stats from ${platform}:`, error);
          stats[platform] = { error: error.message };
        }
      }
    }

    return stats;
  }

  /**
   * Shutdown all integrations
   */
  async shutdown() {
    console.log('🛑 Shutting down integrations...');

    const shutdownPromises = Array.from(this.integrations.entries()).map(
      async ([name, integration]) => {
        try {
          if (integration.stop) {
            await integration.stop();
            console.log(`✅ ${name} integration stopped`);
          }
        } catch (error) {
          console.error(`❌ Failed to stop ${name} integration:`, error);
        }
      }
    );

    await Promise.all(shutdownPromises);
    this.integrations.clear();
    this.isInitialized = false;

    console.log('✅ All integrations stopped');
  }

  /**
   * Get status of all integrations
   */
  getStatus() {
    const status = {
      initialized: this.isInitialized,
      integrations: {}
    };

    for (const [name, integration] of this.integrations) {
      status.integrations[name] = {
        available: true,
        ready: integration.isReady || true
      };
    }

    return status;
  }

  /**
   * Setup event forwarding from integrations to StaticRebel
   */
  setupEventForwarding() {
    // Forward Discord events to StaticRebel
    const discord = this.getDiscord();
    if (discord) {
      // These events would be emitted from the Discord integration
      // when users interact with the bot
      discord.on?.('logEntry', (entry) => {
        this.emit('activity:logged', { platform: 'discord', entry });
      });

      discord.on?.('challengeJoined', (data) => {
        this.emit('challenge:joined', { platform: 'discord', ...data });
      });

      discord.on?.('streakMilestone', (data) => {
        this.emit('streak:milestone', { platform: 'discord', ...data });
      });
    }
  }
}

/**
 * Create and initialize integration manager
 */
export async function createIntegrationManager(config = {}) {
  const manager = new IntegrationManager(config);
  await manager.initialize();
  manager.setupEventForwarding();
  return manager;
}

/**
 * Global integration manager instance
 */
let globalManager = null;

/**
 * Get or create global integration manager
 */
export async function getIntegrationManager(config = {}) {
  if (!globalManager) {
    globalManager = await createIntegrationManager(config);
  }
  return globalManager;
}

/**
 * Shutdown global integration manager
 */
export async function shutdownIntegrationManager() {
  if (globalManager) {
    await globalManager.shutdown();
    globalManager = null;
  }
}

// Export Discord integration for direct use
export { createDiscordIntegration } from './discord.js';

export default IntegrationManager;