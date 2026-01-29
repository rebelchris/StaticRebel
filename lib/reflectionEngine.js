/**
 * Reflection Engine - Self-improvement through reflection and error memory
 *
 * Features:
 * - Post-action reflection
 * - Error memory and lessons learned
 * - Pattern recognition for mistakes
 * - Confidence tracking
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} Reflection
 * @property {string} id - Unique reflection ID
 * @property {string} sessionId - Associated session ID
 * @property {string} actionId - Associated action ID
 * @property {string} goalId - Associated goal ID
 * @property {boolean} goalProgressed - Did this move toward the goal?
 * @property {string} outcome - 'success' | 'partial' | 'failure'
 * @property {string} analysis - Analysis of what happened
 * @property {string[]} lessons - Lessons learned
 * @property {string[]} improvements - Suggested improvements
 * @property {number} confidenceDelta - Change in confidence
 * @property {Object} metrics - Quantitative metrics
 * @property {Date} timestamp - When reflection occurred
 */

/**
 * @typedef {Object} ErrorMemory
 * @property {string} id - Unique error ID
 * @property {string} type - Error type/category
 * @property {string} description - Error description
 * @property {string} context - Context where error occurred
 * @property {string} cause - Root cause analysis
 * @property {string} solution - How it was resolved
 * @property {string} prevention - How to prevent in future
 * @property {number} occurrences - How many times this error occurred
 * @property {Date} firstSeen - First occurrence
 * @property {Date} lastSeen - Most recent occurrence
 * @property {string[]} relatedErrors - IDs of similar errors
 */

/**
 * @typedef {Object} Pattern
 * @property {string} id - Pattern ID
 * @property {string} type - 'success' | 'failure' | 'inefficiency'
 * @property {string} description - Pattern description
 * @property {string[]} triggers - Situations that trigger this pattern
 * @property {string[]} indicators - Signs this pattern is occurring
 * @property {string} recommendation - What to do about it
 * @property {number} confidence - Confidence in this pattern (0-1)
 * @property {number} occurrences - How many times observed
 */

// ============================================================================
// Reflection Engine Class
// ============================================================================

export class ReflectionEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.reflections = [];
    this.errorMemory = new Map();
    this.patterns = new Map();
    this.confidenceHistory = [];

    this.options = {
      maxReflections: options.maxReflections || 1000,
      maxErrors: options.maxErrors || 500,
      similarityThreshold: options.similarityThreshold || 0.8,
      enablePatternRecognition: options.enablePatternRecognition !== false,
      storage: options.storage || null,
    };

    // Load persisted data if storage available
    if (this.options.storage) {
      this.loadPersistedData();
    }
  }

  /**
   * Create a reflection after an action
   */
  reflect(action, result, context = {}) {
    const reflection = {
      id: uuidv4(),
      sessionId: context.sessionId,
      actionId: action.id,
      goalId: context.goalId,
      goalProgressed: this.assessGoalProgress(action, result, context),
      outcome: this.determineOutcome(action, result),
      analysis: this.analyzeAction(action, result, context),
      lessons: this.extractLessons(action, result, context),
      improvements: this.suggestImprovements(action, result, context),
      confidenceDelta: this.calculateConfidenceDelta(action, result),
      metrics: this.calculateMetrics(action, result),
      timestamp: new Date(),
    };

    // Store reflection
    this.reflections.push(reflection);

    // Trim if needed
    if (this.reflections.length > this.options.maxReflections) {
      this.reflections = this.reflections.slice(-this.options.maxReflections);
    }

    this.emit('reflection:created', { reflection });

    // If failure, store in error memory
    if (reflection.outcome === 'failure') {
      this.rememberError(action, result, reflection);
    }

    // Update patterns
    if (this.options.enablePatternRecognition) {
      this.recognizePattern(reflection);
    }

    // Persist
    this.persistData();

    return reflection;
  }

  /**
   * Assess if the action progressed toward the goal
   */
  assessGoalProgress(action, result, context) {
    // Simple heuristics - can be enhanced with LLM

    if (result.error) {
      return false;
    }

    if (action.type === 'respond' && result.content) {
      return true;
    }

    if (result.success || result.completed) {
      return true;
    }

    return false;
  }

  /**
   * Determine the outcome of an action
   */
  determineOutcome(action, result) {
    if (result.error) {
      return 'failure';
    }

    if (result.partial || result.incomplete) {
      return 'partial';
    }

    if (result.success || result.completed) {
      return 'success';
    }

    // Default to partial if unclear
    return 'partial';
  }

  /**
   * Analyze what happened during the action
   */
  analyzeAction(action, result, context) {
    const parts = [];

    parts.push(
      `Action '${action.type}' ${result.error ? 'failed' : 'succeeded'}`,
    );

    if (result.error) {
      parts.push(`Error: ${result.error}`);
    }

    if (result.duration) {
      parts.push(`Duration: ${result.duration}ms`);
    }

    // Check against error memory for similar issues
    const similarErrors = this.findSimilarErrors(action, result);
    if (similarErrors.length > 0) {
      parts.push(`Similar errors encountered before: ${similarErrors.length}`);
    }

    return parts.join('. ');
  }

  /**
   * Extract lessons from the action
   */
  extractLessons(action, result, context) {
    const lessons = [];

    if (result.error) {
      lessons.push(`Error in ${action.type}: ${result.error}`);

      // Check if tool choice was correct
      if (
        result.error.includes('not found') ||
        result.error.includes('unknown')
      ) {
        lessons.push('Tool selection may need improvement');
      }

      // Check if parameters were correct
      if (
        result.error.includes('invalid') ||
        result.error.includes('required')
      ) {
        lessons.push('Parameter validation needs attention');
      }
    } else {
      // Success lessons
      if (result.duration && result.duration > 5000) {
        lessons.push(
          `Action took ${result.duration}ms - consider optimization`,
        );
      }
    }

    // Check for repeated patterns
    const recentReflections = this.getRecentReflections(10);
    const similarFailures = recentReflections.filter(
      (r) => r.outcome === 'failure' && r.actionId !== action.id,
    );

    if (similarFailures.length > 2) {
      lessons.push('Multiple recent failures - may need strategy adjustment');
    }

    return lessons;
  }

  /**
   * Suggest improvements based on the action
   */
  suggestImprovements(action, result, context) {
    const improvements = [];

    if (result.error) {
      // Find similar errors and their solutions
      const similar = this.findSimilarErrors(action, result);
      for (const error of similar.slice(0, 3)) {
        if (error.solution) {
          improvements.push(`Try: ${error.solution}`);
        }
      }

      // Generic suggestions
      improvements.push('Consider alternative approach or tool');
      improvements.push('Gather more information before retrying');
    } else {
      // Success improvements
      if (result.duration > 10000) {
        improvements.push('Look for ways to optimize this action');
      }
    }

    return improvements;
  }

  /**
   * Calculate confidence delta from the action
   */
  calculateConfidenceDelta(action, result) {
    if (result.error) {
      return -0.2;
    }

    if (result.partial) {
      return 0;
    }

    return 0.1;
  }

  /**
   * Calculate metrics for the action
   */
  calculateMetrics(action, result) {
    return {
      duration: result.duration || 0,
      retries: result.retries || 0,
      dataSize: result.dataSize || 0,
      tool: action.type,
    };
  }

  /**
   * Store an error in error memory
   */
  rememberError(action, result, reflection) {
    const errorKey = this.generateErrorKey(action, result);
    const existing = this.errorMemory.get(errorKey);

    if (existing) {
      // Update existing error
      existing.occurrences++;
      existing.lastSeen = new Date();
      existing.contexts.push({
        sessionId: reflection.sessionId,
        timestamp: reflection.timestamp,
        analysis: reflection.analysis,
      });

      this.emit('error:updated', { error: existing });
    } else {
      // Create new error entry
      const errorEntry = {
        id: uuidv4(),
        key: errorKey,
        type: this.categorizeError(result.error),
        description: result.error,
        context: action.description || action.type,
        cause: null, // To be filled by analysis
        solution: null, // To be filled when resolved
        prevention: null,
        occurrences: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        relatedErrors: [],
        contexts: [
          {
            sessionId: reflection.sessionId,
            timestamp: reflection.timestamp,
            analysis: reflection.analysis,
          },
        ],
      };

      this.errorMemory.set(errorKey, errorEntry);

      // Trim if needed
      if (this.errorMemory.size > this.options.maxErrors) {
        const oldest = Array.from(this.errorMemory.values()).sort(
          (a, b) => a.lastSeen - b.lastSeen,
        )[0];
        this.errorMemory.delete(oldest.key);
      }

      this.emit('error:remembered', { error: errorEntry });
    }

    this.persistData();
  }

  /**
   * Generate a key for error deduplication
   */
  generateErrorKey(action, result) {
    // Normalize error message for deduplication
    const normalized = result.error
      .toLowerCase()
      .replace(/\d+/g, '#')
      .replace(/['"`][^'"`]*['"`]/g, '""')
      .trim();

    return `${action.type}:${normalized}`;
  }

  /**
   * Categorize an error
   */
  categorizeError(error) {
    const lower = error.toLowerCase();

    if (lower.includes('not found') || lower.includes('does not exist')) {
      return 'not_found';
    }
    if (lower.includes('permission') || lower.includes('access')) {
      return 'permission';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return 'timeout';
    }
    if (lower.includes('network') || lower.includes('connection')) {
      return 'network';
    }
    if (lower.includes('invalid') || lower.includes('validation')) {
      return 'validation';
    }
    if (lower.includes('rate limit') || lower.includes('too many')) {
      return 'rate_limit';
    }

    return 'unknown';
  }

  /**
   * Find similar errors in memory
   */
  findSimilarErrors(action, result) {
    const similar = [];
    const currentType = this.categorizeError(result.error);

    for (const error of this.errorMemory.values()) {
      if (error.type === currentType) {
        similar.push(error);
      }
    }

    // Sort by recency
    similar.sort((a, b) => b.lastSeen - a.lastSeen);

    return similar;
  }

  /**
   * Update an error with solution information
   */
  resolveError(errorId, solution, prevention) {
    for (const error of this.errorMemory.values()) {
      if (error.id === errorId) {
        error.solution = solution;
        error.prevention = prevention;
        error.resolvedAt = new Date();

        this.emit('error:resolved', { error });
        this.persistData();

        return error;
      }
    }

    return null;
  }

  /**
   * Recognize patterns in reflections
   */
  recognizePattern(reflection) {
    // Look for repeated failure patterns
    if (reflection.outcome === 'failure') {
      const recentFailures = this.getRecentReflections(20).filter(
        (r) => r.outcome === 'failure',
      );

      // Check for repeated failures of same action type
      const actionFailures = recentFailures.filter((r) => {
        // Compare action types (would need to look up action)
        return true; // Simplified
      });

      if (actionFailures.length >= 3) {
        this.createPattern({
          type: 'failure',
          description: `Repeated failures detected`,
          triggers: ['Similar action types', 'Same context'],
          indicators: ['Multiple failures in short timeframe'],
          recommendation:
            'Consider alternative approach or gather more information',
          confidence: actionFailures.length / 10,
        });
      }
    }

    // Look for inefficiency patterns
    if (reflection.metrics?.duration > 10000) {
      const slowActions = this.getRecentReflections(20).filter(
        (r) => r.metrics?.duration > 10000,
      );

      if (slowActions.length >= 5) {
        this.createPattern({
          type: 'inefficiency',
          description: 'Frequent slow actions detected',
          triggers: ['Large data processing', 'Network calls'],
          indicators: ['Actions taking >10s'],
          recommendation: 'Consider caching or optimization',
          confidence: slowActions.length / 20,
        });
      }
    }
  }

  /**
   * Create a new pattern
   */
  createPattern(patternData) {
    const pattern = {
      id: uuidv4(),
      ...patternData,
      occurrences: 1,
      createdAt: new Date(),
      lastSeen: new Date(),
    };

    // Check for similar existing patterns
    for (const existing of this.patterns.values()) {
      if (
        existing.type === pattern.type &&
        existing.description === pattern.description
      ) {
        existing.occurrences++;
        existing.lastSeen = new Date();
        existing.confidence = Math.min(1, existing.confidence + 0.1);

        this.emit('pattern:updated', { pattern: existing });
        return existing;
      }
    }

    this.patterns.set(pattern.id, pattern);
    this.emit('pattern:created', { pattern });

    return pattern;
  }

  /**
   * Get recent reflections
   */
  getRecentReflections(count = 10) {
    return this.reflections.slice(-count);
  }

  /**
   * Get reflections for a session
   */
  getSessionReflections(sessionId) {
    return this.reflections.filter((r) => r.sessionId === sessionId);
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const errors = Array.from(this.errorMemory.values());

    const byType = {};
    for (const error of errors) {
      byType[error.type] = (byType[error.type] || 0) + error.occurrences;
    }

    return {
      totalErrors: errors.length,
      totalOccurrences: errors.reduce((sum, e) => sum + e.occurrences, 0),
      byType,
      mostFrequent: errors
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 5),
      unresolved: errors.filter((e) => !e.solution).length,
    };
  }

  /**
   * Get patterns that match current context
   */
  getRelevantPatterns(context = {}) {
    const relevant = [];

    for (const pattern of this.patterns.values()) {
      // Check if pattern triggers match context
      const matches = pattern.triggers.some((trigger) => {
        return JSON.stringify(context)
          .toLowerCase()
          .includes(trigger.toLowerCase());
      });

      if (matches || pattern.confidence > 0.7) {
        relevant.push(pattern);
      }
    }

    return relevant.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get recommendations based on history
   */
  getRecommendations(context = {}) {
    const recommendations = [];

    // Check for similar past failures
    const similarErrors = this.findSimilarErrors(
      { type: context.actionType },
      { error: context.potentialError || '' },
    );

    for (const error of similarErrors.slice(0, 3)) {
      if (error.prevention) {
        recommendations.push({
          type: 'prevention',
          message: error.prevention,
          basedOn: error.description,
        });
      }
    }

    // Check for patterns
    const patterns = this.getRelevantPatterns(context);
    for (const pattern of patterns.slice(0, 3)) {
      recommendations.push({
        type: 'pattern',
        message: pattern.recommendation,
        confidence: pattern.confidence,
      });
    }

    return recommendations;
  }

  /**
   * Persist data to storage
   */
  async persistData() {
    if (!this.options.storage) return;

    try {
      const data = {
        reflections: this.reflections,
        errors: Array.from(this.errorMemory.entries()),
        patterns: Array.from(this.patterns.entries()),
        updatedAt: new Date(),
      };

      await this.options.storage.set('reflections', data);
    } catch (error) {
      this.emit('error', { type: 'persist', error });
    }
  }

  /**
   * Load persisted data
   */
  async loadPersistedData() {
    if (!this.options.storage) return;

    try {
      const data = await this.options.storage.get('reflections');
      if (data) {
        this.reflections = data.reflections || [];
        this.errorMemory = new Map(data.errors || []);
        this.patterns = new Map(data.patterns || []);

        this.emit('data:loaded', {
          reflections: this.reflections.length,
          errors: this.errorMemory.size,
          patterns: this.patterns.size,
        });
      }
    } catch (error) {
      this.emit('error', { type: 'load', error });
    }
  }

  /**
   * Export all data
   */
  export() {
    return {
      reflections: this.reflections,
      errors: Array.from(this.errorMemory.values()),
      patterns: Array.from(this.patterns.values()),
      stats: this.getErrorStats(),
      exportedAt: new Date(),
    };
  }

  /**
   * Clear all data
   */
  clear() {
    this.reflections = [];
    this.errorMemory.clear();
    this.patterns.clear();

    this.emit('data:cleared');
    this.persistData();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createReflectionEngine(options = {}) {
  return new ReflectionEngine(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default ReflectionEngine;
