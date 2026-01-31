import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import os from 'os';
import { getDefaultModel } from './lib/modelRegistry.js';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = getDefaultModel();
const VISION_MODEL = process.env.VISION_MODEL || 'llava';
const TRACKERS_DIR = path.join(os.homedir(), '.static-rebel', 'trackers');
const TRACKERS_REGISTRY = path.join(TRACKERS_DIR, 'trackers.json');

// ============================================================================
// Helper functions for async file operations
// ============================================================================

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, defaultValue = null) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`Failed to read ${filePath}:`, e.message);
    }
    return defaultValue;
  }
}

async function writeJsonFile(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error(`Failed to write ${filePath}:`, e.message);
    return false;
  }
}

// ============================================================================
// Tracker Store - CRUD operations for trackers and records
// ============================================================================

class TrackerStore {
  constructor() {
    this._initialized = false;
    this._initPromise = null;
  }

  /**
   * Ensure the tracker directory exists (async)
   */
  async ensureDir() {
    if (this._initialized) return;
    
    // Use a promise to prevent concurrent initialization
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = (async () => {
      const exists = await fileExists(TRACKERS_DIR);
      if (!exists) {
        await fs.mkdir(TRACKERS_DIR, { recursive: true });
      }
      this._initialized = true;
    })();

    return this._initPromise;
  }

  async loadRegistry() {
    await this.ensureDir();
    const data = await readJsonFile(TRACKERS_REGISTRY, { trackers: [] });
    return data;
  }

  async saveRegistry(data) {
    await this.ensureDir();
    return writeJsonFile(TRACKERS_REGISTRY, data);
  }

  async listTrackers() {
    const registry = await this.loadRegistry();
    return registry.trackers;
  }

  async getTracker(id) {
    const registry = await this.loadRegistry();
    return registry.trackers.find((t) => t.id === id);
  }

  async createTracker(tracker) {
    const registry = await this.loadRegistry();
    tracker.id = tracker.id || `tracker-${Date.now()}`;
    tracker.createdAt = new Date().toISOString();
    tracker.updatedAt = tracker.createdAt;
    // Ensure displayName is set
    tracker.displayName = tracker.displayName || tracker.name || 'Tracker';
    registry.trackers.push(tracker);
    await this.saveRegistry(registry);
    return tracker;
  }

  async updateTracker(id, updates) {
    const registry = await this.loadRegistry();
    const index = registry.trackers.findIndex((t) => t.id === id);
    if (index === -1) return null;

    registry.trackers[index] = {
      ...registry.trackers[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.saveRegistry(registry);
    return registry.trackers[index];
  }

  async deleteTracker(id) {
    const registry = await this.loadRegistry();
    const index = registry.trackers.findIndex((t) => t.id === id);
    if (index === -1) return false;

    registry.trackers.splice(index, 1);
    await this.saveRegistry(registry);
    return true;
  }

  // Records
  getRecordsFile(trackerId) {
    return path.join(TRACKERS_DIR, `${trackerId}.json`);
  }

  async loadRecords(trackerId) {
    await this.ensureDir();
    const file = this.getRecordsFile(trackerId);
    const data = await readJsonFile(file, { records: [] });
    return data;
  }

  async saveRecords(trackerId, data) {
    await this.ensureDir();
    const file = this.getRecordsFile(trackerId);
    return writeJsonFile(file, data);
  }

  async addRecord(trackerId, record) {
    const data = await this.loadRecords(trackerId);
    record.id = record.id || `record-${Date.now()}`;
    record.timestamp = new Date().toISOString();
    data.records.push(record);
    await this.saveRecords(trackerId, data);

    // Update tracker stats
    await this.updateTrackerStats(trackerId);

    return record;
  }

  async updateTrackerStats(trackerId) {
    const data = await this.loadRecords(trackerId);
    const count = data.records.length;
    const lastEntry = data.records[data.records.length - 1]?.timestamp;
    await this.updateTracker(trackerId, { count, lastEntry });
  }

  /**
   * Get records for a tracker (alias for loadRecords for compatibility)
   */
  async getRecords(trackerId) {
    return this.loadRecords(trackerId);
  }

  /**
   * Get entries for a tracker (alias for getRecords for dashboard compatibility)
   */
  async getEntries(trackerId) {
    const data = await this.loadRecords(trackerId);
    return data.records || [];
  }

  /**
   * Get records by date range
   */
  async getRecordsByDateRange(trackerId, startDate, endDate) {
    const data = await this.loadRecords(trackerId);
    if (!startDate && !endDate) {
      return data;
    }

    const filtered = data.records.filter((r) => {
      const recordDate = new Date(r.timestamp);
      if (startDate && recordDate < new Date(startDate)) return false;
      if (endDate && recordDate > new Date(endDate)) return false;
      return true;
    });

    return { records: filtered };
  }
}

// ============================================================================
// Query Engine - Natural language queries on tracker data
// ============================================================================

class QueryEngine {
  constructor(store) {
    this.store = store;
  }

  async query(trackerId, question) {
    const tracker = await this.store.getTracker(trackerId);
    const data = await this.store.loadRecords(trackerId);

    const prompt = `You are analyzing tracker data. Answer the user's question based on the data provided.

Tracker: ${tracker.name} (${tracker.type})
Description: ${tracker.description || 'N/A'}

Records (${data.records.length} total):
${JSON.stringify(data.records.slice(-20), null, 2)}

User question: ${question}

Provide a concise, helpful answer based on the data. If you need to calculate totals, averages, or trends, do so.`;

    return new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
      });

      const url = new URL(OLLAMA_HOST);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 11434,
          path: '/api/generate',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              resolve(json.response || 'No response');
            } catch (err) {
              reject(new Error('Failed to parse response'));
            }
          });
        },
      );

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });
  }

  async getStats(trackerId) {
    const data = await this.store.loadRecords(trackerId);
    const records = data.records;

    if (records.length === 0) {
      return { count: 0, message: 'No records yet' };
    }

    // Calculate basic stats
    const count = records.length;
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = records.filter((r) => r.timestamp?.startsWith(today));

    return {
      count,
      todayCount: todayRecords.length,
      lastEntry: records[records.length - 1]?.timestamp,
      recent: records.slice(-5),
    };
  }
}

// ============================================================================
// Natural Language Parsing
// ============================================================================

/**
 * Parse a record from natural language text
 * @returns {Object} { success: boolean, data: Object }
 */
export async function parseRecordFromText(text, trackerType) {
  const prompt = `Parse the following text into a structured record for a ${trackerType} tracker.

Text: "${text}"

IMPORTANT RULES:
- Extract EXACT numbers from the text - do not guess or infer
- If user says "10 pushups", extract count: 10 (NOT half, not 5, exactly 10)
- If user says "add 50 calories", extract calories: 50
- Use the exact number mentioned, do not halve, double, or modify it

Respond with ONLY a JSON object containing the parsed fields. Example formats:
- For nutrition: {"food": "chicken salad", "calories": 450, "meal": "lunch"}
- For workout: {"exercise": "running", "duration": 30, "distance": "5km"}
- For workout pushups: {"exercise": "pushups", "count": 50}
- For habit: {"habit": "meditation", "completed": true, "notes": "felt good"}
- For sleep: {"hours": 7.5, "quality": "good", "bedtime": "23:00"}

JSON response:`;

  return new Promise((resolve) => {
    const requestBody = JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
    });

    const url = new URL(OLLAMA_HOST);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const parsed = JSON.parse(json.response);
            // Return consistent format
            resolve({ success: true, data: parsed });
          } catch {
            // Fallback: return empty data
            resolve({ success: false, data: null });
          }
        });
      },
    );

    req.on('error', () => resolve({ success: false, data: null }));
    req.write(requestBody);
    req.end();
  });
}

/**
 * Parse tracker creation from natural language
 */
export async function parseTrackerFromNaturalLanguage(text) {
  const prompt = `Parse the following text into tracker configuration.

Text: "${text}"

Respond with ONLY a JSON object:
{
  "name": "tracker name",
  "type": "nutrition|workout|habit|sleep|custom",
  "description": "what this tracker is for",
  "fields": ["field1", "field2"],
  "goal": optional goal description
}

JSON response:`;

  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
    });

    const url = new URL(OLLAMA_HOST);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const parsed = JSON.parse(json.response);
            resolve(parsed);
          } catch {
            // Fallback
            resolve({
              name: text.slice(0, 30),
              type: 'custom',
              description: text,
              fields: ['notes'],
            });
          }
        });
      },
    );

    req.on('error', () =>
      resolve({
        name: text.slice(0, 30),
        type: 'custom',
        description: text,
        fields: ['notes'],
      }),
    );
    req.write(requestBody);
    req.end();
  });
}

// ============================================================================
// Vision Analyzer - Image analysis using vision models
// ============================================================================

export class VisionAnalyzer {
  constructor(options = {}) {
    this.model = options.model || VISION_MODEL;
  }

  async analyze(imagePath, prompt = 'Describe what you see in this image.') {
    // Placeholder implementation - would integrate with vision model
    return {
      description: 'Vision analysis not fully implemented',
      imagePath,
      prompt,
    };
  }
}

// ============================================================================
// Persona Chat - Chat with different personas
// ============================================================================

export class PersonaChat {
  constructor(persona = 'default') {
    this.persona = persona;
    this.history = [];
  }

  async chat(message) {
    this.history.push({ role: 'user', content: message });

    // Placeholder - would integrate with actual chat
    const response = `Response as ${this.persona}: ${message}`;
    this.history.push({ role: 'assistant', content: response });
    return response;
  }

  getHistory() {
    return this.history;
  }

  clearHistory() {
    this.history = [];
  }
}

// ============================================================================
// Tracker Wizard - Interactive tracker creation
// ============================================================================

export async function runTrackerWizard() {
  // Placeholder implementation
  console.log('Tracker wizard would start here...');
  return {
    name: 'New Tracker',
    type: 'custom',
    description: 'Created via wizard',
  };
}

export async function confirmOrCustomizeTracker(trackerConfig) {
  // Placeholder implementation
  return trackerConfig;
}

// ============================================================================
// Auto Detection - Detect tracker type from input
// ============================================================================

export function matchesAutoDetect(input) {
  const patterns = {
    nutrition: /calories|food|meal|ate|eaten/i,
    workout: /workout|exercise|run|running|gym/i,
    sleep: /sleep|bed|woke|rest/i,
    habit: /habit|daily|routine/i,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(input)) {
      return type;
    }
  }

  return null;
}

export { TrackerStore, QueryEngine };
