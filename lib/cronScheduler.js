// Cron Scheduler - Schedule and manage periodic tasks
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, saveConfig, getConfig } from './configManager.js';
import { spawn } from 'child_process';

const CRON_FILE = path.join(os.homedir(), '.static-rebel', 'config', 'cron.json');

let cronInterval = null;

// Parse cron expression (simplified 5-field format)
export function parseCron(expr) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('Invalid cron expression (expected 5 fields)');
  }

  return {
    minute: fields[0],
    hour: fields[1],
    dayOfMonth: fields[2],
    month: fields[3],
    dayOfWeek: fields[4]
  };
}

// Check if cron matches current time
export function cronMatches(cron, date = new Date()) {
  const now = {
    minute: date.getMinutes(),
    hour: date.getHours(),
    dayOfMonth: date.getDate(),
    month: date.getMonth() + 1,
    dayOfWeek: date.getDay()
  };

  return (
    matchesField(cron.minute, now.minute, 0, 59) &&
    matchesField(cron.hour, now.hour, 0, 23) &&
    matchesField(cron.dayOfMonth, now.dayOfMonth, 1, 31) &&
    matchesField(cron.month, now.month, 1, 12) &&
    matchesField(cron.dayOfWeek, now.dayOfWeek, 0, 6)
  );
}

function matchesField(field, value, min, max) {
  if (field === '*') return true;
  if (field.includes(',')) {
    return field.split(',').some(v => matchesField(v.trim(), value, min, max));
  }
  if (field.includes('/')) {
    const [base, interval] = field.split('/');
    const baseVal = base === '*' ? min : parseInt(base);
    return value >= baseVal && (value - baseVal) % parseInt(interval) === 0;
  }
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }
  return parseInt(field) === value;
}

// Format cron for display
export function formatCron(expr) {
  const parts = expr.trim().split(/\s+/);
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4]
  };
}

// Human-readable cron format
export function describeCron(expr) {
  const f = formatCron(expr);

  const descriptions = [];

  if (f.dayOfWeek !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (f.dayOfWeek.includes(',')) {
      const dayList = f.dayOfWeek.split(',').map(d => days[parseInt(d.trim())] || d);
      descriptions.push(`${dayList.join(', ')}`);
    } else if (!isNaN(parseInt(f.dayOfWeek))) {
      descriptions.push(days[parseInt(f.dayOfWeek)] || f.dayOfWeek);
    }
  }

  if (f.hour !== '*') {
    descriptions.push(`${f.hour}:00`);
  } else {
    descriptions.push('hourly');
  }

  return descriptions.join(' ') || 'every minute';
}

// Load cron jobs
export function loadCronJobs() {
  try {
    if (fs.existsSync(CRON_FILE)) {
      const data = JSON.parse(fs.readFileSync(CRON_FILE, 'utf-8'));
      return data.jobs || [];
    }
  } catch (e) {
    console.error('Failed to load cron jobs:', e.message);
  }
  return [];
}

// Save cron jobs
export function saveCronJobs(jobs) {
  try {
    const config = { version: 1, jobs };
    fs.writeFileSync(CRON_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to save cron jobs:', e.message);
    return false;
  }
}

// Add a cron job
export function addCronJob(job) {
  const jobs = loadCronJobs();
  const newJob = {
    id: generateId(),
    enabled: true,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...job
  };

  // Parse and validate cron expression
  parseCron(job.schedule.expr);

  jobs.push(newJob);
  saveCronJobs(jobs);
  return newJob;
}

// Update a cron job
export function updateCronJob(id, updates) {
  const jobs = loadCronJobs();
  const index = jobs.findIndex(j => j.id === id);

  if (index === -1) return null;

  jobs[index] = {
    ...jobs[index],
    ...updates,
    updatedAtMs: Date.now()
  };

  saveCronJobs(jobs);
  return jobs[index];
}

// Delete a cron job
export function deleteCronJob(id) {
  const jobs = loadCronJobs();
  const filtered = jobs.filter(j => j.id !== id);
  if (filtered.length === jobs.length) return false;
  saveCronJobs(filtered);
  return true;
}

// Get cron job by ID
export function getCronJob(id) {
  const jobs = loadCronJobs();
  return jobs.find(j => j.id === id) || null;
}

// List all cron jobs
export function listCronJobs() {
  return loadCronJobs();
}

// Enable/disable a cron job
export function toggleCronJob(id, enabled) {
  return updateCronJob(id, { enabled });
}

// Check which jobs are due
export function getDueJobs(date = new Date()) {
  const jobs = loadCronJobs();
  return jobs.filter(job => {
    if (!job.enabled) return false;

    try {
      const cron = parseCron(job.schedule.expr);
      return cronMatches(cron, date);
    } catch (e) {
      return false;
    }
  });
}

// Start the cron scheduler
export function startScheduler(callback) {
  if (cronInterval) {
    clearInterval(cronInterval);
  }

  // Check every minute
  cronInterval = setInterval(() => {
    const dueJobs = getDueJobs();

    for (const job of dueJobs) {
      // Check if already ran this minute (simple debounce)
      const lastRun = job.state?.lastRunAtMs || 0;
      if (Date.now() - lastRun < 60000) continue;

      // Update last run time
      updateCronJob(job.id, {
        state: {
          ...job.state,
          lastRunAtMs: Date.now(),
          lastStatus: 'pending'
        }
      });

      // Execute callback
      callback(job);
    }
  }, 60000);

  return cronInterval;
}

// Stop the scheduler
export function stopScheduler() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}

// Generate unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

// Format next run time
export function getNextRunTime(job) {
  try {
    const cron = parseCron(job.schedule.expr);
    const now = new Date();

    // Look ahead up to 7 days
    for (let i = 0; i < 7 * 24 * 60; i++) {
      const checkTime = new Date(now.getTime() + i * 60000);
      if (cronMatches(cron, checkTime)) {
        return checkTime;
      }
    }
  } catch (e) {}
  return null;
}

// Get scheduler status
export function getSchedulerStatus() {
  return {
    running: cronInterval !== null,
    jobsCount: loadCronJobs().length,
    enabledCount: loadCronJobs().filter(j => j.enabled).length,
    nextCheck: new Date(Date.now() + 60000)
  };
}
