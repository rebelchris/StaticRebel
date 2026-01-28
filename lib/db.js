// Simple SQLite Database Wrapper for Charlize
// No external deps - uses better-sqlite3 if available, otherwise falls back to JSON

import fs from 'fs';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(os.homedir(), '.ollama-assistant', 'data.db');

let db = null;

// Try to use better-sqlite3, fallback to simple JSON storage
let useSQLite = false;
try {
  const SQLite = await import('better-sqlite3');
  if (SQLite && SQLite.default) {
    useSQLite = true;
    const Database = SQLite.default;
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Initialize tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        type TEXT,
        content TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        payload TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        next_run DATETIME,
        last_run DATETIME
      );

      CREATE TABLE IF NOT EXISTS subagents (
        id TEXT PRIMARY KEY,
        task_type TEXT,
        model TEXT,
        messages TEXT,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME
      );

      CREATE TABLE IF NOT EXISTS user_profile (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_memory_date ON memory(date);
      CREATE INDEX IF NOT EXISTS idx_cron_next ON cron_jobs(next_run) WHERE enabled=1;
    `);

    console.log(`[DB] SQLite initialized at ${DB_PATH}`);
  }
} catch (e) {
  console.log('[DB] SQLite not available, using JSON storage');
}

// JSON fallback
const JSON_DIR = path.join(os.homedir(), '.ollama-assistant', 'data');
const ensureDir = () => {
  if (!fs.existsSync(JSON_DIR)) fs.mkdirSync(JSON_DIR, { recursive: true });
};
ensureDir();

function getJSON(path) {
  try {
    if (fs.existsSync(path)) {
      return JSON.parse(fs.readFileSync(path, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

function setJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// ============================================================================
// Memory Functions
// ============================================================================

export function addMemory(date, type, content, metadata = {}) {
  if (useSQLite && db) {
    const stmt = db.prepare('INSERT INTO memory (date, type, content, metadata) VALUES (?, ?, ?, ?)');
    stmt.run(date, type, content, JSON.stringify(metadata));
    return db.prepare('SELECT last_insert_rowid() as id').get();
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, `memory_${date}.json`);
    const memories = getJSON(file) || [];
    const entry = { id: Date.now(), type, content, metadata, created_at: new Date().toISOString() };
    memories.push(entry);
    setJSON(file, memories);
    return entry;
  }
}

export function getMemoryByDate(date) {
  if (useSQLite && db) {
    return db.prepare('SELECT * FROM memory WHERE date = ? ORDER BY created_at').all(date);
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, `memory_${date}.json`);
    return getJSON(file) || [];
  }
}

export function getRecentMemories(days = 7) {
  if (useSQLite && db) {
    const stmt = db.prepare(`
      SELECT * FROM memory
      WHERE date >= date('now', '-' || ? || ' days')
      ORDER BY date, created_at
    `);
    return stmt.all(days);
  } else {
    const memories = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      memories.push(...getMemoryByDate(dateStr).map(m => ({ ...m, date: dateStr })));
    }
    return memories;
  }
}

export function searchMemory(query) {
  if (useSQLite && db) {
    return db.prepare(`
      SELECT * FROM memory
      WHERE content LIKE ? OR type LIKE ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(`%${query}%`, `%${query}%`);
  } else {
    const all = getRecentMemories(30);
    return all.filter(m =>
      m.content?.toLowerCase().includes(query.toLowerCase()) ||
      m.type?.toLowerCase().includes(query.toLowerCase())
    );
  }
}

export function curateMemory() {
  // AI-curated memory would go here
  // For now, just return recent memories that might be worth saving
  const recent = getRecentMemories(7);
  const important = recent.filter(m =>
    m.type === 'preference' ||
    m.type === 'decision' ||
    m.type === 'important'
  );
  return important;
}

// ============================================================================
// Cron Job Functions
// ============================================================================

export function addCronJob(id, name, schedule, payload) {
  if (useSQLite && db) {
    db.prepare(`
      INSERT INTO cron_jobs (id, name, schedule, payload, enabled)
      VALUES (?, ?, ?, ?, 1)
    `).run(id, name, schedule, JSON.stringify(payload));

    // Calculate next run
    const nextRun = calculateNextRun(schedule);
    db.prepare('UPDATE cron_jobs SET next_run = ? WHERE id = ?').run(nextRun, id);

    return { id, name, schedule, next_run: nextRun };
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'cron.json');
    const jobs = getJSON(file) || [];
    const nextRun = calculateNextRun(schedule);
    const job = { id, name, schedule, payload, enabled: true, next_run: nextRun };
    jobs.push(job);
    setJSON(file, jobs);
    return job;
  }
}

export function getCronJobs() {
  if (useSQLite && db) {
    return db.prepare('SELECT * FROM cron_jobs ORDER BY created_at').all();
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'cron.json');
    return getJSON(file) || [];
  }
}

export function deleteCronJob(id) {
  if (useSQLite && db) {
    const result = db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(id);
    return result.changes > 0;
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'cron.json');
    const jobs = getJSON(file) || [];
    const filtered = jobs.filter(j => j.id !== id);
    setJSON(file, filtered);
    return filtered.length !== jobs.length;
  }
}

export function updateCronJob(id, updates) {
  if (useSQLite && db) {
    const fields = [];
    const values = [];

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.next_run) {
      fields.push('next_run = ?');
      values.push(updates.next_run);
    }
    if (updates.last_run) {
      fields.push('last_run = ?');
      values.push(updates.last_run);
    }

    if (fields.length === 0) return null;

    values.push(id);
    db.prepare(`UPDATE cron_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getCronJob(id);
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'cron.json');
    const jobs = getJSON(file) || [];
    const idx = jobs.findIndex(j => j.id === id);
    if (idx === -1) return null;

    jobs[idx] = { ...jobs[idx], ...updates };
    setJSON(file, jobs);
    return jobs[idx];
  }
}

export function getCronJob(id) {
  if (useSQLite && db) {
    return db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id);
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'cron.json');
    const jobs = getJSON(file) || [];
    return jobs.find(j => j.id === id) || null;
  }
}

export function getDueJobs() {
  if (useSQLite && db) {
    return db.prepare(`
      SELECT * FROM cron_jobs
      WHERE enabled = 1 AND next_run <= datetime('now')
    `).all();
  } else {
    const jobs = getCronJobs();
    const now = new Date();
    return jobs.filter(j => j.enabled && j.next_run && new Date(j.next_run) <= now);
  }
}

// ============================================================================
// Subagent Functions
// ============================================================================

export function createSubagent(id, taskType, model) {
  if (useSQLite && db) {
    db.prepare(`
      INSERT INTO subagents (id, task_type, model, status, last_activity)
      VALUES (?, ?, ?, 'active', datetime('now'))
    `).run(id, taskType, model);
    return { id, task_type: taskType, model, status: 'active' };
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'subagents.json');
    const subs = getJSON(file) || [];
    const sub = { id, task_type: taskType, model, status: 'active', messages: [], last_activity: new Date().toISOString() };
    subs.push(sub);
    setJSON(file, subs);
    return sub;
  }
}

export function updateSubagent(id, updates) {
  if (useSQLite && db) {
    const fields = [];
    const values = [];

    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.messages) {
      fields.push('messages = ?');
      values.push(JSON.stringify(updates.messages));
    }

    fields.push('last_activity = datetime("now")');

    if (fields.length === 0) return null;

    values.push(id);
    db.prepare(`UPDATE subagents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getSubagent(id);
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'subagents.json');
    const subs = getJSON(file) || [];
    const idx = subs.findIndex(s => s.id === id);
    if (idx === -1) return null;

    subs[idx] = { ...subs[idx], ...updates, last_activity: new Date().toISOString() };
    setJSON(file, subs);
    return subs[idx];
  }
}

export function getSubagent(id) {
  if (useSQLite && db) {
    return db.prepare('SELECT * FROM subagents WHERE id = ?').get(id);
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'subagents.json');
    const subs = getJSON(file) || [];
    return subs.find(s => s.id === id) || null;
  }
}

export function getActiveSubagents() {
  if (useSQLite && db) {
    return db.prepare("SELECT * FROM subagents WHERE status = 'active'").all();
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'subagents.json');
    const subs = getJSON(file) || [];
    return subs.filter(s => s.status === 'active');
  }
}

// ============================================================================
// User Profile Functions
// ============================================================================

export function setProfile(key, value) {
  if (useSQLite && db) {
    db.prepare(`
      INSERT OR REPLACE INTO user_profile (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `).run(key, JSON.stringify(value));
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'profile.json');
    const profile = getJSON(file) || {};
    profile[key] = value;
    setJSON(file, profile);
  }
}

export function getProfile(key) {
  if (useSQLite && db) {
    const result = db.prepare('SELECT value FROM user_profile WHERE key = ?').get(key);
    return result ? JSON.parse(result.value) : null;
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'profile.json');
    const profile = getJSON(file) || {};
    return profile[key];
  }
}

export function getAllProfile() {
  if (useSQLite && db) {
    const results = db.prepare('SELECT * FROM user_profile').all();
    const profile = {};
    for (const r of results) {
      profile[r.key] = JSON.parse(r.value);
    }
    return profile;
  } else {
    ensureDir();
    const file = path.join(JSON_DIR, 'profile.json');
    return getJSON(file) || {};
  }
}

// ============================================================================
// Utility
// ============================================================================

function calculateNextRun(schedule) {
  // Simplified cron parser
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return new Date(Date.now() + 3600000).toISOString();

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const now = new Date();
  let next = new Date(now);

  // Parse minute
  if (minute !== '*') {
    next.setMinutes(parseInt(minute));
  } else {
    next.setMinutes(0);
  }

  // Parse hour
  if (hour !== '*') {
    next.setHours(parseInt(hour));
  } else {
    next.setHours(next.getHours() + 1);
  }

  // Reset seconds/ms
  next.setSeconds(0);
  next.setMilliseconds(0);

  // If in past, add a day
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

export function getStats() {
  const memCount = useSQLite && db
    ? db.prepare('SELECT COUNT(*) as count FROM memory').get().count
    : getRecentMemories(30).length;

  const cronCount = getCronJobs().length;
  const subagentCount = getActiveSubagents().length;

  return {
    memoryEntries: memCount,
    cronJobs: cronCount,
    activeSubagents: subagentCount,
    storageType: useSQLite ? 'SQLite' : 'JSON',
    dbPath: DB_PATH
  };
}

export function close() {
  if (useSQLite && db) {
    db.close();
  }
}
