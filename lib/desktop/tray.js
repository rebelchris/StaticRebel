/**
 * System Tray Integration for StaticRebel
 * 
 * Cross-platform system tray with quick actions and stats display.
 * Uses native bindings when available, falls back gracefully.
 */

import os from 'os';
import path from 'path';

/**
 * System Tray Manager
 * 
 * Provides system tray functionality with graceful degradation:
 * - macOS: Menu bar widget
 * - Windows: System tray icon
 * - Linux: Desktop notification area
 */
export class SystemTray {
  constructor(options = {}) {
    this.options = {
      iconPath: options.iconPath,
      title: options.title || 'StaticRebel',
      skillManager: options.skillManager,
      goalTracker: options.goalTracker,
      onQuickLog: options.onQuickLog,
      onShowStats: options.onShowStats
    };

    this.platform = os.platform();
    this.tray = null;
    this.isInitialized = false;
    this.stats = {};
  }

  /**
   * Initialize system tray
   */
  async init() {
    try {
      // Try to use electron's Tray if available (for desktop apps)
      if (await this.tryElectronTray()) {
        console.log('✓ Using Electron system tray');
        return;
      }

      // Try platform-specific solutions
      if (await this.tryNativeTray()) {
        console.log('✓ Using native system tray');
        return;
      }

      // Fallback to polling-based status updates
      await this.initFallback();
      console.log('✓ Using fallback tray (status updates only)');

    } catch (error) {
      throw new Error(`System tray initialization failed: ${error.message}`);
    }

    this.isInitialized = true;
  }

  /**
   * Try to use Electron's Tray API
   */
  async tryElectronTray() {
    try {
      // Check if we're in an Electron environment
      const { app, Tray, Menu } = await import('electron').catch(() => null);
      if (!app || !Tray) return false;

      await app.whenReady();

      this.tray = new Tray(this.options.iconPath);
      this.tray.setToolTip(this.options.title);

      await this.updateElectronMenu();

      // Update stats periodically
      setInterval(() => this.updateStats(), 30000);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update Electron tray menu
   */
  async updateElectronMenu() {
    if (!this.tray) return;

    const { Menu } = await import('electron');
    
    const menuTemplate = [
      {
        label: 'StaticRebel Status',
        enabled: false
      },
      { type: 'separator' }
    ];

    // Add quick stats
    if (this.options.goalTracker) {
      const today = new Date().toISOString().split('T')[0];
      try {
        this.stats = await this.options.goalTracker.getDailyStats(today);
        
        for (const [skill, data] of Object.entries(this.stats)) {
          const progress = data.target ? Math.round((data.current / data.target) * 100) : 0;
          menuTemplate.push({
            label: `${skill}: ${data.current}${data.target ? `/${data.target}` : ''} (${progress}%)`,
            enabled: false
          });
        }
      } catch (error) {
        menuTemplate.push({
          label: 'Stats unavailable',
          enabled: false
        });
      }
    }

    menuTemplate.push(
      { type: 'separator' },
      {
        label: 'Quick Actions',
        submenu: await this.buildQuickActionsMenu()
      },
      { type: 'separator' },
      {
        label: 'Show Stats',
        click: () => this.options.onShowStats?.()
      },
      {
        label: 'Open StaticRebel',
        click: () => {
          // Could launch the main app or open terminal
          console.log('Opening StaticRebel...');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          this.destroy();
          // Don't quit the entire app, just hide tray
        }
      }
    );

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Build quick actions submenu
   */
  async buildQuickActionsMenu() {
    const actions = [];

    if (this.options.skillManager) {
      try {
        const skills = Array.from(this.options.skillManager.skills.entries())
          .filter(([id]) => !id.startsWith('_'))
          .slice(0, 5); // Limit to 5 most recent skills

        for (const [skillId, skill] of skills) {
          actions.push({
            label: `Log ${skill.name}`,
            click: () => this.options.onQuickLog?.(skillId)
          });
        }
      } catch (error) {
        actions.push({
          label: 'Skills unavailable',
          enabled: false
        });
      }
    }

    if (actions.length === 0) {
      actions.push({
        label: 'No quick actions available',
        enabled: false
      });
    }

    return actions;
  }

  /**
   * Try platform-specific native solutions
   */
  async tryNativeTray() {
    switch (this.platform) {
      case 'win32':
        return await this.tryWindowsTray();
      case 'darwin':
        return await this.tryMacOSTray();
      case 'linux':
        return await this.tryLinuxTray();
      default:
        return false;
    }
  }

  /**
   * Windows system tray using native modules
   */
  async tryWindowsTray() {
    try {
      // Try node-windows-tray if available
      const WindowsTray = await import('node-windows-tray').catch(() => null);
      if (!WindowsTray) return false;

      this.tray = new WindowsTray.default({
        icon: this.options.iconPath,
        title: this.options.title
      });

      // Add basic menu items
      this.tray.addMenuItem({
        label: 'Show Stats',
        onclick: () => this.options.onShowStats?.()
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * macOS menu bar using native modules
   */
  async tryMacOSTray() {
    try {
      // Try menubar if available
      const { menubar } = await import('menubar').catch(() => ({}));
      if (!menubar) return false;

      this.tray = menubar({
        icon: this.options.iconPath,
        tooltip: this.options.title,
        preloadWindow: true
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Linux desktop notification area
   */
  async tryLinuxTray() {
    try {
      // Linux tray support is complex and varies by desktop environment
      // For now, we'll just return false and use fallback
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fallback mode - just periodic status updates
   */
  async initFallback() {
    // In fallback mode, we just log status updates periodically
    setInterval(async () => {
      try {
        await this.updateStats();
        console.log(`📊 StaticRebel Status: ${this.getStatusSummary()}`);
      } catch (error) {
        // Silently continue
      }
    }, 300000); // Every 5 minutes

    this.tray = { fallback: true };
  }

  /**
   * Update stats from goal tracker
   */
  async updateStats() {
    if (!this.options.goalTracker) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      this.stats = await this.options.goalTracker.getDailyStats(today);

      // Update tray tooltip/title with current progress
      if (this.tray && !this.tray.fallback) {
        const summary = this.getStatusSummary();
        
        if (this.tray.setToolTip) {
          this.tray.setToolTip(`${this.options.title} - ${summary}`);
        }
        
        // Update Electron menu
        if (this.tray.setContextMenu) {
          await this.updateElectronMenu();
        }
      }
    } catch (error) {
      console.error('Failed to update tray stats:', error);
    }
  }

  /**
   * Get a summary of current stats
   */
  getStatusSummary() {
    if (Object.keys(this.stats).length === 0) {
      return 'No goals today';
    }

    const completed = Object.values(this.stats).filter(s => s.current >= s.target).length;
    const total = Object.keys(this.stats).length;
    
    return `${completed}/${total} goals completed`;
  }

  /**
   * Show balloon/toast notification (Windows)
   */
  async showBalloon(title, content) {
    if (this.tray?.displayBalloon) {
      this.tray.displayBalloon({
        title,
        content,
        icon: this.options.iconPath
      });
    }
  }

  /**
   * Destroy the tray
   */
  async destroy() {
    if (this.tray) {
      if (this.tray.destroy) {
        this.tray.destroy();
      }
      this.tray = null;
    }
    this.isInitialized = false;
  }

  /**
   * Check if tray is supported on this platform
   */
  static isSupported() {
    const platform = os.platform();
    return platform === 'win32' || platform === 'darwin' || platform === 'linux';
  }
}

export default SystemTray;