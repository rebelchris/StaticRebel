/**
 * Lane Queue - Serial message processing with parallel lanes option
 *
 * Implements Clawdbot's Lane Queue architecture:
 * - Default serial execution per session (prevents race conditions)
 * - Explicit parallel lanes for concurrent operations (cron jobs, etc.)
 * - Control layer for preventing async/await spaghetti
 *
 * Philosophy: "Default to serial, go parallel explicitly"
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * @typedef {Object} LaneMessage
 * @property {string} id - Unique message ID
 * @property {string} sessionId - Session lane identifier
 * @property {string} type - Message type
 * @property {Object} payload - Message payload
 * @property {Function} resolve - Promise resolve function
 * @property {Function} reject - Promise reject function
 * @property {Date} createdAt - Creation timestamp
 * @property {number} priority - Message priority (higher = processed first)
 */

/**
 * @typedef {Object} LaneOptions
 * @property {boolean} serial - Whether this lane is serial (default: true)
 * @property {number} maxConcurrent - Max concurrent messages (default: 1 for serial)
 * @property {number} timeout - Message timeout in ms
 */

// ============================================================================
// Lane Queue Class
// ============================================================================

export class LaneQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      defaultTimeout: options.defaultTimeout || 60000,
      maxLanes: options.maxLanes || 100,
      enableMetrics: options.enableMetrics !== false,
      ...options,
    };

    // Lanes map: sessionId -> Queue
    this.lanes = new Map();

    // Active processing count per lane
    this.activeCount = new Map();

    // Metrics
    this.metrics = {
      totalMessages: 0,
      totalProcessed: 0,
      totalFailed: 0,
      laneMetrics: new Map(),
    };

    // Processing loop
    this.isProcessing = false;
  }

  /**
   * Get or create a lane for a session
   */
  getLane(sessionId, options = {}) {
    if (!this.lanes.has(sessionId)) {
      if (this.lanes.size >= this.options.maxLanes) {
        throw new Error(`Maximum lanes (${this.options.maxLanes}) reached`);
      }

      this.lanes.set(sessionId, {
        queue: [],
        options: {
          serial: options.serial !== false, // Default: serial
          maxConcurrent: options.serial !== false ? 1 : (options.maxConcurrent || 5),
          timeout: options.timeout || this.options.defaultTimeout,
        },
        isProcessing: false,
      });

      this.emit('lane:created', { sessionId });
    }

    return this.lanes.get(sessionId);
  }

  /**
   * Send a message to a session lane (serial by default)
   */
  send(sessionId, type, payload, options = {}) {
    return new Promise((resolve, reject) => {
      const lane = this.getLane(sessionId, options);

      const message = {
        id: uuidv4(),
        sessionId,
        type,
        payload,
        resolve,
        reject,
        createdAt: new Date(),
        priority: options.priority || 0,
        timeout: options.timeout || lane.options.timeout,
      };

      // Add to queue
      lane.queue.push(message);

      // Sort by priority (higher first)
      lane.queue.sort((a, b) => b.priority - a.priority);

      // Update metrics
      this.metrics.totalMessages++;
      this.updateLaneMetrics(sessionId, 'queued');

      this.emit('message:queued', { sessionId, messageId: message.id, type });

      // Start processing if not already
      this.processLane(sessionId);
    });
  }

  /**
   * Send to a parallel lane (for cron jobs, background tasks)
   */
  sendParallel(sessionId, type, payload, options = {}) {
    return this.send(sessionId, type, payload, {
      ...options,
      serial: false,
      maxConcurrent: options.maxConcurrent || 5,
    });
  }

  /**
   * Process messages in a lane
   */
  async processLane(sessionId) {
    const lane = this.lanes.get(sessionId);
    if (!lane || lane.isProcessing) {
      return;
    }

    // Check if lane is at capacity
    const currentActive = this.activeCount.get(sessionId) || 0;
    if (currentActive >= lane.options.maxConcurrent) {
      return;
    }

    lane.isProcessing = true;

    while (lane.queue.length > 0) {
      // Check capacity again
      const activeNow = this.activeCount.get(sessionId) || 0;
      if (activeNow >= lane.options.maxConcurrent) {
        break;
      }

      // Get next message
      const message = lane.queue.shift();

      // Mark as active
      this.activeCount.set(sessionId, (this.activeCount.get(sessionId) || 0) + 1);
      this.updateLaneMetrics(sessionId, 'processing');

      this.emit('message:processing', { sessionId, messageId: message.id, type: message.type });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        message.reject(new Error(`Message timeout after ${message.timeout}ms`));
        this.metrics.totalFailed++;
        this.updateLaneMetrics(sessionId, 'failed');
        this.emit('message:timeout', { sessionId, messageId: message.id });
      }, message.timeout);

      try {
        // Emit event for external handler
        const result = await this.handleMessage(sessionId, message);

        clearTimeout(timeoutId);
        message.resolve(result);

        this.metrics.totalProcessed++;
        this.updateLaneMetrics(sessionId, 'processed');

        this.emit('message:completed', { sessionId, messageId: message.id, type: message.type });
      } catch (error) {
        clearTimeout(timeoutId);
        message.reject(error);

        this.metrics.totalFailed++;
        this.updateLaneMetrics(sessionId, 'failed');

        this.emit('message:failed', { sessionId, messageId: message.id, error: error.message });
      } finally {
        this.activeCount.set(sessionId, (this.activeCount.get(sessionId) || 0) - 1);
      }
    }

    lane.isProcessing = false;

    // Clean up empty lanes
    if (lane.queue.length === 0 && currentActive === 0) {
      this.emit('lane:idle', { sessionId });
    }
  }

  /**
   * Handle a message (override in subclass or listen to events)
   */
  async handleMessage(sessionId, message) {
    // Default: emit event and expect handler to resolve/reject
    this.emit('message', { sessionId, message });

    // Return a promise that waits for the 'message:result' event
    return new Promise((resolve, reject) => {
      const handler = (event) => {
        if (event.messageId === message.id) {
          process.removeListener('message:result', handler);
          process.removeListener('message:error', errorHandler);
          if (event.error) {
            reject(new Error(event.error));
          } else {
            resolve(event.result);
          }
        }
      };

      const errorHandler = (event) => {
        if (event.messageId === message.id) {
          process.removeListener('message:result', handler);
          process.removeListener('message:error', errorHandler);
          reject(new Error(event.error));
        }
      };

      process.on('message:result', handler);
      process.on('message:error', errorHandler);
    });
  }

  /**
   * Directly resolve a message (for external handlers)
   */
  resolveMessage(messageId, result) {
    process.emit('message:result', { messageId, result });
  }

  /**
   * Directly reject a message (for external handlers)
   */
  rejectMessage(messageId, error) {
    process.emit('message:error', { messageId, error });
  }

  /**
   * Update lane metrics
   */
  updateLaneMetrics(sessionId, status) {
    if (!this.options.enableMetrics) {
      return;
    }

    if (!this.metrics.laneMetrics.has(sessionId)) {
      this.metrics.laneMetrics.set(sessionId, {
        queued: 0,
        processing: 0,
        processed: 0,
        failed: 0,
      });
    }

    const laneMetrics = this.metrics.laneMetrics.get(sessionId);
    laneMetrics[status]++;
  }

  /**
   * Get queue status for a session
   */
  getQueueStatus(sessionId) {
    const lane = this.lanes.get(sessionId);
    if (!lane) {
      return { exists: false, queueLength: 0, active: 0 };
    }

    return {
      exists: true,
      queueLength: lane.queue.length,
      active: this.activeCount.get(sessionId) || 0,
      serial: lane.options.serial,
      maxConcurrent: lane.options.maxConcurrent,
    };
  }

  /**
   * Get all queue statuses
   */
  getAllQueueStatuses() {
    const statuses = [];

    for (const [sessionId, lane] of this.lanes) {
      statuses.push({
        sessionId,
        queueLength: lane.queue.length,
        active: this.activeCount.get(sessionId) || 0,
        serial: lane.options.serial,
        maxConcurrent: lane.options.maxConcurrent,
      });
    }

    return statuses;
  }

  /**
   * Clear a lane's queue
   */
  clearLane(sessionId, reason = 'cleared') {
    const lane = this.lanes.get(sessionId);
    if (!lane) {
      return;
    }

    // Reject all pending messages
    for (const message of lane.queue) {
      message.reject(new Error(`Queue cleared: ${reason}`));
      this.metrics.totalFailed++;
    }

    lane.queue = [];
    this.emit('lane:cleared', { sessionId, reason });
  }

  /**
   * Remove a lane
   */
  removeLane(sessionId) {
    this.clearLane(sessionId, 'removed');
    this.lanes.delete(sessionId);
    this.activeCount.delete(sessionId);
    this.metrics.laneMetrics.delete(sessionId);
    this.emit('lane:removed', { sessionId });
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      totalMessages: this.metrics.totalMessages,
      totalProcessed: this.metrics.totalProcessed,
      totalFailed: this.metrics.totalFailed,
      activeLanes: this.lanes.size,
      totalQueued: Array.from(this.lanes.values()).reduce(
        (sum, lane) => sum + lane.queue.length,
        0,
      ),
      laneMetrics: Object.fromEntries(this.metrics.laneMetrics),
    };
  }

  /**
   * Shutdown - reject all pending messages
   */
  shutdown(reason = 'shutdown') {
    for (const [sessionId] of this.lanes) {
      this.clearLane(sessionId, reason);
    }
    this.emit('shutdown', { reason });
  }
}

// ============================================================================
// Lane Manager (for multiple named lanes)
// ============================================================================

export class LaneManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.laneQueues = new Map();
    this.defaultLane = new LaneQueue(options);
  }

  /**
   * Get or create a named lane queue
   */
  getLane(name, options = {}) {
    if (!this.laneQueues.has(name)) {
      const lane = new LaneQueue(options);
      lane.on('message', (event) => this.emit('message', { lane: name, ...event }));
      this.laneQueues.set(name, lane);
      this.emit('lane:created', { name });
    }
    return this.laneQueues.get(name);
  }

  /**
   * Send to default lane (serial by default)
   */
  send(sessionId, type, payload, options = {}) {
    return this.defaultLane.send(sessionId, type, payload, options);
  }

  /**
   * Send to a named lane
   */
  sendTo(laneName, sessionId, type, payload, options = {}) {
    return this.getLane(laneName, options).send(sessionId, type, payload, options);
  }

  /**
   * Send to parallel lane
   */
  sendParallel(sessionId, type, payload, options = {}) {
    return this.defaultLane.sendParallel(sessionId, type, payload, options);
  }

  /**
   * Get all statuses
   */
  getAllStatuses() {
    const statuses = {};

    for (const [name, lane] of this.laneQueues) {
      statuses[name] = lane.getAllQueueStatuses();
    }

    statuses['_default'] = this.defaultLane.getAllQueueStatuses();

    return statuses;
  }

  /**
   * Shutdown all lanes
   */
  shutdown(reason = 'shutdown') {
    for (const [, lane] of this.laneQueues) {
      lane.shutdown(reason);
    }
    this.defaultLane.shutdown(reason);
    this.emit('shutdown', { reason });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createLaneQueue(options = {}) {
  return new LaneQueue(options);
}

export function createLaneManager(options = {}) {
  return new LaneManager(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default LaneQueue;
