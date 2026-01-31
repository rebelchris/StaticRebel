/**
 * Structured Logger for StaticRebel
 * 
 * Provides consistent, structured JSON logging across all modules.
 * Supports log levels, context, and optional file output.
 * 
 * Per LEVEL_UP_PLAN.md Part 8.2: Standardize logging format (structured JSON)
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const LEVEL_COLORS = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.LOG_FORMAT || 'pretty', // 'json' | 'pretty'
  timestamps: true,
  colors: process.stdout.isTTY !== false,
  moduleWidth: 20, // For pretty format alignment
};

/**
 * Format a log entry as JSON
 */
function formatJson(entry) {
  return JSON.stringify(entry);
}

/**
 * Format a log entry for human-readable output
 */
function formatPretty(entry, config) {
  const { level, module, message, timestamp, ...extra } = entry;
  
  const levelStr = level.toUpperCase().padEnd(5);
  const moduleStr = `[${module}]`.padEnd(config.moduleWidth + 2);
  const timeStr = config.timestamps 
    ? `${new Date(timestamp).toISOString().slice(11, 23)} `
    : '';
  
  let color = '';
  let reset = '';
  if (config.colors) {
    color = LEVEL_COLORS[level] || '';
    reset = RESET;
  }
  
  let output = `${timeStr}${color}${levelStr}${reset} ${moduleStr} ${message}`;
  
  // Add extra fields if present
  const extraKeys = Object.keys(extra);
  if (extraKeys.length > 0) {
    const extraStr = extraKeys
      .map(k => `${k}=${JSON.stringify(extra[k])}`)
      .join(' ');
    output += ` ${config.colors ? '\x1b[90m' : ''}${extraStr}${reset}`;
  }
  
  return output;
}

/**
 * Create a logger instance for a specific module
 */
function createLogger(moduleName, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const minLevel = LOG_LEVELS[config.level] ?? LOG_LEVELS.info;

  function log(level, message, extra = {}) {
    const levelNum = LOG_LEVELS[level];
    if (levelNum === undefined || levelNum < minLevel) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      module: moduleName,
      message,
      ...extra,
    };

    const formatted = config.format === 'json'
      ? formatJson(entry)
      : formatPretty(entry, config);

    // Route to appropriate console method
    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }

    return entry;
  }

  return {
    debug: (message, extra) => log('debug', message, extra),
    info: (message, extra) => log('info', message, extra),
    warn: (message, extra) => log('warn', message, extra),
    error: (message, extra) => log('error', message, extra),
    
    /**
     * Create a child logger with additional context
     */
    child: (childContext) => {
      const childModule = childContext.module 
        ? `${moduleName}:${childContext.module}`
        : moduleName;
      return createLogger(childModule, { ...config, ...childContext });
    },

    /**
     * Log with timing information
     */
    timed: (message, fn) => {
      const start = Date.now();
      const result = fn();
      const duration = Date.now() - start;
      log('info', message, { durationMs: duration });
      return result;
    },

    /**
     * Async version of timed
     */
    timedAsync: async (message, fn) => {
      const start = Date.now();
      const result = await fn();
      const duration = Date.now() - start;
      log('info', message, { durationMs: duration });
      return result;
    },

    /**
     * Get current log level
     */
    getLevel: () => config.level,

    /**
     * Set log level dynamically
     */
    setLevel: (newLevel) => {
      if (LOG_LEVELS[newLevel] !== undefined) {
        config.level = newLevel;
      }
    },
  };
}

/**
 * Global logger registry for consistent configuration
 */
const loggers = new Map();
let globalConfig = { ...DEFAULT_CONFIG };

/**
 * Get or create a logger for a module
 */
export function getLogger(moduleName, options = {}) {
  const key = moduleName;
  
  if (!loggers.has(key)) {
    loggers.set(key, createLogger(moduleName, { ...globalConfig, ...options }));
  }
  
  return loggers.get(key);
}

/**
 * Configure global logging settings
 */
export function configureLogging(options) {
  globalConfig = { ...globalConfig, ...options };
  
  // Update existing loggers
  for (const [name, logger] of loggers) {
    loggers.set(name, createLogger(name, globalConfig));
  }
}

/**
 * Set global log level
 */
export function setLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    configureLogging({ level });
  }
}

/**
 * Get all registered loggers (useful for debugging)
 */
export function getLoggers() {
  return Array.from(loggers.keys());
}

/**
 * Clear all loggers (useful for testing)
 */
export function clearLoggers() {
  loggers.clear();
}

// Export log levels for external use
export { LOG_LEVELS };

// Default export for convenience
export default { getLogger, configureLogging, setLogLevel, LOG_LEVELS };
