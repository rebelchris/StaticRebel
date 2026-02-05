/**
 * Habit Tracker - Learn and track user patterns
 *
 * Features:
 * - Pattern detection
 * - Habit strength tracking
 * - Predictive suggestions
 * - Time-based analytics
 */

import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const HABIT_VERSION = '1.0.0';

const DEFAULT_OPTIONS = {
  persistencePath: path.join(os.homedir(), '.static-rebel', 'habits.json'),
  decayRate: 0.01,
  minConfidence: 0.3,
  maxHabits: 100,
  trackingWindow: 604800000,
};

export class HabitTracker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.habits = new Map();
    this.patterns = new Map();
    this.actions = [];
    this.dailyStats = new Map();

    this.trackedActions = new Set([
      'app_launch',
      'app_quit',
      'file_open',
      'file_save',
      'command_run',
      'notification_sent',
      'meeting_start',
      'meeting_end',
      'break_taken',
      'focus_session',
    ]);
  }

  async initialize() {
    await this.load();
    this.emit('initialized', { version: HABIT_VERSION });
  }

  async load() {
    try {
      const data = await fs.readFile(this.options.persistencePath, 'utf-8');
      const saved = JSON.parse(data);

      if (saved.habits) {
        for (const [id, habit] of Object.entries(saved.habits)) {
          this.habits.set(id, habit);
        }
      }

      if (saved.patterns) {
        for (const [id, pattern] of Object.entries(saved.patterns)) {
          this.patterns.set(id, pattern);
        }
      }

      if (saved.actions) {
        this.actions = saved.actions.slice(-1000);
      }
    } catch {
      console.log('[Habits] No saved data found');
    }
  }

  async save() {
    try {
      const data = {
        habits: Object.fromEntries(this.habits),
        patterns: Object.fromEntries(this.patterns),
        actions: this.actions.slice(-1000),
        lastSaved: Date.now(),
      };

      await fs.writeFile(this.options.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[Habits] Failed to save:', error.message);
    }
  }

  track(action, metadata = {}) {
    const entry = {
      action,
      timestamp: Date.now(),
      metadata,
      dayOfWeek: new Date().getDay(),
      hour: new Date().getHours(),
    };

    this.actions.push(entry);

    if (this.actions.length > 1000) {
      this.actions.shift();
    }

    this.updateHabits(action, entry);
    this.detectPatterns();
    this.updateDailyStats(action);

    this.emit('action:tracked', entry);
  }

  updateHabits(action, entry) {
    const habitId = this.getHabitId(action, entry.metadata);

    if (!this.habits.has(habitId)) {
      if (this.habits.size >= this.options.maxHabits) {
        const weakest = this.findWeakestHabit();
        if (weakest) {
          this.habits.delete(weakest);
        }
      }

      this.habits.set(habitId, {
        id: habitId,
        action,
        count: 0,
        streak: 0,
        lastSeen: entry.timestamp,
        firstSeen: entry.timestamp,
        strength: 0.1,
        hourlyDistribution: new Array(24).fill(0),
        dailyDistribution: new Array(7).fill(0),
        metadata: entry.metadata,
      });
    }

    const habit = this.habits.get(habitId);
    habit.count++;
    habit.lastSeen = entry.timestamp;
    habit.hourlyDistribution[entry.hour]++;
    habit.dailyDistribution[entry.dayOfWeek]++;

    this.updateHabitStrength(habit);
    this.calculateStreak(habit);

    this.emit('habit:updated', habit);
  }

  updateHabitStrength(habit) {
    const timeSinceFirst = habit.lastSeen - habit.firstSeen;
    const daysActive = timeSinceFirst / 86400000;

    const recencyBonus = Math.min(habit.count / 10, 0.2);
    const consistencyBonus = this.calculateConsistency(habit);
    const timeBonus = Math.min(daysActive / 30, 0.2);

    const targetStrength = 0.3 + recencyBonus + consistencyBonus + timeBonus;

    habit.strength = targetStrength;
  }

  calculateConsistency(habit) {
    const recentActions = this.actions.filter(
      (a) => a.timestamp > Date.now() - 604800000
    );

    const actionCounts = new Map();
    for (const a of recentActions) {
      const id = this.getHabitId(a.action, a.metadata);
      actionCounts.set(id, (actionCounts.get(id) || 0) + 1);
    }

    const total = recentActions.length || 1;
    const frequency = (actionCounts.get(habit.id) || 0) / total;

    return Math.min(frequency * 2, 0.3);
  }

  calculateStreak(habit) {
    let streak = 0;
    const daysSeen = new Set();

    for (let i = this.actions.length - 1; i >= 0; i--) {
      const action = this.actions[i];
      const actionId = this.getHabitId(action.action, action.metadata);

      if (actionId === habit.id) {
        const day = new Date(action.timestamp).toDateString();
        if (!daysSeen.has(day)) {
          daysSeen.add(day);
          streak++;
        }
      } else if (streak > 0) {
        break;
      }
    }

    habit.streak = streak;
  }

  findWeakestHabit() {
    let weakest = null;
    let lowestStrength = Infinity;

    for (const [id, habit] of this.habits) {
      const decay = this.options.decayRate * (Date.now() - habit.lastSeen) / 86400000;
      const effectiveStrength = Math.max(0, habit.strength - decay);

      if (effectiveStrength < lowestStrength) {
        lowestStrength = effectiveStrength;
        weakest = id;
      }
    }

    return weakest;
  }

  detectPatterns() {
    const windowStart = Date.now() - 3600000;
    const recentActions = this.actions.filter((a) => a.timestamp > windowStart);

    if (recentActions.length < 3) return;

    const sequence = recentActions.map((a) => a.action);

    for (let i = 0; i < sequence.length - 1; i++) {
      const before = sequence[i];
      const after = sequence[i + 1];

      if (!before || !after) continue;

      const patternId = `${before} -> ${after}`;

      if (!this.patterns.has(patternId)) {
        this.patterns.set(patternId, {
          id: patternId,
          before,
          after,
          count: 0,
          lastSeen: Date.now(),
        });
      }

      const pattern = this.patterns.get(patternId);
      pattern.count++;
      pattern.lastSeen = Date.now();
      pattern.strength = Math.min(pattern.count / 5, 1);
    }
  }

  updateDailyStats(action) {
    const today = new Date().toDateString();

    if (!this.dailyStats.has(today)) {
      this.dailyStats.set(today, {
        date: today,
        actions: 0,
        uniqueActions: new Set(),
        topActions: [],
      });
    }

    const stats = this.dailyStats.get(today);
    stats.actions++;
    stats.uniqueActions.add(action);

    if (stats.uniqueActions.size > 0) {
      const actionCounts = new Map();

      for (const a of this.actions) {
        const date = new Date(a.timestamp).toDateString();
        if (date === today) {
          actionCounts.set(a.action, (actionCounts.get(a.action) || 0) + 1);
        }
      }

      stats.topActions = [...actionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    }
  }

  predictNextAction() {
    if (this.actions.length < 3) return null;

    const recentActions = this.actions.slice(-5);
    const lastAction = recentActions[recentActions.length - 1]?.action;

    if (!lastAction) return null;

    const predictions = [];

    for (const [id, pattern] of this.patterns) {
      if (pattern.before === lastAction) {
        const strength = pattern.strength * this.getTimeBonus(pattern.lastSeen);
        if (strength > this.options.minConfidence) {
          predictions.push({
            action: pattern.after,
            confidence: strength,
            pattern: id,
          });
        }
      }
    }

    predictions.sort((a, b) => b.confidence - a.confidence);

    return predictions[0] || null;
  }

  getTimeBonus(lastSeen) {
    const hoursSince = (Date.now() - lastSeen) / 3600000;
    return Math.max(0.2, 1 - (hoursSince / 168));
  }

  getHabitId(action, metadata = {}) {
    const base = action;
    const app = metadata.app || '';
    const file = metadata.file || '';
    return `${base}:${app}:${file}`.replace(/:+$/, '');
  }

  getHabits(options = {}) {
    let habits = [...this.habits.values()];

    if (options.minStrength) {
      habits = habits.filter((h) => h.strength >= options.minStrength);
    }

    if (options.sortBy) {
      habits.sort((a, b) => {
        switch (options.sortBy) {
          case 'strength':
            return b.strength - a.strength;
          case 'count':
            return b.count - a.count;
          case 'streak':
            return b.streak - a.streak;
          case 'recent':
            return b.lastSeen - a.lastSeen;
          default:
            return 0;
        }
      });
    }

    if (options.limit) {
      habits = habits.slice(0, options.limit);
    }

    return habits;
  }

  getPatterns(options = {}) {
    let patterns = [...this.patterns.values()];

    patterns.sort((a, b) => b.count - a.count);

    if (options.limit) {
      patterns = patterns.slice(0, options.limit);
    }

    return patterns;
  }

  getTodayStats() {
    const today = new Date().toDateString();
    return this.dailyStats.get(today) || {
      date: today,
      actions: 0,
      uniqueActions: 0,
      topActions: [],
    };
  }

  getStats() {
    const strongHabits = [...this.habits.values()].filter(
      (h) => h.strength > 0.5
    ).length;

    return {
      version: HABIT_VERSION,
      totalHabits: this.habits.size,
      strongHabits,
      patterns: this.patterns.size,
      totalActions: this.actions.length,
      todayStats: this.getTodayStats(),
    };
  }

  async clearHistory() {
    this.habits.clear();
    this.patterns.clear();
    this.actions = [];
    this.dailyStats.clear();
    await this.save();
  }
}

export function createHabitTracker(options = {}) {
  return new HabitTracker(options);
}

export default HabitTracker;
