#!/usr/bin/env node

/**
 * Charlize - Ollama AI Assistant v2.0
 * A sophisticated, elegant AI assistant with local Ollama models
 *
 * Features:
 * - Modular architecture with sub-agents
 * - Daily + long-term memory system
 * - Heartbeat monitoring & cron scheduling
 * - Task delegation to specialized agents
 * - Skills package system
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import http from 'http';
import https from 'https';
import os from 'os';
import { spawn } from 'child_process';

// Unified chat handler
import { handleChat, initChatHandler } from './lib/chatHandler.js';

// Core modules (NEW)
import {
  loadConfig,
  getConfig,
  saveConfig,
  resolvePath,
  clearConfigCache,
} from './lib/configManager.js';
import {
  initMemory,
  loadSessionMemory,
  writeDailyMemory,
  getMemoryStats,
  readLongTermMemory,
} from './lib/memoryManager.js';
import {
  listAvailableModels,
  getModelForTask,
  detectTaskType,
  chatCompletion,
  getDefaultModel,
  createEmbeddings,
} from './lib/modelRegistry.js';
import {
  startScheduler,
  listCronJobs,
  addCronJob,
  describeCron,
  getNextRunTime,
  toggleCronJob,
  deleteCronJob,
  getSchedulerStatus,
} from './lib/cronScheduler.js';
import {
  startHeartbeatMonitor,
  getHeartbeatStatus,
  performAllScheduledChecks,
  isQuietHours,
} from './lib/heartbeatManager.js';
import {
  listSubagents,
  createCodingSubagent,
  createAnalysisSubagent,
  sendToSubagent,
  getSubagentStats,
} from './lib/subagentManager.js';
import {
  listSkills,
  checkTriggers,
  createSkill,
  getSkillsStats,
} from './lib/skillsManager.js';
import {
  askYesNo,
  numberedSelect,
  multiSelect,
  checkRiskyAction,
  checkNeedsClarification,
} from './prompt.js';
import {
  isQuestionAnswer,
  processAnswer,
  startQuestionFlow,
  createYesNoQuestion,
  createConfirmQuestion,
  getState,
  clearState,
} from './lib/followUpManager.js';
import { log as logToFile } from './lib/logManager.js';

// Agent modules (NEW)
import {
  loadPersona,
  buildSystemPrompt,
  sendMessage,
  handleCommand,
  getSessionContext,
  clearSession,
  startSession,
} from './agents/main/agent.js';
import {
  runCommand as runCodingCommand,
  readFile,
  executeChange,
} from './agents/coding/agent.js';

// Tracker & Companion (existing)
import {
  TrackerStore,
  VisionAnalyzer,
  QueryEngine,
  parseTrackerFromNaturalLanguage,
  parseRecordFromText,
  runTrackerWizard,
  confirmOrCustomizeTracker,
  PersonaChat,
  matchesAutoDetect,
} from './tracker.js';
import {
  showCompanion,
  setState,
  reactToEvent,
  setStats,
  toggleStats,
  getAvailableCompanions,
  setCompanion,
  showCompanionUI,
  toggleVisibility,
  startAnimation,
  stopAnimation,
} from './companion.js';

// ============================================================================
// Configuration
// ============================================================================

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const VISION_MODEL = process.env.VISION_MODEL || 'llava';
const MEMORY_FILE = path.join(os.homedir(), '.static-rebel', 'memory', 'daily');
const PROFILE_FILE =
  process.env.PROFILE_FILE ||
  path.join(os.homedir(), '.static-rebel-profile.md');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '30000');
const VERBOSE = process.env.VERBOSE === 'true';
const SKILLS_DIR = path.join(os.homedir(), '.static-rebel', 'skills');
const WORKSPACES_DIR = path.join(os.homedir(), '.static-rebel', 'workspaces');
const TRACKERS_DIR = path.join(os.homedir(), '.static-rebel', 'trackers');
const CONFIG_DIR = path.join(os.homedir(), '.static-rebel', 'config');

// Persona: Charlize (inspired by the actress - sophisticated, elegant, witty)
const BASE_SYSTEM_PROMPT = `You are Charlize—a sophisticated, elegant AI assistant with dry wit and grounded wisdom.

## Core Traits
- Named after Charlize Theron: elegant, capable, with a sharp mind
- Concise, no fluff
- Direct and practical
- Witty but never dismissive
- Calm under pressure

## How You Help
- Solve problems efficiently
- Ask clarifying questions when needed
- Give honest assessments, not empty validation
- Break complex tasks into manageable steps

## Style
- Professional but warm
- Use humor sparingly, when it lands
- Get to the point

## Critical Rules
- When web search results are provided, use them to answer the question
- If search results don't contain relevant information, say "I couldn't find information about that in my search"
- Never fabricate articles, titles, dates, or facts not present in search results

You are a partner, not a sycophant. Be helpful, be real.`;

// ============================================================================
// Profile System
// ============================================================================

const PROFILE_TEMPLATE = `# User Profile

*Last updated: {date}*

## Basics
- **Name:** {name}
- **Role:** {role}
- **Location:** {location}

## Preferences
- **Communication style:** {communication_style}
- **Preferred tools/technologies:** {tools}
- **Work hours:** {work_hours}

## Current Context
{context}

## Goals & Projects
{goals}

## Notes
{notes}
`;

const ONBOARDING_QUESTIONS = [
  {
    key: 'name',
    prompt: "Hi! I'm Charlize. What's your name?",
    default: 'Friend',
  },
  {
    key: 'role',
    prompt: 'Nice to meet you, {name}. What do you do for work?',
    default: 'Developer',
  },
  { key: 'location', prompt: 'Where are you based?', default: 'Somewhere' },
  {
    key: 'communication_style',
    prompt:
      'How do you prefer to communicate? (brief & direct / detailed & thorough)',
    default: 'brief',
  },
  {
    key: 'tools',
    prompt: 'What tools or technologies do you use most?',
    default: 'Various',
  },
  {
    key: 'work_hours',
    prompt: 'What are your typical work hours?',
    default: '9-5',
  },
  {
    key: 'goals',
    prompt: 'What are you working on right now? Any big goals?',
    default: 'Just exploring',
  },
];

function loadProfile() {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      return fs.readFileSync(PROFILE_FILE, 'utf-8');
    }
  } catch (e) {}
  return null;
}

function saveProfile(data) {
  try {
    const dir = path.dirname(PROFILE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PROFILE_FILE, data);
    return true;
  } catch (e) {
    console.error('Failed to save profile:', e.message);
    return false;
  }
}

async function buildProfile(rl) {
  console.clear();
  console.log('='.repeat(50));
  console.log('  Charlize - Initial Setup');
  console.log('='.repeat(50));
  console.log('  Let me get to know you a bit...\n');

  const answers = {};

  for (const q of ONBOARDING_QUESTIONS) {
    const question = q.prompt.replace(`{${q.key}}`, answers.name || q.default);
    const answer = await new Promise((resolve) => {
      rl.question(`  ${question}: `, resolve);
    });
    answers[q.key] = answer.trim() || q.default;
  }

  const profile = PROFILE_TEMPLATE.replace(
    '{date}',
    new Date().toLocaleDateString(),
  )
    .replace('{name}', answers.name)
    .replace('{role}', answers.role)
    .replace('{location}', answers.location)
    .replace('{communication_style}', answers.communication_style)
    .replace('{tools}', answers.tools)
    .replace('{work_hours}', answers.work_hours)
    .replace('{context}', `Just set up Charlize as their AI assistant`)
    .replace('{goals}', answers.goals)
    .replace('{notes}', '');

  saveProfile(profile);

  console.log('\n  Profile saved!\n');
  return profile;
}

async function getSystemPrompt() {
  const profile = loadProfile();
  let prompt = BASE_SYSTEM_PROMPT;

  if (profile) {
    prompt += `\n\n## About the User
${profile}

Use this context to personalize your responses. Address them by name when appropriate.`;
  }

  return prompt;
}

// ============================================================================
// Model Registry & Auto-Selection
// ============================================================================

const MODELS = {
  coding: ['qwen3-coder', 'qwen2.5-coder', 'deepseek-coder', 'llama3.2'],
  analysis: ['deepseek-r1', 'qwen2.5', 'mistral', 'llama3.2'],
  creative: ['qwen2.5', 'llama3.2', 'llama3.1'],
  general: ['llama3.2', 'qwen2.5', 'mistral'],
};

// Task patterns that indicate delegation is needed
const DELEGATION_PATTERNS = [
  {
    pattern:
      /\b(write|create|build|make|implement|develop)\s+(a\s+)?(function|class|module|api|component|script|程序|函数|类)\b/i,
    type: 'coding',
    confidence: 0.9,
  },
  {
    pattern: /\b(code|debug|fix|refactor|review)\s+(this|the|my)?\b/i,
    type: 'coding',
    confidence: 0.9,
  },
  {
    pattern:
      /\b(analyze|compare|evaluate|assess)\s+(code|system|architecture|design|这个|代码|系统)\b/i,
    type: 'analysis',
    confidence: 0.85,
  },
  {
    pattern:
      /\b(explain|understand|think through)\s+(how|why|what|为什么|如何)\b/i,
    type: 'analysis',
    confidence: 0.7,
  },
  {
    pattern:
      /\b(create|write)\s+(a\s+)?(story|poem|article|blog|content|脚本|文章)\b/i,
    type: 'creative',
    confidence: 0.8,
  },
  {
    pattern:
      /\b[📝🔧💻⚡🚀✨🔥⭐🎯📌🔍🎨🔐💡📚🤖💭📖📋✅❓🔎📈📊💬🎭📜🔑🎓📝🔖📕📗📘📙📔📒📑🔖]/,
    type: 'coding',
    confidence: 0.6,
  },
];

// When to NOT delegate
const NO_DELEGATION_PATTERNS = [
  /^(hi|hey|hello|yo|what'?s up|how are|how'?s it|good morning|good afternoon|good evening)/i,
  /^(thanks|thank you|cheers|appreciate)/i,
  /^(what can|what do|can you|do you|would you)/i,
  /^(who are|what are|tell me about)/i,
  /^(set|remember|recall|help me|show me)/i,
];

function shouldDelegate(message) {
  // Check for no-delegation patterns
  for (const pattern of NO_DELEGATION_PATTERNS) {
    if (pattern.test(message.trim())) {
      return { delegate: false, reason: ' conversational' };
    }
  }

  // Check for delegation patterns
  let bestMatch = null;
  let highestConfidence = 0;

  for (const { pattern, type, confidence } of DELEGATION_PATTERNS) {
    if (pattern.test(message) && confidence > highestConfidence) {
      bestMatch = type;
      highestConfidence = confidence;
    }
  }

  if (bestMatch) {
    return { delegate: true, type: bestMatch, confidence: highestConfidence };
  }

  return { delegate: false, reason: ' general query' };
}

async function selectBestModel(taskType, availableModels) {
  const preferences = MODELS[taskType] || MODELS.general;

  for (const model of preferences) {
    if (availableModels.includes(model)) {
      return model;
    }
  }

  return availableModels[0] || 'llama3.2';
}

// ============================================================================
// Claude Code Subagent Integration
// ============================================================================

const CLAUDE_SUBAGENT_BIN = path.join(process.cwd(), 'claude-subagent.js');

async function runClaudeSubagent(task, workspace = null, options = {}) {
  const workspaceDir = workspace || process.cwd();
  const wsName = path.basename(workspaceDir);

  return new Promise(async (resolve, reject) => {
    try {
      // Import the claude subagent module
      // Use eval to prevent webpack from parsing the dynamic import
      const loadModule = eval('(async (p) => { const m = await import("file://" + p); return m; })');
      const mod = await loadModule(CLAUDE_SUBAGENT_BIN);
      const { claudeInDir } = mod;

      console.log(`\n  [Claude Code in: ${workspaceDir}]`);

      const onChunk = options.stream
        ? (chunk) => {
            process.stdout.write(chunk);
          }
        : null;

      const result = await claudeInDir(workspaceDir, task, {
        model: options.model || 'claude',
        stream: options.stream !== false,
        onOutput: onChunk,
      });

      resolve({ output: result, workspace: wsName });
    } catch (err) {
      if (err.message.includes('Ollama')) {
        console.log(`\n  To use the coding subagent:`);
        console.log(`  Install Ollama: https://ollama.com\n`);
      }
      reject(err);
    }
  });
}

// ============================================================================
// Ollama Subagent Runner (fallback when Claude Code not available)
// ============================================================================

async function runOllamaSubagent(task, model, systemPrompt, workspace = null) {
  const workspaceDir = workspace || path.join(WORKSPACES_DIR, 'default');
  const wsName = path.basename(workspaceDir);

  // Ensure workspace exists
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    // Subagent script that can read/write files in its workspace
    const script = `
import http from 'http';
import fs from 'fs';
import path from 'path';

const OLLAMA_HOST = '${OLLAMA_HOST}';
const MODEL = '${model}';
const WORKSPACE = ${JSON.stringify(workspaceDir)};
const TASK = ${JSON.stringify(task)};
const SYSTEM_PROMPT = ${JSON.stringify(systemPrompt)};

// File operations for the agent
function writeFile(relativePath, content) {
  const fullPath = path.join(WORKSPACE, relativePath);
  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
    return { success: true, path: fullPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function readFile(relativePath) {
  const fullPath = path.join(WORKSPACE, relativePath);
  try {
    return { success: true, content: fs.readFileSync(fullPath, 'utf-8') };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function listFiles(dir = '.') {
  const fullPath = path.join(WORKSPACE, dir);
  try {
    if (!fs.existsSync(fullPath)) return { success: false, error: 'Directory not found' };
    const files = fs.readdirSync(fullPath).map(f => {
      const full = path.join(fullPath, f);
      const stat = fs.statSync(full);
      return { name: f, isDir: stat.isDirectory(), size: stat.size };
    });
    return { success: true, files };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function runCommand(cmd) {
  return new Promise((resolve) => {
    const proc = require('child_process').spawn(cmd, {
      cwd: WORKSPACE,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', code => resolve({ code, stdout: out, stderr: err }));
  });
}

// Task includes workspace context
const messages = [
  { role: 'system', content: SYSTEM_PROMPT + '\\n\\n[WORKSPACE: ' + WORKSPACE + ']\\nYou can use: writeFile(path, content), readFile(path), listFiles(dir), runCommand(cmd). Report file changes clearly.' },
  { role: 'user', content: TASK + '\\n\\nWork in: ' + WORKSPACE }
];

const data = JSON.stringify({ model: MODEL, messages, stream: false });

const req = http.request({
  hostname: new URL(OLLAMA_HOST).hostname,
  port: new URL(OLLAMA_HOST).port || 11434,
  path: '/api/chat',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const response = JSON.parse(body);
      console.log(response.message?.content || 'No response');
    } catch (e) {
      console.error('Error:', e.message);
    }
  });
});

req.onerror = () => console.error('Request failed');
req.write(data);
req.end();
`;

    const proc = spawn('node', ['-e', script], {
      cwd: workspaceDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr));
      } else {
        resolve({ output: stdout.trim(), workspace: wsName });
      }
    });

    proc.on('error', reject);
  });
}

// Workspace management
function listWorkspaces() {
  try {
    if (!fs.existsSync(WORKSPACES_DIR)) return [];
    return fs.readdirSync(WORKSPACES_DIR).filter((w) => {
      const full = path.join(WORKSPACES_DIR, w);
      return fs.statSync(full).isDirectory();
    });
  } catch (e) {
    return [];
  }
}

function getWorkspacePath(name) {
  if (name.startsWith('/') || name.startsWith('~')) {
    return path.resolve(name.replace('~', os.homedir()));
  }
  return path.join(WORKSPACES_DIR, name);
}

// ============================================================================
// Memory System with Embeddings
// ============================================================================

class MemoryStore {
  constructor(filePath = MEMORY_FILE) {
    this.filePath = filePath;
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.error('Failed to load memory:', e.message);
    }
    return { memories: [] };
  }

  async save(data) {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (e) {
      console.error('Failed to save memory:', e.message);
      return false;
    }
  }

  async getEmbedding(text) {
    return new Promise((resolve) => {
      const data = JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text,
      });

      const req = http.request(
        {
          hostname: new URL(OLLAMA_HOST).hostname,
          port: new URL(OLLAMA_HOST).port || 11434,
          path: '/api/embeddings',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const response = JSON.parse(body);
              resolve(response.embedding || null);
            } catch {
              resolve(null);
            }
          });
        },
      );

      req.onerror = () => resolve(null);
      req.write(data);
      req.end();
    });
  }

  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0,
      magA = 0,
      magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
  }

  async add(text, category = 'general') {
    const data = this.load();

    const timestamp = Date.now();
    const dateStr = new Date(timestamp).toISOString().split('T')[0]; // "2026-01-27"
    const readableDate = new Date(timestamp).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }); // "Mon, Jan 27, 2026"

    // Include date in the embedded text so queries can find by date
    const textWithDate = `${text} [Date: ${dateStr} | ${readableDate}]`;

    // Get embedding (with fallback)
    let embedding = null;
    try {
      embedding = await this.getEmbedding(textWithDate);
    } catch (e) {
      if (VERBOSE)
        console.log(`  [Memory: embedding failed, storing without vector]\n`);
    }

    const memory = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      text: text.trim(), // Original text without date
      textWithDate, // Text with date for embedding
      category,
      embedding,
      createdAt: timestamp,
      dateStr,
    };

    data.memories.push(memory);
    await this.save(data);

    return data.memories.length;
  }

  async search(query, limit = 5) {
    const data = this.load();
    if (data.memories.length === 0) return [];

    // Detect date references in query
    const now = new Date();
    let dateContext = '';

    // Look for relative date references
    if (/\b(today|now|currently)\b/i.test(query)) {
      dateContext = `[Current date: ${now.toISOString().split('T')[0]}]`;
    } else if (/\b(yesterday)\b/i.test(query)) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      dateContext = `[Query date: ${yesterday.toISOString().split('T')[0]}]`;
    } else if (/\b(last week|recently)\b/i.test(query)) {
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);
      dateContext = `[Query date range: ${lastWeek.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}]`;
    } else if (/\b(last month)\b/i.test(query)) {
      const lastMonth = new Date(now);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      dateContext = `[Query date range: ${lastMonth.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}]`;
    }

    // Include date context in embedding
    const queryWithContext = dateContext ? `${query} ${dateContext}` : query;
    const queryEmbedding = await this.getEmbedding(queryWithContext);
    if (!queryEmbedding) {
      // Fallback to simple text match
      return this.simpleSearch(data.memories, query, limit);
    }

    const results = data.memories
      .filter((m) => m.embedding)
      .map((m) => ({
        ...m,
        score: this.cosineSimilarity(queryEmbedding, m.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // If no good vector matches, try simple search
    if (results.length === 0 || results[0].score < 0.3) {
      return this.simpleSearch(data.memories, query, limit);
    }

    return results.filter((r) => r.score > 0.3);
  }

  simpleSearch(memories, query, limit) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    // Check for date patterns in query
    const datePatternMatch = queryLower.match(
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i,
    );
    const hasDateQuery = datePatternMatch !== null;

    return memories
      .map((m) => {
        const memLower = m.text.toLowerCase();
        const memDate = (m.dateStr || '').toLowerCase();

        // Exact phrase match
        if (memLower.includes(queryLower)) return { ...m, score: 0.9 };

        // Date-specific match
        if (hasDateQuery && memDate.includes(datePatternMatch[0])) {
          return { ...m, score: 0.95 };
        }

        // Word overlap
        const memWords = memLower.split(/\s+/).filter((w) => w.length > 2);
        const overlap = queryWords.filter((w) => memWords.includes(w)).length;
        const score = overlap / Math.max(queryWords.length, memWords.length);
        return { ...m, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter((r) => r.score > 0.1);
  }

  delete(id) {
    const data = this.load();
    const idx = data.memories.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    data.memories.splice(idx, 1);
    this.save(data);
    return true;
  }

  list() {
    const data = this.load();
    return data.memories.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  }

  async clear() {
    this.save({ memories: [] });
  }
}

const memory = new MemoryStore();

// ============================================================================
// Browser Automation (via CDP - reuses ClawdBot's Chrome profile)
// ============================================================================

const CDP_PORT = process.env.CDP_PORT || '18800';
const CDP_URL = `ws://127.0.0.1:${CDP_PORT}`;

async function cdpCommand(method, params = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: CDP_PORT,
        path: '/json/protocol',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          // Try to use CDP WebSocket
          cdpWsRequest(method, params).then(resolve).catch(reject);
        });
      },
    );
    req.onerror = () => reject(new Error('CDP not available'));
    req.end();
  });
}

async function cdpWsRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://127.0.0.1:${CDP_PORT}/`;
    const ws = require('ws');
    const wsClient = new ws(wsUrl, 'chrome-devtools');

    let response = null;
    let timeout = setTimeout(() => {
      wsClient.close();
      reject(new Error('CDP timeout'));
    }, 10000);

    wsClient.on('open', () => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      wsClient.send(JSON.stringify({ id, method, params }));
    });

    wsClient.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id) {
          clearTimeout(timeout);
          if (msg.result) {
            resolve(msg.result);
          } else if (msg.error) {
            reject(new Error(msg.error.message || 'CDP error'));
          }
        }
      } catch (e) {}
    });

    wsClient.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

async function browserNavigate(url) {
  try {
    // First get the target ID
    const targetsReq = http.request(
      {
        hostname: '127.0.0.1',
        port: CDP_PORT,
        path: '/json',
        method: 'GET',
        timeout: 3000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const targets = JSON.parse(body);
            const target = targets.find((t) => t.type === 'page');
            if (target) {
              // Navigate to URL using the target's webSocketDebuggerUrl
              const wsUrl = target.webSocketDebuggerUrl;
              browserWsCommand(wsUrl, 'Page.navigate', { url });
            }
          } catch (e) {}
        });
      },
    );
    targetsReq.onerror = () => {};
    targetsReq.end();
    return true;
  } catch (e) {
    return false;
  }
}

async function browserWsCommand(wsUrl, method, params = {}) {
  return new Promise((resolve) => {
    try {
      const WebSocket = require('ws');
      const ws = new WebSocket(wsUrl, 'chrome-devtools');

      const timeout = setTimeout(() => {
        ws.close();
        resolve({ error: 'timeout' });
      }, 15000);

      ws.on('open', () => {
        const id = Date.now().toString();
        ws.send(JSON.stringify({ id, method, params }));
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id) {
            clearTimeout(timeout);
            ws.close();
            resolve(msg.result || {});
          }
        } catch (e) {}
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        resolve({ error: 'ws error' });
      });
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

async function browserGetPageContent() {
  return new Promise((resolve) => {
    http
      .get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const targets = JSON.parse(body);
            const target = targets.find((t) => t.type === 'page');
            if (target && target.url) {
              // Get page content via CDP
              const wsUrl = target.webSocketDebuggerUrl;
              browserWsCommand(wsUrl, 'DOM.getDocument', { depth: -1 }).then(
                (domResult) => {
                  browserWsCommand(wsUrl, 'Runtime.evaluate', {
                    expression: 'document.body.innerText.slice(0, 5000)',
                  }).then((textResult) => {
                    resolve({
                      url: target.url,
                      title: target.title,
                      text: textResult.result?.value || '',
                    });
                  });
                },
              );
            } else {
              resolve({ url: 'about:blank', text: '' });
            }
          } catch (e) {
            resolve({ error: e.message });
          }
        });
      })
      .on('error', () => {
        resolve({ error: 'CDP not available' });
      });
  });
}

async function browserScreenshot() {
  return new Promise((resolve) => {
    http
      .get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const targets = JSON.parse(body);
            const target = targets.find((t) => t.type === 'page');
            if (target) {
              const wsUrl = target.webSocketDebuggerUrl;
              browserWsCommand(wsUrl, 'Page.captureScreenshot', {
                format: 'png',
              }).then((result) => {
                resolve(result.data || null);
              });
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      })
      .on('error', () => {
        resolve(null);
      });
  });
}

async function browserSearchTwitter(query) {
  const url = `https://twitter.com/search?q=${encodeURIComponent(query)}&f=live`;
  await browserNavigate(url);
  // Wait for page to load
  await new Promise((r) => setTimeout(r, 3000));
  return browserGetPageContent();
}

// ============================================================================
// Utility Functions
// ============================================================================

// Clean control characters from JSON string to prevent parse errors
function cleanJsonString(str) {
  if (!str) return str;
  // Remove control characters except for newlines, tabs, and carriage returns within strings
  // This is a simplified approach - we preserve \n and \t that are properly escaped
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

// Safely parse JSON with error handling
function safeJsonParse(str, fallback = null) {
  try {
    const cleaned = cleanJsonString(str);
    return JSON.parse(cleaned);
  } catch (e) {
    console.error(`JSON parse error: ${e.message}`);
    return fallback;
  }
}

// ============================================================================
// Web Search
// ============================================================================

async function webSearch(query, limit = 5) {
  // Web search temporarily disabled - requires API configuration
  console.log('🔍 Web search is temporarily disabled.');
  console.log(
    'To enable, configure TAVILY_API_KEY or SEARXNG_URL in your .env file',
  );
  return [];

  /* Original DuckDuckGo implementation disabled
  return new Promise((resolve) => {
    // Use DuckDuckGo HTML search
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://duckduckgo.com/html/?q=${encodedQuery}&kl=us-en`;

    const req = http.request(
      {
        hostname: 'duckduckgo.com',
        port: 443,
        path: `/html/?q=${encodedQuery}&kl=us-en`,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      },
      (res) => {
        // Handle HTTP error status codes
        if (res.statusCode !== 200) {
          console.error(`Web search HTTP error: ${res.statusCode}`);
          return resolve([]);
        }

        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('error', (err) => {
          console.error(`Web search read error: ${err.message}`);
          resolve([]);
        });
        res.on('end', () => {
          try {
            // Parse DuckDuckGo HTML results
            const results = [];
            // Updated regex for DuckDuckGo HTML results
            const linkRegex =
              /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
            const snippetRegex =
              /<a[^>]+class="[^"]*result__a[^"]*"[^>]+>.*?<\/a>[\s\S]*?<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)</g;

            let match;
            let lastIndex = 0;

            // Use a more robust parsing approach
            while (
              (match = linkRegex.exec(body)) !== null &&
              results.length < limit
            ) {
              const url = match[1];
              // Decode HTML entities in title
              const title = match[2]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&apos;/g, "'")
                .replace(/<[^>]+>/g, '')
                .trim();

              // Find snippet after this link
              const snippetMatch = body
                .substring(match.index)
                .match(snippetRegex);
              let snippet = '';
              if (snippetMatch) {
                snippet = snippetMatch[1]
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#039;/g, "'")
                  .replace(/&apos;/g, "'")
                  .replace(/<[^>]+>/g, '')
                  .trim();
              }

              // Validate result
              if (
                url &&
                title &&
                !url.includes('duckduckgo') &&
                url.startsWith('http')
              ) {
                results.push({ title, url, snippet });
              }
            }

            resolve(results);
          } catch (e) {
            console.error(`Web search parse error: ${e.message}`);
            resolve([]);
          }
        });
      },
    );

    req.onerror = () => {
      console.error('Web search request failed');
      resolve([]);
    };
    req.setTimeout(15000, () => {
      console.error('Web search timed out');
      req.destroy();
      resolve([]);
    });
    req.end();
  });
  */
}

async function webFetch(url) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const req = protocol.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          // Extract text content (simple approach)
          const text = body
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          resolve(text.substring(0, 3000)); // Limit to 3k chars
        });
      },
    );

    req.onerror = () => resolve('');
    req.setTimeout(10000, () => {
      req.destroy();
      resolve('');
    });
    req.end();
  });
}

// ============================================================================
// Command Runner
// ============================================================================

// Commands that run without confirmation
const SAFE_COMMANDS = [
  'git status',
  'git diff',
  'git log',
  'git branch',
  'git show',
  'npm test',
  'npm run',
  'npm list',
  'npm outdated',
  'npm ls',
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'pwd',
  'cd',
  'node -v',
  'npm -v',
  'git --version',
  'python --version',
  'git remote -v',
  'git stash list',
  'git tag',
  'git describe',
];

// Commands that need confirmation
const DANGEROUS_COMMANDS = [
  { cmd: 'rm', patterns: [/^rm\s+/], danger: 'delete files' },
  { cmd: 'rmdir', patterns: [/^rmdir\s+/], danger: 'delete directories' },
  {
    cmd: 'git reset',
    patterns: [/^git reset\s+--hard/, /^git reset\s+--mixed/],
    danger: 'reset changes',
  },
  {
    cmd: 'git checkout',
    patterns: [/^git checkout\s+-\.\s*/, /^git checkout\s+[^-]/],
    danger: 'discard local changes',
  },
  {
    cmd: 'git push',
    patterns: [/^git push\s+(-f|--force)/],
    danger: 'force push',
  },
  {
    cmd: 'git clean',
    patterns: [/^git clean\s+/],
    danger: 'remove untracked files',
  },
  {
    cmd: 'chmod',
    patterns: [/^chmod\s+[0-7][0-7][0-7]/],
    danger: 'change file permissions',
  },
];

function isSafeCommand(fullCmd) {
  const baseCmd = fullCmd.trim().split(/\s+/)[0];
  return SAFE_COMMANDS.some((safe) => {
    if (safe.includes(' ')) return fullCmd.trim().startsWith(safe);
    return baseCmd === safe;
  });
}

function isDangerousCommand(fullCmd) {
  const baseCmd = fullCmd.trim().split(/\s+/)[0];
  return DANGEROUS_COMMANDS.some((d) => {
    if (d.cmd !== baseCmd) return false;
    return d.patterns.some((p) => p.test(fullCmd));
  });
}

function getDangerWarning(fullCmd) {
  const baseCmd = fullCmd.trim().split(/\s+/)[0];
  const danger = DANGEROUS_COMMANDS.find((d) => d.cmd === baseCmd);
  return danger ? danger.danger : 'potentially destructive operation';
}

function runCommand(cmd, projectDir = process.cwd()) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, {
      cwd: projectDir,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Exit code: ${code}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on('error', reject);
  });
}

// ============================================================================
// Git Workflow
// ============================================================================

async function gitStatus() {
  const status = await runCommand('git status --porcelain');
  const branch = await runCommand('git branch --show-current');
  const aheadBehind = await runCommand('git status -sb').catch(() => '');

  return { branch: branch.trim(), status, aheadBehind };
}

async function gitDiff(staged = false) {
  return runCommand(staged ? 'git diff --cached' : 'git diff');
}

async function gitCommit(message, amend = false) {
  const cmd = `git commit ${amend ? '--amend --no-edit' : '-m "' + message + '"'}`;
  return runCommand(cmd);
}

async function gitAutoCommit() {
  const status = await gitStatus();
  if (!status.status.trim()) {
    return {
      success: false,
      message: 'Nothing to commit - working tree clean',
    };
  }

  // Get staged changes or all changes
  const staged = await runCommand('git diff --cached --stat').catch(() => '');
  const unstaged = await runCommand('git diff --stat').catch(() => '');

  // Generate commit message from changes
  const changes = staged || unstaged;
  const filesChanged = (
    changes.match(/\.\.\..*\.js|\.\.\..*\.ts|\.\.\..*\.py/g) || []
  ).length;
  const type = changes.includes('| 0')
    ? 'chore'
    : changes.includes('+') && changes.includes('-')
      ? 'fix'
      : changes.includes('+++')
        ? 'feat'
        : 'update';

  const message = `${type}: ${filesChanged} file${filesChanged !== 1 ? 's' : ''} updated`;

  try {
    await gitCommit(message, false);
    return { success: true, message: `Committed: "${message}"` };
  } catch (e) {
    return { success: false, message: `Failed: ${e.message}` };
  }
}

async function gitPush(force = false) {
  const branch = await runCommand('git branch --show-current').catch(
    () => 'main',
  );
  const cmd = `git push ${force ? '-f' : ''} origin ${branch.trim()}`;
  return runCommand(cmd);
}

async function gitLog(limit = 10) {
  return runCommand(
    `git log --oneline -${limit} --pretty=format:"%h %s (%an)"`,
  );
}

// ============================================================================
// Skills System
// ============================================================================

const SKILLS_FILE = path.join(SKILLS_DIR, 'skills.json');

function loadSkills() {
  try {
    if (fs.existsSync(SKILLS_FILE)) {
      return JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { skills: [] };
}

function saveSkills(skills) {
  try {
    const dir = path.dirname(SKILLS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SKILLS_FILE, JSON.stringify(skills, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to save skills:', e.message);
    return false;
  }
}

function matchSkill(query) {
  const skills = loadSkills();

  for (const skill of skills.skills) {
    // Check explicit triggers
    if (
      skill.triggers &&
      skill.triggers.some((t) => query.toLowerCase().includes(t.toLowerCase()))
    ) {
      return { skill, reason: 'trigger match' };
    }

    // Check if skill purpose matches query context
    if (
      skill.keywords &&
      skill.keywords.some((k) => query.toLowerCase().includes(k.toLowerCase()))
    ) {
      return { skill, reason: 'keyword match' };
    }
  }

  return null;
}

async function parseSkillFromNaturalLanguage(userInput) {
  // Use the LLM to convert natural language to structured skill
  const prompt = `Extract skill definition from this user request:

"${userInput}"

Respond with ONLY valid JSON in this format:
{
  "name": "short-name-hyphenated",
  "purpose": "1-2 sentence description",
  "system_prompt": "Detailed system prompt for this skill",
  "triggers": ["phrase1", "phrase2"],
  "keywords": ["keyword1", "keyword2"]
}

Example:
{
  "name": "sql-expert",
  "purpose": "Helps write and optimize PostgreSQL queries",
  "system_prompt": "You are a PostgreSQL expert. Write efficient queries, suggest indexes, and help with schema design...",
  "triggers": ["write sql", "postgres", "database query", "sql optimization"],
  "keywords": ["postgresql", "sql", "query", "database"]
}`;

  try {
    const response = await askOllama([
      {
        role: 'system',
        content: 'You are a JSON parser. Output only valid JSON.',
      },
      { role: 'user', content: prompt },
    ]);

    const json = response.message?.content;
    const parsed = JSON.parse(json.match(/\{[\s\S]*\}/)?.[0] || '{}');

    return {
      name: parsed.name || 'custom-skill',
      purpose: parsed.purpose || 'User-defined skill',
      system_prompt: parsed.system_prompt || 'You are a helpful assistant.',
      triggers: parsed.triggers || [],
      keywords: parsed.keywords || [],
      createdAt: Date.now(),
    };
  } catch (e) {
    return null;
  }
}

function deleteSkill(name) {
  const data = loadSkills();
  const idx = data.skills.findIndex((s) => s.name === name);
  if (idx === -1) return false;
  data.skills.splice(idx, 1);
  saveSkills(data);
  return true;
}

// ============================================================================
// Self-Improvement System
// ============================================================================

const SELF_DIR = path.dirname(new URL(import.meta.url).pathname);

async function readSelfFile(relativePath) {
  const fullPath = path.join(SELF_DIR, relativePath);
  try {
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
  } catch (e) {}
  return null;
}

async function writeSelfFile(relativePath, content) {
  const fullPath = path.join(SELF_DIR, relativePath);
  try {
    fs.writeFileSync(fullPath, content);
    return true;
  } catch (e) {
    console.error('Failed to write file:', e.message);
    return false;
  }
}

async function improveSelf(improvementRequest) {
  const currentCode = await readSelfFile('assistant.js');
  if (!currentCode) {
    return { success: false, message: 'Could not read own code' };
  }

  const improvementPrompt = `You are modifying your own codebase. Improve the code based on this request:

REQUEST: ${improvementRequest}

CURRENT CODE (assistant.js):
\`\`\`javascript
${currentCode.slice(0, 15000)}
\`\`\`

Respond with ONLY a JSON object (no markdown, no explanations):
{
  "explanation": "Brief description of what you're changing",
  "code": "The full improved code (include ALL original code with your changes)"
}

IMPORTANT: Return the complete file content with improvements applied. Do not use placeholder comments like "// ... existing code".`;

  try {
    const response = await askOllama([
      {
        role: 'system',
        content: 'You are a code improver. Output ONLY valid JSON.',
      },
      { role: 'user', content: improvementPrompt },
    ]);

    const jsonMatch = response.message?.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = safeJsonParse(jsonMatch[0]);
      if (parsed && parsed.code) {
        const success = await writeSelfFile('assistant.js', parsed.code);
        return {
          success,
          message: success
            ? `Applied: ${parsed.explanation || 'changes applied'}`
            : 'Failed to write changes',
        };
      }
    }
    // Try to extract explanation if full JSON parsing failed
    const content = response.message?.content || '';
    const explanationMatch = content.match(/"explanation"\s*:\s*"([^"]+)"/);
    const explanation = explanationMatch ? explanationMatch[1] : null;
    if (explanation) {
      return { success: false, message: `JSON parse failed. ${explanation}` };
    }
    return {
      success: false,
      message: 'Could not parse response - invalid JSON format',
    };
  } catch (e) {
    return { success: false, message: `Error: ${e.message}` };
  }
}

async function selfReflect() {
  const currentCode = await readSelfFile('assistant.js');
  if (!currentCode) {
    return { success: false, message: 'Could not read own code' };
  }

  const reflectionPrompt = `Analyze your own codebase for improvements. Consider:
1. Code quality issues
2. Missing features
3. Bug risks
4. Performance opportunities
5. Better patterns

CURRENT CODE:
\`\`\`javascript
${currentCode.slice(0, 12000)}
\`\`\`

Respond with ONLY JSON (no markdown):
{
  "score": 7, // 1-10 self-rating
  "issues": ["issue 1", "issue 2"],
  "topPriority": "The most important improvement to make",
  "suggestedChange": "Concrete change request for /improve"
}`;

  try {
    const response = await askOllama([
      {
        role: 'system',
        content: 'You are a code reviewer. Output ONLY valid JSON.',
      },
      { role: 'user', content: reflectionPrompt },
    ]);

    const jsonMatch = response.message?.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = safeJsonParse(jsonMatch[0]);
      if (parsed && (parsed.score !== undefined || parsed.analysis)) {
        return { success: true, analysis: parsed };
      }
    }
    return {
      success: false,
      message: 'Could not parse response - invalid JSON format',
    };
  } catch (e) {
    return { success: false, message: `Error: ${e.message}` };
  }
}

// ============================================================================
// Utilities
// ============================================================================

function formatMessage(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '\x1b[1m$1\x1b[0m')
    .replace(/\*(.*?)\*/g, '\x1b[3m$1\x1b[0m');
}

function askOllama(messages) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ model: MODEL, messages, stream: false });

    const req = http.request(
      {
        hostname: new URL(OLLAMA_HOST).hostname,
        port: new URL(OLLAMA_HOST).port || 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        // Handle HTTP error status codes
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP error: ${res.statusCode}`));
        }

        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('error', (err) =>
          reject(new Error(`Response error: ${err.message}`)),
        );
        res.on('end', () => {
          const parsed = safeJsonParse(body);
          if (parsed) {
            resolve(parsed);
          } else {
            reject(new Error('Failed to parse API response'));
          }
        });
      },
    );

    req.onerror = () => reject(new Error('Request failed'));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(data);
    req.end();
  });
}

async function askWithMemory(userMessage, systemPrompt) {
  const relevantMemories = await memory.search(userMessage, 3);

  let contextPrompt = systemPrompt;
  if (relevantMemories.length > 0) {
    const memText = relevantMemories
      .map((m) => `  - [${m.category}] ${m.text}`)
      .join('\n');
    contextPrompt += `\n\n<relevant-memories>\nThese memories may be relevant:\n${memText}\n</relevant-memories>`;
  }

  const response = await askOllama([
    { role: 'system', content: contextPrompt },
    { role: 'user', content: userMessage },
  ]);

  return { response, relevantMemories };
}

// ============================================================================
// Intelligent Auto-Tracking System
// ============================================================================

/**
 * Goals and targets system
 */
const GOALS_FILE = path.join(os.homedir(), '.static-rebel', 'goals.json');

function loadGoals() {
  try {
    if (fs.existsSync(GOALS_FILE)) {
      return JSON.parse(fs.readFileSync(GOALS_FILE, 'utf-8'));
    }
  } catch (e) {
    // Ignore errors
  }
  return { goals: [] };
}

function saveGoals(goalsData) {
  try {
    const dir = path.dirname(GOALS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(GOALS_FILE, JSON.stringify(goalsData, null, 2));
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Detects goal-setting statements in user input
 */
function detectGoalStatement(userInput) {
  const goalPatterns = [
    /i want to (hit|reach|achieve|get to|log) (\d+)/i,
    /my goal is (\d+)/i,
    /target of (\d+)/i,
    /aim for (\d+)/i,
    /trying to (hit|reach|get to) (\d+)/i,
  ];

  return goalPatterns.some((pattern) => pattern.test(userInput));
}

/**
 * Parses goal from user input
 */
async function parseGoal(userInput, trackers) {
  const prompt = `Extract the goal from this user statement:

"${userInput}"

Available trackers: ${trackers.map((t) => `${t.name} (${t.type})`).join(', ')}

Respond with ONLY valid JSON:
{
  "trackerType": "nutrition|workout|sleep|etc",
  "metric": "calories|workouts|hours|etc",
  "target": number,
  "period": "daily|weekly|monthly",
  "confidence": 0.0-1.0
}

Examples:
- "I want to hit 2000 calories per day" -> {trackerType: "nutrition", metric: "calories", target: 2000, period: "daily", confidence: 0.95}
- "my goal is 5 workouts per week" -> {trackerType: "workout", metric: "entries", target: 5, period: "weekly", confidence: 0.9}`;

  try {
    const response = await askOllama([
      {
        role: 'system',
        content: 'You are a goal parser. Output only valid JSON.',
      },
      { role: 'user', content: prompt },
    ]);

    const content = response.message?.content;
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');

    if (parsed.confidence >= 0.7) {
      return parsed;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Checks goal progress and generates updates
 */
function checkGoalProgress(goals, trackers, trackStore, queryEngine) {
  const updates = [];

  for (const goal of goals.goals) {
    const tracker = trackers.find(
      (t) => t.type === goal.trackerType || t.name === goal.trackerName,
    );
    if (!tracker) continue;

    let stats;
    if (goal.period === 'daily') {
      stats = queryEngine.getStats(tracker.name, 'today');
    } else if (goal.period === 'weekly') {
      stats = queryEngine.getStats(tracker.name, 'week');
    } else if (goal.period === 'monthly') {
      stats = queryEngine.getStats(tracker.name, 'month');
    }

    if (!stats || !stats.metrics) continue;

    let current = 0;
    if (goal.metric === 'entries') {
      current = stats.records?.length || 0;
    } else if (stats.metrics[goal.metric]) {
      current = stats.metrics[goal.metric].total || 0;
    }

    const progress = Math.round((current / goal.target) * 100);
    const remaining = goal.target - current;

    updates.push({
      goal,
      tracker,
      current,
      target: goal.target,
      progress,
      remaining,
      achieved: current >= goal.target,
      period: goal.period,
    });
  }

  return updates;
}

/**
 * Pattern recognition for predictions
 */
function analyzeUserPatterns(trackers, trackStore) {
  const patterns = {
    timePatterns: {}, // When user usually tracks
    dayPatterns: {}, // Which days they track
    frequencyPatterns: {}, // How often they track
    valuePatterns: {}, // Common values/amounts
  };

  for (const tracker of trackers) {
    const records = trackStore.getRecords(tracker.name).records || [];
    if (records.length < 3) continue; // Need at least 3 entries for patterns

    const trackerName = tracker.name;

    // Analyze time patterns
    const timesByHour = {};
    const dayOfWeek = {};
    const values = {};

    for (const record of records) {
      const date = new Date(record.timestamp);
      const hour = date.getHours();
      const day = date.getDay(); // 0=Sunday, 1=Monday, etc.

      // Track hours
      timesByHour[hour] = (timesByHour[hour] || 0) + 1;

      // Track days
      dayOfWeek[day] = (dayOfWeek[day] || 0) + 1;

      // Track common values
      if (record.data) {
        for (const [key, value] of Object.entries(record.data)) {
          if (typeof value === 'number') {
            if (!values[key]) values[key] = [];
            values[key].push(value);
          }
        }
      }
    }

    // Find most common hour
    const mostCommonHour = Object.entries(timesByHour).sort(
      (a, b) => b[1] - a[1],
    )[0];

    if (mostCommonHour && mostCommonHour[1] >= 2) {
      patterns.timePatterns[trackerName] = {
        hour: parseInt(mostCommonHour[0]),
        frequency: mostCommonHour[1],
        total: records.length,
      };
    }

    // Find most common days
    const mostCommonDays = Object.entries(dayOfWeek)
      .filter(([day, count]) => count >= 2)
      .map(([day, count]) => ({
        day: parseInt(day),
        dayName: [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ][parseInt(day)],
        count,
      }));

    if (mostCommonDays.length > 0) {
      patterns.dayPatterns[trackerName] = mostCommonDays;
    }

    // Calculate typical values (averages)
    for (const [key, vals] of Object.entries(values)) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (!patterns.valuePatterns[trackerName]) {
        patterns.valuePatterns[trackerName] = {};
      }
      patterns.valuePatterns[trackerName][key] = {
        average: Math.round(avg),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }
  }

  return patterns;
}

/**
 * Generate predictions based on patterns
 */
function generatePredictions(patterns, trackers, trackStore) {
  const predictions = [];
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  for (const tracker of trackers) {
    const trackerName = tracker.name;

    // Check if user usually logs at this time
    const timePattern = patterns.timePatterns[trackerName];
    if (timePattern && Math.abs(timePattern.hour - currentHour) <= 1) {
      const records = trackStore.getRecords(trackerName).records || [];
      const todayRecords = records.filter((r) => {
        const recordDate = new Date(r.timestamp).toDateString();
        return recordDate === now.toDateString();
      });

      if (todayRecords.length === 0) {
        predictions.push({
          type: 'time_based',
          tracker: tracker,
          message: `You usually log ${tracker.displayName} around this time.`,
          confidence: timePattern.frequency / timePattern.total,
          priority: 'medium',
        });
      }
    }

    // Check if user usually logs on this day
    const dayPattern = patterns.dayPatterns[trackerName];
    if (dayPattern) {
      const todayPattern = dayPattern.find((p) => p.day === currentDay);
      if (todayPattern) {
        const records = trackStore.getRecords(trackerName).records || [];
        const todayRecords = records.filter((r) => {
          const recordDate = new Date(r.timestamp).toDateString();
          return recordDate === now.toDateString();
        });

        if (todayRecords.length === 0 && currentHour >= 12) {
          predictions.push({
            type: 'day_based',
            tracker: tracker,
            message: `It's ${todayPattern.dayName}! You usually track ${tracker.displayName} on ${todayPattern.dayName}s.`,
            confidence: todayPattern.count / 10, // Arbitrary confidence
            priority: 'low',
          });
        }
      }
    }
  }

  return predictions.slice(0, 2); // Top 2 predictions
}

/**
 * Self-improvement learning log
 */
const LEARNING_LOG_FILE = path.join(
  os.homedir(),
  '.static-rebel',
  'learning-log.json',
);

function loadLearningLog() {
  try {
    if (fs.existsSync(LEARNING_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LEARNING_LOG_FILE, 'utf-8'));
    }
  } catch (e) {
    // Ignore errors
  }
  return { lessons: [], stats: { corrections: 0, misclassifications: 0 } };
}

function saveLearningLog(log) {
  try {
    const dir = path.dirname(LEARNING_LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LEARNING_LOG_FILE, JSON.stringify(log, null, 2));
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Records a learning opportunity when the system makes a mistake
 */
function recordLearning(type, context) {
  try {
    const log = loadLearningLog();

    const lesson = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      type, // 'correction', 'misclassification', 'wrong_tracker', etc.
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      ...context,
    };

    log.lessons.push(lesson);
    log.stats[type] = (log.stats[type] || 0) + 1;

    // Keep only last 100 lessons
    if (log.lessons.length > 100) {
      log.lessons = log.lessons.slice(-100);
    }

    saveLearningLog(log);

    if (VERBOSE) {
      console.log(`  \x1b[90m[Learning recorded: ${type}]\x1b[0m`);
    }

    return lesson;
  } catch (e) {
    // Silently fail
    return null;
  }
}

/**
 * Gets learning patterns to improve future classifications
 */
function getLearningPatterns(type) {
  try {
    const log = loadLearningLog();
    const relevantLessons = log.lessons.filter((l) => l.type === type);

    // Build patterns from lessons
    const patterns = {};
    for (const lesson of relevantLessons) {
      if (lesson.userInput && lesson.correctType) {
        if (!patterns[lesson.correctType]) {
          patterns[lesson.correctType] = [];
        }
        patterns[lesson.correctType].push(lesson.userInput);
      }
    }

    return patterns;
  } catch (e) {
    return {};
  }
}

/**
 * Generates proactive insights based on tracker data patterns
 */
function generateProactiveInsights(trackers, trackStore, queryEngine) {
  const insights = [];

  for (const tracker of trackers) {
    const todayStats = queryEngine.getStats(tracker.name, 'today');
    const weekStats = queryEngine.getStats(tracker.name, 'week');
    const lastWeekStats = queryEngine.getStats(tracker.name, 'last-week');

    const todayCount = todayStats.records?.length || 0;
    const weekCount = weekStats.records?.length || 0;
    const lastWeekCount = lastWeekStats.records?.length || 0;

    // Insight: Streak detection
    if (weekCount >= 5 && tracker.type === 'workout') {
      insights.push({
        type: 'streak',
        message: `🔥 You've logged ${weekCount} workouts this week! Keep it up!`,
        priority: 'high',
      });
    }

    // Insight: Improvement
    if (weekCount > lastWeekCount && lastWeekCount > 0) {
      const improvement = (
        ((weekCount - lastWeekCount) / lastWeekCount) *
        100
      ).toFixed(0);
      insights.push({
        type: 'improvement',
        message: `📈 ${improvement}% more ${tracker.type} entries than last week!`,
        priority: 'medium',
      });
    }

    // Insight: Consistency
    if (weekCount >= 7 && tracker.type === 'habit') {
      insights.push({
        type: 'consistency',
        message: `⭐ Perfect week! You logged your ${tracker.displayName} every day.`,
        priority: 'high',
      });
    }

    // Insight: Milestone
    const allRecords = trackStore.getRecords(tracker.name).records || [];
    const totalCount = allRecords.length;
    if ([10, 25, 50, 100, 250, 500, 1000].includes(totalCount)) {
      insights.push({
        type: 'milestone',
        message: `🎉 Milestone: ${totalCount} total entries in ${tracker.displayName}!`,
        priority: 'high',
      });
    }

    // Insight: Inactive tracker
    if (allRecords.length > 0 && todayCount === 0 && weekCount === 0) {
      const lastEntry = allRecords[allRecords.length - 1];
      const daysSince = Math.floor(
        (Date.now() - lastEntry.timestamp) / (1000 * 60 * 60 * 24),
      );
      if (daysSince >= 7 && daysSince < 30) {
        insights.push({
          type: 'inactive',
          message: `⏰ It's been ${daysSince} days since your last ${tracker.displayName} entry.`,
          priority: 'low',
        });
      }
    }

    // Insight: Goal tracking (if metrics have totals)
    if (weekStats.metrics) {
      for (const [metric, values] of Object.entries(weekStats.metrics)) {
        if (values.total && metric === 'calories' && values.total > 10000) {
          insights.push({
            type: 'goal',
            message: `💪 Over 10,000 calories tracked this week!`,
            priority: 'medium',
          });
        }
      }
    }
  }

  // Sort by priority
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  insights.sort(
    (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority],
  );

  return insights.slice(0, 3); // Return top 3 insights
}

/**
 * Generates smart suggestions based on patterns and goals
 */
function generateSmartSuggestions(
  trackers,
  trackStore,
  queryEngine,
  patterns,
  goals,
) {
  const suggestions = [];
  const now = new Date();
  const currentHour = now.getHours();

  for (const tracker of trackers) {
    const todayRecords =
      trackStore.getRecords(tracker.name).records?.filter((r) => {
        const recordDate = new Date(r.timestamp).toDateString();
        return recordDate === now.toDateString();
      }) || [];

    // Suggestion: Haven't logged today but usually do
    if (todayRecords.length === 0 && currentHour >= 12) {
      const weekRecords =
        queryEngine.getStats(tracker.name, 'week').records || [];
      if (weekRecords.length >= 3) {
        suggestions.push({
          type: 'missing_today',
          message: `📝 You haven't logged ${tracker.displayName} today yet.`,
          tracker: tracker,
          priority: 'low',
        });
      }
    }

    // Suggestion: Goal progress
    if (goals && goals.goals) {
      const trackerGoals = goals.goals.filter(
        (g) => g.trackerType === tracker.type || g.trackerName === tracker.name,
      );

      for (const goal of trackerGoals) {
        const progress = checkGoalProgress(
          { goals: [goal] },
          trackers,
          trackStore,
          queryEngine,
        );
        if (progress.length > 0) {
          const goalProgress = progress[0];

          if (goalProgress.progress >= 80 && goalProgress.progress < 100) {
            suggestions.push({
              type: 'goal_almost',
              message: `🎯 Almost there! ${goalProgress.remaining} more ${goal.metric} to reach your ${goal.period} goal!`,
              tracker: tracker,
              priority: 'high',
            });
          } else if (goalProgress.achieved && goalProgress.progress === 100) {
            suggestions.push({
              type: 'goal_achieved',
              message: `🎉 Goal achieved! You hit your ${goal.target} ${goal.metric} target for ${goal.period}!`,
              tracker: tracker,
              priority: 'high',
            });
          }
        }
      }
    }

    // Suggestion: Unusual pattern
    if (patterns.valuePatterns && patterns.valuePatterns[tracker.name]) {
      const valuePattern = patterns.valuePatterns[tracker.name];

      for (const record of todayRecords) {
        for (const [key, value] of Object.entries(record.data || {})) {
          if (typeof value === 'number' && valuePattern[key]) {
            const avg = valuePattern[key].average;
            const deviation = Math.abs(value - avg) / avg;

            if (deviation > 0.5) {
              // 50% deviation
              const direction = value > avg ? 'higher' : 'lower';
              suggestions.push({
                type: 'unusual_value',
                message: `📊 That ${key} (${value}) is ${direction} than your usual ${avg}.`,
                tracker: tracker,
                priority: 'low',
              });
            }
          }
        }
      }
    }
  }

  // Sort by priority
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  suggestions.sort(
    (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority],
  );

  return suggestions.slice(0, 2); // Top 2 suggestions
}

/**
 * Shows proactive insights if any are available
 */
function showProactiveInsights(insights) {
  if (insights.length === 0) return;

  console.log('\n  \x1b[36m💡 Insights:\x1b[0m');
  for (const insight of insights) {
    console.log(`  ${insight.message}`);
  }
  console.log();
}

/**
 * Shows smart suggestions
 */
function showSmartSuggestions(suggestions) {
  if (suggestions.length === 0) return;

  console.log('\n  \x1b[35m✨ Suggestions:\x1b[0m');
  for (const suggestion of suggestions) {
    console.log(`  ${suggestion.message}`);
  }
  console.log();
}

/**
 * Detects action intents in LLM responses and executes them
 * This simulates function calling by parsing LLM output for commands
 */
async function detectAndExecuteActionIntents(llmResponse, userInput) {
  try {
    const trackStore = new TrackerStore();
    const queryEngine = new QueryEngine();
    const trackers = trackStore.listTrackers();

    if (trackers.length === 0) {
      return null;
    }

    // Detect action patterns in LLM response
    const actionPatterns = {
      showStats:
        /let me (show|check|pull up|get) (your|the|those)? ?(stats|statistics|numbers|data)/i,
      showHistory:
        /let me (show|check|pull up|get|display) (your|the)? ?(history|log|entries|records)/i,
      compareData: /let me compare|i'll compare|comparing/i,
      createTracker: /let me create|i'll create|creating a tracker/i,
    };

    let detectedAction = null;
    for (const [action, pattern] of Object.entries(actionPatterns)) {
      if (pattern.test(llmResponse)) {
        detectedAction = action;
        break;
      }
    }

    if (!detectedAction) {
      return null;
    }

    // Use Ollama to extract details about what the LLM wants to do
    const extractPrompt = `The AI assistant said: "${llmResponse}"

This suggests executing an action. Extract what action should be performed:

Respond with ONLY valid JSON:
{
  "action": "stats|history|compare|create",
  "trackerType": "nutrition|workout|sleep|etc or null",
  "period": "today|week|month|etc or null",
  "confidence": 0.0-1.0
}`;

    const extractResponse = await askOllama([
      {
        role: 'system',
        content: 'You are an action intent parser. Output only valid JSON.',
      },
      { role: 'user', content: extractPrompt },
    ]);

    const extractContent = extractResponse.message?.content;
    const intent = JSON.parse(extractContent.match(/\{[\s\S]*\}/)?.[0] || '{}');

    if (intent.confidence < 0.6) {
      return null;
    }

    // Find the relevant tracker
    let targetTracker = null;
    if (intent.trackerType) {
      targetTracker = findMatchingTracker(trackers, intent.trackerType);
    } else {
      // Try to infer from user input
      for (const tracker of trackers) {
        if (
          userInput.toLowerCase().includes(tracker.name) ||
          userInput.toLowerCase().includes(tracker.type)
        ) {
          targetTracker = tracker;
          break;
        }
      }
    }

    if (!targetTracker && trackers.length === 1) {
      targetTracker = trackers[0]; // Use the only tracker available
    }

    if (!targetTracker) {
      return null;
    }

    // Execute the action
    let result = null;
    if (intent.action === 'stats' || detectedAction === 'showStats') {
      const period = intent.period || 'week';
      const stats = queryEngine.getStats(targetTracker.name, period);
      result = queryEngine.formatStats(stats);
      console.log('\n' + result);
    } else if (
      intent.action === 'history' ||
      detectedAction === 'showHistory'
    ) {
      const records = trackStore.getRecentRecords(targetTracker.name, 10);
      result = queryEngine.formatHistory(records);
      console.log('\n' + result);
    }

    if (result) {
      return {
        action: intent.action || detectedAction,
        tracker: targetTracker,
        executed: true,
      };
    }

    return null;
  } catch (e) {
    if (VERBOSE) {
      console.log(`  \x1b[90m[Action intent error: ${e.message}]\x1b[0m`);
    }
    return null;
  }
}

/**
 * Routes natural language queries to tracker commands
 */
async function routeNaturalLanguageQuery(userInput) {
  try {
    const trackStore = new TrackerStore();
    const queryEngine = new QueryEngine();
    const trackers = trackStore.listTrackers();

    if (trackers.length === 0) {
      return null; // No trackers to query
    }

    // Detect query patterns
    const queryPatterns = {
      history:
        /show (me )?(my )?|list (my )?|what (are|were|was|is) (my )?|view (my )?/i,
      stats: /how many|how much|total|average|sum of|stats|statistics/i,
      compare: /compare|versus|vs\.?|difference between/i,
      last: /last (entry|time|one)|most recent|latest/i,
    };

    let queryType = null;
    for (const [type, pattern] of Object.entries(queryPatterns)) {
      if (pattern.test(userInput)) {
        queryType = type;
        break;
      }
    }

    if (!queryType) {
      return null; // Not a recognized query
    }

    // Use Ollama to extract which tracker and time period
    const extractPrompt = `Extract the tracker type and time period from this query:

"${userInput}"

Available trackers: ${trackers.map((t) => `${t.name} (${t.type})`).join(', ')}

Respond with ONLY valid JSON:
{
  "trackerName": "tracker_name or null",
  "trackerType": "nutrition|workout|sleep|etc or null",
  "period": "today|week|month|this-week|last-week|yesterday|null",
  "confidence": 0.0-1.0
}

Examples:
- "show me my workouts this week" -> {trackerName: null, trackerType: "workout", period: "this-week", confidence: 0.9}
- "how many calories today" -> {trackerName: null, trackerType: "nutrition", period: "today", confidence: 0.95}
- "what was my last run" -> {trackerName: null, trackerType: "workout", period: null, confidence: 0.85}`;

    const extractResponse = await askOllama([
      {
        role: 'system',
        content: 'You are a query parser. Output only valid JSON.',
      },
      { role: 'user', content: extractPrompt },
    ]);

    const extractContent = extractResponse.message?.content;
    const extracted = JSON.parse(
      extractContent.match(/\{[\s\S]*\}/)?.[0] || '{}',
    );

    if (extracted.confidence < 0.6) {
      return null;
    }

    // Find the tracker
    let targetTracker = null;
    if (extracted.trackerName) {
      targetTracker = trackStore.getTracker(extracted.trackerName);
    } else if (extracted.trackerType) {
      targetTracker = findMatchingTracker(trackers, extracted.trackerType);
    }

    if (!targetTracker) {
      return null;
    }

    // Execute the query
    let result = null;
    if (queryType === 'history') {
      const records = trackStore.getRecentRecords(targetTracker.name, 10);
      result = queryEngine.formatHistory(records);
    } else if (queryType === 'stats') {
      const period = extracted.period || 'week';
      const stats = queryEngine.getStats(targetTracker.name, period);
      result = queryEngine.formatStats(stats);
    } else if (queryType === 'last') {
      const records = trackStore.getRecords(targetTracker.name);
      const recentRecords = records.records || records;
      if (recentRecords.length > 0) {
        const last = recentRecords[recentRecords.length - 1];
        result = `\n  Last entry (${last.date}):\n  ${JSON.stringify(last.data, null, 2)}\n`;
      } else {
        result = '\n  No entries yet.\n';
      }
    }

    if (result) {
      console.log(result);
      return {
        tracker: targetTracker,
        queryType,
        executed: true,
      };
    }

    return null;
  } catch (e) {
    if (VERBOSE) {
      console.log(`  \x1b[90m[Query routing error: ${e.message}]\x1b[0m`);
    }
    return null;
  }
}

/**
 * Finds a tracker that matches the given type, including synonyms
 */
function findMatchingTracker(trackers, targetType) {
  // Define tracker type synonyms
  const typeSynonyms = {
    nutrition: ['food', 'diet', 'eating', 'meal', 'calories', 'snack', 'drink'],
    workout: ['exercise', 'fitness', 'training', 'gym', 'activity', 'sport'],
    sleep: ['rest', 'nap', 'bedtime', 'insomnia'],
    habit: ['routine', 'practice', 'daily', 'streak'],
    mood: ['emotion', 'feeling', 'mental', 'wellbeing'],
    hydration: ['water', 'fluid', 'drink'],
    medication: ['med', 'pill', 'supplement', 'vitamin', 'drug'],
    weight: ['body', 'scale', 'mass'],
    finance: ['money', 'budget', 'expense', 'spending'],
    productivity: ['task', 'todo', 'work', 'focus'],
  };

  // First, try exact type match
  let match = trackers.find((t) => t.type === targetType);
  if (match) return match;

  // Then try synonym matching
  for (const [mainType, synonyms] of Object.entries(typeSynonyms)) {
    if (targetType === mainType || synonyms.includes(targetType)) {
      // Check if any tracker matches this type or its synonyms
      match = trackers.find(
        (t) =>
          t.type === mainType ||
          synonyms.includes(t.type) ||
          t.name.toLowerCase().includes(mainType) ||
          synonyms.some((syn) => t.name.toLowerCase().includes(syn)),
      );
      if (match) return match;
    }
  }

  return null;
}

/**
 * Detects undo/delete statements
 */
function detectUndo(userInput) {
  const undoPatterns = [
    /forget (that|the last one|last entry|that last one)/i,
    /undo (that|last|the last one)/i,
    /delete (that|the last one|last entry)/i,
    /remove (that|the last one|last entry)/i,
    /cancel (that|the last one)/i,
    /nevermind|never mind/i,
    /scratch that/i,
  ];

  return undoPatterns.some((pattern) => pattern.test(userInput));
}

/**
 * Handles undo by deleting the most recent entry
 */
function handleUndo(trackers, trackStore) {
  // Find most recently updated tracker
  const recentTracker = trackers.sort((a, b) => {
    const aRecords = trackStore.getRecords(a.name).records || [];
    const bRecords = trackStore.getRecords(b.name).records || [];
    const aLast =
      aRecords.length > 0 ? aRecords[aRecords.length - 1].timestamp : 0;
    const bLast =
      bRecords.length > 0 ? bRecords[bRecords.length - 1].timestamp : 0;
    return bLast - aLast;
  })[0];

  if (!recentTracker) {
    return null;
  }

  const records = trackStore.getRecords(recentTracker.name);
  const allRecords = records.records || [];

  if (allRecords.length === 0) {
    return null;
  }

  const lastRecord = allRecords[allRecords.length - 1];

  // Delete the last record
  const updatedRecords = allRecords.filter((r) => r.id !== lastRecord.id);
  records.records = updatedRecords;

  // Save back
  const recordsFile = path.join(
    os.homedir(),
    '.static-rebel',
    'trackers',
    recentTracker.name,
    'records.json',
  );

  try {
    fs.writeFileSync(recordsFile, JSON.stringify(records, null, 2));
    return {
      tracker: recentTracker,
      deletedEntry: lastRecord,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Detects if user input is a correction to a previous entry
 */
function detectCorrection(userInput) {
  const correctionPatterns = [
    /actually|correction|meant to say|i mean|no wait|oops|my bad/i,
    /\*|fix:|edit:|change:|update:/i,
    /it was (\d+) not (\d+)/i,
    /should be|should have been/i,
    /wrong|mistake|incorrect/i,
  ];

  return correctionPatterns.some((pattern) => pattern.test(userInput));
}

/**
 * Extracts time information from user input
 */
function parseTimeFromInput(userInput) {
  const timePatterns = [
    // Specific times
    { pattern: /at (\d{1,2}):(\d{2})\s*(am|pm)?/i, type: 'specific' },
    { pattern: /at (\d{1,2})\s*(am|pm)/i, type: 'hour' },

    // Relative times
    { pattern: /(\d+)\s*(hour|hr|hours|hrs)\s*ago/i, type: 'hours_ago' },
    {
      pattern: /(\d+)\s*(minute|min|minutes|mins)\s*ago/i,
      type: 'minutes_ago',
    },

    // Time of day
    { pattern: /this morning|in the morning/i, type: 'morning' },
    { pattern: /this afternoon|in the afternoon/i, type: 'afternoon' },
    { pattern: /this evening|in the evening/i, type: 'evening' },
    { pattern: /tonight|at night/i, type: 'night' },

    // Earlier today
    { pattern: /earlier today|earlier/i, type: 'earlier' },
    { pattern: /just now|right now/i, type: 'now' },
  ];

  for (const { pattern, type } of timePatterns) {
    const match = userInput.match(pattern);
    if (match) {
      const now = new Date();

      switch (type) {
        case 'specific':
          let hour = parseInt(match[1]);
          const minute = parseInt(match[2]);
          const ampm = match[3]?.toLowerCase();

          if (ampm === 'pm' && hour < 12) hour += 12;
          if (ampm === 'am' && hour === 12) hour = 0;

          const specificTime = new Date(now);
          specificTime.setHours(hour, minute, 0, 0);
          return specificTime.getTime();

        case 'hour':
          let hourOnly = parseInt(match[1]);
          const ampmOnly = match[2].toLowerCase();

          if (ampmOnly === 'pm' && hourOnly < 12) hourOnly += 12;
          if (ampmOnly === 'am' && hourOnly === 12) hourOnly = 0;

          const hourTime = new Date(now);
          hourTime.setHours(hourOnly, 0, 0, 0);
          return hourTime.getTime();

        case 'hours_ago':
          const hoursAgo = parseInt(match[1]);
          return now.getTime() - hoursAgo * 60 * 60 * 1000;

        case 'minutes_ago':
          const minutesAgo = parseInt(match[1]);
          return now.getTime() - minutesAgo * 60 * 1000;

        case 'morning':
          const morning = new Date(now);
          morning.setHours(8, 0, 0, 0);
          return morning.getTime();

        case 'afternoon':
          const afternoon = new Date(now);
          afternoon.setHours(14, 0, 0, 0);
          return afternoon.getTime();

        case 'evening':
          const evening = new Date(now);
          evening.setHours(18, 0, 0, 0);
          return evening.getTime();

        case 'night':
          const night = new Date(now);
          night.setHours(21, 0, 0, 0);
          return night.getTime();

        case 'earlier':
          // 2 hours ago as default for "earlier"
          return now.getTime() - 2 * 60 * 60 * 1000;

        case 'now':
          return now.getTime();
      }
    }
  }

  return null; // No time specified, use current time
}

/**
 * Extracts correction data from user input
 */
async function parseCorrection(userInput, trackerType) {
  const prompt = `The user is correcting a previous entry. Extract what they want to change:

"${userInput}"

Respond with ONLY valid JSON:
{
  "field": "field_name_to_change",
  "value": new_value,
  "confidence": 0.0-1.0
}

Examples:
- "actually it was 200 calories" -> {field: "calories", value: 200, confidence: 0.9}
- "the weight was 185 not 175" -> {field: "weight", value: 185, confidence: 0.95}
- "fix: 8 reps not 10" -> {field: "reps", value: 8, confidence: 0.9}`;

  try {
    const response = await askOllama([
      {
        role: 'system',
        content: 'You are a correction parser. Output only valid JSON.',
      },
      { role: 'user', content: prompt },
    ]);

    const content = response.message?.content;
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');

    if (parsed.confidence >= 0.7) {
      return parsed;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Detects trackable data in user input and automatically:
 * 1. Identifies if the message contains trackable information
 * 2. Infers what type of tracker is needed
 * 3. Checks if a suitable tracker exists
 * 4. Auto-creates one if missing
 * 5. Logs the data (or corrects if it's a correction)
 */
async function detectAndRouteTrackableData(userInput) {
  try {
    // Skip if it's a question or command
    const isQuestion =
      /\?|^(how|what|when|where|why|who|which|can you|could you|would you|do you|does|is|are|will|show me|tell me)/i.test(
        userInput,
      );
    if (isQuestion || userInput.startsWith('/') || userInput.startsWith('@')) {
      return null;
    }

    const trackStore = new TrackerStore();
    const trackers = trackStore.listTrackers();

    // Check if this is an undo/delete request
    if (detectUndo(userInput) && trackers.length > 0) {
      const undoResult = handleUndo(trackers, trackStore);
      if (undoResult) {
        console.log(
          `  \x1b[31m[Deleted last entry from @${undoResult.tracker.name}]\x1b[0m`,
        );
        return {
          tracker: undoResult.tracker,
          data: undoResult.deletedEntry.data,
          undone: true,
        };
      }
    }

    // Check if this is a correction to a previous entry
    if (detectCorrection(userInput) && trackers.length > 0) {
      // Find the most recently updated tracker
      const recentTracker = trackers.sort((a, b) => {
        const aRecords = trackStore.getRecords(a.name).records || [];
        const bRecords = trackStore.getRecords(b.name).records || [];
        const aLast =
          aRecords.length > 0 ? aRecords[aRecords.length - 1].timestamp : 0;
        const bLast =
          bRecords.length > 0 ? bRecords[bRecords.length - 1].timestamp : 0;
        return bLast - aLast;
      })[0];

      if (recentTracker) {
        const records = trackStore.getRecords(recentTracker.name).records || [];
        if (records.length > 0) {
          const lastRecord = records[records.length - 1];

          // Parse the correction
          const correction = await parseCorrection(
            userInput,
            recentTracker.type,
          );

          if (correction && correction.field) {
            const newData = { [correction.field]: correction.value };
            const result = trackStore.updateRecord(
              recentTracker.name,
              lastRecord.id,
              newData,
            );

            if (result.success) {
              console.log(
                `  \x1b[33m[Corrected @${recentTracker.name}: ${correction.field}=${correction.value}]\x1b[0m`,
              );

              // Record learning: user had to correct something
              recordLearning('correction', {
                userInput: userInput,
                previousValue: lastRecord.data[correction.field],
                correctedValue: correction.value,
                field: correction.field,
                trackerType: recentTracker.type,
              });

              return {
                tracker: recentTracker,
                data: result.record.data,
                corrected: true,
                field: correction.field,
                value: correction.value,
              };
            }
          }
        }
      }
    }

    // Step 1: Use Ollama to detect if this contains trackable data
    const detectionPrompt = `Analyze this user statement and determine if it contains data that should be tracked (like food, exercise, sleep, habits, mood, water intake, medication, etc.):

"${userInput}"

Respond with ONLY valid JSON:
{
  "trackable": true/false,
  "trackerType": "nutrition|workout|sleep|habit|mood|hydration|medication|custom",
  "description": "brief description of what tracker this needs",
  "confidence": 0.0-1.0
}

Examples:
- "I had a coffee with 150 calories" -> {trackable: true, trackerType: "nutrition", description: "nutrition tracker for food and drinks"}
- "Just finished a 5k run" -> {trackable: true, trackerType: "workout", description: "workout tracker for exercise"}
- "Slept 7 hours last night" -> {trackable: true, trackerType: "sleep", description: "sleep tracker"}
- "What's the weather?" -> {trackable: false}`;

    const detectionResponse = await askOllama([
      {
        role: 'system',
        content: 'You are a data classifier. Output only valid JSON.',
      },
      { role: 'user', content: detectionPrompt },
    ]);

    const detectionContent = detectionResponse.message?.content;
    const detection = JSON.parse(
      detectionContent.match(/\{[\s\S]*\}/)?.[0] || '{}',
    );

    // If not trackable or low confidence, skip
    if (!detection.trackable || detection.confidence < 0.6) {
      return null;
    }

    // Step 2: Check if a suitable tracker already exists (using smart matching)
    // Note: trackStore and trackers are already declared at the top of this function
    const matchingTracker = findMatchingTracker(
      trackers,
      detection.trackerType,
    );

    let targetTracker = matchingTracker;

    // Step 3: Auto-create tracker if it doesn't exist
    if (!targetTracker) {
      console.log(
        `  \x1b[36m[Auto-creating ${detection.trackerType} tracker...]\x1b[0m`,
      );

      const trackerConfig = await parseTrackerFromNaturalLanguage(
        detection.description,
      );
      if (!trackerConfig) {
        return null;
      }

      // Don't ask for confirmation - just create it automatically
      const result = trackStore.createTracker(trackerConfig);
      if (!result.success) {
        return null;
      }

      targetTracker = trackerConfig;
      console.log(`  \x1b[32m[Created tracker: @${trackerConfig.name}]\x1b[0m`);
    }

    // Step 4: Parse and log the data
    const parsed = await parseRecordFromText(
      targetTracker.name,
      userInput,
      targetTracker.type,
    );

    if (
      !parsed.success ||
      !parsed.data ||
      Object.keys(parsed.data).length === 0
    ) {
      return null;
    }

    // Extract time from input if specified
    const customTimestamp = parseTimeFromInput(userInput);
    const recordData = {
      data: parsed.data,
      source: 'auto-detect',
    };

    // Add custom timestamp if found
    if (customTimestamp) {
      recordData.timestamp = customTimestamp;
    }

    const result = trackStore.addRecord(targetTracker.name, recordData);

    if (result.success) {
      console.log(`  \x1b[36m[Logged to @${targetTracker.name}]\x1b[0m`);
      return {
        tracker: targetTracker,
        data: parsed.data,
        created: !matchingTracker,
      };
    }

    return null;
  } catch (e) {
    // Silently fail - don't disrupt the conversation
    if (VERBOSE) {
      console.log(`  \x1b[90m[Auto-track error: ${e.message}]\x1b[0m`);
    }
    return null;
  }
}

// ============================================================================
// Main Chat
// ============================================================================

async function chat() {
  const availableModels = await listAvailableModels();

  // Autocomplete function for / commands and @ tracker mentions
  const completer = (line) => {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // Slash command completions
    if (trimmed.startsWith('/')) {
      const cmdPart = trimmed.slice(1).toLowerCase();
      const commands = [
        '/profile',
        '/edit',
        '/idle',
        '/verbose',
        '/run',
        '/git',
        '/skill',
        '/track',
        '/search',
        '/fetch',
        '/browser',
        '/workspace',
        '/claude',
        '/self',
        '/memories',
        '/forget',
        '/memory',
        '/clear',
        '/models',
        '/quit',
        '/exit',
        '/help',
      ];
      const matches = commands.filter(
        (cmd) =>
          cmd.toLowerCase().includes('/' + cmdPart) ||
          cmd.toLowerCase().endsWith(cmdPart),
      );
      return [matches.length ? matches.map((m) => m + ' ') : [], line];
    }

    // @ tracker mention completions
    if (trimmed.startsWith('@')) {
      const mentionPart = trimmed.slice(1).toLowerCase();
      const trackStore = new TrackerStore();
      const trackers = trackStore.listTrackers();
      const trackerMatches = trackers
        .filter(
          (t) =>
            t.name.toLowerCase().startsWith(mentionPart) ||
            t.displayName.toLowerCase().includes(mentionPart),
        )
        .map((t) => '@' + t.name + ' ');

      // Also include workspaces
      const workspaces = listWorkspaces();
      const wsMatches = workspaces
        .filter((w) => w.toLowerCase().startsWith(mentionPart))
        .map((w) => '@' + w + ' ');

      return [trackerMatches.concat(wsMatches), line];
    }

    return [[], line];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer,
  });

  // Check and build profile if needed
  const profile = loadProfile();
  if (!profile) {
    await buildProfile(rl);
  }

  // Initialize companion with current stats
  const trackStore = new TrackerStore();
  const trackers = trackStore.listTrackers();
  const mems = memory.list();
  setStats({
    trackersActive: trackers.length,
    memoriesStored: mems.length,
    workoutsLogged: 0,
  });

  // Show companion greeting
  reactToEvent('greeting');

  const systemPrompt = await getSystemPrompt();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Charlize AI Assistant');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Model:   ${MODEL}`);
  console.log(`  Profile: ${PROFILE_FILE}`);
  console.log(`  Memory:  ${MEMORY_FILE}`);
  console.log(`  Models:  ${availableModels.length} available`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Commands:');
  console.log('    /profile   - View your profile');
  console.log('    /edit      - Update profile information');
  console.log('    /idle      - Toggle Telegram mode (for testing)');
  console.log('    /verbose   - Toggle verbose mode');
  console.log('    /run <cmd> - Execute shell commands');
  console.log('    /git       - Git workflow (status, diff, commit, push)');
  console.log('    /skill     - Skill management (list, create, delete)');
  console.log('    /track     - Custom tracking (workouts, food, habits)');
  console.log('    /search    - Web search');
  console.log('    /fetch     - Get webpage content');
  console.log("    /browser   - Browser automation (uses ClawdBot's Chrome)");
  console.log('    /workspace - Workspace management & subagent spawning');
  console.log('    /claude    - Run Claude Code CLI in a directory');
  console.log('    /self      - Self-improve commands');
  console.log('    /memories  - View stored memories');
  console.log('    /forget <id> - Delete a memory');
  console.log('    /memory <text> - Manually store a memory');
  console.log('    /clear     - Clear all memories');
  console.log('    /models    - List available models');
  console.log('    /companion - Manage your terminal companion');
  console.log('    /quit      - Exit');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Quick Actions:');
  console.log(
    '    @tracker   - Query trackers (e.g., @matt stats, @matt how am I doing?)',
  );
  console.log('    @workspace - Switch workspace context');
  console.log('    !<cmd>     - Run shell command');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  let quitResolve;
  const quitPromise = new Promise((r) => {
    quitResolve = r;
  });

  const askQuestion = () => {
    rl.question('\x1b[36mYou:\x1b[0m ', async (question) => {
      const q = question.trim();

      // Check if we're in the middle of a follow-up question flow
      if (isQuestionAnswer()) {
        const result = await processAnswer(q);
        if (result && result.handled) {
          if (result.valid) {
            // Question was answered and processed - show result if any
            if (result.result?.result) {
              console.log(`  \x1b[90m${result.result.result}\x1b[0m`);
            }
          }
          // Continue to next question even if invalid (will re-ask)
          askQuestion();
          return;
        }
      }

      if (
        q.toLowerCase() === '/quit' ||
        q.toLowerCase() === '/exit' ||
        q === ''
      ) {
        console.log('\nGoodbye!\n');
        rl.close();
        quitResolve();
        return;
      }

      // Handle commands
      if (q.startsWith('/')) {
        const parts = q.split(' ');
        const cmd = parts[0].toLowerCase();
        const arg = parts.slice(1).join(' ');

        // Check for risky actions that need confirmation - use new follow-up system
        const riskyCheck = checkRiskyAction(q);
        if (riskyCheck) {
          startQuestionFlow(
            createConfirmQuestion(
              riskyCheck.action,
              { message: riskyCheck.message, risk: riskyCheck.risk },
              {
                context: `Command: ${q}`,
                onConfirm: async () => {
                  console.log(`\n  \x1b[36m→ Executing: ${q}\x1b[0m`);
                  // The command will continue processing after confirmation
                  return 'Action confirmed and executed';
                },
                onCancel: () => {
                  console.log('  \x1b[90mCancelled.\x1b[0m');
                  return 'Action cancelled';
                },
              },
            ),
            { command: q, riskyCheck },
          );
          askQuestion();
          return;
        }

        // Check if clarification is needed - use new follow-up system
        const clarificationCheck = checkNeedsClarification(q);
        if (clarificationCheck) {
          startQuestionFlow(
            createTextQuestion(clarificationCheck.question, {
              context: `Command: ${q}`,
              hint: 'Please provide the missing information',
              onAnswer: (answer, ctx) => {
                // Re-process the command with the additional info
                console.log(
                  `\n  \x1b[36m→ Re-processing: ${ctx.command} ${answer}\x1b[0m`,
                );
                return `Received: ${answer}`;
              },
            }),
            { command: q, clarificationCheck },
          );
          askQuestion();
          return;
        }

        if (cmd === '/profile') {
          const p = loadProfile();
          if (p) {
            console.log('\n' + '='.repeat(50));
            console.log(p);
            console.log('='.repeat(50) + '\n');
          } else {
            console.log('\n  No profile set.\n');
          }
        } else if (cmd === '/edit') {
          await buildProfile(rl);
        } else if (cmd === '/idle') {
          isCliActive = !isCliActive;
          if (isCliActive) {
            console.log('\n  CLI active - Telegram paused.\n');
          } else {
            console.log(
              '\n  Telegram active - Send a message on Telegram to test!\n',
            );
          }
        } else if (cmd === '/verbose') {
          // Toggle verbose mode
          global.VERBOSE_MODE = !global.VERBOSE_MODE;
          console.log(
            `\n  Verbose mode: ${global.VERBOSE_MODE ? 'ON' : 'OFF'}\n`,
          );
        } else if (cmd === '/memories') {
          const mems = memory.list();
          if (mems.length === 0) {
            console.log('\n  No memories stored.\n');
          } else {
            console.log(`\n  Memories (${mems.length} total):`);
            mems.forEach((m) => {
              const date = new Date(m.createdAt).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const score = m.score ? ` [${(m.score * 100).toFixed(0)}%]` : '';
              console.log(
                `  [${m.id.slice(0, 8)}]${score} ${m.text.slice(0, 40)}${m.text.length > 40 ? '...' : ''} (${date})`,
              );
            });
            console.log();
          }
        } else if (cmd === '/forget') {
          if (arg && memory.delete(arg)) {
            console.log('\n  Memory deleted.\n');
          } else {
            console.log('\n  Usage: /forget <memory-id>\n');
          }
        } else if (cmd === '/memory') {
          // Manually store a memory
          if (arg) {
            const memText = arg.replace(/^memory\s+/i, '');
            await memory.add(memText, 'manual');
            console.log('\n  Memory stored!\n');
          } else {
            console.log('\n  Usage: /memory <text to remember>\n');
            console.log(
              '  Example: /memory I prefer TypeScript over JavaScript\n',
            );
          }
        } else if (cmd === '/clear') {
          await memory.clear();
          console.log('\n  Memory cleared.\n');
        } else if (cmd === '/companion') {
          // Companion commands
          const companionArgs = arg.split(' ');
          const action = companionArgs[0];
          const param = companionArgs[1];

          if (action === 'list' || !action) {
            const companions = getAvailableCompanions();
            console.log('\n  Available Companions:\n');
            companions.forEach((c) => {
              console.log(`  ${c.emoji} ${c.name} (/${c.id})`);
            });
            console.log('\n  Commands:');
            console.log('    /companion show    - Show your companion');
            console.log('    /companion hide    - Hide your companion');
            console.log('    /companion set <name>  - Choose a companion');
            console.log('    /companion stats  - Toggle stats display\n');
          } else if (action === 'set' && param) {
            if (setCompanion(param)) {
              reactToEvent('greeting');
              console.log(
                `\n  Your new companion is ${getCompanion(param).name}!\n`,
              );
            } else {
              console.log(
                `\n  Companion "${param}" not found. Try /companion list\n`,
              );
            }
          } else if (action === 'show') {
            toggleVisibility(true);
            showCompanionUI();
          } else if (action === 'hide') {
            toggleVisibility(false);
            console.log(
              '\n  Companion hidden. Use /companion show to bring them back.\n',
            );
          } else if (action === 'stats') {
            toggleStats();
            const stats = getAvailableCompanions();
            console.log(
              `\n  Stats display ${showStats ? 'enabled' : 'disabled'}.\n`,
            );
          } else {
            console.log('\n  Usage: /companion [list|set|show|hide|stats]\n');
          }
        } else if (cmd === '/models') {
          console.log('\n  Available models:');
          const specs = {
            'qwen3-coder': 'coding',
            'qwen2.5-coder': 'coding',
            'deepseek-coder': 'coding',
            'deepseek-r1': 'reasoning',
            'qwen2.5': 'general',
            mistral: 'reasoning',
            'llama3.2': 'general',
            'llama3.1': 'general',
          };
          availableModels.forEach((m) => {
            console.log(`  - ${m} (${specs[m] || 'unknown'})`);
          });
          console.log();
        } else if (cmd === '/run') {
          // Command runner
          const fullCmd = arg;
          if (!fullCmd) {
            console.log('\n  Usage: /run <command>\n');
            console.log(
              '  Safe commands run automatically. Dangerous ones prompt for confirmation.\n',
            );
            console.log('  Examples:');
            console.log('    /run npm test');
            console.log('    /run git status');
            console.log('    /run ls -la\n');
          } else {
            if (isSafeCommand(fullCmd)) {
              console.log(`\n  \x1b[36m→ Running: ${fullCmd}\x1b[0m\n`);
              try {
                const output = await runCommand(fullCmd);
                console.log(output || '(no output)');
                console.log();
              } catch (e) {
                console.log(`  \x1b[31mError: ${e.message}\x1b[0m\n`);
              }
            } else if (isDangerousCommand(fullCmd)) {
              const warning = getDangerWarning(fullCmd);
              // Use new follow-up system for dangerous commands
              startQuestionFlow(
                createConfirmQuestion(
                  `run "${fullCmd}"`,
                  { message: warning, risk: 'high' },
                  {
                    context: 'Dangerous command execution',
                    onConfirm: async () => {
                      console.log(`\n  \x1b[36m→ Running: ${fullCmd}\x1b[0m\n`);
                      try {
                        const output = await runCommand(fullCmd);
                        console.log(output || '(no output)');
                        console.log();
                        return 'Command executed successfully';
                      } catch (e) {
                        console.log(`  \x1b[31mError: ${e.message}\x1b[0m\n`);
                        throw e;
                      }
                    },
                    onCancel: () => {
                      console.log('  \x1b[90mCancelled.\x1b[0m\n');
                      return 'Execution cancelled';
                    },
                  },
                ),
                { command: fullCmd, warning },
              );
            } else if (global.DANGER_ALWAYS) {
              console.log(
                `\n  \x1b[36m→ Running (danger bypass): ${fullCmd}\x1b[0m\n`,
              );
              try {
                const output = await runCommand(fullCmd);
                console.log(output || '(no output)');
                console.log();
              } catch (e) {
                console.log(`  \x1b[31mError: ${e.message}\x1b[0m\n`);
              }
            } else {
              // Unknown command - run it but warn
              console.log(`\n  \x1b[33m⚠️  Running: ${fullCmd}\x1b[0m\n`);
              try {
                const output = await runCommand(fullCmd);
                console.log(output || '(no output)');
                console.log();
              } catch (e) {
                console.log(`  \x1b[31mError: ${e.message}\x1b[0m\n`);
              }
            }
          }
        } else if (cmd === '/git') {
          // Git workflow commands
          const gitArgs = arg.split(' ');
          const subCmd = gitArgs[0];
          const subArg = gitArgs.slice(1).join(' ');

          if (!subCmd || subCmd === 'status') {
            const status = await gitStatus();
            console.log('\n  Git Status:');
            console.log(`  Branch: ${status.branch || 'detached'}`);
            if (status.status) {
              console.log(status.status);
            } else {
              console.log('  Working tree clean');
            }
            console.log();
          } else if (subCmd === 'diff') {
            const diff = await gitDiff(
              subArg === '--staged' || subArg === '-s',
            );
            console.log(diff || '(no changes)');
            console.log();
          } else if (subCmd === 'commit') {
            if (!subArg) {
              console.log('\n  Auto-committing with generated message...\n');
              const result = await gitAutoCommit();
              console.log(`  ${result.message}\n`);
            } else {
              const result = await gitCommit(
                subArg.replace(/^["']|["']$/g, ''),
                subArg.includes('--amend'),
              );
              console.log(`  \x1b[32mCommitted!\x1b[0m\n`);
            }
          } else if (subCmd === 'push') {
            console.log('\n  Pushing...\n');
            try {
              await gitPush(subArg === '-f' || subArg === '--force');
              console.log('  \x1b[32mPushed!\x1b[0m\n');
            } catch (e) {
              console.log(`  \x1b[31mError: ${e.message}\x1b[0m\n`);
            }
          } else if (subCmd === 'log') {
            const log = await gitLog(parseInt(subArg) || 10);
            console.log(`\n${log}\n`);
          } else if (subCmd === 'help') {
            console.log('\n  Git Commands:');
            console.log('    /git status    - Current branch and changes');
            console.log('    /git diff      - Unstaged changes');
            console.log('    /git diff -s   - Staged changes');
            console.log(
              '    /git commit    - Auto-commit with generated message',
            );
            console.log('    /git push      - Push current branch');
            console.log('    /git push -f   - Force push');
            console.log('    /git log       - Recent commits\n');
          } else {
            console.log(`\n  Unknown git command: ${subCmd}\n`);
          }
        } else if (cmd === '/skill') {
          const skillArgs = arg.split(' ');
          const action = skillArgs[0];

          if (action === 'list' || !action) {
            const skills = listSkills();
            console.log('\n  Skills:');
            if (skills.length === 0) {
              console.log('    No skills defined.\n');
            } else {
              skills.forEach((s) => {
                console.log(`  - ${s.name}: ${s.purpose}`);
                console.log(
                  `    Triggers: ${s.triggers?.join(', ') || 'none'}`,
                );
              });
              console.log();
            }
          } else if (action === 'create') {
            const description = skillArgs.slice(1).join(' ');
            if (!description) {
              console.log(
                '\n  Usage: /skill create "I want a skill that helps me write blog posts in my voice"\n',
              );
            } else {
              console.log(`\n  Creating skill from: "${description}"\n`);
              const skill = await parseSkillFromNaturalLanguage(description);
              if (skill) {
                const skills = loadSkills();
                skills.skills.push(skill);
                saveSkills(skills);
                console.log(`  \x1b[32mCreated skill: ${skill.name}\x1b[0m`);
                console.log(`  Triggers: ${skill.triggers.join(', ')}\n`);
              } else {
                console.log('  \x1b[31mFailed to create skill.\x1b[0m\n');
              }
            }
          } else if (action === 'delete' || action === 'remove') {
            const name = skillArgs[1];
            if (name) {
              if (deleteSkill(name)) {
                console.log(`\n  \x1b[32mDeleted skill: ${name}\x1b[0m\n`);
              } else {
                console.log('\n  Skill not found.\n');
              }
            } else {
              console.log('\n  Usage: /skill delete <name>\n');
            }
          } else if (action === 'help') {
            console.log('\n  Skill Commands:');
            console.log('    /skill list              - List all skills');
            console.log('    /skill create "自然语言描述" - Create new skill');
            console.log('    /skill delete <name>     - Delete a skill\n');
          } else {
            console.log(`\n  Unknown skill action: ${action}\n`);
          }
        } else if (cmd === '/search') {
          // Web search
          const searchQuery = arg;
          if (!searchQuery) {
            console.log('\n  Usage: /search <query>\n');
            console.log('  Examples:');
            console.log('    /search "latest React 19 features"');
            console.log('    /search "Node.js 22 new features"');
            console.log('    /search "Claude API pricing"\n');
          } else {
            console.log(`\n  \x1b[36mSearching: "${searchQuery}"\x1b[0m\n`);

            const results = await webSearch(searchQuery, 5);

            if (results.length === 0) {
              console.log('  No results found.\n');
            } else {
              console.log('  Results:');
              console.log('  ' + '─'.repeat(50));
              results.forEach((r, i) => {
                const num = `\x1b[33m${i + 1}\x1b[0m`;
                console.log(`  ${num}. ${r.title}`);
                console.log(`     ${r.url}`);
                if (r.snippet) {
                  console.log(`     ${r.snippet.slice(0, 100)}...`);
                }
                console.log();
              });
            }
          }
        } else if (cmd === '/fetch') {
          // Fetch webpage content
          const url = arg;
          if (!url) {
            console.log('\n  Usage: /fetch <url>\n');
          } else {
            console.log(`\n  \x1b[36mFetching: ${url}\x1b[0m\n`);
            const content = await webFetch(url);
            if (content) {
              console.log(content.slice(0, 2000));
              console.log('\n  [...truncated]\n');
            } else {
              console.log('  Failed to fetch page.\n');
            }
          }
        } else if (cmd === '/browser') {
          // Browser automation via CDP
          const browserArgs = arg.split(' ');
          const action = browserArgs[0];
          const param = browserArgs.slice(1).join(' ');

          if (action === 'goto' && param) {
            console.log(`\n  \x1b[36mNavigating: ${param}\x1b[0m\n`);
            const success = await browserNavigate(param);
            console.log(
              success ? '  Done.\n' : '  Failed (CDP not available).\n',
            );
          } else if (action === 'content') {
            console.log('\n  Getting page content...\n');
            const result = await browserGetPageContent();
            if (result.error) {
              console.log(`  Error: ${result.error}\n`);
            } else {
              console.log(`  URL: ${result.url}\n`);
              console.log(result.text.slice(0, 2000));
              console.log('\n  [...truncated]\n');
            }
          } else if (action === 'screenshot') {
            console.log('\n  Taking screenshot...\n');
            const data = await browserScreenshot();
            if (data) {
              const fs = await import('fs');
              const path = '/tmp/charlize-screenshot.png';
              fs.writeFileSync(path, Buffer.from(data, 'base64'));
              console.log(`  Saved to: ${path}\n`);
            } else {
              console.log('  Failed (CDP not available).\n');
            }
          } else if (action === 'twitter' && param) {
            console.log(`\n  \x1b[36mSearching Twitter: ${param}\x1b[0m\n`);
            const result = await browserSearchTwitter(param);
            if (result.error) {
              console.log(`  Error: ${result.error}\n`);
            } else {
              console.log(`  Results for: ${param}\n`);
              console.log(result.text.slice(0, 2000));
              console.log('\n  [...truncated]\n');
            }
          } else if (action === 'help' || !action) {
            console.log("\n  Browser Commands (uses ClawdBot's Chrome):\n");
            console.log('    /browser goto <url>    - Navigate to URL');
            console.log('    /browser content       - Get current page text');
            console.log('    /browser screenshot    - Save screenshot to /tmp');
            console.log('    /browser twitter <query> - Search Twitter\n');
            console.log('  Requires ClawdBot gateway running with browser.\n');
          } else {
            console.log(`\n  Unknown browser action: ${action}\n`);
          }
        } else if (cmd === '/workspace') {
          // Workspace management and subagent spawning
          const wsArgs = arg.split(' ');
          const action = wsArgs[0];
          const param = wsArgs.slice(1).join(' ');

          if (action === 'list' || !action) {
            const workspaces = listWorkspaces();
            console.log('\n  Workspaces:\n');
            if (workspaces.length === 0) {
              console.log('    No workspaces found.\n');
            } else {
              workspaces.forEach((w) => {
                const wsPath = path.join(WORKSPACES_DIR, w);
                try {
                  const files = fs
                    .readdirSync(wsPath)
                    .filter(
                      (f) => !f.startsWith('.') && !f.includes('node_modules'),
                    );
                  console.log(`  • ${w} (${files.length} files)`);
                } catch {
                  console.log(`  • ${w}`);
                }
              });
              console.log();
            }
          } else if (action === 'create' && param) {
            const wsPath = getWorkspacePath(param);
            if (!fs.existsSync(wsPath)) {
              fs.mkdirSync(wsPath, { recursive: true });
              console.log(`\n  \x1b[32mCreated workspace: ${param}\x1b[0m\n`);
            } else {
              console.log(`\n  Workspace already exists: ${param}\n`);
            }
          } else if (action === 'run' || action === 'spawn') {
            // /workspace run <workspace> <task>
            // Supports: /workspace run my-workspace "task"
            //           /workspace run ~/projects/my-app "task"
            //           /workspace run /Users/name/project "task"
            const parts = param.split(' ');
            let workspaceInput = parts[0];
            let task = parts.slice(1).join(' ');

            if (!workspaceInput || !task) {
              console.log('\n  Usage: /workspace run <workspace> <task>\n');
              console.log('  Examples:');
              console.log(
                '    /workspace run my-saas "add user authentication"',
              );
              console.log(
                '    /workspace run ~/projects/my-app "fix the auth bug"',
              );
              console.log(
                '    /workspace run /Users/me/code/my-project "review this code"\n',
              );
            } else {
              // Handle absolute paths
              let wsPath;
              let useClaude = false;

              // Check for --claude flag
              if (workspaceInput === '--claude') {
                useClaude = true;
                if (parts[1]) {
                  workspaceInput = parts[1];
                  task = parts.slice(2).join(' ');
                } else {
                  console.log(
                    '\n  Usage: /workspace run --claude <path> <task>\n',
                  );
                  askQuestion();
                  return;
                }
              }

              if (workspaceInput.startsWith('/')) {
                // Absolute path
                wsPath = path.resolve(workspaceInput);
              } else if (workspaceInput.startsWith('~')) {
                // Home-relative path
                wsPath = path.resolve(os.homedir(), workspaceInput.slice(1));
              } else {
                // Workspace name
                wsPath = getWorkspacePath(workspaceInput);
              }

              const displayName = path.basename(wsPath);

              if (!fs.existsSync(wsPath)) {
                console.log(`\n  Creating workspace: ${wsPath}\n`);
                fs.mkdirSync(wsPath, { recursive: true });
              }

              const startTime = Date.now();

              if (useClaude) {
                console.log(`\n  \x1b[33m[Claude Code at: ${wsPath}]\x1b[0m\n`);
                try {
                  const result = await runClaudeSubagent(task, wsPath);
                  console.log('\x1b[32mResult:\x1b[0m ');
                  console.log(result.output);
                  console.log(
                    `\n  \x1b[90m(${((Date.now() - startTime) / 1000).toFixed(1)}s | ${wsPath})\x1b[0m\n`,
                  );
                } catch (err) {
                  console.log(
                    `\n  \x1b[31mClaude Code failed: ${err.message}\x1b[0m\n`,
                  );
                  console.log('  Falling back to Ollama...\n');
                  const model = await selectBestModel(
                    'coding',
                    availableModels,
                  );
                  const result = await runOllamaSubagent(
                    task,
                    model,
                    systemPrompt,
                    wsPath,
                  );
                  console.log('\x1b[32mResult:\x1b[0m ');
                  console.log(result.output);
                  console.log(
                    `\n  \x1b[90m(${((Date.now() - startTime) / 1000).toFixed(1)}s | ${wsPath})\x1b[0m\n`,
                  );
                }
              } else {
                const delegation = shouldDelegate(task);
                const model = await selectBestModel(
                  delegation.type || 'coding',
                  availableModels,
                );

                console.log(
                  `\n  \x1b[33m[Running at: ${wsPath} | Model: ${model}]\x1b[0m\n`,
                );

                const result = await runOllamaSubagent(
                  task,
                  model,
                  systemPrompt,
                  wsPath,
                );
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                console.log('\x1b[32mResult:\x1b[0m ');
                console.log(result.output);
                console.log(`\n  \x1b[90m(${elapsed}s | ${wsPath})\x1b[0m\n`);
              }
            }
          } else if (action === 'files' && param) {
            const wsPath = getWorkspacePath(param);
            try {
              const files = fs
                .readdirSync(wsPath)
                .filter(
                  (f) => !f.startsWith('.') && !f.includes('node_modules'),
                );
              console.log(`\n  Files in ${param}:\n`);
              files.forEach((f) => console.log(`  • ${f}`));
              console.log();
            } catch (e) {
              console.log(`\n  Could not access workspace: ${param}\n`);
            }
          } else if (action === 'open' && param) {
            const wsPath = getWorkspacePath(param);
            if (fs.existsSync(wsPath)) {
              console.log(`\n  \x1b[36mOpening workspace: ${param}\x1b[0m\n`);
              console.log(`  Path: ${wsPath}\n`);
              console.log(
                '  You can now use /workspace run to execute tasks here.\n',
              );
            } else {
              console.log(`\n  Workspace not found: ${param}\n`);
            }
          } else if (action === 'help' || !action) {
            console.log('\n  Workspace Commands:\n');
            console.log(
              '    /workspace list                 - List all workspaces',
            );
            console.log(
              '    /workspace create <name>        - Create new workspace',
            );
            console.log(
              '    /workspace run <path> <task>    - Run task in workspace or existing dir',
            );
            console.log(
              '    /workspace run --claude <path> <task> - Run with Claude Code CLI',
            );
            console.log(
              '    /workspace files <path>         - List files in workspace',
            );
            console.log(
              '    /workspace open <path>          - Show workspace path\n',
            );
            console.log('  Examples:\n');
            console.log('    /workspace create my-saas');
            console.log(
              '    /workspace run my-saas "initialize a Next.js project"',
            );
            console.log(
              '    /workspace run ~/projects/my-app "fix the auth bug"',
            );
            console.log(
              '    /workspace run --claude /path/to/repo "add tests"\n',
            );
            console.log(
              '  Supports: workspace names, ~/ paths, and absolute / paths\n',
            );
          } else {
            console.log(`\n  Unknown workspace action: ${action}\n`);
          }
        } else if (cmd === '/claude') {
          // Run Claude Code CLI as subagent
          const claudeArgs = arg.split(' ');
          let pathArg = claudeArgs[0];
          let task = claudeArgs.slice(1).join(' ');

          if (!pathArg || !task) {
            console.log('\n  Usage: /claude <path> <task>\n');
            console.log('  Examples:');
            console.log(
              '    /claude ~/projects/my-app "Explain the architecture"',
            );
            console.log('    /claude /path/to/repo "Add user authentication"');
            console.log('    /claude . "Fix all TypeScript errors"\n');
            console.log(
              '  Uses Claude Code CLI with local Ollama model via LiteLLM.\n',
            );
          } else {
            // Handle paths
            let wsPath;
            if (pathArg.startsWith('/')) {
              wsPath = path.resolve(pathArg);
            } else if (pathArg.startsWith('~')) {
              wsPath = path.resolve(os.homedir(), pathArg.slice(1));
            } else if (pathArg === '.') {
              wsPath = process.cwd();
            } else {
              wsPath = path.resolve(process.cwd(), pathArg);
            }

            if (!fs.existsSync(wsPath)) {
              console.log(`\n  Path not found: ${wsPath}\n`);
            } else {
              console.log(`\n  [Claude Code at: ${wsPath}]`);
              console.log(`  Task: ${task}\n`);

              const startTime = Date.now();
              try {
                const result = await runClaudeSubagent(task, wsPath);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                console.log('\x1b[32mResult:\x1b[0m ');
                console.log(result.output);
                console.log(`\n  \x1b[90m(${elapsed}s)\x1b[0m\n`);
              } catch (err) {
                console.log(`\n  \x1b[31mError: ${err.message}\x1b[0m\n`);
                // Fallback to Ollama subagent
                console.log('  Falling back to Ollama-based subagent...\n');
                const model = await selectBestModel('coding', availableModels);
                const fallbackResult = await runOllamaSubagent(
                  task,
                  model,
                  systemPrompt,
                  wsPath,
                );
                console.log('\x1b[32mResult:\x1b[0m ');
                console.log(fallbackResult.output);
                console.log();
              }
            }
          }
        } else if (cmd === '/self') {
          // Self-improvement commands
          const selfArgs = arg.split(' ');
          const action = selfArgs[0];
          const param = selfArgs.slice(1).join(' ');

          if (action === 'improve' && param) {
            console.log('\n  Analyzing and improving my own code...\n');
            const result = await improveSelf(param);
            if (result.success) {
              console.log(`  \x1b[32m${result.message}\x1b[0m\n`);
              console.log(
                '  Restart me to see changes: Ctrl+C then npm start\n',
              );
            } else {
              console.log(`  \x1b[31mFailed: ${result.message}\x1b[0m\n`);
            }
          } else if (action === 'reflect') {
            console.log('\n  Self-analyzing...\n');
            const result = await selfReflect();
            if (result.success) {
              console.log(`  Self-rating: ${result.analysis.score}/10`);
              console.log(
                `  Issues found: ${result.analysis.issues?.join(', ') || 'none'}\n`,
              );
              console.log(`  Top priority: ${result.analysis.topPriority}`);
              console.log(
                `  \x1b[36mSuggesting: ${result.analysis.suggestedChange}\x1b[0m\n`,
              );
              console.log('  Run: /improve "<suggestion>" to apply\n');
            } else {
              console.log(`  \x1b[31mFailed: ${result.message}\x1b[0m\n`);
            }
          } else if (action === 'read' && param) {
            const code = await readSelfFile(param);
            if (code) {
              console.log(`\n  ${param}:\n`);
              console.log(code.slice(0, 3000));
              if (code.length > 3000) console.log('\n  [...truncated]\n');
            } else {
              console.log(`\n  Could not read: ${param}\n`);
            }
          } else if (action === 'help' || !action) {
            console.log('\n  Self-Improvement Commands:\n');
            console.log(
              '    /self improve <request>  - Improve my code based on request',
            );
            console.log(
              '    /self reflect           - Self-analyze for improvements',
            );
            console.log('    /self read <file>       - Read source file\n');
            console.log('  Examples:');
            console.log('    /self improve add better error handling');
            console.log('    /self improve make the web search faster');
            console.log('    /self reflect\n');
          } else {
            console.log(`\n  Unknown self action: ${action}\n`);
          }
        } else if (cmd === '/track') {
          // Tracker commands
          const trackStore = new TrackerStore();
          const visionAnalyzer = new VisionAnalyzer();
          const queryEngine = new QueryEngine();
          const personaChat = new PersonaChat(trackStore);

          const trackArgs = arg.split(' ');
          const action = trackArgs[0];
          const trackerName = trackArgs[1];
          const subAction = trackArgs[2];
          const subParam = trackArgs.slice(3).join(' ');

          if (action === 'list' || !action) {
            // List all trackers
            const trackers = trackStore.listTrackers();
            console.log('\n  Trackers:\n');
            if (trackers.length === 0) {
              console.log('    No trackers defined. Create one with:');
              console.log(
                '    /track create          - Start interactive wizard',
              );
              console.log(
                '    /track create "query"  - Create from natural language\n',
              );
            } else {
              trackers.forEach((t) => {
                const records = trackStore.getRecords(t.name);
                const count = records.records?.length || 0;
                const persona = t.config?.persona;
                console.log(
                  `  • ${t.displayName} (@${t.name}) - ${count} entries`,
                );
                console.log(`    Type: ${t.type}`);
                if (persona?.name) {
                  console.log(`    Persona: ${persona.name}`);
                }
                console.log(
                  `    Metrics: ${t.config.metrics?.join(', ') || 'none'}\n`,
                );
              });
            }
          } else if (action === 'create' && !subAction) {
            // Launch interactive wizard
            const result = await runTrackerWizard(rl);
            if (result?.success) {
              console.log(
                `  Your new tracker "@${result.tracker.name}" is ready!\n`,
              );
            }
          } else if (action === 'create' && subAction) {
            // Create a new tracker from natural language
            const description = trackArgs.slice(1).join(' ');
            console.log(`\n  Creating tracker from: "${description}"\n`);

            const config = await parseTrackerFromNaturalLanguage(description);
            if (config) {
              // Ask for confirmation and customization
              const finalConfig = await confirmOrCustomizeTracker(rl, config);

              // Check if tracker name already exists
              const existingTracker = trackStore.getTracker(finalConfig.name);
              if (existingTracker) {
                console.log(
                  `\n  \x1b[31mA tracker named "@${finalConfig.name}" already exists.\x1b[0m`,
                );
                console.log(
                  '  Try a different name with: /track create "my tracker description"\n',
                );
                return;
              }

              const result = trackStore.createTracker(finalConfig);
              if (result.success) {
                console.log(
                  `\n  \x1b[32mCreated tracker: ${finalConfig.displayName}\x1b[0m`,
                );
                console.log(`  Name: @${finalConfig.name}`);
                console.log(`  Type: ${finalConfig.type}`);
                console.log(
                  `  Metrics: ${finalConfig.metrics?.join(', ') || 'none'}`,
                );
                if (finalConfig.persona) {
                  console.log(`  Persona: ${finalConfig.persona.name}`);
                }
                console.log(`\n  Commands:`);
                console.log(
                  `    /track ${finalConfig.name} add "entry"    - Add entry`,
                );
                console.log(
                  `    /track ${finalConfig.name} stats         - View stats`,
                );
                console.log(
                  `    /track ${finalConfig.name} history       - View history`,
                );
                if (finalConfig.persona) {
                  console.log(
                    `    /track ${finalConfig.name} chat "?"     - Chat with ${finalConfig.persona.name}`,
                  );
                }
                console.log(
                  `    /track ${finalConfig.name} delete       - Delete tracker\n`,
                );
              } else {
                console.log(`  \x1b[31m${result.message}\x1b[0m\n`);
              }
            } else {
              console.log(
                '  \x1b[31mFailed to parse tracker description.\x1b[0m\n',
              );
            }
          } else if (trackerName && action === 'chat') {
            // Chat with tracker persona
            const message = subAction || '';
            const tracker = trackStore.getTracker(trackerName);
            if (!tracker) {
              console.log(`\n  Tracker not found: ${trackerName}\n`);
            } else if (!message) {
              console.log(
                '\n  Usage: /track <name> chat "How\'s my progress?"\n',
              );
            } else {
              console.log(
                `\n  ${tracker.config?.persona?.name || tracker.displayName}:\n`,
              );
              const result = await personaChat.chat(
                trackerName,
                message,
                `You are a helpful tracking assistant for ${tracker.displayName}.`,
              );
              if (result.error) {
                console.log(`  Error: ${result.error}\n`);
              } else {
                console.log(`  ${result.response}\n`);
              }
            }
          } else if (trackerName && (action === 'add' || action === 'log')) {
            // Add a record via text
            const text = subAction ? trackArgs.slice(2).join(' ') : '';
            if (!text) {
              console.log(
                '\n  Usage: /track <name> add "Bench press 3x8 at 185"\n',
              );
            } else {
              const tracker = trackStore.getTracker(trackerName);
              if (!tracker) {
                console.log(`\n  Tracker not found: ${trackerName}\n`);
              } else {
                console.log(
                  `\n  Adding entry to ${tracker.displayName}: "${text}"\n`,
                );
                const parsed = await parseRecordFromText(
                  trackerName,
                  text,
                  tracker.type,
                );
                if (parsed.success) {
                  const result = trackStore.addRecord(trackerName, {
                    data: parsed.data,
                    source: 'text',
                  });
                  if (result.success) {
                    console.log('  \x1b[32mEntry added!\x1b[0m');
                    console.log(
                      `  Data: ${JSON.stringify(parsed.data, null, 2).replace(/\n/g, '\n  ')}\n`,
                    );
                  } else {
                    console.log(`  \x1b[31mFailed: ${result.message}\x1b[0m\n`);
                  }
                } else {
                  console.log(
                    `  \x1b[31mFailed to parse: ${parsed.error}\x1b[0m\n`,
                  );
                }
              }
            }
          } else if (trackerName && action === 'image') {
            // Add a record via image
            const imagePath = subAction;
            if (!imagePath) {
              console.log('\n  Usage: /track <name> image <path-to-image>\n');
              console.log('  Example: /track workout image ~/workout.png\n');
            } else {
              // Resolve path
              let resolvedPath = imagePath;
              if (imagePath.startsWith('~')) {
                resolvedPath = path.resolve(os.homedir(), imagePath.slice(1));
              } else if (!imagePath.startsWith('/')) {
                resolvedPath = path.resolve(process.cwd(), imagePath);
              }

              const tracker = trackStore.getTracker(trackerName);
              if (!tracker) {
                console.log(`\n  Tracker not found: ${trackerName}\n`);
              } else if (!fs.existsSync(resolvedPath)) {
                console.log(`\n  Image not found: ${resolvedPath}\n`);
              } else {
                console.log(`\n  Analyzing image: ${resolvedPath}\n`);

                let analysis;
                if (tracker.type === 'workout') {
                  analysis = await visionAnalyzer.analyzeWorkout(resolvedPath);
                } else if (tracker.type === 'food') {
                  analysis = await visionAnalyzer.analyzeFood(resolvedPath);
                } else {
                  // Generic analysis
                  const prompt = `Analyze this image for ${tracker.displayName} tracker.

Extract relevant data and respond with ONLY valid JSON with fields matching these metrics: ${tracker.config.metrics?.join(', ') || 'custom'}

Respond with JSON containing a "data" object with the extracted values.`;
                  const content = await visionAnalyzer.analyzeImage(
                    resolvedPath,
                    prompt,
                  );
                  try {
                    analysis = JSON.parse(
                      content.match(/\{[\s\S]*\}/)?.[0] || '{}',
                    );
                  } catch {
                    analysis = { error: 'Failed to parse image' };
                  }
                }

                if (analysis.error) {
                  console.log(
                    `  \x1b[31mAnalysis failed: ${analysis.error}\x1b[0m\n`,
                  );
                } else {
                  // Try to parse as JSON
                  let parsedData = analysis;
                  if (typeof analysis === 'string') {
                    try {
                      parsedData = JSON.parse(
                        analysis.match(/\{[\s\S]*\}/)?.[0] || '{}',
                      );
                    } catch {
                      console.log(`  Analysis: ${analysis}\n`);
                    }
                  }

                  if (
                    parsedData.exercise ||
                    parsedData.meal ||
                    parsedData.data
                  ) {
                    const result = trackStore.addRecord(trackerName, {
                      data: parsedData.data || parsedData,
                      source: 'image',
                    });

                    if (result.success) {
                      console.log('  \x1b[32mEntry added from image!\x1b[0m');
                      console.log(
                        `  Data: ${JSON.stringify(parsedData.data || parsedData, null, 2).replace(/\n/g, '\n  ')}\n`,
                      );
                    } else {
                      console.log(
                        `  \x1b[31mFailed: ${result.message}\x1b[0m\n`,
                      );
                    }
                  } else {
                    console.log(
                      `  Could not extract data: ${JSON.stringify(parsedData)}\n`,
                    );
                  }
                }
              }
            }
          } else if (trackerName && (action === 'stats' || action === 'stat')) {
            // Show statistics
            const period = subAction || subParam || 'week';
            const tracker = trackStore.getTracker(trackerName);
            if (!tracker) {
              console.log(`\n  Tracker not found: ${trackerName}\n`);
            } else {
              const stats = queryEngine.getStats(trackerName, period);
              console.log(queryEngine.formatStats(stats));
            }
          } else if (trackerName && action === 'history') {
            // Show recent entries
            const tracker = trackStore.getTracker(trackerName);
            if (!tracker) {
              console.log(`\n  Tracker not found: ${trackerName}\n`);
            } else {
              const limit = parseInt(subAction) || 10;
              const records = trackStore.getRecentRecords(trackerName, limit);
              console.log(queryEngine.formatHistory(records));
            }
          } else if (trackerName && action === 'compare') {
            // Compare two periods
            const period1 = subAction;
            const period2 = subParam;
            const tracker = trackStore.getTracker(trackerName);

            if (!tracker) {
              console.log(`\n  Tracker not found: ${trackerName}\n`);
            } else if (!period1 || !period2) {
              console.log(
                '\n  Usage: /track <name> compare <period1> <period2>\n',
              );
              console.log(
                '  Example: /track workout compare this-week last-week',
              );
              console.log(
                '  Periods: today, yesterday, week, month, this-week, last-week, this-month, last-month\n',
              );
            } else {
              const comparison = queryEngine.comparePeriods(
                trackerName,
                period1,
                period2,
              );
              console.log(queryEngine.formatComparison(comparison));
            }
          } else if (
            trackerName &&
            (action === 'delete' || action === 'remove')
          ) {
            // Delete tracker
            const tracker = trackStore.getTracker(trackerName);
            if (!tracker) {
              console.log(`\n  Tracker not found: ${trackerName}\n`);
            } else {
              const result = trackStore.deleteTracker(trackerName);
              if (result.success) {
                console.log(
                  `\n  \x1b[32mDeleted tracker: ${tracker.displayName}\x1b[0m\n`,
                );
              } else {
                console.log(`\n  \x1b[31mFailed: ${result.message}\x1b[0m\n`);
              }
            }
          } else if (trackerName && action === 'edit') {
            // Edit a record
            const editMatch = subParam.match(/([\w-]+)\s+(.+)/);
            if (!editMatch) {
              console.log('\n  Usage: /track <name> edit <id> <data>\n');
              console.log('  Examples:');
              console.log('    /track matt edit abc123 "total_cals=500"');
              console.log('    /track matt edit abc123 \'{"max_hr": 175}\'');
              console.log('    /track matt history (to see IDs)\n');
            } else {
              const recordId = editMatch[1];
              const newDataStr = editMatch[2].trim();
              const tracker = trackStore.getTracker(trackerName);
              if (!tracker) {
                console.log(`\n  Tracker not found: ${trackerName}\n`);
              } else {
                const records = trackStore.getRecords(trackerName);
                const record = records.records?.find(
                  (r) => r.id.includes(recordId) || r.id.slice(-6) === recordId,
                );

                if (!record) {
                  console.log(`\n  Record not found: ${recordId}\n`);
                } else {
                  let newData;
                  try {
                    newData = JSON.parse(newDataStr);
                  } catch {
                    newData = {};
                    const pairs = newDataStr.match(/(\w+)=([^""]+|"[^""]*")/g);
                    if (pairs) {
                      pairs.forEach((pair) => {
                        const [key, ...val] = pair.split('=');
                        newData[key.trim()] = val
                          .join('=')
                          .replace(/^["']|["']$/g, '')
                          .trim();
                      });
                    } else {
                      newData = { notes: newDataStr };
                    }
                  }

                  const result = trackStore.updateRecord(
                    trackerName,
                    record.id,
                    newData,
                  );
                  if (result.success) {
                    console.log(`\n  \x1b[32mUpdated @${trackerName}\x1b[0m`);
                    console.log(
                      `  New data: ${JSON.stringify(result.record.data, null, 2)}\n`,
                    );
                  } else {
                    console.log(`\n  Failed: ${result.message}\n`);
                  }
                }
              }
            }
          } else if (trackerName && action === 'history') {
            // Show history with IDs
            const tracker = trackStore.getTracker(trackerName);
            if (!tracker) {
              console.log(`\n  Tracker not found: ${trackerName}\n`);
            } else {
              const limit = parseInt(subAction) || 10;
              const records = trackStore.getRecentRecords(trackerName, limit);
              if (records.length === 0) {
                console.log(`\n  No entries yet.\n`);
              } else {
                console.log(`\n  Recent entries:\n`);
                records.forEach((r) => {
                  console.log(
                    `  [${r.date}] ${r.id.slice(-8)}: ${JSON.stringify(r.data)}`,
                  );
                });
                console.log(
                  `\n  To edit: /track ${trackerName} edit <id> "field=value"\n`,
                );
              }
            }
          } else if (action === 'help') {
            console.log('\n  Tracker Commands:\n');
            console.log(
              '    /track list                           - List all trackers',
            );
            console.log(
              '    /track create                         - Launch interactive wizard',
            );
            console.log(
              '    /track create "query"                 - Create from natural language',
            );
            console.log(
              '    /track <name> add "text entry"        - Add entry via natural language',
            );
            console.log(
              '    /track <name> image <path>            - Add entry via image analysis',
            );
            console.log(
              '    /track <name> chat "question"         - Chat with tracker persona',
            );
            console.log(
              '    /track <name> stats [period]          - Show statistics',
            );
            console.log(
              '    /track <name> history [limit]         - Show recent entries',
            );
            console.log(
              '    /track <name> compare <p1> <p2>       - Compare two periods',
            );
            console.log(
              '    /track <name> edit <id> <data>        - Edit a record',
            );
            console.log(
              '    /track <name> delete                  - Delete tracker',
            );
            console.log(
              '    /track <name> persona                 - Manage tracker persona\n',
            );
            console.log('  Examples:\n');
            console.log(
              '    /track create                         - Interactive wizard',
            );
            console.log(
              '    /track create "workout tracker with exercise, weight, reps"',
            );
            console.log('    /track workout add "Deadlift 3x10 at 185 lbs"');
            console.log('    /track workout image ~/workout.png');
            console.log(
              '    /track workout chat "How\'s my progress this month?"',
            );
            console.log('    /track workout stats week');
            console.log('    /track workout compare this-week last-week');
            console.log('    /track workout history\n');
            console.log(
              '  Periods: today, yesterday, week, month, this-week, last-week, this-month, last-month\n',
            );
            console.log('  @tracker commands (natural language!):\n');
            console.log(
              '    @matt last                            - Show last entry',
            );
            console.log(
              '    @matt history                         - Show recent entries',
            );
            console.log(
              '    @matt the calories was 500            - Edit last entry',
            );
            console.log(
              '    @matt max_hr was 175                  - Edit last entry',
            );
            console.log(
              '    @matt fix: total_cals=450             - Edit last entry',
            );
            console.log(
              '    @matt delete                          - Delete last entry\n',
            );
          } else {
            console.log('\n  Usage: /track <command> [args]\n');
            console.log('  Run /track help for full command list.\n');
          }
        }
        askQuestion();
        return;
      }

      // Handle @tracker mentions (e.g., @matt how's my progress?)
      if (q.startsWith('@')) {
        const trackStore = new TrackerStore();
        const queryEngine = new QueryEngine();
        const personaChat = new PersonaChat(trackStore);

        // Extract tracker name and query
        const spaceIndex = q.indexOf(' ');
        let trackerName, query;

        if (spaceIndex === -1) {
          // Just @tracker with no query - show tracker info
          trackerName = q.slice(1);
          const tracker = trackStore.getTracker(trackerName);
          if (!tracker) {
            console.log(`\n  Tracker not found: ${trackerName}\n`);
            askQuestion();
            return;
          }

          // Show tracker info
          const records = trackStore.getRecords(trackerName);
          const count = records.records?.length || 0;
          console.log(`\n  ${tracker.displayName} (@${tracker.name})`);
          console.log(`  Type: ${tracker.type}`);
          console.log(`  Entries: ${count}`);
          console.log(
            `  Metrics: ${tracker.config.metrics?.join(', ') || 'none'}\n`,
          );

          if (tracker.config?.persona) {
            console.log(`  Persona: ${tracker.config.persona.name}`);
            console.log(`  Chat: @${tracker.name} "How's my progress?"\n`);
          }
          askQuestion();
          return;
        } else {
          trackerName = q.slice(1, spaceIndex);
          query = q.slice(spaceIndex + 1);
        }

        const tracker = trackStore.getTracker(trackerName);
        if (!tracker) {
          console.log(`\n  Tracker not found: ${trackerName}\n`);
          askQuestion();
          return;
        }

        console.log(`\n  [${tracker.displayName}]\n`);

        // Check for common queries
        const lowerQuery = query.toLowerCase();

        if (
          lowerQuery.startsWith('stats') ||
          lowerQuery === '?' ||
          lowerQuery.includes('progress')
        ) {
          // Show stats
          const period = lowerQuery.includes('week')
            ? 'week'
            : lowerQuery.includes('month')
              ? 'month'
              : lowerQuery.includes('today')
                ? 'today'
                : 'week';
          const stats = queryEngine.getStats(trackerName, period);
          console.log(queryEngine.formatStats(stats));
        } else if (lowerQuery.startsWith('history') || lowerQuery === 'log') {
          // Show history
          const limit = parseInt(lowerQuery.match(/\d+/)?.[0]) || 10;
          const records = trackStore.getRecordsByDateRange(
            trackerName,
            null,
            null,
          );
          const recent = records.slice(-limit);
          console.log(queryEngine.formatHistory(recent));
        } else if (
          lowerQuery.startsWith('add ') ||
          lowerQuery.startsWith('log ') ||
          lowerQuery.startsWith('record ')
        ) {
          // Add entry
          const text = query.replace(/^(add|log|record)\s+/i, '');
          console.log(`  Adding entry: "${text}"\n`);
          const parsed = await parseRecordFromText(
            trackerName,
            text,
            tracker.type,
          );
          if (parsed.success) {
            const result = trackStore.addRecord(trackerName, {
              data: parsed.data,
              source: 'text',
            });
            if (result.success) {
              console.log('  Entry added!\n');
            } else {
              console.log(`  Failed: ${result.message}\n`);
            }
          } else {
            console.log(`  Failed to parse: ${parsed.error}\n`);
          }
        } else if (
          lowerQuery.startsWith('chat ') ||
          lowerQuery.startsWith('ask ')
        ) {
          // Chat with persona
          const message = query.replace(/^(chat|ask)\s+/i, '');
          const result = await personaChat.chat(
            trackerName,
            message,
            `You are a helpful assistant for ${tracker.displayName}.`,
          );
          if (result.error) {
            console.log(`  Error: ${result.error}\n`);
          } else {
            console.log(`  ${result.response}\n`);
          }
        } else if (
          lowerQuery.startsWith('last') ||
          lowerQuery.includes('last ') ||
          lowerQuery.includes(' most recent')
        ) {
          // Show the most recent entry
          const records = trackStore.getRecords(trackerName);
          const recentRecords = records.records || records;
          if (recentRecords.length > 0) {
            const last = recentRecords[recentRecords.length - 1];
            console.log(`\n  Last entry (${last.date}):`);
            console.log(`  ${JSON.stringify(last.data, null, 2)}\n`);
            console.log(
              `  To fix: @${trackerName} the calories was actually 500\n`,
            );
          } else {
            console.log(`  No entries yet.\n`);
          }
        } else if (
          lowerQuery.includes('what was') ||
          lowerQuery.includes('show me') ||
          lowerQuery.includes('tell me')
        ) {
          // Show history or last entry
          const records = trackStore.getRecords(trackerName);
          const recentRecords = (records.records || records).slice(-5);
          if (recentRecords.length > 0) {
            console.log(`\n  Recent entries:\n`);
            recentRecords.forEach((r) => {
              console.log(`  [${r.date}] ${JSON.stringify(r.data)}`);
            });
            console.log(`\n  To edit: @${trackerName} the max_hr was 175\n`);
          } else {
            console.log(`  No entries yet.\n`);
          }
        } else if (
          lowerQuery.startsWith('edit ') ||
          lowerQuery.startsWith('update ') ||
          lowerQuery.startsWith('fix ') ||
          lowerQuery.startsWith('change ')
        ) {
          // Edit/update a record - supports both ID and natural language
          // Natural language examples:
          // @matt edit abc123 "total_cals=500"
          // @matt the calories was actually 500
          // @matt max hr was 180
          // @matt fix: pte was 85 not 75

          // First try to find record
          const fullRecords = trackStore.getRecords(trackerName);
          const recentRecords = fullRecords.records || [];

          // Check if query mentions "last" or "my"
          const isLastEntry = /last|my (entry|workout)/i.test(query);
          const record =
            isLastEntry && recentRecords.length > 0
              ? recentRecords[recentRecords.length - 1]
              : recentRecords.find((r) => {
                  const shortId = r.id.slice(-6);
                  return query.includes(shortId) || query.includes(r.id);
                });

          if (!record) {
            console.log(`\n  Couldn't find which entry to edit. Try:\n`);
            console.log(`    @${trackerName} last\n`);
            console.log(`  or\n`);
            console.log(`    @${trackerName} edit <id> "field=value"\n`);
          } else {
            // Parse the update from natural language
            let newData = {};

            // Patterns for natural language field=value
            const valuePatterns = [
              // field was value (handles numbers, text)
              /(\w+)\s+(?:was|is)\s+([^\s,.]+(?:\s+[^\s,.]+)*)/gi,
              // field=value or field = value
              /(\w+)=([^\s,."']+)/gi,
              // field: value
              /(\w+):\s*([^\s,."']+)/gi,
            ];

            valuePatterns.forEach((pattern) => {
              let match;
              while ((match = pattern.exec(query)) !== null) {
                const field = match[1].toLowerCase();
                let value = match[2].replace(/[,"']/g, '').trim();
                // Convert numbers
                if (!isNaN(value) && value !== '') {
                  value = parseFloat(value);
                }
                newData[field] = value;
              }
            });

            // If no fields parsed, use the whole query as notes
            if (Object.keys(newData).length === 0) {
              newData = {
                notes: query
                  .replace(/^(edit|update|fix|change)\s+/i, '')
                  .trim(),
              };
            }

            const result = trackStore.updateRecord(
              trackerName,
              record.id,
              newData,
            );
            if (result.success) {
              console.log(
                `\n  \x1b[32mUpdated @${trackerName} (${record.date})\x1b[0m`,
              );
              console.log(
                `  Changed: ${Object.keys(newData)
                  .map((k) => `${k}=${newData[k]}`)
                  .join(', ')}\n`,
              );
            } else {
              console.log(`\n  Failed: ${result.message}\n`);
            }
          }
        } else if (
          lowerQuery.startsWith('delete ') ||
          lowerQuery.startsWith('remove ')
        ) {
          // Delete a record - supports "last" naturally
          const fullRecords = trackStore.getRecords(trackerName);
          const recentRecords = fullRecords.records || [];

          // Check for "last" or just bare delete
          const isLastEntry = /last|this|my/i.test(query) || !query.match(/\d/);
          const record =
            isLastEntry && recentRecords.length > 0
              ? recentRecords[recentRecords.length - 1]
              : recentRecords.find((r) => {
                  const shortId = r.id.slice(-6);
                  return query.includes(shortId) || query.includes(r.id);
                });

          if (!record) {
            console.log(`\n  Record not found.\n`);
          } else {
            const recordsFile = path.join(
              TRACKERS_DIR,
              trackerName,
              'records.json',
            );
            const data = trackStore.getRecords(trackerName);
            data.records = data.records.filter((r) => r.id !== record.id);
            fs.writeFileSync(recordsFile, JSON.stringify(data, null, 2));
            console.log(
              `\n  \x1b[32mDeleted entry from ${record.date}\x1b[0m\n`,
            );
          }
        } else {
          // Check for custom auto-detect triggers first (user-defined in tracker config)
          const hasCustomAutoDetect = matchesAutoDetect(tracker, query);

          // Legacy workout auto-detect (backward compatibility)
          const workoutTriggers = [
            /i (did|completed|finished|just did|just completed|went to|just went to)/i,
            /(F45|crossfit|cross\.fit|gym|workout|session|race)/i,
            /(ran|cycled|swam|lifted|trained)/i,
            /miles?|km|reps|sets/i,
            /(morning|afternoon|evening) workout/i,
          ];

          const looksLikeWorkoutLog =
            workoutTriggers.some((p) => p.test(query)) &&
            !lowerQuery.includes('how') &&
            !lowerQuery.includes('what') &&
            !lowerQuery.includes('?');

          // Determine if this should be auto-logged
          const shouldAutoLog =
            hasCustomAutoDetect ||
            (tracker.type === 'workout' && looksLikeWorkoutLog);

          if (shouldAutoLog) {
            // Determine parser type: custom triggers use tracker's type, workouts use 'workout'
            const parserType = hasCustomAutoDetect ? tracker.type : 'workout';

            // Auto-log the entry
            const parsed = await parseRecordFromText(
              trackerName,
              query,
              parserType,
            );
            let recordData = parsed.data;

            // Fallback for workouts if parsing failed
            if (
              (!recordData || Object.keys(recordData).length === 0) &&
              parserType === 'workout'
            ) {
              recordData = {
                exercise: 'Workout',
                notes: query,
                duration: null,
                sets: null,
                reps: null,
                weight: null,
              };
            }

            // Fallback for nutrition if parsing failed - create basic meal entry
            if (
              (!recordData || Object.keys(recordData).length === 0) &&
              parserType === 'nutrition'
            ) {
              recordData = {
                meal: 'Meal',
                foods: query,
                calories: null,
                protein: null,
                carbs: null,
                fat: null,
              };
            }

            const result = trackStore.addRecord(trackerName, {
              data: recordData,
              source: 'auto-detect',
            });

            if (result.success) {
              console.log(`  [Entry logged]\n`);
              if (parserType === 'workout') {
                reactToEvent('workout_logged');
              }
            }

            // Still provide a response
            if (tracker.config?.persona) {
              const chatResult = await personaChat.chat(
                trackerName,
                query,
                `You are a helpful assistant for ${tracker.displayName}. Answer concisely.`,
              );
              if (!chatResult.error) {
                console.log(`  ${chatResult.response}\n`);
              }
            } else {
              console.log(`  Logged: ${query}\n`);
            }
          } else if (tracker.config?.persona) {
            const result = await personaChat.chat(
              trackerName,
              query,
              `You are a helpful assistant for ${tracker.displayName}. Answer concisely.`,
            );
            if (result.error) {
              console.log(`  Error: ${result.error}\n`);
            } else {
              console.log(`  ${result.response}\n`);
            }
          } else {
            // Show quick stats
            const stats = queryEngine.getStats(trackerName, 'week');
            console.log(queryEngine.formatStats(stats));
          }
        }

        askQuestion();
        return;
      }

      try {
        // Auto-delegation check
        const delegation = shouldDelegate(q);
        const skillMatch = matchSkill(q);

        // Check if we should auto-search
        // Extract domain from query for more specific search
        const urlMatch = q.match(/https?:\/\/[^\s]+/);
        const domainMatch = q.match(/([a-z]+\.[a-z]+(?:\.[a-z]+)?)/i);
        const domain = domainMatch ? domainMatch[1] : null;

        const needsSearch =
          /\b(latest|recent|newest|what'?s new|recently released|news|current version|articles?|posts?|blog)\b/i.test(
            q,
          ) || domain;

        let searchResults = [];
        let fetchedContent = null;
        let effectiveQuery = q;

        if (urlMatch) {
          // Direct URL in query - fetch the page and prepend content to query
          console.log(`  \x1b[36m[Fetching: ${urlMatch[0]}]\x1b[0m\n`);
          fetchedContent = await webFetch(urlMatch[0]);
          if (fetchedContent) {
            effectiveQuery = `PAGE CONTENT:\n${fetchedContent.slice(0, 5000)}\n\nQUESTION: ${q}`;
          }
        } else if (needsSearch) {
          // If query contains a domain, search that specific site
          if (domain && !q.includes('site:')) {
            const searchQuery = `site:${domain} ${q.replace(domain, '').trim()}`;
            console.log(`  \x1b[36m[Searching: ${searchQuery}]\x1b[0m\n`);
            searchResults = await webSearch(searchQuery, 5);
          } else {
            console.log(`  \x1b[36m[Searching: ${q}]\x1b[0m\n`);
            searchResults = await webSearch(q, 5);
          }
        }

        if (delegation.delegate) {
          const model = await selectBestModel(delegation.type, availableModels);
          console.log(`\n  \x1b[33m[Delegating to ${model}]\x1b[0m\n`);

          const startTime = Date.now();
          const result = await runOllamaSubagent(
            effectiveQuery,
            model,
            systemPrompt,
          );
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          console.log('\x1b[32mCharlize:\x1b[0m ');
          console.log(formatMessage(result));
          console.log(`\n  \x1b[90m(${elapsed}s | ${model})\x1b[0m\n`);
        } else {
          // Handle directly
          console.log('\x1b[32mCharlize:\x1b[0m ');

          // Apply skill context if matched
          let effectiveSystemPrompt = systemPrompt;
          if (skillMatch) {
            console.log(
              `  \x1b[36m[Using skill: ${skillMatch.skill.name}]\x1b[0m\n`,
            );
            effectiveSystemPrompt = `${systemPrompt}\n\n---\n\n[ACTIVE SKILL: ${skillMatch.skill.name}]\n${skillMatch.skill.system_prompt}`;
          }

          // Add tracker context so AI knows about available trackers and recent data
          try {
            const trackStore = new TrackerStore();
            const queryEngine = new QueryEngine();
            const trackers = trackStore.listTrackers();

            if (trackers.length > 0) {
              const trackerList = trackers
                .map((t) => {
                  // Get today's stats for this tracker
                  const stats = queryEngine.getStats(t.name, 'today');
                  const recordCount = stats.records?.length || 0;

                  let summary = `- @${t.name}: ${t.displayName} (${t.type}) - ${recordCount} entries today`;

                  // Add key metrics summary if available
                  if (stats.metrics && Object.keys(stats.metrics).length > 0) {
                    const metricSummary = Object.entries(stats.metrics)
                      .map(([key, values]) => {
                        if (values.total !== undefined) {
                          return `${key}=${values.total}`;
                        }
                        return null;
                      })
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(', ');
                    if (metricSummary) {
                      summary += ` (${metricSummary})`;
                    }
                  }

                  return summary;
                })
                .join('\n');

              effectiveSystemPrompt += `\n\n<USER TRACKERS>\nThe user has the following trackers available:\n${trackerList}\n\nWhen the user mentions trackable data (like food, workouts, sleep, etc.), the system automatically detects and logs it to the appropriate tracker. If no suitable tracker exists, one will be created automatically.

IMPORTANT: When answering questions about tracked data (like "how many calories today?"), use the stats shown above to provide accurate answers. The system tracks this data automatically, so you can reference these numbers confidently.

Users can also explicitly interact with trackers using @trackerName (e.g., "@matt how am I doing?" or "@matt stats").\n</USER TRACKERS>`;
            } else {
              effectiveSystemPrompt += `\n\n<USER TRACKERS>\nThe user doesn't have any trackers yet. When they mention trackable data (like "I had coffee", "finished a workout", "slept 8 hours"), the system will automatically create an appropriate tracker and log the data. You don't need to tell them to create trackers - just acknowledge their input naturally.\n</USER TRACKERS>`;
            }
          } catch (e) {
            // Ignore tracker errors
          }

          // Add search results to context if we searched
          if (searchResults.length > 0) {
            const searchContext = searchResults
              .map(
                (r, i) =>
                  `[Source ${i + 1}] Title: ${r.title}\nURL: ${r.url}\n${r.snippet || ''}`,
              )
              .join('\n---\n');
            effectiveSystemPrompt += `\n\n<IMPORTANT: WEB SEARCH RESULTS>\n${searchContext}\n\nYou MUST use these search results to answer the user's question. If the search results don't contain relevant information, say so explicitly. DO NOT fabricate articles, titles, or information that isn't in these results.\n</IMPORTANT: WEB SEARCH RESULTS>`;
          }

          // CRITICAL: Check for natural language queries FIRST (e.g., "show me my workouts")
          let queryResult = null;
          try {
            queryResult = await routeNaturalLanguageQuery(q);
          } catch (e) {
            if (VERBOSE) {
              console.log(
                `  \x1b[90m[Query routing error: ${e.message}]\x1b[0m`,
              );
            }
          }

          // If a query was executed, skip normal tracking and tell LLM what happened
          if (queryResult && queryResult.executed) {
            effectiveSystemPrompt += `\n\n<SYSTEM_ACTION_COMPLETED>\nThe system has automatically executed a ${queryResult.queryType} query for @${queryResult.tracker.name} and displayed the results above.\n\nYou should provide a brief, natural summary or comment about the data shown. Don't repeat the numbers - just add context or insight.\n</SYSTEM_ACTION_COMPLETED>`;
          }

          // CRITICAL: Run auto-tracking BEFORE LLM responds so it knows what actually happened
          // Skip if we already executed a query
          let trackingResult = null;
          if (!queryResult) {
            try {
              trackingResult = await detectAndRouteTrackableData(q);
            } catch (e) {
              // Silently fail - don't disrupt the conversation
              if (VERBOSE) {
                console.log(
                  `  \x1b[90m[Auto-track error: ${e.message}]\x1b[0m`,
                );
              }
            }
          }

          // If tracking happened, add it to the context so LLM knows about it
          if (trackingResult) {
            let actionSummary;
            let actionVerb = 'tracked';

            if (trackingResult.undone) {
              actionSummary = `Deleted last entry from @${trackingResult.tracker.name}`;
              actionVerb = 'deleted';
            } else if (trackingResult.corrected) {
              actionSummary = `Corrected @${trackingResult.tracker.name}: ${trackingResult.field}=${trackingResult.value}`;
              actionVerb = 'corrected';
            } else if (trackingResult.created) {
              actionSummary = `Created new tracker @${trackingResult.tracker.name} and logged`;
              actionVerb = 'created and tracked';
            } else {
              actionSummary = `Logged to @${trackingResult.tracker.name}`;
              actionVerb = 'tracked';
            }

            effectiveSystemPrompt += `\n\n<SYSTEM_ACTION_COMPLETED>\nThe system has automatically ${actionSummary}: ${JSON.stringify(trackingResult.data)}\n\nYou should acknowledge this naturally without repeating the technical details. The user's data has been successfully ${actionVerb}.\n</SYSTEM_ACTION_COMPLETED>`;
          }

          const startTime = Date.now();
          const { response } = await askWithMemory(
            effectiveQuery,
            effectiveSystemPrompt,
          );
          const answer = response.message?.content || 'No response';

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(formatMessage(answer));
          console.log(`\n  \x1b[90m(${elapsed}s)\x1b[0m\n`);

          // EXPERIMENTAL: Detect if LLM suggested an action and execute it
          try {
            const actionIntent = await detectAndExecuteActionIntents(answer, q);
            if (actionIntent && actionIntent.executed) {
              console.log(
                `  \x1b[90m[Auto-executed: ${actionIntent.action} for @${actionIntent.tracker.name}]\x1b[0m\n`,
              );
            }
          } catch (e) {
            // Silently fail
            if (VERBOSE) {
              console.log(
                `  \x1b[90m[Action intent error: ${e.message}]\x1b[0m`,
              );
            }
          }

          // Show search sources if we searched
          if (searchResults.length > 0) {
            console.log('  \x1b[90mSources:\x1b[0m');
            searchResults.forEach((r) => console.log(`    • ${r.url}`));
            console.log();
          }

          // Show fetched URL
          if (urlMatch && fetchedContent) {
            console.log(`  \x1b[90m[Fetched ${urlMatch[0]}]\x1b[0m\n`);
          }

          // Auto-capture preferences (broader pattern for natural language)
          const memoryTriggers = [
            /i (like|prefer|hate|love|need|want|don'?t like|really like)/i,
            /my (favorite|preferred|preferred|least favorite)/i,
            /remember (that|to)/i,
            /don'?t forget/i,
            /always (use|prefer|like|need)/i,
            /never (use|prefer|like)/i,
            /can you (remember|note|keep in mind)/i,
            /i work with/i,
            /i'?m (currently|working on|building)/i,
          ];

          const shouldStoreMemory =
            memoryTriggers.some((p) => p.test(q)) ||
            (q.length > 20 && /^(can you|please|remember|note|keep)/i.test(q));

          if (shouldStoreMemory) {
            await memory.add(q, 'preference');
            console.log(`  \x1b[90m[Memory stored]\x1b[0m\n`);
            reactToEvent('memory_stored');
          }

          // Trigger events based on tracking result (tracking already happened before response)
          if (trackingResult) {
            if (trackingResult.tracker.type === 'workout') {
              reactToEvent('workout_logged');
            }
            // You can add more event reactions based on tracker type

            // Generate and show proactive insights after logging
            try {
              const trackStore = new TrackerStore();
              const queryEngine = new QueryEngine();
              const trackers = trackStore.listTrackers();
              const insights = generateProactiveInsights(
                trackers,
                trackStore,
                queryEngine,
              );

              // Show insights occasionally (20% chance to avoid being annoying)
              if (insights.length > 0 && Math.random() < 0.2) {
                showProactiveInsights(insights);
              }
            } catch (e) {
              // Silently fail
            }
          }
        }
      } catch (error) {
        console.log(`\n  \x1b[31mError: ${error.message}\x1b[0m\n`);
        reactToEvent('error');
      }

      askQuestion();
    });
  };

  askQuestion();
  return quitPromise;
}

// ============================================================================
// Telegram Bot
// ============================================================================

let telegramBot = null;
let lastActivity = Date.now();
let isCliActive = true;
let currentTelegramToken = null;

// Helper function to download files from Telegram
async function downloadTelegramFile(bot, fileId) {
  try {
    const file = await bot.getFile(fileId);
    const tokenToUse = currentTelegramToken || TELEGRAM_TOKEN;
    const downloadUrl = `https://api.telegram.org/file/bot${tokenToUse}/${file.file_path}`;
    const tempPath = path.join(
      os.tmpdir(),
      `telegram_img_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
    );

    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(tempPath);
      https
        .get(downloadUrl, (res) => {
          if (res.statusCode !== 200) {
            fs.unlink(tempPath, () => {});
            return resolve(null);
          }
          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve(tempPath);
          });
        })
        .on('error', (err) => {
          fs.unlink(tempPath, () => {});
          resolve(null);
        });
    });
  } catch (e) {
    console.error(`Download error: ${e.message}`);
    return null;
  }
}

async function startTelegramBot() {
  // Get token from config or environment variable
  const config = loadConfig();
  const tokenFromConfig = config.telegram?.botToken;
  const tokenToUse = tokenFromConfig || TELEGRAM_TOKEN;
  const isEnabled = config.telegram?.enabled !== false; // Default to true if not explicitly disabled

  if (!tokenToUse) {
    if (VERBOSE)
      console.log(
        '\x1b[90m  [Telegram: TELEGRAM_TOKEN not set, skipping]\x1b[0m\n',
      );
    return null;
  }

  // Check for placeholder tokens
  if (
    tokenToUse.includes('YOUR_') ||
    tokenToUse.includes('_HERE') ||
    tokenToUse.length < 30
  ) {
    console.log(
      '\x1b[33m  [Telegram: token appears to be a placeholder, skipping]\x1b[0m\n',
    );
    console.log(
      '\x1b[90m  To enable Telegram, get a token from @BotFather and update:\x1b[0m\n',
    );
    console.log(
      '\x1b[90m  ~/.static-rebel/config/config.json -> telegram.botToken\x1b[0m\n',
    );
    return null;
  }

  if (!isEnabled) {
    if (VERBOSE)
      console.log(
        '\x1b[90m  [Telegram: disabled in config, skipping]\x1b[0m\n',
      );
    return null;
  }

  // If bot is already running with the same token, don't restart
  if (telegramBot && currentTelegramToken === tokenToUse) {
    return telegramBot;
  }

  // Stop existing bot if token changed
  if (telegramBot && currentTelegramToken !== tokenToUse) {
    console.log(
      '\x1b[33m  [Telegram: token changed, restarting bot...]\x1b[0m\n',
    );
    try {
      telegramBot.stopPolling();
      telegramBot = null;
    } catch (e) {
      console.log(
        `\x1b[90m  [Telegram: error stopping old bot: ${e.message}]\x1b[0m\n`,
      );
    }
  }

  // Show masked token for debugging
  const maskedToken = tokenToUse.slice(0, 8) + '...' + tokenToUse.slice(-5);
  console.log(
    `\x1b[33m  [Telegram: connecting with token ${maskedToken}...]\x1b[0m\n`,
  );

  try {
    const TelegramBot = (await import('node-telegram-bot-api')).default;

    telegramBot = new TelegramBot(tokenToUse, { polling: true });
    currentTelegramToken = tokenToUse;

    // Verify connection
    const me = await telegramBot.getMe();
    console.log(`\x1b[32m  [Telegram: connected as @${me.username}]\x1b[0m\n`);
    console.log(`  Bot info: id=${me.id}, first_name=${me.first_name}\n`);

    // Register slash commands for autocomplete
    try {
      await telegramBot.setMyCommands([
        { command: 'start', description: 'Start the bot' },
        { command: 'help', description: 'Show help and commands' },
        { command: 'track', description: 'Tracker management' },
        { command: 'search', description: 'Web search' },
        { command: 'workspace', description: 'Workspace management' },
        { command: 'profile', description: 'View your profile' },
        { command: 'memories', description: 'View stored memories' },
        { command: 'claude', description: 'Run Claude Code CLI' },
        { command: 'git', description: 'Git workflow' },
      ]);
      console.log(`\x1b[90m  [Telegram: commands registered]\x1b[0m\n`);
    } catch (e) {
      console.log(
        `\x1b[90m  [Telegram: failed to register commands: ${e.message}]\x1b[0m\n`,
      );
    }

    telegramBot.on('message', async (msg) => {
      const chatId = msg.chat.id;

      // Verbose logging of ALL messages
      console.log(
        `\x1b[35m[Telegram IN] chat=${chatId} user=${msg.chat.first_name || 'unknown'}: ${msg.text || '(non-text)'}\x1b[0m`,
      );

      // Log incoming message
      logToFile('telegram-in', 'info', msg.text || '(non-text)', {
        chatId,
        user: msg.chat.first_name || 'unknown',
        hasPhoto: !!msg.photo,
      });

      // Handle photo messages (image analysis with vision)
      if (msg.photo) {
        console.log(`\x1b[36m  -> Image received, analyzing...\x1b[0m\n`);

        try {
          // Get the largest photo (last in array has highest resolution)
          const photo = msg.photo[msg.photo.length - 1];
          const fileId = photo.file_id;
          const caption = msg.caption || '';
          const replyToMsgId = msg.message_id;

          // Parse @tracker mention from caption
          const trackerMentionMatch = caption.match(/@(\w+)/);
          const trackerName = trackerMentionMatch
            ? trackerMentionMatch[1]
            : null;
          const cleanCaption = caption.replace(/@\w+/, '').trim();

          // Send immediate acknowledgment
          await telegramBot.sendMessage(chatId, 'Analyzing image...', {
            reply_to_message_id: replyToMsgId,
          });

          // Process image in background (fire and forget)
          (async () => {
            try {
              const imagePath = await downloadTelegramFile(telegramBot, fileId);
              if (!imagePath) {
                await telegramBot.sendMessage(
                  chatId,
                  'Failed to download the image.',
                );
                return;
              }

              const visionAnalyzer = new VisionAnalyzer();
              const trackStore = new TrackerStore();
              let analysis;
              let targetTracker = null;

              // If tracker specified, use tracker-specific analysis
              if (trackerName) {
                targetTracker = trackStore.getTracker(trackerName);
                if (targetTracker) {
                  console.log(
                    `\x1b[36m  -> Using tracker: ${targetTracker.displayName} (${targetTracker.type})\x1b[0m\n`,
                  );

                  if (targetTracker.type === 'workout') {
                    analysis = await visionAnalyzer.analyzeWorkout(imagePath);
                  } else if (
                    targetTracker.type === 'food' ||
                    targetTracker.type === 'nutrition'
                  ) {
                    analysis = await visionAnalyzer.analyzeFood(imagePath);
                  } else {
                    // Generic analysis with tracker metrics
                    const prompt = `Analyze this image for ${targetTracker.displayName} tracker.
Metrics to extract: ${targetTracker.config.metrics?.join(', ') || 'custom'}

Respond with ONLY valid JSON with a "data" object containing extracted values.`;
                    analysis = await visionAnalyzer.analyzeImage(
                      imagePath,
                      prompt,
                    );
                  }
                } else {
                  console.log(
                    `\x1b[33m  -> Tracker @${trackerName} not found, using generic analysis\x1b[0m\n`,
                  );
                  analysis = await visionAnalyzer.analyzeImage(
                    imagePath,
                    cleanCaption || 'Describe this image in detail.',
                  );
                }
              } else {
                // Generic analysis
                analysis = await visionAnalyzer.analyzeImage(
                  imagePath,
                  cleanCaption ||
                    'Describe what you see in this image in detail.',
                );
              }

              // Clean up temp file
              try {
                fs.unlinkSync(imagePath);
              } catch (e) {}

              // Verbose logging of raw vision result
              if (VERBOSE) {
                console.log(`\x1b[90m  -> Raw vision response:\x1b[0m`);
                console.log(
                  `\x1b[90m${JSON.stringify(analysis, null, 2)}\x1b[0m\n`,
                );
              } else {
                console.log(
                  `\x1b[90m  -> Vision analysis type: ${typeof analysis}\x1b[0m`,
                );
                console.log(
                  `\x1b[90m  -> Vision response preview: ${JSON.stringify(analysis)?.slice(0, 300)}\x1b[0m\n`,
                );
              }

              // Handle different response types
              let analysisText = null;
              let extractedData = null;

              if (typeof analysis === 'string' && analysis.trim()) {
                analysisText = analysis.trim();
              } else if (typeof analysis === 'object' && analysis !== null) {
                // Check if it's a JSON response with data
                const jsonMatch =
                  typeof analysis === 'string'
                    ? analysis.match(/\{[\s\S]*\}/)
                    : null;
                if (jsonMatch) {
                  try {
                    extractedData = JSON.parse(jsonMatch[0]);
                    analysisText = JSON.stringify(extractedData, null, 2);
                  } catch (e) {
                    analysisText =
                      analysis.message ||
                      analysis.content ||
                      JSON.stringify(analysis);
                  }
                } else {
                  analysisText =
                    analysis.message ||
                    analysis.content ||
                    analysis.error ||
                    JSON.stringify(analysis);
                }
              } else if (analysis && analysis.error) {
                analysisText = `Vision error: ${analysis.error}`;
              }

              // If tracker specified, try to save the extracted data
              if (targetTracker && extractedData) {
                console.log(
                  `\x1b[36m  -> Attempting to save to @${targetTracker.name}\x1b[0m\n`,
                );

                // Flatten nested data and extract all key-value pairs
                const flattenData = (obj, prefix = '') => {
                  const result = {};
                  for (const [key, value] of Object.entries(obj)) {
                    const newKey = prefix ? `${prefix}_${key}` : key;
                    if (
                      value !== null &&
                      typeof value === 'object' &&
                      !Array.isArray(value)
                    ) {
                      Object.assign(result, flattenData(value, newKey));
                    } else if (value !== null && value !== undefined) {
                      // Convert arrays to comma-separated strings
                      result[newKey] = Array.isArray(value)
                        ? value.join(', ')
                        : value;
                    }
                  }
                  return result;
                };

                // Dynamic record data - extract all fields as-is
                const recordData = {
                  ...flattenData(extractedData),
                  _rawText: cleanCaption || 'From image',
                  _imageProcessed: new Date().toISOString(),
                };

                const result = trackStore.addRecord(targetTracker.name, {
                  data: recordData,
                  source: 'image',
                });

                if (result.success) {
                  console.log(
                    `\x1b[32m  -> Saved to @${targetTracker.name}!\x1b[0m\n`,
                  );
                  console.log(
                    `\x1b[90m  -> Extracted fields: ${Object.keys(recordData)
                      .filter((k) => !k.startsWith('_'))
                      .join(', ')}\x1b[0m\n`,
                  );
                  analysisText = `*Saved to @${targetTracker.name}*\n\n${JSON.stringify(recordData, null, 2)}`;
                } else {
                  console.log(
                    `\x1b[31m  -> Failed to save: ${result.message}\x1b[0m\n`,
                  );
                }
              }

              if (analysisText) {
                await telegramBot.sendMessage(chatId, analysisText, {
                  parse_mode: analysisText.includes('{')
                    ? 'Markdown'
                    : undefined,
                });
                logToFile('telegram-out', 'info', analysisText.slice(0, 500), {
                  chatId,
                  context: 'image-analysis',
                });
                console.log(`\x1b[32m  -> Image analysis sent\x1b[0m\n`);
              } else {
                console.error(
                  `\x1b[31m  -> Background image error: Empty or invalid analysis result\x1b[0m\n`,
                );
                logToFile(
                  'telegram-error',
                  'error',
                  'Empty or invalid analysis result',
                  { chatId, context: 'image-analysis' },
                );
                try {
                  await telegramBot.sendMessage(
                    chatId,
                    'Sorry, I had trouble analyzing that image. The vision model may not be available.',
                  );
                } catch (e) {}
              }
            } catch (error) {
              console.error(
                `\x1b[31m  -> Background image error: ${error.message}\x1b[0m\n`,
              );
              logToFile('telegram-error', 'error', error.message, {
                chatId,
                context: 'image-analysis-background',
              });
              try {
                await telegramBot.sendMessage(
                  chatId,
                  'Sorry, I had trouble analyzing that image.',
                );
              } catch (e) {}
            }
          })();
        } catch (error) {
          console.error(`\x1b[31m  -> Image error: ${error.message}\x1b[0m\n`);
          logToFile('telegram-error', 'error', error.message, {
            chatId,
            context: 'image-processing',
          });
          await telegramBot.sendMessage(
            chatId,
            'Sorry, I had trouble processing that image.',
          );
        }
        return;
      }

      // Handle commands
      if (msg.text?.startsWith('/')) {
        const parts = msg.text.split(' ');
        const command = parts[0].toLowerCase();
        const arg = parts.slice(1).join(' ');

        if (command === '/start') {
          const startMsg =
            "Hi! I'm Charlize. Send me a message and I'll help you out. Use /help for commands.";
          await telegramBot.sendMessage(chatId, startMsg, {
            reply_to_message_id: msg.message_id,
          });
          logToFile('telegram-out', 'info', startMsg, {
            chatId,
            command: '/start',
          });
          console.log(`\x1b[32m  -> /start sent\x1b[0m\n`);
        } else if (command === '/help') {
          const helpMsg = `*Charlize AI Assistant Commands*

• /track - Manage trackers (workouts, food, habits)
• /search <query> - Web search
• /workspace - Workspace management
• /claude <path> <task> - Run Claude Code CLI
• /git - Git workflow
• /browser - Browser automation
• /self - Self-improvement
• /profile - View your profile
• /memories - View stored memories

*Quick Actions:*
• @trackerName - Query a tracker
• Just chat naturally!`;
          await telegramBot.sendMessage(chatId, helpMsg, {
            reply_to_message_id: msg.message_id,
            parse_mode: 'Markdown',
          });
          logToFile('telegram-out', 'info', '/help response', {
            chatId,
            command: '/help',
          });
          console.log(`\x1b[32m  -> /help sent\x1b[0m\n`);
        } else if (command === '/track') {
          await telegramBot.sendMessage(
            chatId,
            `*Tracker Commands*

• /track list - List all trackers
• /track create - Create a new tracker
• /track <name> add "entry" - Add an entry
• /track <name> stats - View statistics
• /track <name> history - View history
• @trackerName - Query tracker naturally

*Examples:*
• /track list
• /track workout add "Bench press 3x8 at 185"
• @matt what was my last workout?`,
            { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' },
          );
          console.log(`\x1b[32m  -> /track help sent\x1b[0m\n`);
        } else if (command === '/search') {
          if (!arg) {
            await telegramBot.sendMessage(
              chatId,
              'Usage: /search <query>\n\nExample: /search latest React features',
              {
                reply_to_message_id: msg.message_id,
              },
            );
          } else {
            console.log(`\x1b[36m  -> Searching: ${arg}\x1b[0m\n`);
            const results = await webSearch(arg, 5);
            if (results.length === 0) {
              await telegramBot.sendMessage(chatId, 'No results found.', {
                reply_to_message_id: msg.message_id,
              });
              logToFile('telegram-out', 'info', 'No results found', {
                chatId,
                command: '/search',
                query: arg,
              });
            } else {
              const response = results
                .map((r, i) => `${i + 1}. [${r.title}](${r.url})`)
                .join('\n');
              await telegramBot.sendMessage(
                chatId,
                `*Search Results for "${arg}"*\n\n${response}`,
                {
                  reply_to_message_id: msg.message_id,
                  parse_mode: 'Markdown',
                },
              );
              logToFile(
                'telegram-out',
                'info',
                `Search results: ${results.length} found`,
                { chatId, command: '/search', query: arg },
              );
            }
          }
          console.log(`\x1b[32m  -> /search processed\x1b[0m\n`);
        } else if (command === '/workspace') {
          await telegramBot.sendMessage(
            chatId,
            `*Workspace Commands*

• /workspace list - List workspaces
• /workspace run <name> <task> - Run task in workspace
• /workspace create <name> - Create workspace

*Note:* Workspace management works best in CLI.`,
            { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' },
          );
        } else if (command === '/profile') {
          const p = loadProfile();
          if (p) {
            await telegramBot.sendMessage(chatId, `*Your Profile*\n\n${p}`, {
              reply_to_message_id: msg.message_id,
              parse_mode: 'Markdown',
            });
          } else {
            await telegramBot.sendMessage(
              chatId,
              'No profile set. Use /profile in CLI to set up.',
              { reply_to_message_id: msg.message_id },
            );
          }
        } else if (command === '/memories') {
          const mems = memory.list();
          if (mems.length === 0) {
            await telegramBot.sendMessage(chatId, 'No memories stored.', {
              reply_to_message_id: msg.message_id,
            });
          } else {
            const list = mems
              .slice(0, 10)
              .map(
                (m) =>
                  `• ${m.text.slice(0, 50)}${m.text.length > 50 ? '...' : ''}`,
              )
              .join('\n');
            await telegramBot.sendMessage(
              chatId,
              `*Memories* (${mems.length} total)\n\n${list}`,
              {
                reply_to_message_id: msg.message_id,
                parse_mode: 'Markdown',
              },
            );
          }
        } else if (command === '/claude') {
          await telegramBot.sendMessage(
            chatId,
            '*Claude Code CLI*\n\nUse Claude Code via /claude command in CLI for complex tasks. In Telegram, just describe what you need!',
            {
              reply_to_message_id: msg.message_id,
              parse_mode: 'Markdown',
            },
          );
        } else if (command === '/git') {
          await telegramBot.sendMessage(
            chatId,
            '*Git Commands*\n\n• /git status - Check status\n• /git diff - View changes\n• /git commit - Commit changes\n• /git push - Push\n\n*Note:* Git commands work best in CLI.',
            {
              reply_to_message_id: msg.message_id,
              parse_mode: 'Markdown',
            },
          );
        } else {
          await telegramBot.sendMessage(
            chatId,
            `Unknown command: ${command}\n\nUse /help for available commands.`,
            {
              reply_to_message_id: msg.message_id,
            },
          );
          console.log(`\x1b[90m  -> Unknown command: ${command}\x1b[0m\n`);
        }
        return;
      }

      // Always respond to Telegram messages
      console.log(`\x1b[36m  -> Processing...\x1b[0m\n`);

      try {
        const { response } = await askWithMemory(
          msg.text || '...',
          await getSystemPrompt(),
        );
        const answer = response.message?.content || 'No response';

        await telegramBot.sendMessage(chatId, answer, {
          reply_to_message_id: msg.message_id,
        });
        logToFile('telegram-out', 'info', answer.slice(0, 500), { chatId });

        console.log(`\x1b[32m  -> Response sent\x1b[0m\n`);
      } catch (error) {
        console.error(`\x1b[31m  -> Error: ${error.message}\x1b[0m\n`);
        logToFile('telegram-error', 'error', error.message, {
          chatId,
          context: 'main-response',
        });
        await telegramBot.sendMessage(chatId, 'Sorry, something went wrong.');
      }
    });

    telegramBot.on('error', (err) => {
      console.error(`\x1b[31m[Telegram error: ${err.message}]\x1b[0m\n`);
      logToFile('telegram-error', 'error', err.message, {
        context: 'bot-error',
      });
    });

    // Rate-limit polling error logs to avoid spam
    let lastPollingError = 0;
    let pollingErrorCount = 0;
    telegramBot.on('polling_error', (err) => {
      const now = Date.now();
      pollingErrorCount++;
      // Only log once per 30 seconds to avoid spam
      if (now - lastPollingError > 30000) {
        if (pollingErrorCount > 1) {
          console.error(
            `\x1b[31m[Polling error (${pollingErrorCount}x): ${err.message}]\x1b[0m\n`,
          );
        } else {
          console.error(`\x1b[31m[Polling error: ${err.message}]\x1b[0m\n`);
        }
        logToFile('telegram-error', 'error', err.message, {
          context: 'polling-error',
          count: pollingErrorCount,
        });
        lastPollingError = now;
        pollingErrorCount = 0;
      }
    });

    return telegramBot;
  } catch (error) {
    console.log(`\x1b[31m  [Telegram: failed to start]\x1b[0m\n`);
    console.log(`  Error: ${error.message}\n`);
    if (error.message.includes('401')) {
      console.log(
        '  -> Token is invalid! Check your TELEGRAM_TOKEN env var.\n',
      );
    }
    return null;
  }
}

function startIdleTracker() {
  setInterval(() => {
    if (isCliActive && Date.now() - lastActivity > IDLE_TIMEOUT) {
      isCliActive = false;
      console.log('\x1b[33m  [CLI idle - Telegram active]\x1b[0m\n');
    }
  }, 5000);

  // Reset idle timer when user types
  process.stdin.on('keypress', () => {
    if (isCliActive === false) {
      isCliActive = true;
      console.log('\x1b[32m  [CLI active - Telegram paused]\x1b[0m\n');
    }
    lastActivity = Date.now();
  });
}

// Watch for config changes and restart Telegram bot if needed
function watchTelegramConfig() {
  setInterval(async () => {
    // Clear config cache to get fresh config from disk
    clearConfigCache();

    const config = loadConfig();
    const tokenFromConfig = config.telegram?.botToken;
    const tokenToUse = tokenFromConfig || TELEGRAM_TOKEN;

    // Check if token changed or bot needs to be started/stopped
    const isEnabled = config.telegram?.enabled && tokenToUse;

    if (isEnabled && (!telegramBot || currentTelegramToken !== tokenToUse)) {
      console.log(
        '\x1b[33m  [Telegram: config changed, updating bot...]\x1b[0m\n',
      );
      await startTelegramBot();
    } else if (!isEnabled && telegramBot) {
      console.log(
        '\x1b[33m  [Telegram: disabled in config, stopping bot...]\x1b[0m\n',
      );
      try {
        telegramBot.stopPolling();
        telegramBot = null;
        currentTelegramToken = null;
      } catch (e) {
        console.log(
          `\x1b[90m  [Telegram: error stopping bot: ${e.message}]\x1b[0m\n`,
        );
      }
    }
  }, 5000); // Check every 5 seconds
}

// Main
async function main() {
  // Initialize chat handler
  await initChatHandler();

  // Start Telegram bot
  await startTelegramBot();

  // Start idle tracker
  startIdleTracker();

  // Start config watcher for Telegram
  watchTelegramConfig();

  // Start CLI chat
  await chat();

  console.log('\n  Press Ctrl+C to exit.\n');
}

main().catch(console.error);
