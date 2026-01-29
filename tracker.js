import fs from 'fs';
import path from 'path';
import http from 'http';
import os from 'os';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const VISION_MODEL = process.env.VISION_MODEL || 'llava';
const TRACKERS_DIR = path.join(os.homedir(), '.static-rebel', 'trackers');
const TRACKERS_REGISTRY = path.join(TRACKERS_DIR, 'trackers.json');

// ============================================================================
// Tracker Store - CRUD operations for trackers and records
// ============================================================================

class TrackerStore {
  constructor() {
    this.ensureDir();
  }

  ensureDir() {
    if (!fs.existsSync(TRACKERS_DIR)) {
      fs.mkdirSync(TRACKERS_DIR, { recursive: true });
    }
  }

  loadRegistry() {
    try {
      if (fs.existsSync(TRACKERS_REGISTRY)) {
        return JSON.parse(fs.readFileSync(TRACKERS_REGISTRY, 'utf-8'));
      }
    } catch (e) {
      console.error('Failed to load tracker registry:', e.message);
    }
    return { trackers: [] };
  }

  saveRegistry(data) {
    try {
      fs.writeFileSync(TRACKERS_REGISTRY, JSON.stringify(data, null, 2));
      return true;
    } catch (e) {
      console.error('Failed to save tracker registry:', e.message);
      return false;
    }
  }

  listTrackers() {
    const registry = this.loadRegistry();
    return registry.trackers;
  }

  getTracker(id) {
    const registry = this.loadRegistry();
    return registry.trackers.find((t) => t.id === id);
  }

  createTracker(tracker) {
    const registry = this.loadRegistry();
    tracker.id = tracker.id || `tracker-${Date.now()}`;
    tracker.createdAt = new Date().toISOString();
    tracker.updatedAt = tracker.createdAt;
    registry.trackers.push(tracker);
    this.saveRegistry(registry);
    return tracker;
  }

  updateTracker(id, updates) {
    const registry = this.loadRegistry();
    const index = registry.trackers.findIndex((t) => t.id === id);
    if (index === -1) return null;

    registry.trackers[index] = {
      ...registry.trackers[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.saveRegistry(registry);
    return registry.trackers[index];
  }

  deleteTracker(id) {
    const registry = this.loadRegistry();
    const index = registry.trackers.findIndex((t) => t.id === id);
    if (index === -1) return false;

    registry.trackers.splice(index, 1);
    this.saveRegistry(registry);
    return true;
  }

  // Records
  getRecordsFile(trackerId) {
    return path.join(TRACKERS_DIR, `${trackerId}.json`);
  }

  loadRecords(trackerId) {
    const file = this.getRecordsFile(trackerId);
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
    } catch (e) {
      console.error('Failed to load records:', e.message);
    }
    return { records: [] };
  }

  saveRecords(trackerId, data) {
    const file = this.getRecordsFile(trackerId);
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      return true;
    } catch (e) {
      console.error('Failed to save records:', e.message);
      return false;
    }
  }

  addRecord(trackerId, record) {
    const data = this.loadRecords(trackerId);
    record.id = record.id || `record-${Date.now()}`;
    record.timestamp = new Date().toISOString();
    data.records.push(record);
    this.saveRecords(trackerId, data);

    // Update tracker stats
    this.updateTrackerStats(trackerId);

    return record;
  }

  updateTrackerStats(trackerId) {
    const data = this.loadRecords(trackerId);
    const count = data.records.length;
    const lastEntry = data.records[data.records.length - 1]?.timestamp;
    this.updateTracker(trackerId, { count, lastEntry });
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
    const tracker = this.store.getTracker(trackerId);
    const data = this.store.loadRecords(trackerId);

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

  getStats(trackerId) {
    const data = this.store.loadRecords(trackerId);
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
 */
export async function parseRecordFromText(text, trackerType) {
  const prompt = `Parse the following text into a structured record for a ${trackerType} tracker.

Text: "${text}"

Respond with ONLY a JSON object containing the parsed fields. Example formats:
- For nutrition: {"food": "chicken salad", "calories": 450, "meal": "lunch"}
- For workout: {"exercise": "running", "duration": 30, "distance": "5km"}
- For habit: {"habit": "meditation", "completed": true, "notes": "felt good"}
- For sleep: {"hours": 7.5, "quality": "good", "bedtime": "23:00"}

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
            // Fallback: return raw text as notes
            resolve({ notes: text, parsed: false });
          }
        });
      },
    );

    req.on('error', () => resolve({ notes: text, parsed: false }));
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
