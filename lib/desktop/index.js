/**
 * Desktop Integration for StaticRebel
 * 
 * Provides cross-platform desktop widgets and notifications:
 * - Desktop notifications via node-notifier
 * - System tray integration (optional, platform-dependent)
 * - Integration with nudges system
 * - Configurable notification types
 */

import notifier from 'node-notifier';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import SystemTray from './tray.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Desktop Integration Manager
 */
export class DesktopIntegration {
  constructor(options = {}) {
    this.config = {
      notifications: {
        enabled: true,
        sound: true,
        timeout: 5000,
        priority: 'normal',
        ...options.notifications
      },
      tray: {
        enabled: true,
        showStats: true,
        quickActions: true,
        ...options.tray
      },
      nudges: {
        enabled: true,
        cooldownMinutes: 60,
        types: ['streak', 'goal', 'time', 'gap'],
        ...options.nudges
      }
    };

    this.nudgeEngine = options.nudgeEngine;
    this.skillManager = options.skillManager;
    this.goalTracker = options.goalTracker;
    this.systemTray = null;
    this.isInitialized = false;
    this.lastNudgeTime = 0;
    
    // Platform detection for graceful degradation
    this.platform = os.platform();
    this.supportsNotifications = true;
    this.supportsTray = this.platform === 'win32' || this.platform === 'darwin' || this.platform === 'linux';
  }

  /**
   * Initialize desktop integration
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Initialize notifications
      if (this.config.notifications.enabled && this.supportsNotifications) {
        await this.initNotifications();
      }

      // Initialize system tray (optional, platform-dependent)
      if (this.config.tray.enabled && this.supportsTray) {
        await this.initSystemTray();
      }

      // Set up nudge polling if nudge engine is available
      if (this.nudgeEngine && this.config.nudges.enabled) {
        this.startNudgePolling();
      }

      this.isInitialized = true;
      console.log('🖥️  Desktop integration initialized');
    } catch (error) {
      console.error('Desktop integration failed to initialize:', error);
      // Continue without desktop features
    }
  }

  /**
   * Initialize notification system
   */
  async initNotifications() {
    try {
      // Test notification
      if (process.env.NODE_ENV !== 'test') {
        await this.showNotification({
          title: 'StaticRebel Desktop',
          message: 'Desktop notifications are now active!',
          icon: this.getIconPath(),
          sound: false
        });
      }
    } catch (error) {
      console.warn('Desktop notifications not available:', error.message);
      this.supportsNotifications = false;
      
      if (error.message.includes('notify-send')) {
        console.log('💡 Install libnotify-bin for Linux desktop notifications: sudo apt-get install libnotify-bin');
      }
    }
  }

  /**
   * Initialize system tray
   */
  async initSystemTray() {
    try {
      this.systemTray = new SystemTray({
        iconPath: this.getIconPath(),
        title: 'StaticRebel',
        skillManager: this.skillManager,
        goalTracker: this.goalTracker,
        onQuickLog: this.handleQuickLog.bind(this),
        onShowStats: this.handleShowStats.bind(this)
      });

      await this.systemTray.init();
      console.log('🔔 System tray initialized');
    } catch (error) {
      console.warn('System tray initialization failed:', error.message);
      this.systemTray = null;
      // Continue without tray
    }
  }

  /**
   * Show desktop notification
   */
  async showNotification(options) {
    if (!this.config.notifications.enabled || !this.supportsNotifications) {
      // Fallback: log to console
      console.log(`🔔 ${options.title || 'StaticRebel'}: ${options.message || ''}`);
      return { fallback: true };
    }

    const notification = {
      title: options.title || 'StaticRebel',
      message: options.message || '',
      icon: options.icon || this.getIconPath(),
      sound: options.sound !== false && this.config.notifications.sound,
      timeout: options.timeout || this.config.notifications.timeout,
      urgency: options.urgency || this.config.notifications.priority,
      actions: options.actions || []
    };

    try {
      return new Promise((resolve, reject) => {
        notifier.notify(notification, (err, response, metadata) => {
          if (err) {
            reject(err);
          } else {
            resolve({ response, metadata });
          }
        });
      });
    } catch (error) {
      // Fallback if notification fails
      console.warn('Notification failed, using fallback:', error.message);
      console.log(`🔔 ${notification.title}: ${notification.message}`);
      this.supportsNotifications = false;
      return { fallback: true };
    }
  }

  /**
   * Show nudge notification
   */
  async showNudge(nudge) {
    if (!this.shouldShowNudge(nudge)) {
      return;
    }

    const priorityIcons = {
      high: '🔥',
      medium: '💡',
      low: '📝'
    };

    const icon = priorityIcons[nudge.priority] || '💡';
    const title = `${icon} StaticRebel Nudge`;

    try {
      await this.showNotification({
        title,
        message: nudge.message,
        urgency: nudge.priority === 'high' ? 'critical' : 'normal',
        timeout: nudge.priority === 'high' ? 10000 : 5000,
        actions: ['Log Now', 'Remind Later', 'Dismiss']
      });

      this.lastNudgeTime = Date.now();
      
      // Mark nudge as sent in the nudge engine
      if (this.nudgeEngine?.markNudged) {
        await this.nudgeEngine.markNudged();
      }
    } catch (error) {
      console.error('Failed to show nudge notification:', error);
    }
  }

  /**
   * Start polling for nudges
   */
  startNudgePolling() {
    const intervalMs = this.config.nudges.cooldownMinutes * 60 * 1000;
    
    setInterval(async () => {
      try {
        const nudges = await this.nudgeEngine.generateNudges();
        
        if (nudges.length > 0) {
          const highPriorityNudge = nudges.find(n => n.priority === 'high') || nudges[0];
          await this.showNudge(highPriorityNudge);
        }
      } catch (error) {
        console.error('Error checking for nudges:', error);
      }
    }, intervalMs);

    console.log(`🔔 Nudge polling started (${this.config.nudges.cooldownMinutes}min intervals)`);
  }

  /**
   * Check if we should show a nudge (rate limiting)
   */
  shouldShowNudge(nudge) {
    if (!this.config.nudges.enabled) return false;
    if (!this.config.nudges.types.includes(nudge.type)) return false;

    const cooldownMs = this.config.nudges.cooldownMinutes * 60 * 1000;
    const timeSinceLastNudge = Date.now() - this.lastNudgeTime;

    return timeSinceLastNudge >= cooldownMs;
  }

  /**
   * Get icon path for notifications/tray
   */
  getIconPath() {
    const iconName = this.platform === 'win32' ? 'icon.ico' : 
                     this.platform === 'darwin' ? 'icon.icns' : 'icon.png';
    
    return path.join(__dirname, 'assets', iconName);
  }

  /**
   * Handle quick log action from tray
   */
  async handleQuickLog(skillId) {
    try {
      // This would integrate with your skill logging system
      console.log(`Quick log requested for skill: ${skillId}`);
      
      await this.showNotification({
        title: 'Quick Log',
        message: `Ready to log ${skillId}. Open StaticRebel to continue.`,
        timeout: 3000
      });
    } catch (error) {
      console.error('Quick log failed:', error);
    }
  }

  /**
   * Handle show stats action from tray
   */
  async handleShowStats() {
    try {
      if (!this.goalTracker) return;

      const today = new Date().toISOString().split('T')[0];
      const stats = await this.goalTracker.getDailyStats(today);
      
      const message = Object.entries(stats)
        .map(([skill, data]) => `${skill}: ${data.current}/${data.target}`)
        .join('\n');

      await this.showNotification({
        title: 'Today\'s Progress',
        message: message || 'No goals set for today',
        timeout: 8000
      });
    } catch (error) {
      console.error('Show stats failed:', error);
    }
  }

  /**
   * Send custom notification
   */
  async notify(title, message, options = {}) {
    return this.showNotification({
      title,
      message,
      ...options
    });
  }

  /**
   * Update tray stats
   */
  async updateTrayStats() {
    if (this.systemTray?.updateStats) {
      await this.systemTray.updateStats();
    }
  }

  /**
   * Shutdown desktop integration
   */
  async shutdown() {
    if (this.systemTray?.destroy) {
      await this.systemTray.destroy();
    }
    this.isInitialized = false;
    console.log('🖥️  Desktop integration shut down');
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      platform: this.platform,
      features: {
        notifications: this.config.notifications.enabled && this.supportsNotifications,
        systemTray: this.config.tray.enabled && this.supportsTray && !!this.systemTray,
        nudges: this.config.nudges.enabled && !!this.nudgeEngine
      },
      config: this.config
    };
  }
}

export default DesktopIntegration;