/**
 * Task Scheduler - Cron-style scheduling for Task Queue
 *
 * Features:
 * - Cron expression parsing
 * - Schedule jobs to run at specific times
 * - Recurring schedules
 * - Schedule management
 */

import { EventEmitter } from 'events';
import { createTaskQueue } from './index.js';

const CRON_PARTS = ['min', 'hour', 'day', 'month', 'dow'];

const PRESETS = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
  '@every_minute': '* * * * *',
};

export class TaskScheduler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.taskQueue = options.taskQueue || createTaskQueue();
    this.schedules = new Map();
    this.running = false;
    this.checkTimer = null;
    this.checkInterval = options.checkInterval || 60000;
  }

  start() {
    if (this.running) return;

    this.running = true;
    this.loadSchedules();
    this.startChecker();

    this.emit('started');
  }

  stop() {
    this.running = false;

    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }

    this.emit('stopped');
  }

  loadSchedules() {
    const db = this.taskQueue.db;
    const schedules = db.prepare('SELECT * FROM scheduled_jobs').all();

    for (const schedule of schedules) {
      this.schedules.set(schedule.id, {
        ...schedule,
        payload: JSON.parse(schedule.payload || '{}'),
        nextRun: this.calculateNextRun(schedule.cron_expression),
      });
    }
  }

  parseExpression(expression) {
    let expr = expression.trim();

    if (PRESETS[expr]) {
      expr = PRESETS[expr];
    }

    const parts = expr.split(/\s+/);

    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${expression}`);
    }

    const parsed = {};

    for (let i = 0; i < 5; i++) {
      const part = parts[i];
      const values = new Set();

      if (part === '*') {
        parsed[CRON_PARTS[i]] = null;
        continue;
      }

      const ranges = part.split(',');
      for (const range of ranges) {
        if (range.includes('/')) {
          const [start, step] = range.split('/');
          const s = parseInt(start);
          const stepVal = parseInt(step);
          const max = this.getMaxForField(CRON_PARTS[i]);
          for (let v = s; v <= max; v += stepVal) {
            values.add(v);
          }
        } else if (range.includes('-')) {
          const [start, end] = range.split('-').map(Number);
          for (let v = start; v <= end; v++) {
            values.add(v);
          }
        } else {
          values.add(parseInt(range));
        }
      }

      parsed[CRON_PARTS[i]] = Array.from(values);
    }

    return parsed;
  }

  getMaxForField(field) {
    const limits = {
      min: 59,
      hour: 23,
      day: 31,
      month: 12,
      dow: 6,
    };
    return limits[field];
  }

  calculateNextRun(cronExpression) {
    const parsed = this.parseExpression(cronExpression);
    const now = new Date();

    let next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);

    for (let i = 0; i < 366; i++) {
      const year = next.getFullYear();
      const month = next.getMonth();
      const day = next.getDate();
      const hour = next.getHours();
      const min = next.getMinutes();
      const dow = next.getDay();

      if (!this.matches(parsed, { year, month: month + 1, day, hour, min, dow })) {
        next.setMinutes(next.getMinutes() + 1);
        continue;
      }

      if (next.getTime() > now.getTime()) {
        return next.getTime();
      }

      next.setMinutes(next.getMinutes() + 1);
    }

    return now.getTime() + 3600000;
  }

  matches(parsed, time) {
    const timeMap = {
      min: time.min,
      hour: time.hour,
      day: time.day,
      month: time.month,
      dow: time.dow,
    };

    for (const field of CRON_PARTS) {
      if (parsed[field] === null) continue;

      if (!parsed[field].includes(timeMap[field])) {
        return false;
      }
    }

    return true;
  }

  startChecker() {
    const check = () => {
      if (!this.running) return;

      const now = Date.now();

      for (const [id, schedule] of this.schedules) {
        if (schedule.nextRun && now >= schedule.nextRun) {
          this.triggerSchedule(id);
        }
      }

      this.checkTimer = setTimeout(check, this.checkInterval);
    };

    check();
  }

  async triggerSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || !schedule.enabled) return;

    const jobId = await this.taskQueue.enqueue(schedule.job_type, schedule.payload, {
      priority: 'normal',
      metadata: {
        scheduledJobId: schedule.id,
        scheduledJobName: schedule.name,
      },
    });

    schedule.lastRun = Date.now();
    schedule.nextRun = this.calculateNextRun(schedule.cron_expression);

    this.taskQueue.db.prepare(`
      UPDATE scheduled_jobs SET last_run = ?, next_run = ?, updated_at = ?
      WHERE id = ?
    `).run(schedule.lastRun, schedule.nextRun, Date.now(), scheduleId);

    this.emit('triggered', {
      scheduleId,
      scheduleName: schedule.name,
      jobId,
      nextRun: schedule.nextRun,
    });
  }

  async create(options) {
    const id = `schedule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const nextRun = this.calculateNextRun(options.cron);

    this.taskQueue.db.prepare(`
      INSERT INTO scheduled_jobs (id, name, cron_expression, job_type, payload, enabled, next_run)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      options.name,
      options.cron,
      options.jobType,
      JSON.stringify(options.payload || {}),
      options.enabled !== false ? 1 : 0,
      nextRun
    );

    this.schedules.set(id, {
      id,
      name: options.name,
      cron_expression: options.cron,
      job_type: options.jobType,
      payload: options.payload || {},
      enabled: options.enabled !== false,
      nextRun,
    });

    this.emit('created', { id, name: options.name, nextRun });

    return id;
  }

  async update(scheduleId, updates) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
      schedule.name = updates.name;
    }

    if (updates.cron !== undefined) {
      fields.push('cron_expression = ?');
      values.push(updates.cron);
      schedule.cron_expression = updates.cron;
      schedule.nextRun = this.calculateNextRun(updates.cron);
      fields.push('next_run = ?');
      values.push(schedule.nextRun);
    }

    if (updates.payload !== undefined) {
      fields.push('payload = ?');
      values.push(JSON.stringify(updates.payload));
      schedule.payload = updates.payload;
    }

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
      schedule.enabled = updates.enabled;
    }

    if (fields.length === 0) return;

    values.push(scheduleId);

    this.taskQueue.db.prepare(`
      UPDATE scheduled_jobs SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);

    this.emit('updated', { scheduleId, changes: updates });
  }

  async delete(scheduleId) {
    this.taskQueue.db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(scheduleId);
    this.schedules.delete(scheduleId);

    this.emit('deleted', { scheduleId });
  }

  async enable(scheduleId) {
    await this.update(scheduleId, { enabled: true });
  }

  async disable(scheduleId) {
    await this.update(scheduleId, { enabled: false });
  }

  get(scheduleId) {
    return this.schedules.get(scheduleId);
  }

  getAll() {
    return Array.from(this.schedules.values());
  }

  getDue() {
    const now = Date.now();
    return Array.from(this.schedules.values()).filter(
      s => s.enabled && s.nextRun && s.nextRun <= now
    );
  }

  getUpcoming(limit = 10) {
    return Array.from(this.schedules.values())
      .sort((a, b) => (a.nextRun || Infinity) - (b.nextRun || Infinity))
      .slice(0, limit);
  }

  getStats() {
    const enabled = Array.from(this.schedules.values()).filter(s => s.enabled).length;
    const disabled = this.schedules.size - enabled;
    const due = this.getDue().length;

    return {
      total: this.schedules.size,
      enabled,
      disabled,
      due,
    };
  }
}

export function createTaskScheduler(options = {}) {
  return new TaskScheduler(options);
}

export default TaskScheduler;
