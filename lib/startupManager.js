/**
 * Startup Manager for StaticRebel
 * 
 * Coordinates initialization tasks for faster first response.
 * Per LEVEL_UP_PLAN.md Part 2.3: Cache Warm-Up Strategy
 * 
 * Features:
 * - Pre-warm Ollama model with dummy request
 * - Run initial health checks
 * - Pre-compute common query embeddings
 * - Emit startup events for other modules
 */

import http from 'http';
import { URL } from 'url';
import { getLogger } from './logger.js';
import { getHealthMonitor } from './healthMonitor.js';
import { getCacheManager } from './cacheManager.js';
import { getEventBus, EventTypes } from './eventBus.js';

const log = getLogger('StartupManager');

// Default configuration
const DEFAULT_CONFIG = {
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2',
    warmupPrompt: 'Hello',
    warmupTimeout: 30000,
  },
  healthCheck: {
    enabled: true,
    startMonitoring: true,
  },
  cache: {
    warmupEnabled: true,
    commonQueries: [
      'What can you help me with?',
      'Hello',
      'How are you?',
      'Help',
    ],
  },
};

/**
 * Make a simple Ollama request to warm up the model
 */
async function warmupOllama(config) {
  const { host, model, warmupPrompt, warmupTimeout } = config;
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL('/api/generate', host);
    
    const body = JSON.stringify({
      model,
      prompt: warmupPrompt,
      stream: false,
      options: {
        num_predict: 1, // Minimal generation
      },
    });

    const client = url.protocol === 'https:' ? require('https') : http;
    
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: warmupTimeout,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const duration = Date.now() - startTime;
          resolve({
            success: true,
            model,
            durationMs: duration,
            statusCode: res.statusCode,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        success: false,
        model,
        error: err.message,
        durationMs: Date.now() - startTime,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        model,
        error: 'timeout',
        durationMs: warmupTimeout,
      });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Main Startup Manager class
 */
export class StartupManager {
  constructor(options = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, options);
    this.startupResults = null;
    this.startedAt = null;
  }

  mergeConfig(defaults, options) {
    return {
      ...defaults,
      ollama: { ...defaults.ollama, ...options.ollama },
      healthCheck: { ...defaults.healthCheck, ...options.healthCheck },
      cache: { ...defaults.cache, ...options.cache },
    };
  }

  /**
   * Run all startup tasks
   */
  async initialize() {
    this.startedAt = Date.now();
    const bus = getEventBus();
    
    log.info('Starting initialization...');
    
    const results = {
      startedAt: new Date(this.startedAt).toISOString(),
      tasks: {},
      totalDurationMs: 0,
      success: true,
    };

    // Emit startup event
    bus.emit(EventTypes.SYSTEM_STARTUP, { phase: 'starting' });

    // Run tasks in parallel where possible
    const tasks = await Promise.all([
      this.runHealthCheck().then(r => ({ name: 'healthCheck', ...r })),
      this.warmupModel().then(r => ({ name: 'modelWarmup', ...r })),
    ]);

    // Collect results
    for (const task of tasks) {
      results.tasks[task.name] = task;
      if (!task.success) {
        results.success = false;
      }
    }

    // Cache warmup (depends on model being ready)
    if (this.config.cache.warmupEnabled && results.tasks.modelWarmup?.success) {
      results.tasks.cacheWarmup = await this.warmupCache();
    }

    results.totalDurationMs = Date.now() - this.startedAt;
    this.startupResults = results;

    // Log summary
    const status = results.success ? 'completed' : 'completed with warnings';
    log.info(`Initialization ${status}`, {
      durationMs: results.totalDurationMs,
      tasks: Object.keys(results.tasks).length,
    });

    // Emit completion event
    bus.emit(EventTypes.SYSTEM_STARTUP, { 
      phase: 'completed',
      results,
    });

    return results;
  }

  /**
   * Run initial health check
   */
  async runHealthCheck() {
    if (!this.config.healthCheck.enabled) {
      return { success: true, skipped: true };
    }

    const startTime = Date.now();
    
    try {
      const monitor = getHealthMonitor();
      const health = await monitor.check();
      
      // Optionally start continuous monitoring
      if (this.config.healthCheck.startMonitoring) {
        monitor.start();
      }

      return {
        success: health.overall === 'healthy' || health.overall === 'degraded',
        status: health.overall,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Pre-warm the Ollama model
   */
  async warmupModel() {
    const startTime = Date.now();
    
    log.info('Warming up model...', { model: this.config.ollama.model });
    
    const result = await warmupOllama(this.config.ollama);
    
    if (result.success) {
      log.info('Model warmed up', { 
        model: this.config.ollama.model,
        durationMs: result.durationMs,
      });
    } else {
      log.warn('Model warmup failed', { 
        model: this.config.ollama.model,
        error: result.error,
      });
    }

    return {
      ...result,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Pre-populate cache with common queries
   */
  async warmupCache() {
    const startTime = Date.now();
    const cache = getCacheManager();
    const queries = this.config.cache.commonQueries;
    
    log.info('Warming up cache...', { queryCount: queries.length });

    // For now, just register the queries as "seen" without responses
    // Full warmup would require generating responses
    const warmedUp = [];
    
    for (const query of queries) {
      // Check if already cached
      const existing = await cache.get(query);
      if (!existing.hit) {
        warmedUp.push(query);
      }
    }

    return {
      success: true,
      queriesChecked: queries.length,
      newQueries: warmedUp.length,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Get startup results
   */
  getResults() {
    return this.startupResults;
  }

  /**
   * Check if startup completed successfully
   */
  isReady() {
    return this.startupResults?.success === true;
  }

  /**
   * Get time since startup
   */
  getUptime() {
    if (!this.startedAt) return 0;
    return Date.now() - this.startedAt;
  }
}

// Singleton instance
let globalStartupManager = null;

/**
 * Get the global startup manager
 */
export function getStartupManager(options = {}) {
  if (!globalStartupManager) {
    globalStartupManager = new StartupManager(options);
  }
  return globalStartupManager;
}

/**
 * Quick initialization (convenience function)
 */
export async function initialize(options = {}) {
  const manager = getStartupManager(options);
  return manager.initialize();
}

export default StartupManager;
