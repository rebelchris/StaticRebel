// Idle Detector - Activity tracking with idle event emission
import { EventEmitter } from 'events';
import { getConfig } from './configManager.js';

/**
 * @typedef {Object} IdleDetectorOptions
 * @property {number} [idleThreshold] - Milliseconds before considered idle (default: 300000 = 5 min)
 * @property {number} [dreamEligibleThreshold] - Milliseconds before dream-eligible (default: 600000 = 10 min)
 * @property {boolean} [enabled] - Whether idle detection is enabled
 */

class IdleDetector extends EventEmitter {
  constructor(options = {}) {
    super();

    const evolutionConfig = getConfig('evolution', {});

    this.options = {
      idleThreshold: options.idleThreshold || evolutionConfig.idleThreshold || 300000, // 5 min
      dreamEligibleThreshold: options.dreamEligibleThreshold || evolutionConfig.dreamEligibleThreshold || 600000, // 10 min
      enabled: options.enabled !== undefined ? options.enabled : (evolutionConfig.enabled !== false),
    };

    this.lastActivityTime = Date.now();
    this.isCurrentlyIdle = false;
    this.isDreamEligible = false;
    this.checkInterval = null;
    this.activityCount = 0;
    this.sessionStartTime = Date.now();

    // Stats for analytics
    this.stats = {
      totalIdlePeriods: 0,
      totalIdleTimeMs: 0,
      longestIdlePeriod: 0,
      currentIdleStartTime: null,
      dreamSessionsTriggered: 0,
    };
  }

  /**
   * Start the idle detection monitoring
   * @param {number} [checkIntervalMs=30000] - How often to check idle status (default: 30s)
   */
  start(checkIntervalMs = 30000) {
    if (!this.options.enabled) {
      console.log('[IdleDetector] Disabled by configuration');
      return;
    }

    if (this.checkInterval) {
      return; // Already running
    }

    this.checkInterval = setInterval(() => {
      this._checkIdleStatus();
    }, checkIntervalMs);

    console.log('[IdleDetector] Started monitoring (threshold: ' +
      (this.options.idleThreshold / 1000) + 's, check every: ' +
      (checkIntervalMs / 1000) + 's)');
  }

  /**
   * Stop the idle detection monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[IdleDetector] Stopped monitoring');
    }
  }

  /**
   * Record user activity - call this on user input
   */
  recordActivity() {
    const now = Date.now();
    const wasIdle = this.isCurrentlyIdle;

    this.lastActivityTime = now;
    this.activityCount++;

    if (wasIdle) {
      // Calculate idle duration for stats
      if (this.stats.currentIdleStartTime) {
        const idleDuration = now - this.stats.currentIdleStartTime;
        this.stats.totalIdleTimeMs += idleDuration;
        if (idleDuration > this.stats.longestIdlePeriod) {
          this.stats.longestIdlePeriod = idleDuration;
        }
        this.stats.currentIdleStartTime = null;
      }

      this.isCurrentlyIdle = false;
      this.isDreamEligible = false;

      this.emit('idle:end', {
        timestamp: new Date().toISOString(),
        idleDurationMs: now - (this.stats.currentIdleStartTime || now),
        activityCount: this.activityCount,
      });
    }
  }

  /**
   * Check if user is currently idle
   * @returns {boolean}
   */
  isIdle() {
    const idleTime = Date.now() - this.lastActivityTime;
    return idleTime >= this.options.idleThreshold;
  }

  /**
   * Get the current idle duration in milliseconds
   * @returns {number}
   */
  getIdleDuration() {
    return Date.now() - this.lastActivityTime;
  }

  /**
   * Get time since last activity in human-readable format
   * @returns {string}
   */
  getIdleDurationFormatted() {
    const ms = this.getIdleDuration();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Check if eligible for dream session (longer idle period)
   * @returns {boolean}
   */
  isDreamSessionEligible() {
    const idleTime = Date.now() - this.lastActivityTime;
    return idleTime >= this.options.dreamEligibleThreshold;
  }

  /**
   * Internal: Check idle status and emit events
   * @private
   */
  _checkIdleStatus() {
    const now = Date.now();
    const idleTime = now - this.lastActivityTime;
    const wasIdle = this.isCurrentlyIdle;
    const wasDreamEligible = this.isDreamEligible;

    // Check for idle start
    if (!wasIdle && idleTime >= this.options.idleThreshold) {
      this.isCurrentlyIdle = true;
      this.stats.totalIdlePeriods++;
      this.stats.currentIdleStartTime = this.lastActivityTime;

      this.emit('idle:start', {
        timestamp: new Date().toISOString(),
        lastActivityTime: new Date(this.lastActivityTime).toISOString(),
        idleDurationMs: idleTime,
        sessionActivityCount: this.activityCount,
      });
    }

    // Check for dream eligibility
    if (!wasDreamEligible && idleTime >= this.options.dreamEligibleThreshold) {
      this.isDreamEligible = true;
      this.stats.dreamSessionsTriggered++;

      this.emit('idle:dream-eligible', {
        timestamp: new Date().toISOString(),
        lastActivityTime: new Date(this.lastActivityTime).toISOString(),
        idleDurationMs: idleTime,
        totalIdlePeriods: this.stats.totalIdlePeriods,
      });
    }
  }

  /**
   * Get idle detection statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      isCurrentlyIdle: this.isCurrentlyIdle,
      isDreamEligible: this.isDreamEligible,
      currentIdleDurationMs: this.getIdleDuration(),
      activityCount: this.activityCount,
      sessionDurationMs: Date.now() - this.sessionStartTime,
      lastActivityTime: new Date(this.lastActivityTime).toISOString(),
    };
  }

  /**
   * Update configuration options
   * @param {IdleDetectorOptions} newOptions
   */
  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalIdlePeriods: 0,
      totalIdleTimeMs: 0,
      longestIdlePeriod: 0,
      currentIdleStartTime: null,
      dreamSessionsTriggered: 0,
    };
    this.activityCount = 0;
    this.sessionStartTime = Date.now();
  }
}

// Singleton instance
let instance = null;

/**
 * Get the idle detector instance
 * @param {IdleDetectorOptions} [options] - Options for initialization
 * @returns {IdleDetector}
 */
export function getIdleDetector(options = {}) {
  if (!instance) {
    instance = new IdleDetector(options);
  }
  return instance;
}

/**
 * Record user activity (convenience function)
 */
export function recordActivity() {
  getIdleDetector().recordActivity();
}

/**
 * Check if user is idle (convenience function)
 * @returns {boolean}
 */
export function isIdle() {
  return getIdleDetector().isIdle();
}

/**
 * Start idle monitoring (convenience function)
 */
export function startIdleMonitoring(checkIntervalMs) {
  getIdleDetector().start(checkIntervalMs);
}

/**
 * Stop idle monitoring (convenience function)
 */
export function stopIdleMonitoring() {
  getIdleDetector().stop();
}

export { IdleDetector };
export default getIdleDetector;
