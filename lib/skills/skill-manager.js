/**
 * Skill Manager - Dynamic skill discovery, loading, and data persistence
 * 
 * Skills are markdown files that describe capabilities the companion can learn.
 * Each skill can store persistent data that users can query (history, sums, etc).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const DATA_DIR = path.join(ROOT, 'data');

/**
 * Parse a skill markdown file into a structured object
 */
function parseSkillFile(content, filename) {
  const skill = {
    id: path.basename(filename, '.md'),
    name: '',
    description: '',
    triggers: [],
    dataSchema: null,
    actions: [],
    examples: [],
    raw: content
  };

  // Extract frontmatter-style metadata if present
  const lines = content.split('\n');
  let inSection = null;
  let sectionContent = [];

  for (const line of lines) {
    // Main title becomes name
    if (line.startsWith('# ')) {
      skill.name = line.slice(2).trim();
      continue;
    }

    // Section headers
    if (line.startsWith('## ')) {
      // Save previous section
      if (inSection) {
        saveSection(skill, inSection, sectionContent.join('\n').trim());
      }
      inSection = line.slice(3).trim().toLowerCase();
      sectionContent = [];
      continue;
    }

    if (inSection) {
      sectionContent.push(line);
    } else if (line.trim() && !skill.description) {
      // First paragraph is description
      skill.description = line.trim();
    }
  }

  // Save last section
  if (inSection) {
    saveSection(skill, inSection, sectionContent.join('\n').trim());
  }

  return skill;
}

function saveSection(skill, section, content) {
  switch (section) {
    case 'triggers':
    case 'keywords':
    case 'invoke':
      skill.triggers = content.split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
      break;
    case 'data':
    case 'schema':
    case 'data schema':
      try {
        // Try to parse as JSON
        const jsonMatch = content.match(/```json?\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          skill.dataSchema = JSON.parse(jsonMatch[1]);
        }
      } catch {
        skill.dataSchema = { type: 'freeform', description: content };
      }
      break;
    case 'actions':
    case 'capabilities':
      skill.actions = content.split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
      break;
    case 'examples':
      skill.examples = content.split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(l => l.startsWith('"') || l.startsWith("'"));
      break;
    case 'description':
      skill.description = content;
      break;
  }
}

/**
 * SkillManager - handles skill discovery, loading, and data persistence
 */
export class SkillManager {
  constructor(options = {}) {
    this.skillsDir = options.skillsDir || SKILLS_DIR;
    this.dataDir = options.dataDir || DATA_DIR;
    this.skills = new Map();
    this.dataCache = new Map();
  }

  /**
   * Initialize - create directories and load all skills
   */
  async init() {
    await fs.mkdir(this.skillsDir, { recursive: true });
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.loadAllSkills();
    return this;
  }

  /**
   * Load all skill files from the skills directory
   */
  async loadAllSkills() {
    try {
      const files = await fs.readdir(this.skillsDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const file of mdFiles) {
        await this.loadSkill(file);
      }
    } catch (e) {
      console.error('Failed to load skills:', e.message);
    }
    return this.skills;
  }

  /**
   * Load a single skill file
   */
  async loadSkill(filename) {
    const filepath = path.join(this.skillsDir, filename);
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const skill = parseSkillFile(content, filename);
      this.skills.set(skill.id, skill);
      return skill;
    } catch (e) {
      console.error(`Failed to load skill ${filename}:`, e.message);
      return null;
    }
  }

  /**
   * Find skills that match a user message
   */
  findMatchingSkills(message) {
    const lower = message.toLowerCase();
    const matches = [];

    for (const [id, skill] of this.skills) {
      // Check triggers
      const triggerMatch = skill.triggers.some(t => 
        lower.includes(t.toLowerCase())
      );
      
      // Check name/description
      const nameMatch = lower.includes(skill.name.toLowerCase()) ||
        lower.includes(id.toLowerCase());

      if (triggerMatch || nameMatch) {
        matches.push(skill);
      }
    }

    return matches;
  }

  /**
   * Create a new skill from a conversation
   */
  async createSkill(name, definition) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const content = `# ${name}

${definition.description || 'A learned skill.'}

## Triggers
${(definition.triggers || []).map(t => `- ${t}`).join('\n') || '- ' + name.toLowerCase()}

## Data Schema
\`\`\`json
${JSON.stringify(definition.dataSchema || { type: 'entries', fields: ['value', 'note'] }, null, 2)}
\`\`\`

## Actions
${(definition.actions || ['log', 'history', 'summary']).map(a => `- ${a}`).join('\n')}

## Examples
- "log ${name.toLowerCase()}: value"
- "show ${name.toLowerCase()} history"
- "${name.toLowerCase()} summary this week"

---
*Learned on ${new Date().toISOString().split('T')[0]}*
`;

    const filepath = path.join(this.skillsDir, `${id}.md`);
    await fs.writeFile(filepath, content);
    return this.loadSkill(`${id}.md`);
  }

  // ==================== DATA PERSISTENCE ====================

  /**
   * Get the data file path for a skill
   */
  getDataPath(skillId) {
    return path.join(this.dataDir, `${skillId}.json`);
  }

  /**
   * Load data for a skill
   */
  async loadData(skillId) {
    if (this.dataCache.has(skillId)) {
      return this.dataCache.get(skillId);
    }

    const filepath = this.getDataPath(skillId);
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const data = JSON.parse(content);
      this.dataCache.set(skillId, data);
      return data;
    } catch {
      // Initialize with empty data structure
      const data = { entries: [], metadata: { created: Date.now() } };
      this.dataCache.set(skillId, data);
      return data;
    }
  }

  /**
   * Save data for a skill (atomic write)
   */
  async saveData(skillId, data) {
    const filepath = this.getDataPath(skillId);
    const tempPath = `${filepath}.${process.pid}.tmp`;

    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.rename(tempPath, filepath);
      this.dataCache.set(skillId, data);
      return true;
    } catch (e) {
      console.error(`Failed to save data for ${skillId}:`, e.message);
      try { await fs.unlink(tempPath); } catch {}
      return false;
    }
  }

  /**
   * Add an entry to a skill's data
   */
  async addEntry(skillId, entry) {
    const data = await this.loadData(skillId);
    const newEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      ...entry
    };
    data.entries.push(newEntry);
    data.metadata.lastUpdated = Date.now();
    await this.saveData(skillId, data);
    return newEntry;
  }

  /**
   * Get entries with optional filtering
   */
  async getEntries(skillId, options = {}) {
    const data = await this.loadData(skillId);
    let entries = [...data.entries];

    // Filter by date range
    if (options.since) {
      const sinceTime = new Date(options.since).getTime();
      entries = entries.filter(e => e.timestamp >= sinceTime);
    }
    if (options.until) {
      const untilTime = new Date(options.until).getTime();
      entries = entries.filter(e => e.timestamp <= untilTime);
    }

    // Filter by date string (YYYY-MM-DD)
    if (options.date) {
      entries = entries.filter(e => e.date === options.date);
    }

    // Sort
    if (options.sort === 'asc') {
      entries.sort((a, b) => a.timestamp - b.timestamp);
    } else {
      entries.sort((a, b) => b.timestamp - a.timestamp);
    }

    // Limit
    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get aggregated stats for numeric data
   */
  async getStats(skillId, field = 'value', options = {}) {
    const entries = await this.getEntries(skillId, options);
    const values = entries
      .map(e => parseFloat(e[field]))
      .filter(v => !isNaN(v));

    if (values.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
    }

    return {
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      first: entries[entries.length - 1],
      last: entries[0]
    };
  }

  /**
   * Get daily/weekly/monthly aggregations
   */
  async getAggregations(skillId, field = 'value', groupBy = 'day') {
    const entries = await this.getEntries(skillId, { sort: 'asc' });
    const groups = new Map();

    for (const entry of entries) {
      const date = new Date(entry.timestamp);
      let key;

      switch (groupBy) {
        case 'day':
          key = entry.date;
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = entry.date.slice(0, 7);
          break;
        default:
          key = entry.date;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(parseFloat(entry[field]) || 0);
    }

    const result = [];
    for (const [period, values] of groups) {
      result.push({
        period,
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      });
    }

    return result;
  }

  /**
   * Get a summary of all skills and their data
   */
  async getSummary() {
    const summary = [];

    for (const [id, skill] of this.skills) {
      const stats = await this.getStats(id);
      summary.push({
        id,
        name: skill.name,
        description: skill.description,
        entryCount: stats.count,
        lastEntry: stats.last?.timestamp 
          ? new Date(stats.last.timestamp).toISOString()
          : null
      });
    }

    return summary;
  }
}

// Default singleton instance
let defaultManager = null;

export async function getSkillManager(options) {
  if (!defaultManager) {
    defaultManager = new SkillManager(options);
    await defaultManager.init();
  }
  return defaultManager;
}

export default SkillManager;
