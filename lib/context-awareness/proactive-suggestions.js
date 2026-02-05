/**
 * Proactive Suggestions - Smart action recommendations
 *
 * Features:
 * - Context-aware suggestions
 * - Habit learning
 * - Time-based recommendations
 * - Action triggers
 */

import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const SUGGESTIONS_VERSION = '1.0.0';

const DEFAULT_OPTIONS = {
  maxSuggestions: 10,
  minConfidence: 0.5,
  persistencePath: path.join(os.homedir(), '.static-rebel', 'suggestions.json'),
  checkInterval: 60000,
};

export class ProactiveSuggestions extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.suggestions = [];
    this.triggers = new Map();
    this.habits = new Map();
    this.context = null;
    this.checkTimer = null;
    this.isRunning = false;

    this.builtInTriggers = [
      {
        id: 'idle_long',
        name: 'User Idle Long',
        condition: (ctx) => ctx.activityLevel === 'idle' && ctx.idleDuration > 300000,
        suggest: [
          { action: 'reminder_break', message: 'You\'ve been idle for a while. Take a break?' },
          { action: 'summary_pending', message: 'Catch up on what you missed while away?' },
        ],
      },
      {
        id: 'coding_session',
        name: 'Coding Session',
        condition: (ctx) => ctx.inferred?.state === 'coding',
        suggest: [
          { action: 'commit_code', message: 'Ready to commit your changes?' },
          { action: 'run_tests', message: 'Tests running smoothly?' },
        ],
      },
      {
        id: 'email_check',
        name: 'Email Check Time',
        condition: (ctx) => {
          const hour = new Date().getHours();
          return hour >= 9 && hour <= 17;
        },
        suggest: [
          { action: 'check_email', message: 'Time for a quick email check?' },
        ],
      },
      {
        id: 'morning_greeting',
        name: 'Morning Greeting',
        condition: (ctx) => {
          const hour = new Date().getHours();
          return hour >= 7 && hour <= 9;
        },
        suggest: [
          { action: 'daily_briefing', message: 'Good morning! Want your daily briefing?' },
          { action: 'check_schedule', message: 'Check your schedule for today?' },
        ],
      },
      {
        id: 'end_of_day',
        name: 'End of Day',
        condition: (ctx) => {
          const hour = new Date().getHours();
          return hour >= 17 && hour <= 18;
        },
        suggest: [
          { action: 'end_of_day_summary', message: 'Wrapping up? Get your EOD summary?' },
          { action: 'plan_tomorrow', message: 'Ready to plan tomorrow?' },
        ],
      },
    ];
  }

  async initialize() {
    await this.load();
    this.emit('initialized', { version: SUGGESTIONS_VERSION });
  }

  async load() {
    try {
      const data = await fs.readFile(this.options.persistencePath, 'utf-8');
      const saved = JSON.parse(data);

      if (saved.habits) {
        for (const [key, value] of Object.entries(saved.habits)) {
          this.habits.set(key, value);
        }
      }
    } catch {
      console.log('[Suggestions] No saved data found');
    }
  }

  async save() {
    try {
      const data = {
        habits: Object.fromEntries(this.habits),
        lastSaved: Date.now(),
      };

      await fs.writeFile(this.options.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Suggestions] Failed to save:', error.message);
    }
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    this.checkTimer = setInterval(() => {
      this.evaluateTriggers();
    }, this.options.checkInterval);

    this.emit('started');
  }

  stop() {
    this.isRunning = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.save();
    this.emit('stopped');
  }

  updateContext(context) {
    this.context = context;
    this.evaluateTriggers();
  }

  evaluateTriggers() {
    if (!this.context) return;

    for (const trigger of this.builtInTriggers) {
      if (!trigger.enabled !== false && trigger.condition(this.context)) {
        this.generateSuggestions(trigger);
      }
    }

    for (const [id, trigger] of this.triggers) {
      if (trigger.enabled !== false && trigger.condition(this.context)) {
        this.generateSuggestions(trigger);
      }
    }
  }

  generateSuggestions(trigger) {
    const recentSuggestions = this.suggestions.filter(
      (s) => s.triggerId === trigger.id && Date.now() - s.timestamp < 3600000
    );

    if (recentSuggestions.length >= 3) {
      return;
    }

    for (const suggestion of trigger.suggest) {
      const existing = this.suggestions.find(
        (s) => s.action === suggestion.action && Date.now() - s.timestamp < 1800000
      );

      if (existing) continue;

      const newSuggestion = {
        id: `sugg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        triggerId: trigger.id,
        triggerName: trigger.name,
        action: suggestion.action,
        message: suggestion.message,
        confidence: this.calculateConfidence(trigger, suggestion),
        timestamp: Date.now(),
        dismissed: false,
        executed: false,
      };

      this.suggestions.unshift(newSuggestion);

      if (this.suggestions.length > this.options.maxSuggestions) {
        this.suggestions.pop();
      }

      this.emit('suggestion:new', newSuggestion);
    }

    this.cleanup();
  }

  calculateConfidence(trigger, suggestion) {
    let confidence = 0.7;

    if (trigger.id === 'idle_long') {
      confidence = 0.6 + Math.min((this.context.idleDuration || 0) / 600000, 0.3);
    }

    if (trigger.id === 'coding_session') {
      confidence = this.context.inferred?.confidence || 0.7;
    }

    const habitStrength = this.habits.get(suggestion.action);
    if (habitStrength) {
      confidence += Math.min(habitStrength * 0.2, 0.2);
    }

    return Math.min(confidence, 0.95);
  }

  addTrigger(trigger) {
    const id = trigger.id || `trigger-${Date.now()}`;
    this.triggers.set(id, {
      id,
      name: trigger.name || 'Custom Trigger',
      condition: trigger.condition,
      suggest: trigger.suggest || [],
      enabled: trigger.enabled !== false,
    });
    return id;
  }

  removeTrigger(triggerId) {
    return this.triggers.delete(triggerId);
  }

  enableTrigger(triggerId) {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      trigger.enabled = true;
    }
  }

  disableTrigger(triggerId) {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      trigger.enabled = false;
    }
  }

  executeSuggestion(suggestionId) {
    const suggestion = this.suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return false;

    suggestion.executed = true;
    suggestion.executedAt = Date.now();

    this.habits.set(
      suggestion.action,
      (this.habits.get(suggestion.action) || 0) + 1
    );

    this.emit('suggestion:executed', suggestion);
    this.save();

    return true;
  }

  dismissSuggestion(suggestionId, reason = 'manual') {
    const suggestion = this.suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return false;

    suggestion.dismissed = true;
    suggestion.dismissedAt = Date.now();
    suggestion.dismissReason = reason;

    this.habits.set(
      suggestion.action,
      Math.max(0, (this.habits.get(suggestion.action) || 0) - 0.1)
    );

    this.emit('suggestion:dismissed', suggestion);
    this.save();

    return true;
  }

  cleanup() {
    const oneDayAgo = Date.now() - 86400000;
    this.suggestions = this.suggestions.filter(
      (s) => !s.dismissed || s.timestamp > oneDayAgo
    );
  }

  getSuggestions(options = {}) {
    let results = this.suggestions.filter(
      (s) => !s.dismissed && !s.executed && s.confidence >= this.options.minConfidence
    );

    if (options.action) {
      results = results.filter((s) => s.action === options.action);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  getHistory(limit = 20) {
    return this.suggestions.slice(-limit);
  }

  getHabits() {
    return [...this.habits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([action, strength]) => ({ action, strength: Math.round(strength * 100) / 100 }));
  }

  getStats() {
    const active = this.suggestions.filter((s) => !s.dismissed && !s.executed);
    const executed = this.suggestions.filter((s) => s.executed);
    const dismissed = this.suggestions.filter((s) => s.dismissed);

    return {
      version: SUGGESTIONS_VERSION,
      isRunning: this.isRunning,
      activeSuggestions: active.length,
      executedToday: executed.filter((s) => s.executedAt > Date.now() - 86400000).length,
      dismissedToday: dismissed.filter((s) => s.dismissedAt > Date.now() - 86400000).length,
      customTriggers: this.triggers.size,
      habits: this.habits.size,
    };
  }

  clearHistory() {
    this.suggestions = [];
    this.save();
  }
}

export function createProactiveSuggestions(options = {}) {
  return new ProactiveSuggestions(options);
}

export default ProactiveSuggestions;
