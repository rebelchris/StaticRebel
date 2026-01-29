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

  getTracker(name) {
    const registry = this.loadRegistry();
    return registry.trackers.find(t => t.name === name);
  }

  createTracker(config) {
    const registry = this.loadRegistry();

    // Check if already exists
    if (registry.trackers.find(t => t.name === config.name)) {
      return { success: false, message: 'Tracker already exists' };
    }

    const tracker = {
      name: config.name,
      displayName: config.displayName || config.name,
      type: config.type || 'custom',
      createdAt: Date.now(),
      config: {
        metrics: config.metrics || [],
        visionPrompt: config.visionPrompt || '',
        ...config.config
      }
    };

    registry.trackers.push(tracker);
    this.saveRegistry(registry);

    // Create tracker directory and records file
    const trackerDir = path.join(TRACKERS_DIR, config.name);
    if (!fs.existsSync(trackerDir)) {
      fs.mkdirSync(trackerDir, { recursive: true });
    }

    const recordsFile = path.join(trackerDir, 'records.json');
    fs.writeFileSync(recordsFile, JSON.stringify({ records: [] }, null, 2));

    return { success: true, tracker };
  }

  deleteTracker(name) {
    const registry = this.loadRegistry();
    const idx = registry.trackers.findIndex(t => t.name === name);
    if (idx === -1) {
      return { success: false, message: 'Tracker not found' };
    }

    registry.trackers.splice(idx, 1);
    this.saveRegistry(registry);

    // Delete tracker directory
    const trackerDir = path.join(TRACKERS_DIR, name);
    if (fs.existsSync(trackerDir)) {
      const files = fs.readdirSync(trackerDir);
      for (const file of files) {
        fs.unlinkSync(path.join(trackerDir, file));
      }
      fs.rmdirSync(trackerDir);
    }

    return { success: true };
  }

  // Record operations
  getRecords(trackerName) {
    const recordsFile = path.join(TRACKERS_DIR, trackerName, 'records.json');
    try {
      if (fs.existsSync(recordsFile)) {
        return JSON.parse(fs.readFileSync(recordsFile, 'utf-8'));
      }
    } catch (e) {}
    return { records: [] };
  }

  addRecord(trackerName, record) {
    const recordsFile = path.join(TRACKERS_DIR, trackerName, 'records.json');
    const trackerDir = path.dirname(recordsFile);

    // Ensure tracker directory exists
    if (!fs.existsSync(trackerDir)) {
      fs.mkdirSync(trackerDir, { recursive: true });
    }

    const data = this.getRecords(trackerName);

    const newRecord = {
      id: 'rec_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      ...record
    };

    data.records.push(newRecord);

    try {
      fs.writeFileSync(recordsFile, JSON.stringify(data, null, 2));
      return { success: true, record: newRecord };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  updateRecord(trackerName, recordId, newData) {
    const recordsFile = path.join(TRACKERS_DIR, trackerName, 'records.json');
    const data = this.getRecords(trackerName);

    const idx = data.records.findIndex(r => r.id === recordId);
    if (idx === -1) {
      return { success: false, message: 'Record not found' };
    }

    // Update the record (keep id, timestamp, date, source but update data)
    data.records[idx] = {
      ...data.records[idx],
      data: { ...data.records[idx].data, ...newData },
      updatedAt: Date.now()
    };

    try {
      fs.writeFileSync(recordsFile, JSON.stringify(data, null, 2));
      return { success: true, record: data.records[idx] };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  getRecordsByDateRange(trackerName, startDate, endDate) {
    const data = this.getRecords(trackerName);
    return data.records.filter(r => {
      return r.date >= startDate && r.date <= endDate;
    });
  }

  getRecentRecords(trackerName, limit = 10) {
    const data = this.getRecords(trackerName);
    return data.records
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}

// ============================================================================
// Vision Analyzer - Image analysis using Ollama vision models
// ============================================================================

class VisionAnalyzer {
  constructor() {
    this.model = VISION_MODEL;
  }

  async analyzeImage(imagePath, prompt) {
    try {
      // Read and encode image
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      const data = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [base64Image]
          }
        ],
        stream: false
      });

      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: new URL(OLLAMA_HOST).hostname,
          port: new URL(OLLAMA_HOST).port || 11434,
          path: '/api/chat',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const response = JSON.parse(body);
              resolve(response.message?.content || '');
            } catch (e) {
              reject(new Error('Failed to parse vision response'));
            }
          });
        });

        req.onerror = () => reject(new Error('Vision request failed'));
        req.write(data);
        req.end();
      });
    } catch (e) {
      return { error: e.message };
    }
  }

  async analyzeWorkout(imagePath) {
    const prompt = `Analyze this workout screenshot/image and extract ALL metrics you can find.

Examples of metrics to extract:
- F45 metrics: total_cals, max_hr, min_hr, tss, pte, hr_zones, avg_hr, calories_burned
- Gym metrics: exercise, sets, reps, weight, rpe, duration, rest_time
- Running: distance, pace, time, heart_rate, elevation
- General: any numbers, percentages, scores, times, or metrics you see

Respond with ONLY valid JSON - extract ALL data as key-value pairs:
{
  "workout_type": "F45/Gym/Running/etc or 'unknown'",
  "total_cals": number or null,
  "max_hr": number or null,
  "min_hr": number or null,
  "tss": number or null,
  "pte": number or null,
  "avg_hr": number or null,
  "duration": "string or null",
  "exercise": "name or null",
  "sets": number or null,
  "reps": "string or null",
  "weight": "string or null",
  "distance": "string or null",
  "pace": "string or null",
  "notes": "Any additional observations",
  "all_metrics": "List all metric names and values you can extract from the image"
}

Extract EVERYTHING you can see - don't guess, just report what's visible. Use snake_case for all keys.`;

    return this.analyzeImage(imagePath, prompt);
  }

  async analyzeFood(imagePath) {
    const prompt = `Analyze this food screenshot/image and extract ALL nutritional data you can find.

Extract every metric visible:
- Calories, protein, carbs, fat
- Serving sizes, portions
- Food items names
- Any numbers or percentages

Respond with ONLY valid JSON with all data as key-value pairs:
{
  "meal": "Meal name or 'unknown'",
  "calories": number or null,
  "protein": "string or null",
  "carbs": "string or null",
  "fat": "string or null,
  "fiber": "string or null",
  "sugar": "string or null",
  "sodium": "string or null",
  "servings": number or null,
  "serving_size": "string or null",
  "foods": ["list of food items"],
  "all_metrics": "List all metric names and values"
}

Extract EVERYTHING visible - don't guess, just report what's in the image.`;

    return this.analyzeImage(imagePath, prompt);
  }
}

// ============================================================================
// Query Engine - Data retrieval, aggregation, and comparison
// ============================================================================

class QueryEngine {
  constructor() {
    this.store = new TrackerStore();
  }

  parsePeriod(period) {
    const now = new Date();
    let startDate, endDate;

    switch (period?.toLowerCase()) {
      case 'today':
        startDate = now.toISOString().split('T')[0];
        endDate = startDate;
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = yesterday.toISOString().split('T')[0];
        endDate = startDate;
        break;
      case 'week':
      case 'this-week':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startDate = startOfWeek.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
        break;
      case 'last-week':
        const lastWeekStart = new Date(now);
        lastWeekStart.setDate(now.getDate() - now.getDay() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        startDate = lastWeekStart.toISOString().split('T')[0];
        endDate = lastWeekEnd.toISOString().split('T')[0];
        break;
      case 'month':
      case 'this-month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
        break;
      case 'last-month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
        break;
      default:
        // Default to last 30 days
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        startDate = thirtyDaysAgo.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
    }

    return { startDate, endDate };
  }

  getStats(trackerName, period = 'week') {
    const tracker = this.store.getTracker(trackerName);
    if (!tracker) {
      return { error: 'Tracker not found' };
    }

    const { startDate, endDate } = this.parsePeriod(period);
    const records = this.store.getRecordsByDateRange(trackerName, startDate, endDate);

    if (records.length === 0) {
      return {
        period,
        startDate,
        endDate,
        totalEntries: 0,
        message: `No entries found for ${period}`
      };
    }

    // Aggregate metrics
    const metrics = tracker.config.metrics || [];
    const stats = {
      period,
      startDate,
      endDate,
      totalEntries: records.length,
      dateRange: `${startDate} to ${endDate}`,
      records,
      aggregations: {}
    };

    // Calculate totals and averages for numeric fields
    for (const metric of metrics) {
      const values = records
        .map(r => r.data?.[metric])
        .filter(v => typeof v === 'number');

      if (values.length > 0) {
        stats.aggregations[metric] = {
          total: values.reduce((a, b) => a + b, 0),
          average: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length
        };
      }
    }

    return stats;
  }

  comparePeriods(trackerName, period1, period2) {
    const stats1 = this.getStats(trackerName, period1);
    const stats2 = this.getStats(trackerName, period2);

    if (stats1.error || stats2.error) {
      return { error: stats1.error || stats2.error };
    }

    const comparison = {
      tracker: trackerName,
      period1: { name: period1, ...stats1 },
      period2: { name: period2, ...stats2 },
      changes: {}
    };

    // Compare aggregations
    const metrics = Object.keys(stats1.aggregations);
    for (const metric of metrics) {
      const agg1 = stats1.aggregations[metric];
      const agg2 = stats2.aggregations[metric];

      if (agg1 && agg2) {
        comparison.changes[metric] = {
          period1Total: agg1.total,
          period2Total: agg2.total,
          difference: agg2.total - agg1.total,
          percentChange: agg1.total > 0
            ? ((agg2.total - agg1.total) / agg1.total * 100).toFixed(1) + '%'
            : 'N/A'
        };
      }
    }

    return comparison;
  }

  formatStats(stats) {
    if (stats.error) {
      return `Error: ${stats.error}`;
    }

    let output = `\n${'='.repeat(50)}\n`;
    output += `  ${stats.period.toUpperCase()} Statistics\n`;
    output += `${'='.repeat(50)}\n`;
    output += `  Period: ${stats.dateRange}\n`;
    output += `  Total Entries: ${stats.totalEntries}\n\n`;

    if (stats.totalEntries === 0) {
      output += `  No entries recorded.\n`;
      return output;
    }

    output += `  Aggregations:\n`;
    output += `  ${'-'.repeat(40)}\n`;

    for (const [metric, agg] of Object.entries(stats.aggregations)) {
      output += `  ${metric}:\n`;
      output += `    Total: ${agg.total?.toFixed(1) || 'N/A'}\n`;
      output += `    Average: ${agg.average?.toFixed(1) || 'N/A'}\n`;
      output += `    Min: ${agg.min?.toFixed(1) || 'N/A'}\n`;
      output += `    Max: ${agg.max?.toFixed(1) || 'N/A'}\n\n`;
    }

    return output;
  }

  formatComparison(comp) {
    if (comp.error) {
      return `Error: ${comp.error}`;
    }

    let output = `\n${'='.repeat(50)}\n`;
    output += `  Comparison: ${comp.period1.name} vs ${comp.period2.name}\n`;
    output += `${'='.repeat(50)}\n\n`;

    output += `  ${comp.period1.name}:\n`;
    output += `    Entries: ${comp.period1.totalEntries}\n`;
    output += `    Period: ${comp.period1.dateRange}\n\n`;

    output += `  ${comp.period2.name}:\n`;
    output += `    Entries: ${comp.period2.totalEntries}\n`;
    output += `    Period: ${comp.period2.dateRange}\n\n`;

    output += `  Changes:\n`;
    output += `  ${'-'.repeat(40)}\n`;

    const metrics = Object.keys(comp.changes);
    if (metrics.length === 0) {
      output += `  No comparable metrics found.\n`;
      return output;
    }

    for (const [metric, change] of Object.entries(comp.changes)) {
      const trend = change.difference > 0 ? '+' : '';
      output += `  ${metric}: ${trend}${change.difference?.toFixed(1) || 0} (${change.percentChange})\n`;
    }

    return output;
  }

  formatHistory(records) {
    if (!records || records.length === 0) {
      return '\n  No records found.\n';
    }

    let output = `\n${'='.repeat(50)}\n`;
    output += `  Recent History\n`;
    output += `${'='.repeat(50)}\n\n`;

    for (const record of records) {
      output += `  [${record.date}] ${record.id.slice(0, 8)}\n`;

      // Format data fields
      if (record.data) {
        for (const [key, value] of Object.entries(record.data)) {
          output += `    ${key}: ${JSON.stringify(value)}\n`;
        }
      }

      if (record.source) {
        output += `    source: ${record.source}\n`;
      }

      output += '\n';
    }

    return output;
  }
}

// ============================================================================
// Natural Language Parser for Tracker Creation
// ============================================================================

async function parseTrackerFromNaturalLanguage(description) {
  const prompt = `Parse this tracker description and extract the configuration:

"${description}"

Respond with ONLY valid JSON in this format:
{
  "name": "short-name-kebab-case",
  "displayName": "Display Name",
  "type": "workout|food|custom",
  "metrics": ["metric1", "metric2"],
  "visionPrompt": "Specific instructions for analyzing images for this tracker type"
}

Analyze the description to determine:
1. A kebab-case name for the tracker
2. A display name
3. The type of tracker (workout, food, habit, etc.)
4. What metrics should be tracked
5. Specific vision instructions for image analysis

Example outputs:
- "track my workouts with exercise, weight, reps" -> {type: "workout", metrics: ["exercise", "weight", "reps", "sets"]}
- "log my meals with calories and macros" -> {type: "food", metrics: ["meal", "calories", "protein", "carbs", "fat"]}`;

  try {
    const response = await askOllama([
      { role: 'system', content: 'You are a JSON parser. Output only valid JSON.' },
      { role: 'user', content: prompt }
    ]);

    const content = response.message?.content;
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');

    return {
      name: parsed.name || 'custom-tracker',
      displayName: parsed.displayName || parsed.name || 'Custom Tracker',
      type: parsed.type || 'custom',
      metrics: parsed.metrics || [],
      visionPrompt: parsed.visionPrompt || '',
      createdAt: Date.now()
    };
  } catch (e) {
    return null;
  }
}

async function confirmOrCustomizeTracker(rl, parsedConfig) {
  console.log('\n  I parsed your description. Here\'s what I understood:\n');
  console.log(`    Name:        ${parsedConfig.displayName} (@${parsedConfig.name})`);
  console.log(`    Type:        ${parsedConfig.type}`);
  console.log(`    Metrics:     ${parsedConfig.metrics?.join(', ') || 'none'}`);

  // Ask if they want to customize
  const customize = await askYesNo(rl, '\n  Would you like to customize these settings?', false);

  if (!customize) {
    return parsedConfig;
  }

  console.log('\n  Let\'s customize your tracker...\n');

  // Confirm/modify name
  let shortName = parsedConfig.name;
  let displayName = parsedConfig.displayName;

  const existingName = await new Promise(resolve => {
    rl.question(`  Short name (press Enter to keep "${shortName}"): `, resolve);
  });
  if (existingName.trim()) {
    shortName = existingName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  const existingDisplay = await new Promise(resolve => {
    rl.question(`  Display name (press Enter to keep "${displayName}"): `, resolve);
  });
  if (existingDisplay.trim()) {
    displayName = existingDisplay.trim();
  }

  // Confirm/modify type
  console.log('\n  Tracker type options:\n');
  TRACKER_TYPES.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.icon} ${t.name}`);
  });

  let typeChoice = parsedConfig.type || 'custom';
  const typeInput = await new Promise(resolve => {
    rl.question(`\n  Type (press Enter to keep "${typeChoice}"): `, resolve);
  });
  if (typeInput.trim()) {
    const idx = parseInt(typeInput.trim()) - 1;
    if (idx >= 0 && idx < TRACKER_TYPES.length) {
      typeChoice = TRACKER_TYPES[idx].id;
    } else {
      typeChoice = typeInput.trim().toLowerCase();
    }
  }

  // Confirm/modify metrics
  console.log('\n  Current metrics: ' + (parsedConfig.metrics?.join(', ') || 'none'));
  const metricsInput = await new Promise(resolve => {
    rl.question(`  Metrics (comma-separated, press Enter to keep current): `, resolve);
  });
  let metrics = parsedConfig.metrics || [];
  if (metricsInput.trim()) {
    metrics = metricsInput.split(',').map(m => m.trim()).filter(m => m);
  }

  // Ask about persona
  const createPersonaQ = await askYesNo(rl, '\n  Would you like to create a persona for this tracker?', true);
  let persona = null;

  if (createPersonaQ) {
    const personaName = await new Promise(resolve => {
      rl.question('  Persona name (e.g., "Coach", "Nutritionist"): ', resolve);
    });
    const personaDesc = await new Promise(resolve => {
      rl.question('  Persona description (brief): ', resolve);
    });

    persona = {
      name: personaName.trim() || 'Assistant',
      description: personaDesc.trim() || '',
      systemPrompt: `You are ${personaName.trim() || 'a helpful assistant'} for tracking ${displayName}.`
    };
  }

  return {
    name: shortName,
    displayName: displayName || shortName,
    type: typeChoice,
    metrics,
    persona,
    createdAt: Date.now()
  };
}

function askOllama(messages) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model: MODEL, messages, stream: false });

    const req = http.request({
      hostname: new URL(OLLAMA_HOST).hostname,
      port: new URL(OLLAMA_HOST).port || 11434,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.onerror = reject;
    req.write(data);
    req.end();
  });
}

async function parseRecordFromText(trackerName, text, trackerType) {
  const typePrompts = {
    workout: `Extract workout details from this text:

"${text}"

Respond with ONLY valid JSON:
{
  "exercise": "Exercise name",
  "sets": number or null,
  "reps": "number or array or null",
  "weight": "Weight with units or null",
  "duration": "Duration if applicable or null",
  "notes": "Any notes or null"
}`,
    food: `Extract meal details from this text:

"${text}"

Respond with ONLY valid JSON:
{
  "meal": "Meal/food name (infer from context)",
  "calories": number or null (estimate if not specified),
  "protein": "Protein in grams or null",
  "carbs": "Carbs in grams or null",
  "fat": "Fat in grams or null",
  "foods": ["list of food items"]
}`,
    nutrition: `Extract meal details from this text:

"${text}"

Respond with ONLY valid JSON:
{
  "meal": "Meal/food name (infer from context)",
  "calories": number or null (estimate if not specified),
  "protein": "Protein in grams or null",
  "carbs": "Carbs in grams or null",
  "fat": "Fat in grams or null",
  "foods": ["list of food items"]
}`,
    custom: `Extract structured data from this text for a "${trackerName}" tracker:

"${text}"

Respond with ONLY valid JSON with appropriate fields for this tracker type. If values aren't specified, use null.`
  };

  const prompt = typePrompts[trackerType] || typePrompts.custom;

  try {
    const response = await askOllama([
      { role: 'system', content: 'You are a JSON parser. Output only valid JSON. No markdown, no explanations, no text before or after.' },
      { role: 'user', content: prompt }
    ]);

    const content = response.message?.content;

    // Try to extract valid JSON - look for first { to last }
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');

    let parsed = {};
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const jsonStr = content.substring(jsonStart, jsonEnd + 1);
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        // Try finding just object content
        const match = content.match(/\{[\s\S]*?\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch (e2) {
            // Fall through to empty object
          }
        }
      }
    }

    // Clean up null/undefined values
    Object.keys(parsed).forEach(key => {
      if (parsed[key] === null || parsed[key] === undefined) {
        delete parsed[key];
      }
    });

    return { success: true, data: parsed };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================================================
// Tracker Auto-Detection
// ============================================================================

/**
 * Test if a query matches any of the tracker's auto-detect triggers
 * @param {Object} tracker - The tracker object with config.autoDetect.triggers
 * @param {string} query - The query text to test
 * @returns {boolean} - True if any trigger matches
 */
function matchesAutoDetect(tracker, query) {
  if (!tracker?.config?.autoDetect?.triggers) {
    return false;
  }

  const triggers = tracker.config.autoDetect.triggers;
  if (!Array.isArray(triggers) || triggers.length === 0) {
    return false;
  }

  // Check for question words - don't auto-detect questions
  const lowerQuery = query.toLowerCase();
  if (/\b(how|what|when|where|why|can you|could you)\b/i.test(lowerQuery) || lowerQuery.includes('?')) {
    return false;
  }

  // Test each trigger pattern
  return triggers.some(pattern => {
    try {
      // Handle both regex patterns and string patterns
      if (pattern instanceof RegExp) {
        return pattern.test(query);
      } else if (typeof pattern === 'string') {
        // Check if it looks like a regex pattern (contains regex metacharacters)
        const hasRegexMetachars = /[()\[\]?*+|\\]/.test(pattern);
        if (hasRegexMetachars) {
          // It's a regex pattern string, use it directly
          return new RegExp(pattern, 'i').test(query);
        } else {
          // It's a literal string, escape special chars and match
          const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(escaped, 'i').test(query);
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  });
}

// ============================================================================
// Tracker Creation Wizard
// ============================================================================

const TRACKER_TYPES = [
  { id: 'workout', name: 'Workout', icon: '💪', description: 'Track exercises, sets, reps, weight' },
  { id: 'nutrition', name: 'Nutrition', icon: '🥗', description: 'Track meals, calories, macros' },
  { id: 'sleep', name: 'Sleep', icon: '😴', description: 'Track sleep duration and quality' },
  { id: 'habit', name: 'Habit', icon: '✅', description: 'Track daily habits and routines' },
  { id: 'custom', name: 'Custom', icon: '📊', description: 'Build your own tracker' }
];

const WORKOUT_METRICS = [
  { id: 'exercise', name: 'Exercise', type: 'text', required: true },
  { id: 'sets', name: 'Sets', type: 'number', required: true },
  { id: 'reps', name: 'Reps', type: 'text', required: true },
  { id: 'weight', name: 'Weight', type: 'text', required: false },
  { id: 'duration', name: 'Duration', type: 'text', required: false },
  { id: 'rpe', name: 'RPE (Rate of Perceived Exertion)', type: 'number', required: false },
  { id: 'notes', name: 'Notes', type: 'text', required: false }
];

const NUTRITION_METRICS = [
  { id: 'meal', name: 'Meal Name', type: 'text', required: true },
  { id: 'foods', name: 'Foods', type: 'text', required: true },
  { id: 'calories', name: 'Calories', type: 'number', required: true },
  { id: 'protein', name: 'Protein (g)', type: 'number', required: false },
  { id: 'carbs', name: 'Carbs (g)', type: 'number', required: false },
  { id: 'fat', name: 'Fat (g)', type: 'number', required: false },
  { id: 'notes', name: 'Notes', type: 'text', required: false }
];

const SLEEP_METRICS = [
  { id: 'bedtime', name: 'Bedtime', type: 'time', required: true },
  { id: 'wakeTime', name: 'Wake Time', type: 'time', required: true },
  { id: 'duration', name: 'Duration (hours)', type: 'number', required: true },
  { id: 'quality', name: 'Quality (1-10)', type: 'number', required: false },
  { id: 'energyLevel', name: 'Energy Level (1-10)', type: 'number', required: false },
  { id: 'notes', name: 'Notes', type: 'text', required: false }
];

const HABIT_METRICS = [
  { id: 'habit', name: 'Habit', type: 'text', required: true },
  { id: 'completed', name: 'Completed', type: 'boolean', required: true },
  { id: 'streak', name: 'Current Streak', type: 'number', required: false },
  { id: 'duration', name: 'Duration', type: 'text', required: false },
  { id: 'notes', name: 'Notes', type: 'text', required: false }
];

const PERSONA_TEMPLATES = {
  workout: [
    { name: 'Motivational Coach', description: 'Enthusiastic and encouraging', systemPrompt: 'You are an energetic fitness coach. Be encouraging, use exclamation points, celebrate progress, and always motivate the user to push harder. Reference their workout history to celebrate improvements.' },
    { name: 'Technical Powerlifter', description: 'Focus on numbers and form', systemPrompt: 'You are a technical powerlifting coach. Focus on progressive overload, proper form cues, and give specific numbers-based advice. Be direct and data-focused.' },
    { name: 'Friendly Trainer', description: 'Supportive and approachable', systemPrompt: 'You are a friendly personal trainer. Be warm, supportive, and approachable. Give practical advice that fits the user lifestyle. Ask about how they feel and adjust recommendations accordingly.' },
    { name: 'Custom', description: 'Create your own persona', systemPrompt: '' }
  ],
  nutrition: [
    { name: 'Nutrition Coach', description: 'Balanced approach to eating', systemPrompt: 'You are a nutrition coach focused on balanced eating. Discuss macros, meal timing, and food quality. Be supportive about cravings and help find sustainable solutions.' },
    { name: 'Macro Expert', description: 'Data-driven nutrition', systemPrompt: 'You are a macro counting expert. Focus on protein, carbs, fats ratios. Be precise with numbers and help optimize nutrition for goals. Provide specific food suggestions.' },
    { name: 'Intuitive Eating Guide', description: 'Mindful eating approach', systemPrompt: 'You focus on mindful and intuitive eating. Help users connect with hunger cues, reduce food guilt, and build a healthy relationship with food. Be gentle and supportive.' },
    { name: 'Custom', description: 'Create your own persona', systemPrompt: '' }
  ],
  sleep: [
    { name: 'Sleep Specialist', description: 'Sleep hygiene expert', systemPrompt: 'You are a sleep specialist. Focus on sleep hygiene, bedtime routines, and optimizing sleep environment. Give practical tips for better sleep quality and consistency.' },
    { name: 'Recovery Coach', description: 'Focus on recovery and rest', systemPrompt: 'You are a recovery coach. Connect sleep quality to daily performance and recovery. Be encouraging about building good sleep habits and consistent routines.' },
    { name: 'Custom', description: 'Create your own persona', systemPrompt: '' }
  ],
  habit: [
    { name: 'Accountability Partner', description: 'Keeps you on track', systemPrompt: 'You are an accountability partner. Check in on habit completion, celebrate streaks, and gently check in when habits are missed. Be supportive but firm about consistency.' },
    { name: 'Habit Coach', description: 'Habit formation expert', systemPrompt: 'You are a habit formation coach. Focus on building new habits and breaking bad ones. Use science-backed techniques like habit stacking, cue-reduction, and gradual progression.' },
    { name: 'Custom', description: 'Create your own persona', systemPrompt: '' }
  ],
  custom: [
    { name: 'Custom Assistant', description: 'Build your own', systemPrompt: '' }
  ]
};

async function runTrackerWizard(rl) {
  console.clear();
  console.log('='.repeat(50));
  console.log('  Create New Tracker');
  console.log('='.repeat(50));
  console.log("  Let's set up a tracker for you...\n");

  // Step 1: Select tracker type
  console.log('  Step 1: What type of tracker?\n');
  TRACKER_TYPES.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.icon} ${t.name}`);
    console.log(`     ${t.description}\n`);
  });

  let typeChoice;
  while (true) {
    typeChoice = await new Promise(resolve => {
      rl.question('  Select type (1-5): ', resolve);
    });
    const idx = parseInt(typeChoice) - 1;
    if (idx >= 0 && idx < TRACKER_TYPES.length) {
      typeChoice = TRACKER_TYPES[idx];
      break;
    }
    console.log('  Please enter a number 1-5.\n');
  }

  const selectedType = typeChoice;
  console.log(`\n  Selected: ${selectedType.name}\n`);

  // Step 2: Tracker name
  let shortName, displayName;
  while (true) {
    shortName = await new Promise(resolve => {
      rl.question('  Step 2: Short name for commands (e.g., "workout", "food", "sleep"): ', resolve);
    });
    shortName = shortName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (shortName.length < 2) {
      console.log('  Name must be at least 2 characters.\n');
      continue;
    }
    if (/^-| $/.test(shortName)) {
      console.log('  Name cannot start/end with dash or space.\n');
      continue;
    }

    // Check if exists
    const store = new TrackerStore();
    const existing = store.getTracker(shortName);
    if (existing) {
      console.log(`  A tracker named "${shortName}" already exists.\n`);
      continue;
    }
    break;
  }

  displayName = await new Promise(resolve => {
    rl.question('  Display name (e.g., "Workout Tracker"): ', resolve);
  });
  displayName = displayName.trim() || shortName;
  console.log();

  // Step 3: Select metrics
  let metrics = [];
  if (selectedType.id === 'workout') {
    metrics = await selectMetrics(rl, 'workout', WORKOUT_METRICS);
  } else if (selectedType.id === 'nutrition') {
    metrics = await selectMetrics(rl, 'nutrition', NUTRITION_METRICS);
  } else if (selectedType.id === 'sleep') {
    metrics = await selectMetrics(rl, 'sleep', SLEEP_METRICS);
  } else if (selectedType.id === 'habit') {
    metrics = await selectMetrics(rl, 'habit', HABIT_METRICS);
  } else {
    metrics = await selectCustomMetrics(rl);
  }

  // Step 4: Vision and image analysis
  const useVision = await askYesNo(rl, '\n  Step 4: Enable image analysis? (for logging via screenshots)', true);

  let visionPrompt = '';
  if (useVision) {
    if (selectedType.id === 'workout') {
      visionPrompt = 'Extract workout details: exercise name, sets, reps, weight from workout screenshots. Return structured JSON.';
    } else if (selectedType.id === 'nutrition') {
      visionPrompt = 'Extract meal/nutrition details: food items, calories, macros from food screenshots. Return structured JSON.';
    } else {
      visionPrompt = `Extract ${selectedType.name} data from this image. Return structured JSON with relevant fields.`;
    }
  }

  // Step 5: Create persona
  const personaTemplates = PERSONA_TEMPLATES[selectedType.id] || PERSONA_TEMPLATES.custom;
  const persona = await createPersona(rl, selectedType.name, personaTemplates);

  // Step 6: Summary and confirm
  console.clear();
  console.log('='.repeat(50));
  console.log('  Tracker Summary');
  console.log('='.repeat(50));
  console.log(`\n  Type:        ${selectedType.icon} ${selectedType.name}`);
  console.log(`  Name:        ${displayName} (@${shortName})`);
  console.log(`  Metrics:     ${metrics.map(m => m.id).join(', ')}`);
  console.log(`  Vision:      ${useVision ? 'Enabled' : 'Disabled'}`);
  console.log(`  Persona:     ${persona.name}`);
  if (persona.description) {
    console.log(`  Description: ${persona.description}`);
  }

  const confirm = await askYesNo(rl, '\n  Create this tracker?', true);

  if (!confirm) {
    console.log('\n  Cancelled.\n');
    return null;
  }

  // Create the tracker
  const store = new TrackerStore();
  const result = store.createTracker({
    name: shortName,
    displayName,
    type: selectedType.id,
    metrics: metrics.map(m => m.id),
    visionPrompt,
    config: {
      persona: {
        name: persona.name,
        description: persona.description,
        systemPrompt: persona.systemPrompt
      }
    }
  });

  if (result.success) {
    console.log(`\n  ${'='.repeat(50)}`);
    console.log(`  \x1b[32mTracker created successfully!\x1b[0m`);
    console.log(`${'='.repeat(50)}\n`);
    console.log(`  Commands:`);
    console.log(`    /track ${shortName} add "entry"    - Add entry via text`);
    if (useVision) {
      console.log(`    /track ${shortName} image <path> - Add entry via image`);
    }
    console.log(`    /track ${shortName} stats         - View statistics`);
    console.log(`    /track ${shortName} history       - View history`);
    if (persona.systemPrompt) {
      console.log(`    /track ${shortName} chat "?"     - Chat with ${persona.name}`);
    }
    console.log(`    /track ${shortName} delete       - Delete tracker\n`);
  }

  return result;
}

async function selectMetrics(rl, type, availableMetrics) {
  console.log(`\n  Step 3: Select metrics to track for ${type}:\n`);

  const selected = [];

  for (const metric of availableMetrics) {
    const defaultVal = metric.required ? 'y' : 'n';
    const answer = await new Promise(resolve => {
      rl.question(`  Track "${metric.name}"? (y/n) [${defaultVal}]: `, resolve);
    });
    const cleanAnswer = answer.trim().toLowerCase() || defaultVal;

    if (cleanAnswer === 'y' || cleanAnswer === 'yes' || metric.required) {
      selected.push(metric);
      if (metric.required) {
        console.log(`    ✓ Required field included\n`);
      }
    } else {
      console.log(`    Skipped\n`);
    }
  }

  if (selected.length === 0) {
    console.log('  At least one metric required. Adding default.\n');
    selected.push(availableMetrics[0]);
  }

  return selected;
}

async function selectCustomMetrics(rl) {
  console.log('\n  Step 3: Define custom metrics:\n');

  const metrics = [];
  let addMore = true;

  while (addMore) {
    const metricName = await new Promise(resolve => {
      rl.question('  Metric name (e.g., "water", "steps", "mood"): ', resolve);
    });

    if (!metricName.trim()) {
      break;
    }

    const metricId = metricName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    console.log('  Metric types:');
    console.log('  1. Number (e.g., 5, 12.5, 100)');
    console.log('  2. Text (e.g., "Great workout")');
    console.log('  3. Boolean (e.g., yes/no, true/false)');

    const typeChoice = await new Promise(resolve => {
      rl.question('  Type (1-3): ', resolve);
    });

    let type = 'text';
    if (typeChoice === '1') type = 'number';
    else if (typeChoice === '2') type = 'text';
    else if (typeChoice === '3') type = 'boolean';

    metrics.push({ id: metricId, name: metricName, type, required: false });

    console.log(`  Added: ${metricName} (${type})\n`);

    const more = await new Promise(resolve => {
      rl.question('  Add another metric? (y/n) [y]: ', resolve);
    });
    addMore = more.trim().toLowerCase() !== 'n' && more.trim().toLowerCase() !== 'no';
  }

  if (metrics.length === 0) {
    console.log('  Adding default metric...\n');
    metrics.push({ id: 'value', name: 'Value', type: 'number', required: true });
  }

  return metrics;
}

async function createPersona(rl, trackerType, templates) {
  console.log(`\n  Step 5: Create a persona for ${trackerType} tracking\n`);

  templates.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.name}`);
    console.log(`     ${t.description}\n`);
  });

  const choice = await new Promise(resolve => {
    rl.question('  Select persona (number): ', resolve);
  });

  const idx = parseInt(choice) - 1;
  let selected;

  if (idx >= 0 && idx < templates.length) {
    selected = templates[idx];
  } else {
    selected = templates[0];
  }

  if (selected.id === 'custom' || !selected.systemPrompt) {
    console.log('\n  Creating custom persona...\n');

    const personaName = await new Promise(resolve => {
      rl.question('  Persona name (e.g., "Coach Mike", "Nutrition Guide"): ', resolve);
    });

    const personaDesc = await new Promise(resolve => {
      rl.question('  Brief description: ', resolve);
    });

    console.log('\n  Write a system prompt for this persona.\n');
    console.log('  Think about:');
    console.log('  - How should they sound? (formal, casual, enthusiastic)');
    console.log('  - What expertise do they have?');
    console.log('  - Any specific advice style?\n');

    const systemPrompt = await new Promise(resolve => {
      rl.question('  System prompt (or press Enter for default):\n  ', resolve);
    });

    return {
      name: personaName || 'Assistant',
      description: personaDesc || 'Custom tracker assistant',
      systemPrompt: systemPrompt.trim() || `You are a helpful ${trackerType.toLowerCase()} tracking assistant. Help the user log and analyze their ${trackerType.toLowerCase()} data. Be encouraging and provide insights.`
    };
  }

  return {
    name: selected.name,
    description: selected.description,
    systemPrompt: selected.systemPrompt
  };
}

async function askYesNo(rl, question, defaultYes = true) {
  const defaultText = defaultYes ? 'y' : 'n';
  const answer = await new Promise(resolve => {
    rl.question(`${question} (y/n) [${defaultText}]: `, resolve);
  });

  const cleanAnswer = answer.trim().toLowerCase();
  if (!cleanAnswer) return defaultYes;

  return cleanAnswer === 'y' || cleanAnswer === 'yes';
}

// ============================================================================
// Persona Chat System
// ============================================================================

class PersonaChat {
  constructor(store) {
    this.store = store;
  }

  async chat(trackerName, userMessage, systemPrompt) {
    const tracker = this.store.getTracker(trackerName);
    if (!tracker) {
      return { error: 'Tracker not found' };
    }

    const persona = tracker.config?.persona || {};

    // Build context with tracker data
    const recentRecords = this.store.getRecentRecords(trackerName, 10);
    const stats = this.store.getRecordsByDateRange(trackerName, '2020-01-01', '2100-12-31');

    const dataContext = `
<TRACKER_CONTEXT>
Tracker: ${tracker.displayName} (@${tracker.name})
Type: ${tracker.type}
Metrics: ${tracker.config?.metrics?.join(', ') || 'custom'}

RECENT ENTRIES (last 10):
${recentRecords.map(r => `- [${r.date}] ${JSON.stringify(r.data)}`).join('\n')}

PERIOD STATS:
${JSON.stringify(stats.slice(-30), null, 2)}
</TRACKER_CONTEXT>`;

    const fullSystemPrompt = `${persona.systemPrompt || systemPrompt}
${dataContext}

${persona.name ? `You are ${persona.name}. ${persona.description || ''}` : ''}

When answering tracker-related questions:
1. Reference the user's actual data when possible
2. Provide specific, actionable advice
3. Celebrate progress and improvements
4. Suggest concrete next steps`;

    try {
      const response = await askOllama([
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: userMessage }
      ]);

      return {
        response: response.message?.content || 'No response',
        persona: persona.name,
        tracker: tracker.displayName
      };
    } catch (e) {
      return { error: e.message };
    }
  }
}

// ============================================================================
// Export classes and functions
// ============================================================================

export {
  TrackerStore,
  VisionAnalyzer,
  QueryEngine,
  parseTrackerFromNaturalLanguage,
  parseRecordFromText,
  TRACKERS_DIR,
  runTrackerWizard,
  confirmOrCustomizeTracker,
  PersonaChat,
  TRACKER_TYPES,
  PERSONA_TEMPLATES,
  matchesAutoDetect
};

export default {
  TrackerStore,
  VisionAnalyzer,
  QueryEngine,
  parseTrackerFromNaturalLanguage,
  parseRecordFromText,
  TRACKERS_DIR,
  runTrackerWizard,
  confirmOrCustomizeTracker,
  PersonaChat,
  TRACKER_TYPES,
  PERSONA_TEMPLATES,
  matchesAutoDetect
};
