/**
 * Smart Notifications - Intelligent notification system
 *
 * Features:
 * - Notification rules engine
 * - Smart scheduling (don't disturb)
 * - Priority-based delivery
 * - Notification history
 * - Template system
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const execAsync = promisify(exec);

const NOTIFICATION_VERSION = '1.0.0';

const DEFAULT_OPTIONS = {
  defaultPriority: 'normal',
  quietHours: { start: 22, end: 8 },
  maxPerHour: 10,
  persistencePath: path.join(os.homedir(), '.static-rebel', 'notifications.json'),
  cooldown: 300000,
};

export class SmartNotifications extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.rules = new Map();
    this.history = [];
    this.scheduled = [];
    this.sentCount = new Map();
    this.blockedUntil = null;

    this.templates = new Map([
      ['reminder', {
        title: 'Reminder',
        icon: '⏰',
        sound: 'default',
      }],
      ['alert', {
        title: 'Alert',
        icon: '⚠️',
        sound: 'alert',
      }],
      ['success', {
        title: 'Success',
        icon: '✅',
        sound: 'default',
      }],
      ['error', {
        title: 'Error',
        icon: '❌',
        sound: 'error',
      }],
      ['info', {
        title: 'Info',
        icon: 'ℹ️',
        sound: 'default',
      }],
      ['message', {
        title: 'Message',
        icon: '💬',
        sound: 'default',
      }],
      ['task_complete', {
        title: 'Task Complete',
        icon: '🎉',
        sound: 'default',
      }],
    ]);

    this.loadNotifications();
  }

  async loadNotifications() {
    try {
      const data = await fs.readFile(this.options.persistencePath, 'utf-8');
      const saved = JSON.parse(data);

      if (saved.history) {
        this.history = saved.history.slice(-100);
      }
    } catch {
      console.log('[Notifications] No saved notifications found');
    }
  }

  async saveNotifications() {
    try {
      const data = {
        history: this.history.slice(-100),
        rules: Array.from(this.rules.entries()),
        lastSaved: Date.now(),
      };

      await fs.writeFile(this.options.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Notifications] Failed to save:', error.message);
    }
  }

  addRule(rule) {
    const id = rule.id || `rule-${Date.now()}`;
    this.rules.set(id, {
      id,
      name: rule.name || 'Unnamed Rule',
      trigger: rule.trigger,
      condition: rule.condition || (() => true),
      action: rule.action,
      enabled: rule.enabled !== false,
      priority: rule.priority || 'normal',
      cooldown: rule.cooldown || this.options.cooldown,
      lastTriggered: null,
    });

    this.emit('rule:added', { id, rule });
    return id;
  }

  removeRule(ruleId) {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.emit('rule:removed', { ruleId });
    }
    return deleted;
  }

  enableRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      this.emit('rule:enabled', { ruleId });
    }
  }

  disableRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      this.emit('rule:disabled', { ruleId });
    }
  }

  setQuietHours(start, end) {
    this.options.quietHours = { start: parseInt(start), end: parseInt(end) };
    this.emit('quiet:hours:changed', this.options.quietHours);
  }

  isQuietHours() {
    const now = new Date();
    const currentHour = now.getHours();

    const { start, end } = this.options.quietHours;

    if (start > end) {
      return currentHour >= start || currentHour < end;
    }
    return currentHour >= start && currentHour < end;
  }

  canSendNotification(priority = 'normal') {
    if (this.blockedUntil && Date.now() < this.blockedUntil) {
      return false;
    }

    const hour = new Date().getHours();
    const hourlyCount = this.sentCount.get(hour) || 0;

    if (hourlyCount >= this.options.maxPerHour && priority !== 'critical') {
      return false;
    }

    if (this.isQuietHours() && priority !== 'critical') {
      return false;
    }

    return true;
  }

  getCooldown(priority = 'normal') {
    const cooldowns = {
      critical: 0,
      high: 60000,
      normal: this.options.cooldown,
      low: this.options.cooldown * 2,
    };
    return cooldowns[priority] || this.options.cooldown;
  }

  async send(notification) {
    const {
      title = 'Static Rebel',
      message,
      priority = this.options.defaultPriority,
      template = 'info',
      data = {},
      sound,
      actions = [],
      replyable = false,
    } = notification;

    const templateConfig = this.templates.get(template) || {};
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const enrichedNotification = {
      id,
      title: templateConfig.title || title,
      message,
      priority,
      icon: templateConfig.icon || '',
      sound: sound || templateConfig.sound || 'default',
      data,
      actions,
      replyable,
      timestamp: Date.now(),
      delivered: false,
    };

    if (!this.canSendNotification(priority)) {
      if (!this.isQuietHours() || priority === 'critical') {
        this.scheduleNotification(enrichedNotification);
        this.emit('notification:scheduled', enrichedNotification);
        return { id, status: 'scheduled' };
      }
      this.emit('notification:blocked', enrichedNotification);
      return { id, status: 'blocked' };
    }

    try {
      await this.deliver(enrichedNotification);
      enrichedNotification.delivered = true;

      const hour = new Date().getHours();
      this.sentCount.set(hour, (this.sentCount.get(hour) || 0) + 1);

      this.history.push(enrichedNotification);
      if (this.history.length > 100) {
        this.history.shift();
      }

      this.blockedUntil = Date.now() + this.getCooldown(priority);

      await this.saveNotifications();

      this.emit('notification:sent', enrichedNotification);
      return { id, status: 'sent' };
    } catch (error) {
      enrichedNotification.error = error.message;
      this.emit('notification:failed', { notification: enrichedNotification, error });
      return { id, status: 'failed', error: error.message };
    }
  }

  async deliver(notification) {
    const script = `
      display notification "${notification.message.replace(/"/g, '\\"')}" with title "${notification.title}" subtitle "${notification.icon}"
    `;

    await execAsync(`osascript -e '${script}'`);
  }

  scheduleNotification(notification) {
    const scheduledFor = this.isQuietHours()
      ? this.getNextActiveTime()
      : Date.now() + this.getCooldown(notification.priority);

    this.scheduled.push({
      ...notification,
      scheduledFor,
    });
  }

  getNextActiveTime() {
    const now = new Date();
    const { start, end } = this.options.quietHours;

    if (start > end) {
      if (now.getHours() >= start) {
        return new Date(now.setDate(now.getDate() + 1, start, 0, 0)).getTime();
      }
      return new Date(now.setHours(start, 0, 0, 0)).getTime();
    }

    if (now.getHours() >= end) {
      return new Date(now.setDate(now.getDate() + 1, start, 0, 0)).getTime();
    }
    return new Date(now.setHours(end, 0, 0, 0)).getTime();
  }

  async processScheduled() {
    const now = Date.now();
    const toSend = this.scheduled.filter((n) => n.scheduledFor <= now);

    this.scheduled = this.scheduled.filter((n) => n.scheduledFor > now);

    for (const notification of toSend) {
      await this.send(notification);
    }
  }

  registerTemplate(name, config) {
    this.templates.set(name, config);
  }

  unregisterTemplate(name) {
    this.templates.delete(name);
  }

  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  getScheduled() {
    return [...this.scheduled];
  }

  getRules() {
    return Array.from(this.rules.values());
  }

  getStats() {
    const now = Date.now();
    const hour = new Date().getHours();
    const sentThisHour = this.sentCount.get(hour) || 0;

    const byPriority = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    };

    for (const n of this.history) {
      if (byPriority[n.priority] !== undefined) {
        byPriority[n.priority]++;
      }
    }

    return {
      version: NOTIFICATION_VERSION,
      templates: this.templates.size,
      rules: this.rules.size,
      enabledRules: [...this.rules.values()].filter((r) => r.enabled).length,
      history: this.history.length,
      scheduled: this.scheduled.length,
      sentThisHour,
      quietHours: this.options.quietHours,
    };
  }

  clearHistory() {
    this.history = [];
    this.saveNotifications();
  }
}

export function createSmartNotifications(options = {}) {
  return new SmartNotifications(options);
}

export default SmartNotifications;
