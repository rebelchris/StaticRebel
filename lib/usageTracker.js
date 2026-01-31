/**
 * Usage Tracker for StaticRebel
 *
 * Tracks token usage and costs across sessions with persistent storage.
 * Provides reporting capabilities and alert thresholds.
 *
 * Features:
 * - Track promptTokens, completionTokens per request
 * - Per-session and global aggregation
 * - Cost estimation with configurable rates per model
 * - Persistent storage to ~/.static-rebel/usage/ as JSONL
 * - Daily, weekly, monthly reports
 * - Integration with EventBus
 * - Alert thresholds for usage warnings
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getLogger } from './logger.js';
import { getEventBus, EventTypes } from './eventBus.js';

const log = getLogger('UsageTracker');

// Usage event types
export const UsageEventTypes = {
  USAGE_RECORDED: 'usage.recorded',
  USAGE_THRESHOLD_WARNING: 'usage.threshold.warning',
  USAGE_THRESHOLD_CRITICAL: 'usage.threshold.critical',
  USAGE_REPORT_GENERATED: 'usage.report.generated',
};

// Default cost rates per 1K tokens (in USD)
const DEFAULT_COST_RATES = {
  // Ollama models (free/local)
  'ollama/llama3.2': { prompt: 0, completion: 0 },
  'ollama/qwen3-coder:latest': { prompt: 0, completion: 0 },
  'ollama/deepseek-r1:32b': { prompt: 0, completion: 0 },
  'ollama/llava': { prompt: 0, completion: 0 },
  'ollama/nomic-embed-text': { prompt: 0, completion: 0 },
  // OpenAI models
  'openai/gpt-4': { prompt: 0.03, completion: 0.06 },
  'openai/gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
  'openai/gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
  // Anthropic models
  'anthropic/claude-3-opus': { prompt: 0.015, completion: 0.075 },
  'anthropic/claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
  'anthropic/claude-3-haiku': { prompt: 0.00025, completion: 0.00125 },
  // Default fallback
  default: { prompt: 0.001, completion: 0.002 },
};

// Default configuration
const DEFAULT_CONFIG = {
  storageDir: path.join(os.homedir(), '.static-rebel', 'usage'),
  costRates: DEFAULT_COST_RATES,
  thresholds: {
    daily: {
      tokens: 1000000, // 1M tokens
      cost: 10.0,      // $10
    },
    weekly: {
      tokens: 5000000, // 5M tokens
      cost: 50.0,      // $50
    },
    monthly: {
      tokens: 20000000, // 20M tokens
      cost: 200.0,      // $200
    },
  },
  warningPercent: 80, // Warn at 80% of threshold
};

/**
 * Get the start of day timestamp
 * @param {Date} date
 * @returns {number}
 */
function getStartOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Get the start of week timestamp (Monday)
 * @param {Date} date
 * @returns {number}
 */
function getStartOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Get the start of month timestamp
 * @param {Date} date
 * @returns {number}
 */
function getStartOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Format date as YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Main UsageTracker class
 */
export class UsageTracker {
  /**
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    if (options.costRates) {
      this.config.costRates = { ...DEFAULT_COST_RATES, ...options.costRates };
    }
    if (options.thresholds) {
      this.config.thresholds = { ...DEFAULT_CONFIG.thresholds, ...options.thresholds };
    }

    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sessionUsage = this._createEmptyUsage();
    this.eventBus = getEventBus();
    this.initialized = false;
  }

  /**
   * Create an empty usage object
   * @returns {Object}
   * @private
   */
  _createEmptyUsage() {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      requestCount: 0,
    };
  }

  /**
   * Initialize the usage tracker (ensure storage directory exists)
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.promises.mkdir(this.config.storageDir, { recursive: true });
      this.initialized = true;
      log.info('Usage tracker initialized', { storageDir: this.config.storageDir });
    } catch (error) {
      log.error('Failed to initialize usage tracker', { error: error.message });
      throw error;
    }
  }

  /**
   * Get the file path for a specific date's usage log
   * @param {Date} date
   * @returns {string}
   * @private
   */
  _getLogFilePath(date = new Date()) {
    const dateStr = formatDate(date);
    return path.join(this.config.storageDir, `usage-${dateStr}.jsonl`);
  }

  /**
   * Get cost rate for a model
   * @param {string} model - Model identifier
   * @returns {Object} - { prompt, completion } rates per 1K tokens
   */
  getCostRate(model) {
    return this.config.costRates[model] || this.config.costRates.default;
  }

  /**
   * Calculate cost for token usage
   * @param {string} model - Model identifier
   * @param {number} promptTokens - Number of prompt tokens
   * @param {number} completionTokens - Number of completion tokens
   * @returns {number} - Estimated cost in USD
   */
  calculateCost(model, promptTokens, completionTokens) {
    const rate = this.getCostRate(model);
    const promptCost = (promptTokens / 1000) * rate.prompt;
    const completionCost = (completionTokens / 1000) * rate.completion;
    return promptCost + completionCost;
  }

  /**
   * Record token usage for a request
   * @param {Object} usage - Usage data
   * @param {string} usage.model - Model identifier
   * @param {number} usage.promptTokens - Number of prompt tokens
   * @param {number} usage.completionTokens - Number of completion tokens
   * @param {Object} [usage.metadata] - Additional metadata
   * @returns {Promise<Object>} - Recorded usage entry
   */
  async recordUsage(usage) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model, promptTokens, completionTokens, metadata = {} } = usage;
    const totalTokens = promptTokens + completionTokens;
    const estimatedCost = this.calculateCost(model, promptTokens, completionTokens);

    const entry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost,
      metadata,
    };

    // Update session usage
    this.sessionUsage.promptTokens += promptTokens;
    this.sessionUsage.completionTokens += completionTokens;
    this.sessionUsage.totalTokens += totalTokens;
    this.sessionUsage.estimatedCost += estimatedCost;
    this.sessionUsage.requestCount += 1;

    // Persist to JSONL file
    try {
      const logFile = this._getLogFilePath();
      await fs.promises.appendFile(logFile, JSON.stringify(entry) + '\n');
      log.debug('Usage recorded', { model, totalTokens, estimatedCost });
    } catch (error) {
      log.error('Failed to persist usage', { error: error.message });
    }

    // Emit usage event
    this.eventBus.emit(UsageEventTypes.USAGE_RECORDED, entry);

    // Check thresholds
    await this._checkThresholds();

    return entry;
  }

  /**
   * Check usage against thresholds and emit warnings
   * @private
   */
  async _checkThresholds() {
    const now = new Date();
    const thresholds = this.config.thresholds;
    const warningPercent = this.config.warningPercent / 100;

    // Check daily threshold
    const dailyUsage = await this.getAggregatedUsage({
      since: getStartOfDay(now),
    });

    this._emitThresholdWarnings('daily', dailyUsage, thresholds.daily, warningPercent);

    // Check weekly threshold
    const weeklyUsage = await this.getAggregatedUsage({
      since: getStartOfWeek(now),
    });

    this._emitThresholdWarnings('weekly', weeklyUsage, thresholds.weekly, warningPercent);

    // Check monthly threshold
    const monthlyUsage = await this.getAggregatedUsage({
      since: getStartOfMonth(now),
    });

    this._emitThresholdWarnings('monthly', monthlyUsage, thresholds.monthly, warningPercent);
  }

  /**
   * Emit threshold warning events if limits exceeded
   * @param {string} period - 'daily', 'weekly', or 'monthly'
   * @param {Object} usage - Current usage
   * @param {Object} threshold - Threshold limits
   * @param {number} warningPercent - Warning percentage (0-1)
   * @private
   */
  _emitThresholdWarnings(period, usage, threshold, warningPercent) {
    const tokenPercent = usage.totalTokens / threshold.tokens;
    const costPercent = usage.estimatedCost / threshold.cost;

    // Critical: exceeded 100%
    if (tokenPercent >= 1 || costPercent >= 1) {
      this.eventBus.emit(UsageEventTypes.USAGE_THRESHOLD_CRITICAL, {
        period,
        usage,
        threshold,
        tokenPercent: Math.round(tokenPercent * 100),
        costPercent: Math.round(costPercent * 100),
      });
      log.warn(`Critical: ${period} usage threshold exceeded`, {
        tokenPercent: `${Math.round(tokenPercent * 100)}%`,
        costPercent: `${Math.round(costPercent * 100)}%`,
      });
    }
    // Warning: exceeded warning percent
    else if (tokenPercent >= warningPercent || costPercent >= warningPercent) {
      this.eventBus.emit(UsageEventTypes.USAGE_THRESHOLD_WARNING, {
        period,
        usage,
        threshold,
        tokenPercent: Math.round(tokenPercent * 100),
        costPercent: Math.round(costPercent * 100),
      });
      log.info(`Warning: ${period} usage approaching threshold`, {
        tokenPercent: `${Math.round(tokenPercent * 100)}%`,
        costPercent: `${Math.round(costPercent * 100)}%`,
      });
    }
  }

  /**
   * Read usage entries from log files
   * @param {Object} options - Query options
   * @param {number} [options.since] - Start timestamp (ms)
   * @param {number} [options.until] - End timestamp (ms)
   * @param {string} [options.model] - Filter by model
   * @param {string} [options.sessionId] - Filter by session
   * @returns {Promise<Array>} - Array of usage entries
   */
  async getUsageEntries(options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { since, until = Date.now(), model, sessionId } = options;
    const entries = [];

    try {
      const files = await fs.promises.readdir(this.config.storageDir);
      const jsonlFiles = files.filter(f => f.startsWith('usage-') && f.endsWith('.jsonl'));

      for (const file of jsonlFiles) {
        // Extract date from filename to skip irrelevant files
        const dateMatch = file.match(/usage-(\d{4}-\d{2}-\d{2})\.jsonl/);
        if (dateMatch) {
          const fileDate = new Date(dateMatch[1]).getTime();
          const nextDay = fileDate + 24 * 60 * 60 * 1000;

          // Skip files outside date range
          if (since && nextDay < since) continue;
          if (until && fileDate > until) continue;
        }

        const filePath = path.join(this.config.storageDir, file);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const entryTime = new Date(entry.timestamp).getTime();

            // Apply filters
            if (since && entryTime < since) continue;
            if (until && entryTime > until) continue;
            if (model && entry.model !== model) continue;
            if (sessionId && entry.sessionId !== sessionId) continue;

            entries.push(entry);
          } catch (parseError) {
            log.warn('Failed to parse usage entry', { error: parseError.message });
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log.error('Failed to read usage entries', { error: error.message });
      }
    }

    // Sort by timestamp
    entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return entries;
  }

  /**
   * Get aggregated usage statistics
   * @param {Object} options - Query options (same as getUsageEntries)
   * @returns {Promise<Object>} - Aggregated usage data
   */
  async getAggregatedUsage(options = {}) {
    const entries = await this.getUsageEntries(options);

    const aggregated = this._createEmptyUsage();
    const byModel = {};

    for (const entry of entries) {
      aggregated.promptTokens += entry.promptTokens;
      aggregated.completionTokens += entry.completionTokens;
      aggregated.totalTokens += entry.totalTokens;
      aggregated.estimatedCost += entry.estimatedCost;
      aggregated.requestCount += 1;

      // Aggregate by model
      if (!byModel[entry.model]) {
        byModel[entry.model] = this._createEmptyUsage();
      }
      byModel[entry.model].promptTokens += entry.promptTokens;
      byModel[entry.model].completionTokens += entry.completionTokens;
      byModel[entry.model].totalTokens += entry.totalTokens;
      byModel[entry.model].estimatedCost += entry.estimatedCost;
      byModel[entry.model].requestCount += 1;
    }

    return {
      ...aggregated,
      byModel,
      entryCount: entries.length,
    };
  }

  /**
   * Get session usage (in-memory, current session only)
   * @returns {Object}
   */
  getSessionUsage() {
    return {
      sessionId: this.sessionId,
      ...this.sessionUsage,
    };
  }

  /**
   * Generate a usage report
   * @param {Object} options - Report options
   * @param {string} [options.period='daily'] - 'daily', 'weekly', or 'monthly'
   * @param {Date} [options.date] - Reference date for the report
   * @param {boolean} [options.includeDetails=false] - Include per-request details
   * @returns {Promise<Object>} - Usage report
   */
  async getReport(options = {}) {
    const { period = 'daily', date = new Date(), includeDetails = false } = options;

    let since;
    let until;
    let periodLabel;

    switch (period) {
      case 'weekly':
        since = getStartOfWeek(date);
        until = since + 7 * 24 * 60 * 60 * 1000;
        periodLabel = `Week of ${formatDate(new Date(since))}`;
        break;
      case 'monthly':
        since = getStartOfMonth(date);
        const nextMonth = new Date(date);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        until = nextMonth.getTime();
        periodLabel = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
        break;
      case 'daily':
      default:
        since = getStartOfDay(date);
        until = since + 24 * 60 * 60 * 1000;
        periodLabel = formatDate(date);
        break;
    }

    const aggregated = await this.getAggregatedUsage({ since, until });
    const thresholds = this.config.thresholds[period] || this.config.thresholds.daily;

    const report = {
      period,
      periodLabel,
      generatedAt: new Date().toISOString(),
      dateRange: {
        since: new Date(since).toISOString(),
        until: new Date(until).toISOString(),
      },
      usage: aggregated,
      thresholds,
      thresholdStatus: {
        tokenPercent: Math.round((aggregated.totalTokens / thresholds.tokens) * 100),
        costPercent: Math.round((aggregated.estimatedCost / thresholds.cost) * 100),
      },
    };

    if (includeDetails) {
      report.entries = await this.getUsageEntries({ since, until });
    }

    // Emit report event
    this.eventBus.emit(UsageEventTypes.USAGE_REPORT_GENERATED, {
      period,
      periodLabel,
      usage: aggregated,
    });

    log.info('Report generated', { period, periodLabel, totalTokens: aggregated.totalTokens });

    return report;
  }

  /**
   * Update cost rates for models
   * @param {Object} rates - New cost rates to merge
   */
  setCostRates(rates) {
    this.config.costRates = { ...this.config.costRates, ...rates };
    log.info('Cost rates updated', { modelCount: Object.keys(rates).length });
  }

  /**
   * Update usage thresholds
   * @param {Object} thresholds - New thresholds to merge
   */
  setThresholds(thresholds) {
    this.config.thresholds = { ...this.config.thresholds, ...thresholds };
    log.info('Thresholds updated', { thresholds });
  }

  /**
   * Get current configuration
   * @returns {Object}
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get statistics summary
   * @returns {Promise<Object>}
   */
  async getStats() {
    const now = new Date();

    const [daily, weekly, monthly] = await Promise.all([
      this.getAggregatedUsage({ since: getStartOfDay(now) }),
      this.getAggregatedUsage({ since: getStartOfWeek(now) }),
      this.getAggregatedUsage({ since: getStartOfMonth(now) }),
    ]);

    return {
      session: this.getSessionUsage(),
      daily,
      weekly,
      monthly,
      thresholds: this.config.thresholds,
    };
  }

  /**
   * Reset session usage counters
   */
  resetSession() {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sessionUsage = this._createEmptyUsage();
    log.info('Session reset', { sessionId: this.sessionId });
  }
}

// Singleton instance
let globalUsageTracker = null;

/**
 * Get the global usage tracker instance
 * @param {Object} options - Configuration options
 * @returns {UsageTracker}
 */
export function getUsageTracker(options = {}) {
  if (!globalUsageTracker) {
    globalUsageTracker = new UsageTracker(options);
  }
  return globalUsageTracker;
}

/**
 * Reset the global usage tracker (useful for testing)
 */
export function resetUsageTracker() {
  globalUsageTracker = null;
}

// Convenience exports
export const recordUsage = (usage) => getUsageTracker().recordUsage(usage);
export const getReport = (options) => getUsageTracker().getReport(options);
export const getSessionUsage = () => getUsageTracker().getSessionUsage();
export const getStats = () => getUsageTracker().getStats();

export default UsageTracker;
