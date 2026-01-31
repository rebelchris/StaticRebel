/**
 * JSONL Session Transcripts
 * Structured, parseable conversation history
 * 
 * Replaces markdown daily files with JSONL format (one JSON object per line)
 * Benefits:
 * - Structured, parseable conversation history
 * - Easy appending without rewriting entire files
 * - Better for programmatic analysis and context loading
 */

import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { createReadStream } from 'fs';
import readline from 'readline';

const TRANSCRIPTS_DIR = path.join(os.homedir(), '.static-rebel', 'transcripts');

/**
 * Initialize transcripts directory
 */
export function initTranscripts() {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  }
  return TRANSCRIPTS_DIR;
}

/**
 * Get transcript file path for a session
 */
export function getTranscriptPath(sessionId, date = null) {
  const d = date || new Date().toISOString().split('T')[0];
  return path.join(TRANSCRIPTS_DIR, `${sessionId}_${d}.jsonl`);
}

/**
 * Get all transcript files
 */
export function getAllTranscriptFiles() {
  try {
    if (!fs.existsSync(TRANSCRIPTS_DIR)) {
      return [];
    }
    return fs.readdirSync(TRANSCRIPTS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: path.join(TRANSCRIPTS_DIR, f),
        size: fs.statSync(path.join(TRANSCRIPTS_DIR, f)).size,
      }))
      .sort((a, b) => fs.statSync(b.path).mtime - fs.statSync(a.path).mtime);
  } catch (e) {
    return [];
  }
}

/**
 * Append a message to a transcript
 */
export async function appendToTranscript(sessionId, message) {
  const filePath = getTranscriptPath(sessionId);
  
  const entry = {
    timestamp: new Date().toISOString(),
    sessionId,
    ...message,
  };

  const line = JSON.stringify(entry) + '\n';

  try {
    await fsPromises.appendFile(filePath, line);
    return { success: true, entry };
  } catch (error) {
    console.error('Failed to append to transcript:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Append a message to a transcript (sync version)
 */
export function appendToTranscriptSync(sessionId, message) {
  const filePath = getTranscriptPath(sessionId);
  
  const entry = {
    timestamp: new Date().toISOString(),
    sessionId,
    ...message,
  };

  const line = JSON.stringify(entry) + '\n';

  try {
    fs.appendFileSync(filePath, line);
    return { success: true, entry };
  } catch (error) {
    console.error('Failed to append to transcript:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Read transcript for a session
 */
export async function readTranscript(sessionId, date = null) {
  const filePath = getTranscriptPath(sessionId, date);
  
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const entries = [];
  const fileStream = createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch (e) {
        // Skip malformed lines
      }
    }
  }

  return entries;
}

/**
 * Read transcript synchronously
 */
export function readTranscriptSync(sessionId, date = null) {
  const filePath = getTranscriptPath(sessionId, date);
  
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(entry => entry !== null);
  } catch (error) {
    console.error('Failed to read transcript:', error.message);
    return [];
  }
}

/**
 * Read recent entries from a transcript
 */
export async function readRecentTranscript(sessionId, count = 10) {
  const entries = await readTranscript(sessionId);
  return entries.slice(-count);
}

/**
 * Read transcript entries with filtering
 */
export async function readTranscriptWithFilter(sessionId, options = {}) {
  const entries = await readTranscript(sessionId, options.date);
  
  return entries.filter(entry => {
    if (options.role && entry.role !== options.role) return false;
    if (options.type && entry.type !== options.type) return false;
    if (options.since && new Date(entry.timestamp) < new Date(options.since)) return false;
    if (options.until && new Date(entry.timestamp) > new Date(options.until)) return false;
    if (options.search && !JSON.stringify(entry).toLowerCase().includes(options.search.toLowerCase())) return false;
    return true;
  });
}

/**
 * Get conversation context for LLM (formatted)
 */
export async function getContextForPrompt(sessionId, count = 10) {
  const entries = await readRecentTranscript(sessionId, count);
  
  if (entries.length === 0) {
    return '';
  }

  let context = '\n\n=== Recent Conversation ===\n';
  entries.forEach((entry, index) => {
    const role = entry.role || 'user';
    const content = entry.content || entry.message || '';
    const truncated = content.length > 200 
      ? content.substring(0, 200) + '...' 
      : content;
    context += `\n[${index + 1}] ${role}: ${truncated}`;
  });
  context += '\n\n=== End Context ===\n';

  return context;
}

/**
 * Write user message to transcript
 */
export async function logUserMessage(sessionId, content, metadata = {}) {
  return await appendToTranscript(sessionId, {
    role: 'user',
    type: 'message',
    content,
    metadata,
  });
}

/**
 * Write assistant message to transcript
 */
export async function logAssistantMessage(sessionId, content, metadata = {}) {
  return await appendToTranscript(sessionId, {
    role: 'assistant',
    type: 'message',
    content,
    metadata,
  });
}

/**
 * Log an action/event to transcript
 */
export async function logAction(sessionId, action, result, metadata = {}) {
  return await appendToTranscript(sessionId, {
    role: 'system',
    type: 'action',
    action,
    result,
    metadata,
  });
}

/**
 * Log an error to transcript
 */
export async function logError(sessionId, error, context = {}) {
  return await appendToTranscript(sessionId, {
    role: 'system',
    type: 'error',
    error: error.message || error,
    stack: error.stack,
    context,
  });
}

/**
 * Get transcript statistics
 */
export async function getTranscriptStats(sessionId) {
  const entries = await readTranscript(sessionId);
  
  const stats = {
    totalEntries: entries.length,
    byRole: {},
    byType: {},
    dateRange: {
      first: null,
      last: null,
    },
  };

  entries.forEach(entry => {
    const role = entry.role || 'unknown';
    stats.byRole[role] = (stats.byRole[role] || 0) + 1;

    const type = entry.type || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;

    if (entry.timestamp) {
      if (!stats.dateRange.first || entry.timestamp < stats.dateRange.first) {
        stats.dateRange.first = entry.timestamp;
      }
      if (!stats.dateRange.last || entry.timestamp > stats.dateRange.last) {
        stats.dateRange.last = entry.timestamp;
      }
    }
  });

  return stats;
}

/**
 * Search across all transcripts
 */
export async function searchAllTranscripts(query, options = {}) {
  const files = getAllTranscriptFiles();
  const results = [];
  const limit = options.limit || 10;

  for (const file of files) {
    if (results.length >= limit) break;

    const sessionId = file.name.replace(/_\d{4}-\d{2}-\d{2}\.jsonl$/, '');
    const entries = await readTranscript(sessionId);

    for (const entry of entries) {
      if (results.length >= limit) break;

      const content = JSON.stringify(entry).toLowerCase();
      if (content.includes(query.toLowerCase())) {
        results.push({
          sessionId,
          entry,
          file: file.name,
        });
      }
    }
  }

  return results;
}

/**
 * Session Transcript Manager class
 */
export class SessionTranscriptManager {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.buffer = [];
    this.bufferSize = 0;
    this.maxBufferSize = 10;
  }

  async log(message) {
    this.buffer.push(message);
    this.bufferSize++;

    if (this.bufferSize >= this.maxBufferSize) {
      await this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    for (const message of this.buffer) {
      await appendToTranscript(this.sessionId, message);
    }

    this.buffer = [];
    this.bufferSize = 0;
  }

  async logUser(content, metadata = {}) {
    await this.log({
      role: 'user',
      type: 'message',
      content,
      metadata,
    });
  }

  async logAssistant(content, metadata = {}) {
    await this.log({
      role: 'assistant',
      type: 'message',
      content,
      metadata,
    });
  }

  async logAction(action, result, metadata = {}) {
    await this.log({
      role: 'system',
      type: 'action',
      action,
      result,
      metadata,
    });
  }

  async getRecentContext(count = 10) {
    await this.flush();
    return await getContextForPrompt(this.sessionId, count);
  }
}

initTranscripts();
