/**
 * Conversation Momentum
 * 
 * 🎯 CREATIVE HOOK: Learns conversation patterns and anticipates user needs.
 * 
 * Like autocomplete, but for intents. If a user often checks their water intake
 * after logging a glass, the system can proactively offer the summary.
 * 
 * Tracks:
 * - Action sequences (A → B → C patterns)
 * - Time-based patterns (morning routines, evening check-ins)
 * - Context switches (topic transitions)
 * - User preferences (what they usually want after certain actions)
 * 
 * @module lib/input/momentum
 */

import { EventEmitter } from 'events';

/**
 * Action types for momentum tracking
 */
export const ACTION_TYPES = {
  COMMAND: 'command',
  TRACKING: 'tracking',
  QUERY: 'query',
  NAVIGATION: 'navigation',
  CREATION: 'creation',
  DELETION: 'deletion',
  CONVERSATION: 'conversation',
};

/**
 * Time periods for pattern detection
 */
const TIME_PERIODS = {
  EARLY_MORNING: { start: 5, end: 8, label: 'early_morning' },
  MORNING: { start: 8, end: 12, label: 'morning' },
  AFTERNOON: { start: 12, end: 17, label: 'afternoon' },
  EVENING: { start: 17, end: 21, label: 'evening' },
  NIGHT: { start: 21, end: 24, label: 'night' },
  LATE_NIGHT: { start: 0, end: 5, label: 'late_night' },
};

/**
 * Get current time period
 */
function getCurrentTimePeriod() {
  const hour = new Date().getHours();
  for (const [, period] of Object.entries(TIME_PERIODS)) {
    if (hour >= period.start && hour < period.end) {
      return period.label;
    }
  }
  return 'night';
}

/**
 * Momentum entry representing an action in the conversation
 */
class MomentumEntry {
  constructor(action, context = {}) {
    this.action = action;           // e.g., "track:water", "query:stats", "command:help"
    this.type = context.type || ACTION_TYPES.CONVERSATION;
    this.timestamp = Date.now();
    this.timePeriod = getCurrentTimePeriod();
    this.dayOfWeek = new Date().getDay();
    this.context = context;         // Additional context (skill, params, etc.)
  }

  toKey() {
    return `${this.type}:${this.action}`;
  }
}

/**
 * Sequence pattern (A → B)
 */
class SequencePattern {
  constructor(from, to) {
    this.from = from;    // Previous action
    this.to = to;        // Following action
    this.count = 1;      // Times this sequence occurred
    this.lastSeen = Date.now();
    this.timePeriods = {};  // { morning: 5, evening: 2 }
    this.avgDelayMs = 0;    // Average time between actions
    this.delays = [];       // Recent delays for averaging
  }

  addOccurrence(delayMs, timePeriod) {
    this.count++;
    this.lastSeen = Date.now();
    this.timePeriods[timePeriod] = (this.timePeriods[timePeriod] || 0) + 1;
    
    // Track delays (keep last 10)
    this.delays.push(delayMs);
    if (this.delays.length > 10) this.delays.shift();
    this.avgDelayMs = this.delays.reduce((a, b) => a + b, 0) / this.delays.length;
  }

  /**
   * Calculate confidence that this pattern will occur again
   */
  getConfidence(currentTimePeriod) {
    // Base confidence from count
    let confidence = Math.min(0.9, 0.3 + (this.count * 0.1));
    
    // Boost if common in current time period
    const periodCount = this.timePeriods[currentTimePeriod] || 0;
    const periodRatio = periodCount / this.count;
    if (periodRatio > 0.5) {
      confidence = Math.min(0.95, confidence + 0.1);
    }
    
    // Decay for old patterns
    const ageHours = (Date.now() - this.lastSeen) / (1000 * 60 * 60);
    if (ageHours > 24 * 7) { // Older than a week
      confidence *= 0.8;
    }
    
    return confidence;
  }

  toJSON() {
    return {
      from: this.from,
      to: this.to,
      count: this.count,
      confidence: this.getConfidence(getCurrentTimePeriod()),
      avgDelayMs: this.avgDelayMs,
      timePeriods: this.timePeriods,
    };
  }
}

/**
 * Momentum Tracker
 * 
 * Tracks conversation patterns and predicts next likely actions
 */
export class MomentumTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxHistory = options.maxHistory || 100;
    this.minPatternCount = options.minPatternCount || 2;
    this.predictionThreshold = options.predictionThreshold || 0.6;
    
    // Storage
    this.history = [];           // Recent actions
    this.patterns = new Map();   // "from→to" => SequencePattern
    this.routines = new Map();   // "timePeriod:dayOfWeek" => common first actions
    
    // Predictions
    this.lastPrediction = null;
    this.predictionAccuracy = { correct: 0, total: 0 };
  }

  /**
   * Record an action (call this after each user interaction)
   */
  record(action, context = {}) {
    const entry = new MomentumEntry(action, context);
    const entryKey = entry.toKey();
    
    // Check if we predicted this action
    if (this.lastPrediction) {
      this.predictionAccuracy.total++;
      if (this.lastPrediction.action === entryKey) {
        this.predictionAccuracy.correct++;
        this.emit('prediction_hit', { predicted: this.lastPrediction, actual: entry });
      }
      this.lastPrediction = null;
    }
    
    // Update sequence patterns from previous action
    if (this.history.length > 0) {
      const prevEntry = this.history[this.history.length - 1];
      const patternKey = `${prevEntry.toKey()}→${entryKey}`;
      const delayMs = entry.timestamp - prevEntry.timestamp;
      
      if (this.patterns.has(patternKey)) {
        this.patterns.get(patternKey).addOccurrence(delayMs, entry.timePeriod);
      } else {
        this.patterns.set(patternKey, new SequencePattern(prevEntry.toKey(), entryKey));
      }
    }
    
    // Update routine patterns
    const routineKey = `${entry.timePeriod}:${entry.dayOfWeek}`;
    if (!this.routines.has(routineKey)) {
      this.routines.set(routineKey, new Map());
    }
    const routineActions = this.routines.get(routineKey);
    routineActions.set(entryKey, (routineActions.get(entryKey) || 0) + 1);
    
    // Add to history
    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    this.emit('action_recorded', entry);
    return entry;
  }

  /**
   * Predict what the user might do next
   * @returns {Array<{action: string, confidence: number, reason: string}>}
   */
  predict() {
    const predictions = [];
    const currentPeriod = getCurrentTimePeriod();
    const currentDay = new Date().getDay();
    
    // 1. Sequence-based predictions (what usually follows the last action)
    if (this.history.length > 0) {
      const lastEntry = this.history[this.history.length - 1];
      const lastKey = lastEntry.toKey();
      
      for (const [patternKey, pattern] of this.patterns) {
        if (pattern.from === lastKey && pattern.count >= this.minPatternCount) {
          const confidence = pattern.getConfidence(currentPeriod);
          if (confidence >= this.predictionThreshold) {
            predictions.push({
              action: pattern.to,
              confidence,
              reason: `Usually follows "${lastKey}" (${pattern.count} times)`,
              type: 'sequence',
              avgDelayMs: pattern.avgDelayMs,
            });
          }
        }
      }
    }
    
    // 2. Routine-based predictions (what usually happens at this time)
    const routineKey = `${currentPeriod}:${currentDay}`;
    const routineActions = this.routines.get(routineKey);
    
    if (routineActions) {
      const totalRoutineActions = Array.from(routineActions.values()).reduce((a, b) => a + b, 0);
      
      for (const [action, count] of routineActions) {
        const confidence = Math.min(0.8, count / totalRoutineActions + 0.2);
        if (confidence >= this.predictionThreshold && count >= this.minPatternCount) {
          // Don't duplicate sequence predictions
          if (!predictions.find(p => p.action === action)) {
            predictions.push({
              action,
              confidence: confidence * 0.9, // Slightly lower than sequence
              reason: `Common during ${currentPeriod} (${count} times)`,
              type: 'routine',
            });
          }
        }
      }
    }
    
    // Sort by confidence
    predictions.sort((a, b) => b.confidence - a.confidence);
    
    // Store top prediction for accuracy tracking
    if (predictions.length > 0) {
      this.lastPrediction = predictions[0];
    }
    
    return predictions.slice(0, 5);
  }

  /**
   * Get suggested next actions with human-readable descriptions
   */
  getSuggestions(currentContext = {}) {
    const predictions = this.predict();
    
    return predictions.map(p => {
      // Parse the action key back to readable form
      const [type, ...actionParts] = p.action.split(':');
      const actionName = actionParts.join(':');
      
      return {
        ...p,
        suggestion: this.formatSuggestion(type, actionName, p.reason),
        shortcut: this.getShortcut(type, actionName),
      };
    });
  }

  /**
   * Format a prediction into a user-friendly suggestion
   */
  formatSuggestion(type, action, reason) {
    const templates = {
      tracking: `Log ${action}?`,
      query: `Check ${action} stats?`,
      command: `Run /${action}?`,
      navigation: `Go to ${action}?`,
      default: `${action}?`,
    };
    
    return templates[type] || templates.default;
  }

  /**
   * Get a quick-action shortcut for a prediction
   */
  getShortcut(type, action) {
    if (type === 'command') return `/${action}`;
    if (type === 'query') return `show ${action}`;
    if (type === 'tracking') return `log ${action}`;
    return action;
  }

  /**
   * Get momentum insights (for debugging/display)
   */
  getInsights() {
    const topPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(p => p.toJSON());
    
    return {
      totalActions: this.history.length,
      uniquePatterns: this.patterns.size,
      predictionAccuracy: this.predictionAccuracy.total > 0
        ? (this.predictionAccuracy.correct / this.predictionAccuracy.total * 100).toFixed(1) + '%'
        : 'N/A',
      topPatterns,
      currentPeriod: getCurrentTimePeriod(),
    };
  }

  /**
   * Export state for persistence
   */
  export() {
    return {
      patterns: Array.from(this.patterns.entries()).map(([key, pattern]) => ({
        key,
        ...pattern.toJSON(),
        delays: pattern.delays,
        lastSeen: pattern.lastSeen,
      })),
      routines: Array.from(this.routines.entries()).map(([key, actions]) => ({
        key,
        actions: Array.from(actions.entries()),
      })),
      accuracy: this.predictionAccuracy,
    };
  }

  /**
   * Import state from persistence
   */
  import(data) {
    if (data.patterns) {
      for (const p of data.patterns) {
        const pattern = new SequencePattern(p.from, p.to);
        pattern.count = p.count || 1;
        pattern.lastSeen = p.lastSeen || Date.now();
        pattern.timePeriods = p.timePeriods || {};
        pattern.delays = p.delays || [];
        pattern.avgDelayMs = p.avgDelayMs || 0;
        this.patterns.set(p.key, pattern);
      }
    }
    
    if (data.routines) {
      for (const r of data.routines) {
        this.routines.set(r.key, new Map(r.actions));
      }
    }
    
    if (data.accuracy) {
      this.predictionAccuracy = data.accuracy;
    }
  }

  /**
   * Clear all learned patterns
   */
  reset() {
    this.history = [];
    this.patterns.clear();
    this.routines.clear();
    this.predictionAccuracy = { correct: 0, total: 0 };
    this.lastPrediction = null;
    this.emit('reset');
  }
}

/**
 * Create a momentum tracker instance
 */
export function createMomentumTracker(options = {}) {
  return new MomentumTracker(options);
}

/**
 * Singleton instance for app-wide momentum tracking
 */
let globalTracker = null;

export function getMomentumTracker(options = {}) {
  if (!globalTracker) {
    globalTracker = createMomentumTracker(options);
  }
  return globalTracker;
}

export default {
  MomentumTracker,
  MomentumEntry,
  createMomentumTracker,
  getMomentumTracker,
  ACTION_TYPES,
};
