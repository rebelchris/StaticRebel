/**
 * Log Manager - Persistent logging system for Telegram messages and system events
 *
 * Features:
 * - Stores logs in ~/.static-rebel/logs/
 * - Daily log files (logs-YYYY-MM-DD.json)
 * - Line-delimited JSON format
 * - Auto-cleanup of logs older than 7 days
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Log directory
const LOG_DIR = path.join(os.homedir(), '.static-rebel', 'logs');

// Log retention in days
const LOG_RETENTION_DAYS = 7;

// Ensure log directory exists
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// Get today's log filename
function getLogFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `logs-${yyyy}-${mm}-${dd}.json`;
}

// Get log file path for a date
function getLogPath(date = new Date()) {
  return path.join(LOG_DIR, getLogFilename(date));
}

/**
 * Write a log entry
 * @param {string} type - Log type: 'telegram-in', 'telegram-out', 'telegram-error', 'system'
 * @param {string} level - Log level: 'debug', 'info', 'warn', 'error'
 * @param {string} message - Log message
 * @param {object} metadata - Additional metadata
 */
export function log(type, level, message, metadata = {}) {
  ensureLogDir();

  const entry = {
    timestamp: new Date().toISOString(),
    type,
    level,
    message,
    metadata,
  };

  const logPath = getLogPath();

  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch (error) {
    console.error(`[LogManager] Failed to write log: ${error.message}`);
  }

  return entry;
}

/**
 * Get logs with filtering options
 * @param {object} options - Filter options
 * @param {string} options.type - Filter by type
 * @param {string} options.level - Filter by level
 * @param {string} options.since - ISO timestamp to filter logs after
 * @param {number} options.limit - Maximum number of logs to return (default 100)
 * @param {string} options.search - Search string to filter messages
 * @param {number} options.days - Number of days to look back (default 1)
 * @returns {Array} Array of log entries
 */
export function getLogs(options = {}) {
  ensureLogDir();

  const { type, level, since, limit = 100, search, days = 1 } = options;

  let logs = [];

  // Read logs from the last N days
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const logPath = getLogPath(date);

    if (fs.existsSync(logPath)) {
      try {
        const content = fs.readFileSync(logPath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            logs.push(entry);
          } catch (e) {
            // Skip invalid lines
          }
        }
      } catch (error) {
        console.error(`[LogManager] Failed to read ${logPath}: ${error.message}`);
      }
    }
  }

  // Sort by timestamp descending (newest first)
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Apply filters
  if (type) {
    logs = logs.filter((entry) => entry.type === type);
  }

  if (level) {
    logs = logs.filter((entry) => entry.level === level);
  }

  if (since) {
    const sinceDate = new Date(since);
    logs = logs.filter((entry) => new Date(entry.timestamp) > sinceDate);
  }

  if (search) {
    const searchLower = search.toLowerCase();
    logs = logs.filter(
      (entry) =>
        entry.message?.toLowerCase().includes(searchLower) ||
        JSON.stringify(entry.metadata).toLowerCase().includes(searchLower),
    );
  }

  // Apply limit
  if (limit > 0) {
    logs = logs.slice(0, limit);
  }

  return logs;
}

/**
 * Get Telegram-specific logs
 * @param {object} options - Filter options (same as getLogs)
 * @returns {Array} Array of Telegram log entries
 */
export function getTelegramLogs(options = {}) {
  const telegramTypes = ['telegram-in', 'telegram-out', 'telegram-error'];

  // If type is specified and is a telegram type, use it
  // Otherwise get all telegram types
  if (options.type && telegramTypes.includes(options.type)) {
    return getLogs(options);
  }

  // Get all telegram logs
  let logs = [];
  for (const type of telegramTypes) {
    const typeLogs = getLogs({ ...options, type, limit: 0 });
    logs = logs.concat(typeLogs);
  }

  // Sort by timestamp descending
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Apply limit
  const limit = options.limit || 100;
  if (limit > 0) {
    logs = logs.slice(0, limit);
  }

  return logs;
}

/**
 * Clean up old log files
 * @param {number} retentionDays - Number of days to keep logs (default 7)
 * @returns {object} Cleanup result
 */
export function cleanupOldLogs(retentionDays = LOG_RETENTION_DAYS) {
  ensureLogDir();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  let deleted = 0;
  let errors = 0;

  try {
    const files = fs.readdirSync(LOG_DIR);

    for (const file of files) {
      if (!file.startsWith('logs-') || !file.endsWith('.json')) {
        continue;
      }

      // Extract date from filename (logs-YYYY-MM-DD.json)
      const match = file.match(/logs-(\d{4}-\d{2}-\d{2})\.json/);
      if (!match) continue;

      const fileDate = new Date(match[1]);
      if (fileDate < cutoffDate) {
        try {
          fs.unlinkSync(path.join(LOG_DIR, file));
          deleted++;
        } catch (e) {
          errors++;
        }
      }
    }
  } catch (error) {
    console.error(`[LogManager] Cleanup error: ${error.message}`);
    return { success: false, error: error.message };
  }

  return { success: true, deleted, errors };
}

/**
 * Clear all logs (for DELETE endpoint)
 * @param {object} options - Options
 * @param {number} options.olderThanDays - Only delete logs older than N days
 * @returns {object} Clear result
 */
export function clearLogs(options = {}) {
  const { olderThanDays } = options;

  if (olderThanDays !== undefined) {
    return cleanupOldLogs(olderThanDays);
  }

  // Clear all logs
  ensureLogDir();

  let deleted = 0;
  let errors = 0;

  try {
    const files = fs.readdirSync(LOG_DIR);

    for (const file of files) {
      if (file.startsWith('logs-') && file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(LOG_DIR, file));
          deleted++;
        } catch (e) {
          errors++;
        }
      }
    }
  } catch (error) {
    return { success: false, error: error.message };
  }

  return { success: true, deleted, errors };
}

/**
 * Get log statistics
 * @returns {object} Log stats
 */
export function getLogStats() {
  ensureLogDir();

  const stats = {
    totalFiles: 0,
    totalEntries: 0,
    byType: {},
    byLevel: {},
    oldestLog: null,
    newestLog: null,
  };

  try {
    const files = fs.readdirSync(LOG_DIR).filter(
      (f) => f.startsWith('logs-') && f.endsWith('.json'),
    );

    stats.totalFiles = files.length;

    for (const file of files) {
      const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          stats.totalEntries++;

          // Count by type
          stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;

          // Count by level
          stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;

          // Track oldest/newest
          const ts = new Date(entry.timestamp);
          if (!stats.oldestLog || ts < new Date(stats.oldestLog)) {
            stats.oldestLog = entry.timestamp;
          }
          if (!stats.newestLog || ts > new Date(stats.newestLog)) {
            stats.newestLog = entry.timestamp;
          }
        } catch (e) {
          // Skip invalid lines
        }
      }
    }
  } catch (error) {
    console.error(`[LogManager] Stats error: ${error.message}`);
  }

  return stats;
}

// Run cleanup on module load
cleanupOldLogs();

// Export log directory for reference
export const LOG_DIRECTORY = LOG_DIR;
