// Memory Manager - Daily + Long-term memory architecture
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, resolvePath, getConfig } from './configManager.js';

const MEMORY_DIR = path.join(os.homedir(), '.static-rebel', 'memory');
const DAILY_DIR = path.join(MEMORY_DIR, 'daily');
const LONG_TERM_FILE = path.join(MEMORY_DIR, 'long-term.md');
const HEARTBEAT_STATE_FILE = path.join(MEMORY_DIR, 'heartbeat-state.json');

export function getMemoryPaths() {
  return {
    dailyDir: DAILY_DIR,
    longTermFile: LONG_TERM_FILE,
    heartbeatState: HEARTBEAT_STATE_FILE,
  };
}

// Initialize memory directories
export function initMemory() {
  const dirs = [MEMORY_DIR, DAILY_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Create long-term memory if doesn't exist
  if (!fs.existsSync(LONG_TERM_FILE)) {
    fs.writeFileSync(
      LONG_TERM_FILE,
      `# Long-Term Memory

*Last curated: ${new Date().toLocaleDateString()}*

## Important Context

- User preferences and communication style
- Significant projects and goals
- Lessons learned and patterns
- Personal details worth remembering

## Running Notes

-

## Curated Memories

### Skills & Tools
-

### Preferences
-

### Important Dates
-

### Lessons Learned
-

`,
    );
  }

  // Create heartbeat state if doesn't exist
  if (!fs.existsSync(HEARTBEAT_STATE_FILE)) {
    fs.writeFileSync(
      HEARTBEAT_STATE_FILE,
      JSON.stringify(
        {
          lastChecks: {
            email: null,
            calendar: null,
            mentions: null,
            weather: null,
          },
          lastHeartbeat: null,
        },
        null,
        2,
      ),
    );
  }
}

// Get today's daily memory file
export function getTodayMemoryFile() {
  const today = new Date().toISOString().split('T')[0];
  return path.join(DAILY_DIR, `${today}.md`);
}

// Read daily memory
export function readDailyMemory(date = null) {
  const file = date ? path.join(DAILY_DIR, `${date}.md`) : getTodayMemoryFile();
  try {
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf-8');
    }
  } catch (e) {}
  return '';
}

// Write to daily memory (async - non-blocking)
export async function writeDailyMemory(content, append = true) {
  const file = getTodayMemoryFile();
  try {
    if (append) {
      // Check if file exists asynchronously
      try {
        await fsPromises.access(file);
        await fsPromises.appendFile(file, content + '\n');
      } catch {
        // File doesn't exist, create it
        await fsPromises.writeFile(file, content + '\n');
      }
    } else {
      await fsPromises.writeFile(file, content + '\n');
    }
    return true;
  } catch (e) {
    console.error('Failed to write daily memory:', e.message);
    return false;
  }
}

// Write to daily memory (sync version for backward compatibility)
export function writeDailyMemorySync(content, append = true) {
  const file = getTodayMemoryFile();
  try {
    if (append && fs.existsSync(file)) {
      fs.appendFileSync(file, content + '\n');
    } else {
      fs.writeFileSync(file, content + '\n');
    }
    return true;
  } catch (e) {
    console.error('Failed to write daily memory:', e.message);
    return false;
  }
}

// Read long-term memory
export function readLongTermMemory() {
  try {
    if (fs.existsSync(LONG_TERM_FILE)) {
      return fs.readFileSync(LONG_TERM_FILE, 'utf-8');
    }
  } catch (e) {}
  return '';
}

// Write to long-term memory
export function writeLongTermMemory(content, section = null) {
  try {
    let existing = '';
    if (fs.existsSync(LONG_TERM_FILE)) {
      existing = fs.readFileSync(LONG_TERM_FILE, 'utf-8');
    }

    if (section) {
      // Update specific section
      const sectionRegex = new RegExp(
        `### ${section}[\\s\\S]*?(?=### |$)`,
        'i',
      );
      const replacement = `### ${section}\n\n${content}`;
      existing = existing.replace(sectionRegex, replacement);
      fs.writeFileSync(LONG_TERM_FILE, existing);
    } else {
      fs.writeFileSync(LONG_TERM_FILE, content);
    }
    return true;
  } catch (e) {
    console.error('Failed to write long-term memory:', e.message);
    return false;
  }
}

// Get recent daily memories (last N days)
export function getRecentDailyMemories(days = 3) {
  const memories = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const file = path.join(DAILY_DIR, `${dateStr}.md`);

    if (fs.existsSync(file)) {
      memories.push({
        date: dateStr,
        content: fs.readFileSync(file, 'utf-8'),
      });
    }
  }

  return memories;
}

// Curate daily memories into long-term
export function curateMemory() {
  const recent = getRecentDailyMemories(7);
  if (recent.length === 0) return;

  // This would typically use AI to extract key insights
  const summary = recent
    .map((r) => `## ${r.date}\n${r.content}`)
    .join('\n\n---\n\n');
  writeDailyMemory(
    `\n### Memory Curation: ${new Date().toLocaleDateString()}\nExtracted ${recent.length} days of memories for potential long-term storage.`,
  );

  return summary;
}

// Heartbeat state management
export function getHeartbeatState() {
  try {
    if (fs.existsSync(HEARTBEAT_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(HEARTBEAT_STATE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { lastChecks: {}, lastHeartbeat: null };
}

export function updateHeartbeatState(updates) {
  const state = getHeartbeatState();
  Object.assign(state, updates);
  try {
    fs.writeFileSync(HEARTBEAT_STATE_FILE, JSON.stringify(state, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

// Memory statistics
export function getMemoryStats() {
  const stats = {
    dailyFiles: 0,
    dailySize: 0,
    longTermSize: 0,
    oldestMemory: null,
    newestMemory: null,
  };

  try {
    const dailyFiles = fs
      .readdirSync(DAILY_DIR)
      .filter((f) => f.endsWith('.md'));
    stats.dailyFiles = dailyFiles.length;

    for (const file of dailyFiles) {
      const filePath = path.join(DAILY_DIR, file);
      const stat = fs.statSync(filePath);
      stats.dailySize += stat.size;
      if (!stats.oldestMemory || stat.birthtime < stats.oldestMemory) {
        stats.oldestMemory = file.replace('.md', '');
      }
      if (!stats.newestMemory || stat.birthtime > stats.newestMemory) {
        stats.newestMemory = file.replace('.md', '');
      }
    }
  } catch (e) {}

  try {
    if (fs.existsSync(LONG_TERM_FILE)) {
      stats.longTermSize = fs.statSync(LONG_TERM_FILE).size;
    }
  } catch (e) {}

  return stats;
}

// Load all memory for session
export function loadSessionMemory() {
  const today = new Date().toISOString().split('T')[0];
  return {
    today: readDailyMemory(today),
    yesterday: readDailyMemory(
      new Date(Date.now() - 86400000).toISOString().split('T')[0],
    ),
    longTerm: readLongTermMemory(),
    recent: getRecentDailyMemories(3),
  };
}
