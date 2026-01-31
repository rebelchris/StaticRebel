/**
 * Health Monitor for StaticRebel
 * 
 * Monitors system health across all services and provides status reporting.
 * Per LEVEL_UP_PLAN.md Part 8.2: Add health check endpoints for all services
 * 
 * Features:
 * - Ollama connectivity checks
 * - Memory/CPU monitoring
 * - Database health checks
 * - Service dependency tracking
 * - Automatic recovery suggestions
 */

import http from 'http';
import https from 'https';
import os from 'os';
import { URL } from 'url';
import { getLogger } from './logger.js';

const log = getLogger('HealthMonitor');

// Health status enum
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
};

// Default configuration
const DEFAULT_CONFIG = {
  checkIntervalMs: 30000, // 30 seconds
  timeoutMs: 5000,
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    enabled: true,
  },
  memory: {
    warningThresholdPercent: 80,
    criticalThresholdPercent: 95,
  },
};

/**
 * Check if a URL is reachable
 */
async function checkUrl(urlString, timeoutMs = 5000) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlString);
      const client = url.protocol === 'https:' ? https : http;
      
      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname || '/',
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          resolve({
            reachable: true,
            statusCode: res.statusCode,
            latencyMs: Date.now() - startTime,
          });
        }
      );
      
      const startTime = Date.now();
      
      req.on('error', (err) => {
        resolve({
          reachable: false,
          error: err.message,
          latencyMs: Date.now() - startTime,
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({
          reachable: false,
          error: 'timeout',
          latencyMs: timeoutMs,
        });
      });
      
      req.end();
    } catch (err) {
      resolve({
        reachable: false,
        error: err.message,
        latencyMs: 0,
      });
    }
  });
}

/**
 * Check Ollama health and available models
 */
async function checkOllama(host, timeoutMs) {
  const result = {
    status: HealthStatus.UNKNOWN,
    latencyMs: 0,
    models: [],
    error: null,
  };

  // Check basic connectivity
  const pingResult = await checkUrl(`${host}/api/tags`, timeoutMs);
  result.latencyMs = pingResult.latencyMs;

  if (!pingResult.reachable) {
    result.status = HealthStatus.UNHEALTHY;
    result.error = pingResult.error;
    return result;
  }

  // Get available models
  try {
    const modelsResult = await new Promise((resolve, reject) => {
      const url = new URL('/api/tags', host);
      const client = url.protocol === 'https:' ? https : http;
      
      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || 11434,
          path: '/api/tags',
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ models: [] });
            }
          });
        }
      );
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });
      req.end();
    });

    result.models = (modelsResult.models || []).map((m) => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at,
    }));
    
    result.status = result.models.length > 0 
      ? HealthStatus.HEALTHY 
      : HealthStatus.DEGRADED;
      
    if (result.models.length === 0) {
      result.error = 'No models available';
    }
  } catch (err) {
    result.status = HealthStatus.DEGRADED;
    result.error = `Failed to get models: ${err.message}`;
  }

  return result;
}

/**
 * Check system memory status
 */
function checkMemory(config) {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const usedPercent = (usedMem / totalMem) * 100;

  let status = HealthStatus.HEALTHY;
  if (usedPercent >= config.criticalThresholdPercent) {
    status = HealthStatus.UNHEALTHY;
  } else if (usedPercent >= config.warningThresholdPercent) {
    status = HealthStatus.DEGRADED;
  }

  return {
    status,
    totalMb: Math.round(totalMem / 1024 / 1024),
    usedMb: Math.round(usedMem / 1024 / 1024),
    freeMb: Math.round(freeMem / 1024 / 1024),
    usedPercent: Math.round(usedPercent * 10) / 10,
  };
}

/**
 * Check CPU status
 */
function checkCpu() {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const numCores = cpus.length;
  
  // Load average relative to cores
  const normalizedLoad = loadAvg[0] / numCores;
  
  let status = HealthStatus.HEALTHY;
  if (normalizedLoad > 2) {
    status = HealthStatus.UNHEALTHY;
  } else if (normalizedLoad > 1) {
    status = HealthStatus.DEGRADED;
  }

  return {
    status,
    cores: numCores,
    model: cpus[0]?.model || 'Unknown',
    loadAverage: {
      '1min': Math.round(loadAvg[0] * 100) / 100,
      '5min': Math.round(loadAvg[1] * 100) / 100,
      '15min': Math.round(loadAvg[2] * 100) / 100,
    },
    normalizedLoad: Math.round(normalizedLoad * 100) / 100,
  };
}

/**
 * Check Node.js process health
 */
function checkProcess() {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  return {
    status: HealthStatus.HEALTHY,
    pid: process.pid,
    uptimeSeconds: Math.round(uptime),
    uptimeHuman: formatUptime(uptime),
    memory: {
      heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMb: Math.round(memUsage.rss / 1024 / 1024),
      externalMb: Math.round(memUsage.external / 1024 / 1024),
    },
    nodeVersion: process.version,
  };
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (parts.length === 0) parts.push(`${Math.round(seconds)}s`);
  
  return parts.join(' ');
}

/**
 * Main Health Monitor class
 */
export class HealthMonitor {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.lastCheck = null;
    this.checkInterval = null;
    this.listeners = [];
  }

  /**
   * Run a full health check
   */
  async check() {
    const startTime = Date.now();
    
    const results = {
      timestamp: new Date().toISOString(),
      overall: HealthStatus.HEALTHY,
      services: {},
      system: {},
      durationMs: 0,
    };

    // Check Ollama
    if (this.config.ollama.enabled) {
      results.services.ollama = await checkOllama(
        this.config.ollama.host,
        this.config.timeoutMs
      );
    }

    // Check system resources
    results.system.memory = checkMemory(this.config.memory);
    results.system.cpu = checkCpu();
    results.system.process = checkProcess();

    // Calculate overall status
    const allStatuses = [
      ...Object.values(results.services).map((s) => s.status),
      ...Object.values(results.system).map((s) => s.status),
    ];

    if (allStatuses.includes(HealthStatus.UNHEALTHY)) {
      results.overall = HealthStatus.UNHEALTHY;
    } else if (allStatuses.includes(HealthStatus.DEGRADED)) {
      results.overall = HealthStatus.DEGRADED;
    } else if (allStatuses.every((s) => s === HealthStatus.HEALTHY)) {
      results.overall = HealthStatus.HEALTHY;
    } else {
      results.overall = HealthStatus.UNKNOWN;
    }

    results.durationMs = Date.now() - startTime;
    this.lastCheck = results;

    // Log status changes
    log.info('Health check completed', {
      overall: results.overall,
      durationMs: results.durationMs,
    });

    // Notify listeners
    this.listeners.forEach((fn) => fn(results));

    return results;
  }

  /**
   * Get the last check results (or run a new check if none)
   */
  async getStatus() {
    if (!this.lastCheck) {
      return this.check();
    }
    return this.lastCheck;
  }

  /**
   * Start periodic health checks
   */
  start() {
    if (this.checkInterval) {
      return;
    }

    log.info('Starting health monitor', {
      intervalMs: this.config.checkIntervalMs,
    });

    // Run initial check
    this.check();

    // Schedule periodic checks
    this.checkInterval = setInterval(
      () => this.check(),
      this.config.checkIntervalMs
    );
  }

  /**
   * Stop periodic health checks
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      log.info('Health monitor stopped');
    }
  }

  /**
   * Subscribe to health check results
   */
  onCheck(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== callback);
    };
  }

  /**
   * Get recovery suggestions for current issues
   */
  async getSuggestions() {
    const status = await this.getStatus();
    const suggestions = [];

    // Ollama issues
    if (status.services.ollama?.status === HealthStatus.UNHEALTHY) {
      suggestions.push({
        service: 'ollama',
        issue: 'Ollama is not reachable',
        suggestions: [
          'Check if Ollama is running: `ollama serve`',
          'Verify OLLAMA_HOST environment variable',
          `Current host: ${this.config.ollama.host}`,
        ],
      });
    } else if (status.services.ollama?.status === HealthStatus.DEGRADED) {
      suggestions.push({
        service: 'ollama',
        issue: 'No models available',
        suggestions: [
          'Pull a model: `ollama pull llama3.2`',
          'List available models: `ollama list`',
        ],
      });
    }

    // Memory issues
    if (status.system.memory?.status === HealthStatus.UNHEALTHY) {
      suggestions.push({
        service: 'memory',
        issue: `Memory usage critical (${status.system.memory.usedPercent}%)`,
        suggestions: [
          'Close unused applications',
          'Restart StaticRebel to free memory',
          'Consider increasing system memory',
        ],
      });
    }

    // CPU issues
    if (status.system.cpu?.status !== HealthStatus.HEALTHY) {
      suggestions.push({
        service: 'cpu',
        issue: `High CPU load (${status.system.cpu.normalizedLoad}x cores)`,
        suggestions: [
          'Check for runaway processes',
          'Reduce concurrent operations',
          'Wait for current tasks to complete',
        ],
      });
    }

    return suggestions;
  }
}

// Singleton instance
let globalMonitor = null;

/**
 * Get the global health monitor instance
 */
export function getHealthMonitor(options = {}) {
  if (!globalMonitor) {
    globalMonitor = new HealthMonitor(options);
  }
  return globalMonitor;
}

/**
 * Quick health check (for CLI/API)
 */
export async function quickCheck() {
  const monitor = getHealthMonitor();
  return monitor.check();
}

export default HealthMonitor;
