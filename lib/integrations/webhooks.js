/**
 * Webhook System for StaticRebel
 * 
 * Generic webhook system supporting both outgoing and incoming webhooks.
 * Integrates with the EventBus for seamless event-driven webhook triggers.
 * 
 * Features:
 * - Outgoing webhooks with retry logic and exponential backoff
 * - Incoming webhooks with HTTP endpoints
 * - Configurable payload templates
 * - Webhook management via CLI
 * - Webhook logs and history
 * - Test connectivity features
 */

import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import express from 'express';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getEventBus, EventTypes } from '../eventBus.js';
import { getLogger } from '../logger.js';
import { addMemory } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = getLogger('Webhooks');

// Webhook-specific event types
export const WebhookEventTypes = {
  // Outgoing webhook events
  WEBHOOK_TRIGGERED: 'webhook.triggered',
  WEBHOOK_SUCCESS: 'webhook.success', 
  WEBHOOK_FAILED: 'webhook.failed',
  WEBHOOK_RETRY: 'webhook.retry',
  
  // Incoming webhook events
  WEBHOOK_RECEIVED: 'webhook.received',
  WEBHOOK_PROCESSED: 'webhook.processed',
  WEBHOOK_INVALID: 'webhook.invalid',
  
  // Management events
  WEBHOOK_ADDED: 'webhook.added',
  WEBHOOK_REMOVED: 'webhook.removed',
  WEBHOOK_TESTED: 'webhook.tested',
};

// Default configuration
const DEFAULT_CONFIG = {
  enabled: true,
  incomingPort: 3001,
  incomingPath: '/webhook',
  maxRetries: 3,
  initialRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  timeoutMs: 10000,
  logRetentionDays: 30,
  dataDir: path.join(process.cwd(), 'data', 'webhooks'),
  secretLength: 32,
};

// Default payload templates
const DEFAULT_TEMPLATES = {
  entry_logged: {
    event: 'entry_logged',
    timestamp: '{{timestamp}}',
    user_id: '{{user_id}}',
    entry: {
      id: '{{entry.id}}',
      content: '{{entry.content}}',
      tags: '{{entry.tags}}',
      mood: '{{entry.mood}}'
    }
  },
  
  streak_milestone: {
    event: 'streak_milestone',
    timestamp: '{{timestamp}}',
    user_id: '{{user_id}}',
    streak: {
      type: '{{streak.type}}',
      current_count: '{{streak.current_count}}',
      milestone: '{{streak.milestone}}',
      achievement: '{{streak.achievement}}'
    }
  },
  
  goal_reached: {
    event: 'goal_reached',
    timestamp: '{{timestamp}}',
    user_id: '{{user_id}}',
    goal: {
      id: '{{goal.id}}',
      title: '{{goal.title}}',
      target: '{{goal.target}}',
      achieved_value: '{{goal.achieved_value}}',
      completion_date: '{{goal.completion_date}}'
    }
  },
  
  nudge: {
    event: 'nudge',
    timestamp: '{{timestamp}}',
    user_id: '{{user_id}}',
    nudge: {
      type: '{{nudge.type}}',
      message: '{{nudge.message}}',
      priority: '{{nudge.priority}}',
      context: '{{nudge.context}}'
    }
  }
};

/**
 * Template engine for webhook payloads
 */
class TemplateEngine {
  static render(template, data) {
    if (typeof template === 'string') {
      return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        return this.getNestedValue(data, path.trim()) || match;
      });
    }
    
    if (Array.isArray(template)) {
      return template.map(item => this.render(item, data));
    }
    
    if (template && typeof template === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.render(value, data);
      }
      return result;
    }
    
    return template;
  }
  
  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}

/**
 * Webhook delivery with retry logic
 */
class WebhookDelivery {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async deliver(webhook, payload, attempt = 1) {
    const deliveryId = crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      log.info('Delivering webhook', {
        id: webhook.id,
        url: webhook.url,
        event: webhook.event,
        attempt,
        deliveryId
      });

      const response = await this.makeRequest(webhook, payload);
      const duration = Date.now() - startTime;
      
      const logEntry = {
        id: deliveryId,
        webhookId: webhook.id,
        url: webhook.url,
        event: webhook.event,
        attempt,
        status: 'success',
        statusCode: response.statusCode,
        duration,
        timestamp: new Date().toISOString(),
        payload: this.config.logPayloads ? payload : '[payload hidden]',
        response: response.body?.substring(0, 500) || ''
      };
      
      await this.saveLog(logEntry);
      
      getEventBus().emit(WebhookEventTypes.WEBHOOK_SUCCESS, {
        webhook,
        payload,
        response: logEntry
      });

      log.info('Webhook delivered successfully', {
        id: webhook.id,
        statusCode: response.statusCode,
        duration,
        deliveryId
      });

      return { success: true, response: logEntry };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      const logEntry = {
        id: deliveryId,
        webhookId: webhook.id,
        url: webhook.url,
        event: webhook.event,
        attempt,
        status: 'failed',
        error: error.message,
        statusCode: error.status || error.code,
        duration,
        timestamp: new Date().toISOString(),
        payload: this.config.logPayloads ? payload : '[payload hidden]'
      };
      
      await this.saveLog(logEntry);
      
      // Retry logic
      if (attempt < this.config.maxRetries) {
        const delay = Math.min(
          this.config.initialRetryDelayMs * Math.pow(2, attempt - 1),
          this.config.maxRetryDelayMs
        );
        
        log.warn('Webhook delivery failed, retrying', {
          id: webhook.id,
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay,
          error: error.message,
          deliveryId
        });
        
        getEventBus().emit(WebhookEventTypes.WEBHOOK_RETRY, {
          webhook,
          payload,
          attempt,
          nextAttempt: attempt + 1,
          delay,
          error: logEntry
        });
        
        await this.sleep(delay);
        return this.deliver(webhook, payload, attempt + 1);
      }
      
      log.error('Webhook delivery failed permanently', {
        id: webhook.id,
        attempts: attempt,
        error: error.message,
        deliveryId
      });
      
      getEventBus().emit(WebhookEventTypes.WEBHOOK_FAILED, {
        webhook,
        payload,
        attempts: attempt,
        error: logEntry
      });
      
      return { success: false, error: logEntry };
    }
  }

  async makeRequest(webhook, payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(webhook.url);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const postData = JSON.stringify(payload);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'StaticRebel-Webhooks/1.0',
          ...webhook.headers
        },
        timeout: this.config.timeoutMs
      };

      // Add signature if secret is configured
      if (webhook.secret) {
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(postData)
          .digest('hex');
        options.headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }

      const req = client.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.config.timeoutMs}ms`));
      });

      req.write(postData);
      req.end();
    });
  }

  async saveLog(logEntry) {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.config.dataDir, `webhook-logs-${date}.json`);
      
      // Append to daily log file
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(logFile, logLine);
      
    } catch (error) {
      log.error('Failed to save webhook log', { error: error.message });
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main Webhook Manager class
 */
export class WebhookManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.webhooks = new Map();
    this.delivery = new WebhookDelivery(this.config);
    this.server = null;
    this.eventBus = getEventBus();
    
    this.init();
  }

  async init() {
    try {
      await this.loadWebhooks();
      await this.setupEventListeners();
      
      if (this.config.enabled) {
        await this.startIncomingServer();
      }
      
      log.info('Webhook manager initialized', {
        outgoingWebhooks: this.webhooks.size,
        incomingEnabled: this.config.enabled,
        incomingPort: this.config.incomingPort
      });
      
    } catch (error) {
      log.error('Failed to initialize webhook manager', { error: error.message });
    }
  }

  async loadWebhooks() {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      
      const configFile = path.join(this.config.dataDir, 'webhooks.json');
      
      try {
        const data = await fs.readFile(configFile, 'utf8');
        const webhooksData = JSON.parse(data);
        
        for (const webhook of webhooksData.webhooks || []) {
          this.webhooks.set(webhook.id, {
            ...webhook,
            template: webhook.template || DEFAULT_TEMPLATES[webhook.event] || {}
          });
        }
        
        log.info('Loaded webhooks from config', { count: this.webhooks.size });
        
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist, start with empty webhooks
        log.info('No existing webhook config found, starting fresh');
      }
      
    } catch (error) {
      log.error('Failed to load webhooks', { error: error.message });
    }
  }

  async saveWebhooks() {
    try {
      const configFile = path.join(this.config.dataDir, 'webhooks.json');
      
      const data = {
        version: '1.0',
        updated: new Date().toISOString(),
        webhooks: Array.from(this.webhooks.values())
      };
      
      await fs.writeFile(configFile, JSON.stringify(data, null, 2));
      log.debug('Saved webhooks to config');
      
    } catch (error) {
      log.error('Failed to save webhooks', { error: error.message });
    }
  }

  setupEventListeners() {
    // Listen for events that should trigger webhooks
    const eventMap = {
      'entry.logged': 'entry_logged',
      'streak.milestone': 'streak_milestone', 
      'goal.reached': 'goal_reached',
      'nudge.sent': 'nudge'
    };

    for (const [eventPattern, webhookEvent] of Object.entries(eventMap)) {
      this.eventBus.on(eventPattern, (event) => {
        this.triggerWebhooks(webhookEvent, event.data);
      });
    }

    log.info('Event listeners setup for webhook triggers', { 
      patterns: Object.keys(eventMap) 
    });
  }

  async triggerWebhooks(eventType, data) {
    const matchingWebhooks = Array.from(this.webhooks.values())
      .filter(webhook => webhook.event === eventType && webhook.enabled !== false);

    if (matchingWebhooks.length === 0) {
      log.debug('No webhooks configured for event', { eventType });
      return;
    }

    const commonData = {
      timestamp: new Date().toISOString(),
      user_id: data.userId || 'default',
      ...data
    };

    log.info('Triggering webhooks for event', {
      eventType,
      webhookCount: matchingWebhooks.length,
      data: this.config.logPayloads ? commonData : '[data hidden]'
    });

    this.eventBus.emit(WebhookEventTypes.WEBHOOK_TRIGGERED, {
      eventType,
      webhookCount: matchingWebhooks.length,
      data: commonData
    });

    // Trigger all matching webhooks concurrently
    const deliveryPromises = matchingWebhooks.map(async (webhook) => {
      try {
        const payload = TemplateEngine.render(webhook.template, commonData);
        return await this.delivery.deliver(webhook, payload);
      } catch (error) {
        log.error('Error triggering webhook', {
          webhookId: webhook.id,
          error: error.message
        });
        return { success: false, error: error.message };
      }
    });

    const results = await Promise.allSettled(deliveryPromises);
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    log.info('Webhook trigger batch completed', {
      eventType,
      successful,
      failed,
      total: results.length
    });
  }

  startIncomingServer() {
    return new Promise((resolve, reject) => {
      const app = express();
      
      app.use(express.json({ limit: '10mb' }));
      app.use(express.urlencoded({ extended: true }));

      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({ 
          status: 'ok', 
          service: 'StaticRebel Webhooks',
          timestamp: new Date().toISOString()
        });
      });

      // Main webhook endpoint
      app.post(this.config.incomingPath, async (req, res) => {
        await this.handleIncomingWebhook(req, res);
      });

      // Catch-all for invalid paths
      app.use((req, res) => {
        res.status(404).json({ 
          error: 'Not Found',
          message: `Webhook endpoint is: POST ${this.config.incomingPath}`
        });
      });

      this.server = app.listen(this.config.incomingPort, (error) => {
        if (error) {
          reject(error);
        } else {
          log.info('Incoming webhook server started', {
            port: this.config.incomingPort,
            path: this.config.incomingPath
          });
          resolve();
        }
      });

      this.server.on('error', (error) => {
        log.error('Incoming webhook server error', { error: error.message });
      });
    });
  }

  async handleIncomingWebhook(req, res) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      log.info('Incoming webhook received', {
        requestId,
        method: req.method,
        url: req.url,
        headers: Object.keys(req.headers),
        bodySize: JSON.stringify(req.body).length
      });

      // Validate request
      if (!req.body) {
        return this.sendWebhookResponse(res, 400, 'Missing request body', requestId);
      }

      // Extract webhook event type from headers or body
      const eventType = req.headers['x-webhook-event'] || req.body.event || 'generic';
      
      // Verify signature if provided
      const signature = req.headers['x-webhook-signature'];
      if (signature) {
        // TODO: Implement signature verification for incoming webhooks
        // This would require storing secrets for incoming webhook sources
      }

      const webhookData = {
        id: requestId,
        eventType,
        source: req.headers['user-agent'] || 'unknown',
        timestamp: new Date().toISOString(),
        headers: req.headers,
        body: req.body,
        duration: Date.now() - startTime
      };

      // Emit event for processing
      this.eventBus.emit(WebhookEventTypes.WEBHOOK_RECEIVED, webhookData);

      // Process webhook based on event type
      const result = await this.processIncomingWebhook(webhookData);
      
      if (result.success) {
        this.eventBus.emit(WebhookEventTypes.WEBHOOK_PROCESSED, {
          ...webhookData,
          result
        });
        
        return this.sendWebhookResponse(res, 200, result.message || 'Webhook processed successfully', requestId);
      } else {
        this.eventBus.emit(WebhookEventTypes.WEBHOOK_INVALID, {
          ...webhookData,
          error: result.error
        });
        
        return this.sendWebhookResponse(res, 400, result.error || 'Webhook processing failed', requestId);
      }
      
    } catch (error) {
      log.error('Error handling incoming webhook', {
        requestId,
        error: error.message
      });
      
      return this.sendWebhookResponse(res, 500, 'Internal server error', requestId);
    }
  }

  sendWebhookResponse(res, statusCode, message, requestId) {
    res.status(statusCode).json({
      status: statusCode < 400 ? 'success' : 'error',
      message,
      requestId,
      timestamp: new Date().toISOString()
    });
  }

  async processIncomingWebhook(webhookData) {
    try {
      const { eventType, body } = webhookData;
      
      switch (eventType) {
        case 'log_entry':
          return await this.processLogEntry(body);
        case 'trigger_action':
          return await this.processTriggerAction(body);
        case 'external_update':
          return await this.processExternalUpdate(body);
        default:
          return await this.processGenericWebhook(webhookData);
      }
      
    } catch (error) {
      log.error('Error processing incoming webhook', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  async processLogEntry(body) {
    // Process incoming log entry webhooks
    if (!body.content) {
      return { success: false, error: 'Missing content field' };
    }

    // Add to memory/journal system
    const today = new Date().toISOString().split('T')[0];
    addMemory(today, 'webhook_entry', body.content, {
      source: 'webhook',
      tags: body.tags || [],
      mood: body.mood,
      timestamp: body.timestamp || new Date().toISOString()
    });

    // Emit event for other systems to process
    this.eventBus.emit('entry.logged', {
      data: {
        content: body.content,
        tags: body.tags,
        mood: body.mood,
        source: 'webhook'
      }
    });

    return { 
      success: true, 
      message: 'Entry logged successfully',
      entryId: crypto.randomUUID()
    };
  }

  async processTriggerAction(body) {
    // Process action trigger webhooks
    if (!body.action) {
      return { success: false, error: 'Missing action field' };
    }

    // Emit event for action processing
    this.eventBus.emit('action.triggered', {
      data: {
        action: body.action,
        params: body.params || {},
        source: 'webhook'
      }
    });

    return { 
      success: true, 
      message: `Action '${body.action}' triggered`,
      actionId: crypto.randomUUID()
    };
  }

  async processExternalUpdate(body) {
    // Process external system updates
    this.eventBus.emit('external.update', {
      data: {
        system: body.system || 'unknown',
        update: body.update,
        source: 'webhook'
      }
    });

    return { 
      success: true, 
      message: 'External update processed'
    };
  }

  async processGenericWebhook(webhookData) {
    // Process generic webhooks
    this.eventBus.emit('webhook.generic', {
      data: webhookData
    });

    return { 
      success: true, 
      message: 'Generic webhook processed'
    };
  }

  // Webhook management methods

  async addWebhook(config) {
    const webhook = {
      id: config.id || crypto.randomUUID(),
      name: config.name,
      url: config.url,
      event: config.event,
      enabled: config.enabled !== false,
      headers: config.headers || {},
      secret: config.secret,
      template: config.template || DEFAULT_TEMPLATES[config.event] || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Validate webhook
    const validation = this.validateWebhook(webhook);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    this.webhooks.set(webhook.id, webhook);
    await this.saveWebhooks();

    this.eventBus.emit(WebhookEventTypes.WEBHOOK_ADDED, { webhook });
    
    log.info('Webhook added', { 
      id: webhook.id, 
      name: webhook.name,
      event: webhook.event,
      url: webhook.url 
    });

    return webhook;
  }

  async removeWebhook(id) {
    const webhook = this.webhooks.get(id);
    if (!webhook) {
      throw new Error(`Webhook not found: ${id}`);
    }

    this.webhooks.delete(id);
    await this.saveWebhooks();

    this.eventBus.emit(WebhookEventTypes.WEBHOOK_REMOVED, { webhook });
    
    log.info('Webhook removed', { 
      id: webhook.id, 
      name: webhook.name 
    });

    return webhook;
  }

  validateWebhook(webhook) {
    if (!webhook.name) {
      return { valid: false, error: 'Name is required' };
    }
    
    if (!webhook.url) {
      return { valid: false, error: 'URL is required' };
    }

    try {
      new URL(webhook.url);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }

    if (!webhook.event) {
      return { valid: false, error: 'Event type is required' };
    }

    const validEvents = Object.keys(DEFAULT_TEMPLATES);
    if (!validEvents.includes(webhook.event)) {
      return { 
        valid: false, 
        error: `Invalid event type. Must be one of: ${validEvents.join(', ')}`
      };
    }

    return { valid: true };
  }

  async testWebhook(id) {
    const webhook = this.webhooks.get(id);
    if (!webhook) {
      throw new Error(`Webhook not found: ${id}`);
    }

    const testData = {
      timestamp: new Date().toISOString(),
      user_id: 'test',
      test: true,
      message: 'This is a test webhook delivery from StaticRebel'
    };

    const payload = TemplateEngine.render(webhook.template, testData);
    
    this.eventBus.emit(WebhookEventTypes.WEBHOOK_TESTED, { 
      webhook, 
      testData: payload 
    });

    const result = await this.delivery.deliver(webhook, payload);
    
    log.info('Webhook test completed', { 
      id: webhook.id, 
      success: result.success 
    });

    return result;
  }

  listWebhooks() {
    return Array.from(this.webhooks.values());
  }

  getWebhook(id) {
    return this.webhooks.get(id);
  }

  async getLogs(options = {}) {
    try {
      const logs = [];
      const { days = 7, webhookId, event, status } = options;
      
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const logFile = path.join(this.config.dataDir, `webhook-logs-${dateStr}.json`);
        
        try {
          const content = await fs.readFile(logFile, 'utf8');
          const dayLogs = content.trim().split('\n')
            .filter(line => line)
            .map(line => JSON.parse(line));
          
          logs.push(...dayLogs);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            log.warn('Error reading log file', { file: logFile, error: error.message });
          }
        }
      }
      
      // Apply filters
      let filteredLogs = logs;
      
      if (webhookId) {
        filteredLogs = filteredLogs.filter(log => log.webhookId === webhookId);
      }
      
      if (event) {
        filteredLogs = filteredLogs.filter(log => log.event === event);
      }
      
      if (status) {
        filteredLogs = filteredLogs.filter(log => log.status === status);
      }
      
      // Sort by timestamp (newest first)
      filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return filteredLogs;
      
    } catch (error) {
      log.error('Error retrieving webhook logs', { error: error.message });
      return [];
    }
  }

  async getStats() {
    const webhooks = this.listWebhooks();
    const logs = await this.getLogs({ days: 1 });
    
    const stats = {
      totalWebhooks: webhooks.length,
      enabledWebhooks: webhooks.filter(w => w.enabled !== false).length,
      today: {
        deliveries: logs.length,
        successful: logs.filter(l => l.status === 'success').length,
        failed: logs.filter(l => l.status === 'failed').length
      },
      byEvent: {}
    };
    
    // Calculate stats by event type
    for (const webhook of webhooks) {
      const eventLogs = logs.filter(l => l.event === webhook.event);
      stats.byEvent[webhook.event] = {
        webhooks: webhooks.filter(w => w.event === webhook.event).length,
        deliveries: eventLogs.length,
        successful: eventLogs.filter(l => l.status === 'success').length,
        failed: eventLogs.filter(l => l.status === 'failed').length
      };
    }
    
    return stats;
  }

  async cleanup() {
    // Clean up old logs
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.logRetentionDays);
      
      const files = await fs.readdir(this.config.dataDir);
      const logFiles = files.filter(f => f.startsWith('webhook-logs-') && f.endsWith('.json'));
      
      let deletedCount = 0;
      
      for (const file of logFiles) {
        const match = file.match(/webhook-logs-(\d{4}-\d{2}-\d{2})\.json/);
        if (match) {
          const fileDate = new Date(match[1]);
          if (fileDate < cutoffDate) {
            await fs.unlink(path.join(this.config.dataDir, file));
            deletedCount++;
          }
        }
      }
      
      if (deletedCount > 0) {
        log.info('Cleaned up old webhook logs', { deletedFiles: deletedCount });
      }
      
    } catch (error) {
      log.error('Error during webhook cleanup', { error: error.message });
    }
  }

  async shutdown() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          log.info('Incoming webhook server shut down');
          resolve();
        });
      });
    }
  }
}

// Singleton instance
let webhookManager = null;

/**
 * Get the webhook manager instance
 */
export function getWebhookManager(config = {}) {
  if (!webhookManager) {
    webhookManager = new WebhookManager(config);
  }
  return webhookManager;
}

/**
 * Initialize webhook system
 */
export async function initWebhooks(config = {}) {
  const manager = getWebhookManager(config);
  return manager;
}

export default {
  WebhookManager,
  WebhookEventTypes,
  getWebhookManager,
  initWebhooks,
  TemplateEngine
};