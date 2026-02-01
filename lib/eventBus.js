/**
 * Event Bus for StaticRebel
 * 
 * Unified event system for cross-module communication.
 * Per LEVEL_UP_PLAN.md Part 8.2: Create unified event bus
 * 
 * Features:
 * - Publish/subscribe pattern
 * - Wildcard subscriptions (e.g., 'chat.*')
 * - Event history for debugging
 * - Typed event definitions
 * - Once listeners (auto-remove after first call)
 */

import { getLogger } from './logger.js';

const log = getLogger('EventBus');

// Standard event types for StaticRebel
export const EventTypes = {
  // Chat events
  CHAT_MESSAGE_RECEIVED: 'chat.message.received',
  CHAT_RESPONSE_STARTED: 'chat.response.started',
  CHAT_RESPONSE_COMPLETED: 'chat.response.completed',
  CHAT_RESPONSE_ERROR: 'chat.response.error',
  
  // Ollama events
  OLLAMA_STATUS_CHANGED: 'ollama.status.changed',
  OLLAMA_MODEL_LOADED: 'ollama.model.loaded',
  OLLAMA_REQUEST_STARTED: 'ollama.request.started',
  OLLAMA_REQUEST_COMPLETED: 'ollama.request.completed',
  
  // Cache events
  CACHE_HIT: 'cache.hit',
  CACHE_MISS: 'cache.miss',
  CACHE_SET: 'cache.set',
  CACHE_CLEAR: 'cache.clear',
  
  // Health events
  HEALTH_STATUS_CHANGED: 'health.status.changed',
  HEALTH_CHECK_COMPLETED: 'health.check.completed',
  
  // Session events
  SESSION_STARTED: 'session.started',
  SESSION_ENDED: 'session.ended',
  SESSION_CONTEXT_UPDATED: 'session.context.updated',
  
  // System events
  SYSTEM_STARTUP: 'system.startup',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  SYSTEM_ERROR: 'system.error',
  
  // Webhook events
  WEBHOOK_TRIGGERED: 'webhook.triggered',
  WEBHOOK_SUCCESS: 'webhook.success',
  WEBHOOK_FAILED: 'webhook.failed',
  WEBHOOK_RETRY: 'webhook.retry',
  WEBHOOK_RECEIVED: 'webhook.received',
  WEBHOOK_PROCESSED: 'webhook.processed',
  WEBHOOK_INVALID: 'webhook.invalid',
  
  // StaticRebel-specific events for webhooks
  ENTRY_LOGGED: 'entry.logged',
  STREAK_MILESTONE: 'streak.milestone',
  GOAL_REACHED: 'goal.reached',
  NUDGE_SENT: 'nudge.sent',
};

// Default configuration
const DEFAULT_CONFIG = {
  historyEnabled: true,
  historyMaxSize: 100,
  debugMode: process.env.EVENT_DEBUG === 'true',
};

/**
 * Check if a pattern matches an event type (supports wildcards)
 * Examples:
 *   'chat.*' matches 'chat.message.received'
 *   'chat.message.*' matches 'chat.message.received'
 *   '*' matches everything
 */
function matchesPattern(pattern, eventType) {
  if (pattern === '*') return true;
  if (pattern === eventType) return true;
  
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1); // Remove '*', keep '.'
    return eventType.startsWith(prefix);
  }
  
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
    return regex.test(eventType);
  }
  
  return false;
}

/**
 * Main EventBus class
 */
export class EventBus {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.listeners = new Map(); // eventPattern -> Set of { callback, once }
    this.history = [];
  }

  /**
   * Subscribe to an event
   * @param {string} pattern - Event type or pattern (supports wildcards)
   * @param {Function} callback - Function to call when event fires
   * @returns {Function} Unsubscribe function
   */
  on(pattern, callback) {
    if (!this.listeners.has(pattern)) {
      this.listeners.set(pattern, new Set());
    }
    
    const listener = { callback, once: false };
    this.listeners.get(pattern).add(listener);
    
    if (this.config.debugMode) {
      log.debug('Listener added', { pattern });
    }
    
    // Return unsubscribe function
    return () => this.off(pattern, callback);
  }

  /**
   * Subscribe to an event (fires once then auto-unsubscribes)
   */
  once(pattern, callback) {
    if (!this.listeners.has(pattern)) {
      this.listeners.set(pattern, new Set());
    }
    
    const listener = { callback, once: true };
    this.listeners.get(pattern).add(listener);
    
    return () => this.off(pattern, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(pattern, callback) {
    const listeners = this.listeners.get(pattern);
    if (!listeners) return false;
    
    for (const listener of listeners) {
      if (listener.callback === callback) {
        listeners.delete(listener);
        return true;
      }
    }
    return false;
  }

  /**
   * Publish an event
   * @param {string} eventType - Event type to publish
   * @param {Object} data - Event data
   */
  emit(eventType, data = {}) {
    const event = {
      type: eventType,
      data,
      timestamp: Date.now(),
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    // Add to history
    if (this.config.historyEnabled) {
      this.history.push(event);
      if (this.history.length > this.config.historyMaxSize) {
        this.history.shift();
      }
    }

    if (this.config.debugMode) {
      log.debug('Event emitted', { type: eventType, id: event.id });
    }

    // Find and call matching listeners
    let matchCount = 0;
    const toRemove = [];

    for (const [pattern, listeners] of this.listeners) {
      if (matchesPattern(pattern, eventType)) {
        for (const listener of listeners) {
          try {
            listener.callback(event);
            matchCount++;
            
            if (listener.once) {
              toRemove.push({ pattern, listener });
            }
          } catch (error) {
            log.error('Listener error', { 
              pattern, 
              eventType, 
              error: error.message 
            });
          }
        }
      }
    }

    // Remove once listeners
    for (const { pattern, listener } of toRemove) {
      this.listeners.get(pattern)?.delete(listener);
    }

    return { event, matchCount };
  }

  /**
   * Alias for emit
   */
  publish(eventType, data) {
    return this.emit(eventType, data);
  }

  /**
   * Alias for on
   */
  subscribe(pattern, callback) {
    return this.on(pattern, callback);
  }

  /**
   * Wait for an event (Promise-based)
   * @param {string} pattern - Event pattern to wait for
   * @param {number} timeoutMs - Timeout in milliseconds (0 = no timeout)
   */
  waitFor(pattern, timeoutMs = 0) {
    return new Promise((resolve, reject) => {
      let timeoutId;
      
      const unsubscribe = this.once(pattern, (event) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(event);
      });

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for event: ${pattern}`));
        }, timeoutMs);
      }
    });
  }

  /**
   * Get event history
   * @param {Object} options - Filter options
   */
  getHistory(options = {}) {
    let events = [...this.history];
    
    if (options.type) {
      events = events.filter(e => matchesPattern(options.type, e.type));
    }
    
    if (options.since) {
      const sinceMs = typeof options.since === 'number' 
        ? options.since 
        : new Date(options.since).getTime();
      events = events.filter(e => e.timestamp >= sinceMs);
    }
    
    if (options.limit) {
      events = events.slice(-options.limit);
    }
    
    return events;
  }

  /**
   * Replay events from history to a listener
   */
  replay(pattern, callback, options = {}) {
    const events = this.getHistory({ type: pattern, ...options });
    events.forEach(event => {
      try {
        callback(event);
      } catch (error) {
        log.error('Replay error', { pattern, error: error.message });
      }
    });
    return events.length;
  }

  /**
   * Clear event history
   */
  clearHistory() {
    const count = this.history.length;
    this.history = [];
    log.info('History cleared', { count });
  }

  /**
   * Remove all listeners for a pattern
   */
  removeAllListeners(pattern) {
    if (pattern) {
      this.listeners.delete(pattern);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    let totalListeners = 0;
    const patterns = [];
    
    for (const [pattern, listeners] of this.listeners) {
      totalListeners += listeners.size;
      patterns.push({ pattern, count: listeners.size });
    }
    
    return {
      totalListeners,
      patterns,
      historySize: this.history.length,
      historyMaxSize: this.config.historyMaxSize,
    };
  }
}

// Singleton instance
let globalEventBus = null;

/**
 * Get the global event bus instance
 */
export function getEventBus(options = {}) {
  if (!globalEventBus) {
    globalEventBus = new EventBus(options);
  }
  return globalEventBus;
}

/**
 * Reset the global event bus (useful for testing)
 */
export function resetEventBus() {
  if (globalEventBus) {
    globalEventBus.removeAllListeners();
    globalEventBus.clearHistory();
  }
  globalEventBus = null;
}

// Convenience exports for common patterns
export const emit = (type, data) => getEventBus().emit(type, data);
export const on = (pattern, cb) => getEventBus().on(pattern, cb);
export const once = (pattern, cb) => getEventBus().once(pattern, cb);
export const waitFor = (pattern, timeout) => getEventBus().waitFor(pattern, timeout);

export default EventBus;
