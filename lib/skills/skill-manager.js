/**
 * Skill Manager - Dynamic skill discovery, loading, and data persistence
 * 
 * Skills stored in ~/.static-rebel/skills/*.md
 * Data stored in ~/.static-rebel/data/*.json
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Use home directory for persistence (works everywhere)
const STATIC_REBEL_DIR = path.join(os.homedir(), '.static-rebel');
const DEFAULT_SKILLS_DIR = path.join(STATIC_REBEL_DIR, 'skills');
const DEFAULT_DATA_DIR = path.join(STATIC_REBEL_DIR, 'data');

/**
 * Parse a skill markdown file into a structured object
 */
function parseSkillFile(content, filename) {
  const skill = {
    id: path.basename(filename, '.md'),
    name: '',
    description: '',
    triggers: [],
    unit: '',
    dailyGoal: null,
    icon: '📊',
    dataSchema: null,
    actions: [],
    examples: [],
    raw: content
  };

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
      if (inSection) {
        saveSection(skill, inSection, sectionContent.join('\n').trim());
      }
      inSection = line.slice(3).trim().toLowerCase();
      sectionContent = [];
      continue;
    }

    // Parse config-style lines (- **key:** value)
    const configMatch = line.match(/^[-*]\s*\*\*(\w+):\*\*\s*(.+)/i);
    if (configMatch) {
      const [, key, value] = configMatch;
      switch (key.toLowerCase()) {
        case 'id': skill.id = value.trim(); break;
        case 'unit': skill.unit = value.trim(); break;
        case 'daily_goal':
        case 'dailygoal':
        case 'goal': skill.dailyGoal = parseFloat(value) || null; break;
        case 'icon': skill.icon = value.trim(); break;
        case 'aliases':
        case 'triggers': skill.triggers = value.split(',').map(t => t.trim().toLowerCase()); break;
      }
      continue;
    }

    if (inSection) {
      sectionContent.push(line);
    } else if (line.trim() && !skill.description) {
      skill.description = line.trim();
    }
  }

  if (inSection) {
    saveSection(skill, inSection, sectionContent.join('\n').trim());
  }

  // Ensure triggers include the skill id and name
  if (!skill.triggers.includes(skill.id)) skill.triggers.push(skill.id);
  if (skill.name && !skill.triggers.includes(skill.name.toLowerCase())) {
    skill.triggers.push(skill.name.toLowerCase());
  }

  return skill;
}

function saveSection(skill, section, content) {
  switch (section) {
    case 'triggers':
    case 'keywords':
    case 'invoke':
    case 'config':
      // Config section - parse each line
      content.split('\n').forEach(line => {
        const match = line.match(/^[-*]\s*\*\*(\w+):\*\*\s*(.+)/i);
        if (match) {
          const [, key, value] = match;
          switch (key.toLowerCase()) {
            case 'id': skill.id = value.trim(); break;
            case 'unit': skill.unit = value.trim(); break;
            case 'daily_goal':
            case 'dailygoal':
            case 'goal': skill.dailyGoal = parseFloat(value) || null; break;
            case 'icon': skill.icon = value.trim(); break;
            case 'aliases':
            case 'triggers': skill.triggers = value.split(',').map(t => t.trim().toLowerCase()); break;
          }
        }
      });
      break;
    case 'data':
    case 'schema':
    case 'data schema':
      try {
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
    this.skillsDir = options.skillsDir || DEFAULT_SKILLS_DIR;
    this.dataDir = options.dataDir || DEFAULT_DATA_DIR;
    this.skills = new Map();
    this.dataCache = new Map();
  }

  async init() {
    await fs.mkdir(this.skillsDir, { recursive: true });
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.loadAllSkills();
    return this;
  }

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

  findMatchingSkills(message) {
    const lower = message.toLowerCase();
    const matches = [];

    for (const [id, skill] of this.skills) {
      const triggerMatch = skill.triggers.some(t => lower.includes(t));
      const nameMatch = lower.includes(skill.name.toLowerCase()) || lower.includes(id);

      if (triggerMatch || nameMatch) {
        matches.push(skill);
      }
    }

    return matches;
  }

  async createSkill(name, definition = {}) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const unit = definition.unit || '';
    const goal = definition.dailyGoal || definition.goal || '';
    const icon = definition.icon || '📊';
    const triggers = definition.triggers || [name.toLowerCase()];

    const content = `# ${name}

${definition.description || `Track ${name.toLowerCase()}.`}

## Config
- **id:** ${id}
- **unit:** ${unit}
- **daily_goal:** ${goal}
- **icon:** ${icon}
- **aliases:** ${triggers.join(', ')}

## Patterns
- "${name.toLowerCase()} {amount}" → amount in ${unit || 'units'}

## Examples
- "log ${name.toLowerCase()}: 5"
- "show ${name.toLowerCase()} history"

---
*Created ${new Date().toISOString().split('T')[0]}*
`;

    const filepath = path.join(this.skillsDir, `${id}.md`);
    await fs.writeFile(filepath, content, 'utf-8');
    
    // Clear cache and reload
    this.skills.delete(id);
    this.dataCache.delete(id);
    
    return this.loadSkill(`${id}.md`);
  }

  // ==================== DATA PERSISTENCE ====================

  getDataPath(skillId) {
    return path.join(this.dataDir, `${skillId}.json`);
  }

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
      const data = { entries: [], metadata: { created: Date.now() } };
      this.dataCache.set(skillId, data);
      return data;
    }
  }

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

  async addEntry(skillId, entry) {
    const data = await this.loadData(skillId);
    const newEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      ...entry
    };
    data.entries.push(newEntry);
    data.metadata.lastUpdated = Date.now();
    await this.saveData(skillId, data);
    return newEntry;
  }

  async getEntries(skillId, options = {}) {
    const data = await this.loadData(skillId);
    let entries = [...data.entries];

    if (options.since) {
      const sinceTime = new Date(options.since).getTime();
      entries = entries.filter(e => e.timestamp >= sinceTime);
    }
    if (options.until) {
      const untilTime = new Date(options.until).getTime();
      entries = entries.filter(e => e.timestamp <= untilTime);
    }
    if (options.date) {
      entries = entries.filter(e => e.date === options.date);
    }

    if (options.sort === 'asc') {
      entries.sort((a, b) => a.timestamp - b.timestamp);
    } else {
      entries.sort((a, b) => b.timestamp - a.timestamp);
    }

    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

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

  async getTodayStats(skillId, field = 'value') {
    const today = new Date().toISOString().split('T')[0];
    return this.getStats(skillId, field, { date: today });
  }

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

  async getSummary() {
    const summary = [];

    for (const [id, skill] of this.skills) {
      const stats = await this.getStats(id);
      const todayStats = await this.getTodayStats(id);
      
      summary.push({
        id,
        name: skill.name,
        description: skill.description,
        icon: skill.icon,
        unit: skill.unit,
        dailyGoal: skill.dailyGoal,
        entryCount: stats.count,
        todaySum: todayStats.sum,
        todayCount: todayStats.count,
        lastEntry: stats.last?.timestamp 
          ? new Date(stats.last.timestamp).toISOString()
          : null
      });
    }

    return summary;
  }

  // Get all skills as array
  getAllSkills() {
    return Array.from(this.skills.values());
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

// Reset singleton (useful for tests)
export function resetSkillManager() {
  defaultManager = null;
}

export default SkillManager;
