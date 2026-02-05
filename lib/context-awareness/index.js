/**
 * Context Awareness - Know what the user is doing
 *
 * Features:
 * - Active window tracking
 * - Open application monitoring
 * - Recent activity history
 * - User context inference
 * - Activity patterns
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const CONTEXT_VERSION = '1.0.0';

const DEFAULT_OPTIONS = {
  pollInterval: 5000,
  historySize: 100,
  trackWindows: true,
  trackApps: true,
  trackKeyboard: true,
  trackMouse: true,
  persistencePath: path.join(os.homedir(), '.static-rebel', 'context.json'),
};

export class ContextAwareness extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.isRunning = false;
    this.pollTimer = null;

    this.currentContext = {
      activeWindow: null,
      activeApp: null,
      openApps: [],
      keyboardActive: false,
      mouseActive: false,
      lastActivity: Date.now(),
      activityLevel: 'idle',
    };

    this.activityHistory = [];
    this.contextPatterns = new Map();
    this.dailyStats = {
      totalActiveTime: 0,
      totalIdleTime: 0,
      appUsage: new Map(),
      windowSwitches: 0,
      lastActiveAt: Date.now(),
    };

    this.idleThresholds = {
      idle: 300000,
      away: 600000,
    };
  }

  async initialize() {
    await this.loadContext();
    this.emit('initialized', { version: CONTEXT_VERSION });
  }

  async loadContext() {
    try {
      const data = await fs.readFile(this.options.persistencePath, 'utf-8');
      const saved = JSON.parse(data);

      if (saved.activityHistory) {
        this.activityHistory = saved.activityHistory.slice(-this.options.historySize);
      }

      if (saved.contextPatterns) {
        for (const [key, value] of Object.entries(saved.contextPatterns)) {
          this.contextPatterns.set(key, value);
        }
      }

      if (saved.dailyStats) {
        this.dailyStats = saved.dailyStats;
        this.dailyStats.appUsage = new Map(Object.entries(saved.dailyStats.appUsage || {}));
      }
    } catch {
      console.log('[Context] No saved context found');
    }
  }

  async saveContext() {
    try {
      const data = {
        activityHistory: this.activityHistory.slice(-this.options.historySize),
        contextPatterns: Object.fromEntries(this.contextPatterns),
        dailyStats: {
          ...this.dailyStats,
          appUsage: Object.fromEntries(this.dailyStats.appUsage),
        },
        lastSaved: Date.now(),
      };

      await fs.writeFile(this.options.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Context] Failed to save context:', error.message);
    }
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startPolling();

    this.emit('started');
  }

  stop() {
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.saveContext();
    this.emit('stopped');
  }

  startPolling() {
    const poll = async () => {
      if (!this.isRunning) return;

      try {
        await this.updateContext();
      } catch (error) {
        this.emit('error', { error: error.message });
      }

      this.pollTimer = setTimeout(poll, this.options.pollInterval);
    };

    poll();
  }

  async updateContext() {
    const previousContext = { ...this.currentContext };
    let hasChanges = false;

    if (this.options.trackWindows || this.options.trackApps) {
      const systemInfo = await this.getSystemInfo();

      if (this.options.trackApps) {
        const appsChanged = !this.arraysEqual(
          this.currentContext.openApps,
          systemInfo.openApps
        );

        if (appsChanged) {
          this.currentContext.openApps = systemInfo.openApps;
          this.dailyStats.windowSwitches++;
          hasChanges = true;

          this.emit('apps:changed', {
            added: systemInfo.openApps.filter(
              (a) => !previousContext.openApps?.includes(a)
            ),
            removed: previousContext.openApps?.filter(
              (a) => !systemInfo.openApps.includes(a)
            ),
          });
        }
      }

      if (this.options.trackWindows && systemInfo.activeWindow) {
        const windowChanged =
          previousContext.activeWindow !== systemInfo.activeWindow;

        if (windowChanged) {
          this.currentContext.activeWindow = systemInfo.activeWindow;
          this.currentContext.activeApp = systemInfo.activeApp;
          hasChanges = true;

          this.emit('window:changed', {
            from: previousContext.activeWindow,
            to: systemInfo.activeWindow,
            app: systemInfo.activeApp,
          });

          this.recordActivity('window_switch');
        }
      }
    }

    this.updateActivityLevel();

    if (hasChanges) {
      this.emit('context:updated', { context: this.currentContext });
    }
  }

  async getSystemInfo() {
    const info = {
      activeWindow: null,
      activeApp: null,
      openApps: [],
    };

    if (process.platform === 'darwin') {
      return this.getMacOSInfo();
    }

    return info;
  }

  async getMacOSInfo() {
    const info = {
      activeWindow: null,
      activeApp: null,
      openApps: [],
    };

    try {
      const script = `
        tell application "System Events"
          set frontApp to name of first process whose frontmost is true
          set windowList to name of every window of process frontApp
          set processList to name of every process whose background only is false
        end tell
        return {frontApp, windowList as text, processList as text}
      `;

      const result = await this.runAppleScript(script);

      if (result.success) {
        const lines = result.output.split(',').map((s) => s.trim());

        info.activeApp = lines[0] || null;
        info.activeWindow = lines[1] || `${info.activeApp} - Active`;
        info.openApps = lines.slice(2).filter((a) => a && a.length > 0);

        this.dailyStats.appUsage.set(
          info.activeApp,
          (this.dailyStats.appUsage.get(info.activeApp) || 0) + 1
        );
      }
    } catch (error) {
      console.error('[Context] macOS info failed:', error.message);
    }

    return info;
  }

  runAppleScript(script) {
    return new Promise((resolve) => {
      const child = spawn('osascript', ['-e', script], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ success: false, output: '', error: 'timeout' });
      }, 5000);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          output: stdout.trim(),
          error: stderr.trim(),
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ success: false, output: '', error: error.message });
      });
    });
  }

  recordActivity(type = 'general') {
    const now = Date.now();
    const wasIdle = this.currentContext.activityLevel === 'idle';

    this.currentContext.lastActivity = now;
    this.currentContext.activityLevel = 'active';

    const idleDuration = now - (this.dailyStats.lastActiveAt || now);

    if (wasIdle && idleDuration > this.idleThresholds.idle) {
      this.dailyStats.totalIdleTime += idleDuration;
      this.emit('user:returned', { idleDuration });
    }

    this.dailyStats.lastActiveAt = now;

    const entry = {
      type,
      timestamp: now,
      context: {
        app: this.currentContext.activeApp,
        window: this.currentContext.activeWindow,
      },
    };

    this.activityHistory.push(entry);

    if (this.activityHistory.length > this.options.historySize) {
      this.activityHistory.shift();
    }

    if (wasIdle) {
      this.emit('activity:resumed', { type, idleDuration });
    }

    this.emit('activity:recorded', entry);
  }

  updateActivityLevel() {
    const now = Date.now();
    const sinceActivity = now - this.currentContext.lastActivity;

    let previousLevel = this.currentContext.activityLevel;
    let newLevel = 'active';

    if (sinceActivity > this.idleThresholds.away) {
      newLevel = 'away';
    } else if (sinceActivity > this.idleThresholds.idle) {
      newLevel = 'idle';
    }

    if (previousLevel !== newLevel) {
      this.currentContext.activityLevel = newLevel;

      if (newLevel === 'idle') {
        this.emit('activity:idle', {
          duration: sinceActivity,
          context: this.getCurrentContext(),
        });
      } else if (newLevel === 'away') {
        this.emit('activity:away', {
          duration: sinceActivity,
        });
      } else if (newLevel === 'active' && previousLevel !== 'active') {
        this.emit('activity:resumed', { previousLevel, duration: sinceActivity });
      }
    }
  }

  inferContext() {
    const recentActivities = this.activityHistory.slice(-10);

    if (recentActivities.length === 0) {
      return { state: 'unknown', confidence: 0 };
    }

    const appCounts = new Map();
    const activityTypes = new Set();

    for (const entry of recentActivities) {
      if (entry.context?.app) {
        appCounts.set(
          entry.context.app,
          (appCounts.get(entry.context.app) || 0) + 1
        );
      }
      if (entry.type) {
        activityTypes.add(entry.type);
      }
    }

    const topApp = [...appCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    let state = 'unknown';
    let confidence = 0.3;

    if (topApp) {
      const appName = topApp[0].toLowerCase();

      if (appName.includes('code') || appName.includes('vscode')) {
        state = 'coding';
        confidence = 0.85;
      } else if (appName.includes('safari') || appName.includes('chrome')) {
        state = 'browsing';
        confidence = 0.8;
      } else if (appName.includes('terminal') || appName.includes('iterm')) {
        state = 'terminal';
        confidence = 0.8;
      } else if (appName.includes('word') || appName.includes('pages')) {
        state = 'writing';
        confidence = 0.75;
      } else if (appName.includes('mail') || appName.includes('outlook')) {
        state = 'emailing';
        confidence = 0.8;
      } else if (appName.includes('slack') || appName.includes('discord')) {
        state = 'communicating';
        confidence = 0.75;
      } else {
        state = 'working';
        confidence = 0.5;
      }
    }

    return {
      state,
      confidence: Math.min(confidence, 0.95),
      topApp: topApp?.[0],
      recentActivities: recentActivities.length,
    };
  }

  getCurrentContext() {
    return {
      ...this.currentContext,
      inferred: this.inferContext(),
    };
  }

  getRecentActivity(limit = 20) {
    return this.activityHistory.slice(-limit);
  }

  getActivityPattern(timeRange = 'day') {
    const now = Date.now();
    let startTime;

    switch (timeRange) {
      case 'hour':
        startTime = now - 3600000;
        break;
      case 'day':
        startTime = now - 86400000;
        break;
      case 'week':
        startTime = now - 604800000;
        break;
      default:
        startTime = now - 86400000;
    }

    const activities = this.activityHistory.filter(
      (a) => a.timestamp >= startTime
    );

    const hourlyActivity = new Array(24).fill(0);
    const dailyActivity = new Array(7).fill(0);

    for (const entry of activities) {
      const date = new Date(entry.timestamp);
      hourlyActivity[date.getHours()]++;
      dailyActivity[date.getDay()]++;
    }

    return {
      timeRange,
      totalActivities: activities.length,
      hourlyDistribution: hourlyActivity,
      dailyDistribution: dailyActivity,
      peakHour: hourlyActivity.indexOf(Math.max(...hourlyActivity)),
      peakDay: dailyActivity.indexOf(Math.max(...dailyActivity)),
    };
  }

  getAppUsage() {
    const sorted = [...this.dailyStats.appUsage.entries()].sort(
      (a, b) => b[1] - a[1]
    );

    return {
      total: this.dailyStats.appUsage.size,
      topApps: sorted.slice(0, 10),
      windowSwitches: this.dailyStats.windowSwitches,
    };
  }

  arraysEqual(a, b) {
    if (!a || !b) return a === b;
    if (a.length !== b.length) return false;
    return a.every((val, idx) => val === b[idx]);
  }

  getStats() {
    return {
      version: CONTEXT_VERSION,
      isRunning: this.isRunning,
      currentContext: this.getCurrentContext(),
      activityHistorySize: this.activityHistory.length,
      dailyStats: {
        ...this.dailyStats,
        appUsage: Object.fromEntries(this.dailyStats.appUsage),
      },
    };
  }

  clearHistory() {
    this.activityHistory = [];
    this.saveContext();
  }
}

export function createContextAwareness(options = {}) {
  return new ContextAwareness(options);
}

export default ContextAwareness;
