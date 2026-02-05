/**
 * Task Queue - Background Job Processing System
 *
 * Features:
 * - Persistent job storage (SQLite)
 * - Worker pool for parallel execution
 * - Scheduled jobs (cron-style)
 * - Retry logic with backoff
 * - Priority queues
 * - Job dependencies
 * - Progress tracking
 */

import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import { Worker } from 'worker_threads';
import Database from 'better-sqlite3';

const TASK_QUEUE_VERSION = '1.0.0';

const DEFAULT_OPTIONS = {
  maxWorkers: os.cpus().length,
  jobTimeout: 300000,
  maxRetries: 3,
  retryDelay: 5000,
  persistencePath: path.join(os.homedir(), '.static-rebel', 'task-queue.db'),
  pollInterval: 1000,
  priorityLevels: ['critical', 'high', 'normal', 'low'],
};

export class TaskQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.db = null;
    this.workers = new Map();
    this.runningJobs = new Map();
    this.scheduledJobs = new Map();
    this.isRunning = false;
    this.pollTimer = null;
    this.workerPool = [];

    this.on('job:complete', this.handleJobComplete.bind(this));
    this.on('job:failed', this.handleJobFailed.bind(this));
  }

  async initialize() {
    this.db = new Database(this.options.persistencePath);
    this.db.pragma('journal_mode = WAL');

    this.createTables();
    this.initializeWorkerPool();

    await this.recoverRunningJobs();
    await this.recoverScheduledJobs();

    this.isRunning = true;
    this.startPolling();

    this.emit('initialized', { version: TASK_QUEUE_VERSION });
  }

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT,
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'pending',
        scheduled_at REAL,
        started_at REAL,
        completed_at REAL,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        error TEXT,
        result TEXT,
        progress INTEGER DEFAULT 0,
        metadata TEXT,
        created_at REAL DEFAULT (strftime('%s', 'now')),
        updated_at REAL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS job_dependencies (
        job_id TEXT,
        depends_on TEXT,
        PRIMARY KEY (job_id, depends_on),
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on) REFERENCES jobs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id TEXT PRIMARY KEY,
        name TEXT,
        cron_expression TEXT,
        job_type TEXT NOT NULL,
        payload TEXT,
        enabled INTEGER DEFAULT 1,
        last_run REAL,
        next_run REAL,
        created_at REAL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority, created_at);
      CREATE INDEX IF NOT EXISTS idx_scheduled_next ON scheduled_jobs(next_run);
    `);
  }

  initializeWorkerPool() {
    const numWorkers = Math.min(this.options.maxWorkers, os.cpus().length);

    for (let i = 0; i < numWorkers; i++) {
      const worker = {
        id: i,
        status: 'idle',
        currentJob: null,
        thread: null,
      };
      this.workerPool.push(worker);
    }
  }

  async recoverRunningJobs() {
    const running = this.db.prepare(
      'SELECT * FROM jobs WHERE status = ?'
    ).all('running');

    for (const job of running) {
      this.emit('job:recovered', { job });
    }
  }

  async recoverScheduledJobs() {
    const scheduled = this.db.prepare(
      'SELECT * FROM scheduled_jobs WHERE enabled = 1'
    ).all();

    for (const job of scheduled) {
      this.scheduledJobs.set(job.id, job);
    }
  }

  startPolling() {
    const poll = async () => {
      if (!this.isRunning) return;

      try {
        await this.dispatchJobs();
        await this.checkScheduledJobs();
      } catch (error) {
        this.emit('error', { error: error.message });
      }

      this.pollTimer = setTimeout(poll, this.options.pollInterval);
    };

    poll();
  }

  async dispatchJobs() {
    const idleWorkers = this.workerPool.filter(w => w.status === 'idle');
    if (idleWorkers.length === 0) return;

    const stmt = this.db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'pending'
        AND (scheduled_at IS NULL OR scheduled_at <= ?)
        AND id NOT IN (
          SELECT job_id FROM job_dependencies
          WHERE depends_on IN (
            SELECT id FROM jobs WHERE status NOT IN ('completed', 'failed')
          )
        )
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END,
        created_at ASC
      LIMIT ?
    `);

    const jobs = stmt.all(Date.now(), idleWorkers.length);

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const worker = idleWorkers[i];

      await this.runJobOnWorker(job, worker);
    }
  }

  async runJobOnWorker(job, worker) {
    const jobData = { ...job, payload: JSON.parse(job.payload || '{}') };

    this.db.prepare(`
      UPDATE jobs SET status = 'running', started_at = ?, updated_at = ?
      WHERE id = ?
    `).run(Date.now(), Date.now(), job.id);

    worker.status = 'busy';
    worker.currentJob = job.id;

    this.runningJobs.set(job.id, { worker, startedAt: Date.now() });

    this.emit('job:started', { jobId: job.id, workerId: worker.id });

    const workerScript = `
      const { parentPort, workerData } = require('worker_threads');
      const path = require('path');

      async function run() {
        try {
          const jobTypes = require(path.join(__dirname, 'job-types.js'));
          const handler = jobTypes[jobData.type];

          if (!handler) {
            throw new Error('Unknown job type: ' + jobData.type);
          }

          const result = await handler(jobData.payload, {
            updateProgress: (progress) => {
              parentPort.postMessage({ type: 'progress', progress });
            },
            log: (message) => {
              parentPort.postMessage({ type: 'log', message });
            },
          });

          parentPort.postMessage({ type: 'complete', result });
        } catch (error) {
          parentPort.postMessage({ type: 'error', error: error.message });
        }
      }

      run();
    `;

    const workerPath = path.join(__dirname, 'worker-wrapper.js');
    await require('fs').promises.writeFile(workerPath, workerScript);

    const workerThread = new Worker(workerPath, {
      workerData: { job: jobData },
    });

    worker.thread = workerThread;

    workerThread.on('message', (message) => {
      if (message.type === 'progress') {
        this.updateJobProgress(job.id, message.progress);
      } else if (message.type === 'log') {
        this.emit('job:log', { jobId: job.id, message: message.message });
      }
    });

    workerThread.on('error', (error) => {
      this.handleJobError(job.id, error.message);
    });

    workerThread.on('exit', (code) => {
      if (code !== 0) {
        this.handleJobError(job.id, `Worker exited with code ${code}`);
      }
    });
  }

  async handleJobComplete({ jobId }) {
    const jobData = this.runningJobs.get(jobId);
    if (!jobData) return;

    const worker = this.workerPool.find(w => w.currentJob === jobId);
    if (worker) {
      worker.status = 'idle';
      worker.currentJob = null;
      worker.thread = null;
    }

    this.runningJobs.delete(jobId);

    this.db.prepare(`
      UPDATE jobs SET status = 'completed', completed_at = ?, updated_at = ?, result = ?
      WHERE id = ?
    `).run(Date.now(), Date.now(), JSON.stringify({}), jobId);

    this.emit('job:completed', { jobId });

    await this.checkDependencies(jobId);
  }

  async handleJobFailed({ jobId, error }) {
    const jobData = this.runningJobs.get(jobId);
    if (!jobData) return;

    const job = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    const retryCount = (job?.retry_count || 0) + 1;

    const worker = this.workerPool.find(w => w.currentJob === jobId);
    if (worker) {
      worker.status = 'idle';
      worker.currentJob = null;
      worker.thread = null;
    }

    this.runningJobs.delete(jobId);

    if (retryCount <= this.options.maxRetries) {
      const delay = this.options.retryDelay * Math.pow(2, retryCount - 1);

      this.db.prepare(`
        UPDATE jobs SET status = 'pending', retry_count = ?, error = ?, scheduled_at = ?, updated_at = ?
        WHERE id = ?
      `).run(retryCount, error, Date.now() + delay, Date.now(), jobId);

      this.emit('job:retry_scheduled', { jobId, retryCount, delay });
    } else {
      this.db.prepare(`
        UPDATE jobs SET status = 'failed', error = ?, updated_at = ?
        WHERE id = ?
      `).run(error, Date.now(), jobId);

      this.emit('job:failed', { jobId, error, retriesExceeded: true });
    }
  }

  async checkScheduledJobs() {
    const now = Date.now();

    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_jobs
      WHERE enabled = 1 AND next_run <= ?
      ORDER BY next_run ASC
      LIMIT 10
    `);

    const dueJobs = stmt.all(now);

    for (const scheduled of dueJobs) {
      const jobId = await this.enqueue(scheduled.job_type, JSON.parse(scheduled.payload || '{}'), {
        priority: 'normal',
        scheduledBy: scheduled.id,
      });

      this.db.prepare(`
        UPDATE scheduled_jobs SET last_run = ?, next_run = ?, updated_at = ?
        WHERE id = ?
      `).run(now, this.calculateNextRun(scheduled.cron_expression), Date.now(), scheduled.id);

      this.emit('scheduled_job:triggered', { scheduledJobId: scheduled.id, jobId });
    }
  }

  calculateNextRun(cronExpression) {
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) {
      return Date.now() + 3600000;
    }

    const [min, hour, day, month, dow] = parts;
    const now = new Date();
    let next = new Date(now);

    next.setMinutes(next.getMinutes() + 1);
    next.setSeconds(0);
    next.setMilliseconds(0);

    if (min !== '*' && parseInt(min) !== next.getMinutes()) {
      next.setMinutes(parseInt(min));
    }

    return next.getTime();
  }

  async enqueue(jobType, payload, options = {}) {
    const id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const priority = options.priority || 'normal';
    const scheduledAt = options.scheduledAt || (options.delay ? Date.now() + options.delay : null);

    this.db.prepare(`
      INSERT INTO jobs (id, type, payload, priority, status, scheduled_at, max_retries, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      jobType,
      JSON.stringify(payload),
      priority,
      scheduledAt ? 'pending' : 'ready',
      scheduledAt,
      options.maxRetries || this.options.maxRetries,
      JSON.stringify(options.metadata || {})
    );

    if (options.dependencies && options.dependencies.length > 0) {
      const depStmt = this.db.prepare(`
        INSERT INTO job_dependencies (job_id, depends_on) VALUES (?, ?)
      `);

      for (const depId of options.dependencies) {
        depStmt.run(id, depId);
      }
    }

    this.emit('job:enqueued', { jobId: id, jobType, priority, scheduledAt });

    return id;
  }

  async cancelJob(jobId) {
    const job = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status === 'running') {
      const runningData = this.runningJobs.get(jobId);
      if (runningData?.worker?.thread) {
        runningData.worker.thread.terminate();
      }
    }

    this.db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
    this.db.prepare('DELETE FROM job_dependencies WHERE job_id = ?').run(jobId);

    this.emit('job:cancelled', { jobId });
  }

  async retryJob(jobId) {
    const job = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);

    if (!job || job.status !== 'failed') {
      throw new Error('Can only retry failed jobs');
    }

    this.db.prepare(`
      UPDATE jobs SET status = 'ready', retry_count = 0, error = NULL, updated_at = ?
      WHERE id = ?
    `).run(Date.now(), jobId);

    this.emit('job:retry_enqueued', { jobId, originalJob: job });
  }

  updateJobProgress(jobId, progress) {
    this.db.prepare(`
      UPDATE jobs SET progress = ?, updated_at = ?
      WHERE id = ?
    `).run(progress, Date.now(), jobId);

    this.emit('job:progress', { jobId, progress });
  }

  async checkDependencies(jobId) {
    const dependents = this.db.prepare(`
      SELECT j.* FROM jobs j
      JOIN job_dependencies d ON j.id = d.job_id
      WHERE d.depends_on = ? AND j.status = 'pending'
    `).all(jobId);

    for (const dependent of dependents) {
      const otherDeps = this.db.prepare(`
        SELECT * FROM job_dependencies
        WHERE job_id = ?
      `).all(dependent.id);

      const allDone = otherDeps.every(dep => {
        const depJob = this.db.prepare('SELECT status FROM jobs WHERE id = ?').get(dep.depends_on);
        return depJob?.status === 'completed';
      });

      if (allDone) {
        this.db.prepare(`
          UPDATE jobs SET status = 'ready', updated_at = ?
          WHERE id = ?
        `).run(Date.now(), dependent.id);

        this.emit('job:dependencies_met', { jobId: dependent.id });
      }
    }
  }

  getJob(jobId) {
    return this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  }

  getJobs(filters = {}) {
    let query = 'SELECT * FROM jobs WHERE 1=1';
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.priority) {
      query += ' AND priority = ?';
      params.push(filters.priority);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.db.prepare(query).all(...params);
  }

  getStats() {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
    const pending = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'").get().count;
    const ready = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'ready'").get().count;
    const running = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'running'").get().count;
    const completed = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'completed'").get().count;
    const failed = this.db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'failed'").get().count;

    const idleWorkers = this.workerPool.filter(w => w.status === 'idle').length;
    const busyWorkers = this.workerPool.filter(w => w.status === 'busy').length;

    return {
      version: TASK_QUEUE_VERSION,
      jobs: { total, pending, ready, running, completed, failed },
      workers: { total: this.workerPool.length, idle: idleWorkers, busy: busyWorkers },
      scheduledJobs: this.scheduledJobs.size,
      isRunning: this.isRunning,
    };
  }

  async shutdown() {
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }

    for (const worker of this.workerPool) {
      if (worker.thread) {
        await worker.thread.terminate();
      }
    }

    this.db.close();

    this.emit('shutdown');
  }
}

export function createTaskQueue(options = {}) {
  return new TaskQueue(options);
}

export default TaskQueue;
