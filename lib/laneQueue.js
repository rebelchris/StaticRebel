/**
 * Lane Queue Architecture
 * Session router that defaults to serial execution with opt-in parallel lanes
 *
 * Core concept from Clawdbot: "Default to serial, go for parallel explicitly"
 * This prevents async/await spaghetti and race conditions
 *
 * Features:
 * - Serial execution by default per session
 * - Opt-in parallel lanes for cron jobs and independent tasks
 * - Prevents interleaved garbage logs and race conditions
 * - Explicit session isolation
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Session Queue - Serial execution queue for a single session
 */
class SessionQueue extends EventEmitter {
  constructor(sessionId, options = {}) {
    super();
    this.sessionId = sessionId;
    this.queue = [];
    this.isProcessing = false;
    this.options = {
      maxQueueSize: options.maxQueueSize || 100,
      maxWaitTime: options.maxWaitTime || 300000, // 5 minutes
      ...options,
    };
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      avgProcessingTime: 0,
    };
  }

  /**
   * Add a message/task to the queue
   */
  async enqueue(task) {
    if (this.queue.length >= this.options.maxQueueSize) {
      throw new Error(`Queue full for session ${this.sessionId}`);
    }

    const queuedTask = {
      id: uuidv4(),
      task,
      enqueuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      status: 'pending',
      error: null,
      result: null,
    };

    this.queue.push(queuedTask);
    this.emit('task:enqueued', {
      sessionId: this.sessionId,
      taskId: queuedTask.id,
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return queuedTask.id;
  }

  /**
   * Process queue serially (one at a time)
   */
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.emit('queue:started', { sessionId: this.sessionId });

    try {
      while (this.queue.length > 0) {
        const currentTask = this.queue[0];

        // Check for timeout
        const waitTime = Date.now() - currentTask.enqueuedAt;
        if (waitTime > this.options.maxWaitTime) {
          currentTask.status = 'timeout';
          currentTask.error = new Error('Task timed out waiting in queue');
          this.queue.shift();
          this.emit('task:timeout', {
            sessionId: this.sessionId,
            taskId: currentTask.id,
          });
          continue;
        }

        // Execute the task
        currentTask.status = 'processing';
        currentTask.startedAt = Date.now();
        this.emit('task:started', {
          sessionId: this.sessionId,
          taskId: currentTask.id,
        });

        try {
          const result = await this.executeTask(currentTask.task);
          currentTask.result = result;
          currentTask.status = 'completed';
          currentTask.completedAt = Date.now();
          this.stats.totalProcessed++;
          this.updateStats(currentTask);
          this.emit('task:completed', {
            sessionId: this.sessionId,
            taskId: currentTask.id,
            result,
            duration: currentTask.completedAt - currentTask.startedAt,
          });
        } catch (error) {
          currentTask.error = error;
          currentTask.status = 'failed';
          currentTask.completedAt = Date.now();
          this.stats.totalFailed++;
          this.emit('task:failed', {
            sessionId: this.sessionId,
            taskId: currentTask.id,
            error: error.message,
            duration: currentTask.completedAt - currentTask.startedAt,
          });
        }

        // Remove from queue
        this.queue.shift();
      }
    } finally {
      this.isProcessing = false;
      this.emit('queue:ended', { sessionId: this.sessionId });
    }
  }

  /**
   * Execute a single task
   */
  async executeTask(task) {
    if (typeof task.handler === 'function') {
      return await task.handler(task.params);
    }
    throw new Error('Task must have a handler function');
  }

  /**
   * Update processing statistics
   */
  updateStats(task) {
    const duration = task.completedAt - task.startedAt;
    const totalTasks = this.stats.totalProcessed + this.stats.totalFailed;
    this.stats.avgProcessingTime =
      (this.stats.avgProcessingTime * (totalTasks - 1) + duration) / totalTasks;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      stats: { ...this.stats },
      pendingTasks: this.queue
        .filter((t) => t.status === 'pending')
        .map((t) => ({ id: t.id, enqueuedAt: t.enqueuedAt })),
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    const cleared = this.queue.length;
    this.queue.forEach((task) => {
      if (task.status === 'pending') {
        task.status = 'cancelled';
        this.emit('task:cancelled', {
          sessionId: this.sessionId,
          taskId: task.id,
        });
      }
    });
    this.queue = [];
    return cleared;
  }
}

/**
 * Parallel Lane - For cron jobs and independent tasks
 * Runs tasks in parallel with no ordering guarantees
 */
class ParallelLane extends EventEmitter {
  constructor(laneId, options = {}) {
    super();
    this.laneId = laneId;
    this.maxConcurrency = options.maxConcurrency || 5;
    this.running = new Map();
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
    };
  }

  /**
   * Execute a task in parallel
   */
  async execute(task) {
    // Wait if at max concurrency
    while (this.running.size >= this.maxConcurrency) {
      await this.waitForSlot();
    }

    const taskId = uuidv4();
    const taskWrapper = {
      id: taskId,
      task,
      startedAt: Date.now(),
      status: 'running',
    };

    this.running.set(taskId, taskWrapper);
    this.emit('task:started', { laneId: this.laneId, taskId });

    try {
      const result = await this.runTask(task);
      taskWrapper.status = 'completed';
      taskWrapper.completedAt = Date.now();
      taskWrapper.result = result;
      this.stats.totalProcessed++;
      this.emit('task:completed', {
        laneId: this.laneId,
        taskId,
        result,
        duration: taskWrapper.completedAt - taskWrapper.startedAt,
      });
      return result;
    } catch (error) {
      taskWrapper.status = 'failed';
      taskWrapper.completedAt = Date.now();
      taskWrapper.error = error;
      this.stats.totalFailed++;
      this.emit('task:failed', {
        laneId: this.laneId,
        taskId,
        error: error.message,
      });
      throw error;
    } finally {
      this.running.delete(taskId);
    }
  }

  /**
   * Run the actual task
   */
  async runTask(task) {
    if (typeof task.handler === 'function') {
      return await task.handler(task.params);
    }
    throw new Error('Task must have a handler function');
  }

  /**
   * Wait for a slot to become available
   */
  async waitForSlot() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.running.size < this.maxConcurrency) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Get lane status
   */
  getStatus() {
    return {
      laneId: this.laneId,
      runningCount: this.running.size,
      maxConcurrency: this.maxConcurrency,
      stats: { ...this.stats },
      runningTasks: Array.from(this.running.values()).map((t) => ({
        id: t.id,
        startedAt: t.startedAt,
        status: t.status,
      })),
    };
  }
}

/**
 * Lane Queue Router - Main entry point
 * Routes messages to appropriate session queues or parallel lanes
 */
export class LaneQueueRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      defaultMaxQueueSize: options.defaultMaxQueueSize || 100,
      defaultMaxWaitTime: options.defaultMaxWaitTime || 300000,
      ...options,
    };

    // Serial session queues
    this.sessions = new Map();

    // Parallel lanes
    this.parallelLanes = new Map();

    // Default lane for tasks without explicit session
    this.defaultLane = null;
  }

  /**
   * Get or create a session queue (SERIAL by default)
   */
  getSessionQueue(sessionId, options = {}) {
    if (!this.sessions.has(sessionId)) {
      const queue = new SessionQueue(sessionId, {
        maxQueueSize: options.maxQueueSize || this.options.defaultMaxQueueSize,
        maxWaitTime: options.maxWaitTime || this.options.defaultMaxWaitTime,
        ...options,
      });

      // Forward events
      queue.on('task:enqueued', (data) =>
        this.emit('session:task:enqueued', data),
      );
      queue.on('task:started', (data) =>
        this.emit('session:task:started', data),
      );
      queue.on('task:completed', (data) =>
        this.emit('session:task:completed', data),
      );
      queue.on('task:failed', (data) => this.emit('session:task:failed', data));
      queue.on('task:timeout', (data) =>
        this.emit('session:task:timeout', data),
      );
      queue.on('task:cancelled', (data) =>
        this.emit('session:task:cancelled', data),
      );

      this.sessions.set(sessionId, queue);
    }
    return this.sessions.get(sessionId);
  }

  /**
   * Get or create a parallel lane (EXPLICIT parallel execution)
   */
  getParallelLane(laneId, options = {}) {
    if (!this.parallelLanes.has(laneId)) {
      const lane = new ParallelLane(laneId, options);

      // Forward events
      lane.on('task:started', (data) => this.emit('lane:task:started', data));
      lane.on('task:completed', (data) =>
        this.emit('lane:task:completed', data),
      );
      lane.on('task:failed', (data) => this.emit('lane:task:failed', data));

      this.parallelLanes.set(laneId, lane);
    }
    return this.parallelLanes.get(laneId);
  }

  /**
   * Route a task to appropriate queue/lane
   * @param {Object} options
   * @param {string} options.sessionId - Session ID for serial execution
   * @param {string} options.laneId - Lane ID for parallel execution (takes precedence)
   * @param {Function} options.handler - Task handler function
   * @param {Object} options.params - Task parameters
   * @param {Object} options.metadata - Additional metadata
   */
  async route(options) {
    const { sessionId, laneId, handler, params, metadata = {} } = options;

    const task = {
      handler,
      params,
      metadata,
    };

    // Parallel lane takes precedence (explicit parallel)
    if (laneId) {
      const lane = this.getParallelLane(laneId, metadata.laneOptions);
      return await lane.execute(task);
    }

    // Default to serial session queue
    const effectiveSessionId = sessionId || 'default';
    const queue = this.getSessionQueue(
      effectiveSessionId,
      metadata.sessionOptions,
    );
    const taskId = await queue.enqueue(task);

    // Return a promise that resolves when task completes
    return new Promise((resolve, reject) => {
      const onComplete = (data) => {
        if (data.taskId === taskId) {
          cleanup();
          resolve(data.result);
        }
      };

      const onFailed = (data) => {
        if (data.taskId === taskId) {
          cleanup();
          reject(new Error(data.error));
        }
      };

      const cleanup = () => {
        this.off('session:task:completed', onComplete);
        this.off('session:task:failed', onFailed);
      };

      this.on('session:task:completed', onComplete);
      this.on('session:task:failed', onFailed);
    });
  }

  /**
   * Execute in a parallel lane (convenience method)
   */
  async executeParallel(laneId, handler, params, options = {}) {
    const lane = this.getParallelLane(laneId, options);
    return await lane.execute({ handler, params, metadata: options });
  }

  /**
   * Execute in a session queue (convenience method)
   */
  async executeSerial(sessionId, handler, params, options = {}) {
    return await this.route({
      sessionId,
      handler,
      params,
      metadata: { sessionOptions: options },
    });
  }

  /**
   * Get status of all sessions and lanes
   */
  getStatus() {
    return {
      sessions: Array.from(this.sessions.values()).map((s) => s.getStatus()),
      parallelLanes: Array.from(this.parallelLanes.values()).map((l) =>
        l.getStatus(),
      ),
    };
  }

  /**
   * Get status of a specific session
   */
  getSessionStatus(sessionId) {
    const queue = this.sessions.get(sessionId);
    return queue ? queue.getStatus() : null;
  }

  /**
   * Get status of a specific lane
   */
  getLaneStatus(laneId) {
    const lane = this.parallelLanes.get(laneId);
    return lane ? lane.getStatus() : null;
  }

  /**
   * Clear a session queue
   */
  clearSession(sessionId) {
    const queue = this.sessions.get(sessionId);
    if (queue) {
      return queue.clear();
    }
    return 0;
  }

  /**
   * Remove a session queue
   */
  removeSession(sessionId) {
    const queue = this.sessions.get(sessionId);
    if (queue) {
      queue.clear();
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Remove a parallel lane
   */
  removeLane(laneId) {
    const lane = this.parallelLanes.get(laneId);
    if (lane) {
      // Wait for running tasks to complete
      if (lane.running.size > 0) {
        return false;
      }
      this.parallelLanes.delete(laneId);
      return true;
    }
    return false;
  }
}

// Factory function
export function createLaneRouter(options = {}) {
  return new LaneQueueRouter(options);
}

// Default export
export default LaneQueueRouter;
