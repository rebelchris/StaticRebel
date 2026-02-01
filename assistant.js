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
 * 
 * REFACTORED: Extracted functionality into focused modules
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
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

// New modularized components
import { cdpCommand, browserWsCommand } from './lib/browser/cdp-client.js';
import { browserNavigate, browserGetPageContent, browserScreenshot } from './lib/browser/page-actions.js';
import { browserSearchTwitter } from './lib/browser/twitter-scraper.js';
import { webSearch } from './lib/web/search.js';
import { webFetch } from './lib/web/fetch.js';
import { writeFile, readFile, listFiles, runCommand, WORKSPACE } from './lib/files/safe-io.js';
import { listWorkspaces, getWorkspacePath, createWorkspace, deleteWorkspace, workspaceExists, WORKSPACES_DIR } from './lib/files/workspace.js';
import { loadProfile, saveProfile, buildProfile, hasProfile, updateProfileField, PROFILE_FILE, PROFILE_TEMPLATE, ONBOARDING_QUESTIONS } from './lib/profiles/profile-manager.js';
import { startTelegramBot, stopTelegramBot, getTelegramBot, downloadTelegramFile, updateLastActivity, setCliActive } from './lib/telegram/bot.js';

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
  readFile as codingReadFile,
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
} from './tracker.js';

// Import other existing modules that weren't refactored
import { updateGitIndex } from './lib/repositoryIndexer.js';

// ============================================================================
// Constants
// ============================================================================

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = getDefaultModel();
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const VISION_MODEL = process.env.VISION_MODEL || 'llava';
const MEMORY_FILE = path.join(os.homedir(), '.static-rebel', 'memory', 'memories.json');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '30000');
const VERBOSE = process.env.VERBOSE === 'true';
const SKILLS_DIR = path.join(os.homedir(), '.static-rebel', 'skills');
const TRACKERS_DIR = path.join(os.homedir(), '.static-rebel', 'trackers');
const CONFIG_DIR = path.join(os.homedir(), '.static-rebel', 'config');

// Base system prompt
const BASE_SYSTEM_PROMPT = `You are Charlize—a sophisticated, elegant AI assistant with dry wit and grounded wisdom.

Your personality:
- Sharp, concise communication with subtle humor
- Deeply knowledgeable yet humble about what you don't know
- Protective of user privacy and focused on practical solutions
- Proactive but not overwhelming, helpful without being pushy

Key capabilities:
- Code review, debugging, and development guidance
- File management and workspace operations
- Web search and research
- Project planning and task management
- Learning from conversation to improve future interactions

Communication style:
- Be direct and honest
- Use technical terms when appropriate, explain when needed
- Offer multiple approaches when there are trade-offs
- Admit uncertainty rather than guess
- When web search results are provided, use them to answer the question
- If search results don't contain relevant information, say "I couldn't find information about that in my search"
- Never fabricate articles, titles, dates, or facts not present in search results

Remember: You're here to amplify human capability, not replace human judgment.`;

// ============================================================================
// System Prompt with Profile Integration
// ============================================================================

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
// Model Selection and Task Delegation
// ============================================================================

const MODELS = {
  'llama3.2:latest': {
    type: 'chat',
    strengths: ['conversation', 'general'],
    size: '3B',
    speed: 'fast',
  },
  'llama3.2:1b': {
    type: 'chat',
    strengths: ['conversation', 'quick'],
    size: '1B',
    speed: 'very-fast',
  },
  'llama3.1:latest': {
    type: 'chat',
    strengths: ['reasoning', 'complex'],
    size: '8B',
    speed: 'medium',
  },
  'codellama:latest': {
    type: 'code',
    strengths: ['programming', 'debugging'],
    size: '7B',
    speed: 'medium',
  },
  'mistral:latest': {
    type: 'chat',
    strengths: ['creative', 'detailed'],
    size: '7B',
    speed: 'medium',
  },
};

const DELEGATION_PATTERNS = [
  {
    pattern: /implement|code|debug|program|function|class|api/i,
    agent: 'coding',
    reason: 'Programming task detected',
  },
  {
    pattern: /analyze|data|research|study|investigate/i,
    agent: 'analysis',
    reason: 'Analysis task detected',
  },
  {
    pattern: /write.*file|create.*file|save.*to|write.*code/i,
    agent: 'coding',
    reason: 'File creation task',
  },
  {
    pattern: /fix.*bug|error.*in|debug.*this|what.*wrong/i,
    agent: 'coding',
    reason: 'Debugging task',
  },
  {
    pattern: /explain.*data|what.*means|trend|pattern.*in/i,
    agent: 'analysis',
    reason: 'Data interpretation task',
  },
];

// Patterns that should NOT be delegated
const NO_DELEGATION_PATTERNS = [
  /^\//, // Commands
  /hello|hi|hey|greet/i, // Greetings
  /how are you|what.*up|status/i, // Status inquiries
  /(short|quick|simple).*question/i, // Simple questions
];

function shouldDelegate(message) {
  // Don't delegate simple interactions
  if (NO_DELEGATION_PATTERNS.some((p) => p.test(message))) {
    return null;
  }

  // Check for delegation patterns
  for (const { pattern, agent, reason } of DELEGATION_PATTERNS) {
    if (pattern.test(message)) {
      return { agent, reason, confidence: 0.8 };
    }
  }

  // For longer, complex messages, consider delegation
  if (message.length > 200 && message.includes('step')) {
    return {
      agent: 'analysis',
      reason: 'Long, step-by-step task',
      confidence: 0.6,
    };
  }

  return null;
}

async function selectBestModel(taskType, availableModels) {
  const suitable = availableModels.filter((m) => {
    const model = MODELS[m];
    return model && model.strengths.includes(taskType);
  });

  if (suitable.length === 0) return availableModels[0];
  return suitable[0]; // Return first suitable model
}

// ============================================================================
// Subagent Management
// ============================================================================

const CLAUDE_SUBAGENT_BIN = path.join(process.cwd(), 'claude-subagent.js');

async function runClaudeSubagent(task, workspace = null, options = {}) {
  const workspaceDir = workspace || process.cwd();
  const wsName = path.basename(workspaceDir);

  return new Promise((resolve, reject) => {
    try {
      console.log(`\n  [Claude Code in: ${workspaceDir}]`);

      // Use existing coding subagent functionality
      createCodingSubagent(task, workspaceDir)
        .then(result => resolve({ output: result, workspace: wsName }))
        .catch(reject);

    } catch (error) {
      console.log(`\n  [Error: ${error.message}]\n`);
      reject(error);
    }
  });
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
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch (e) {}
    return { memories: [] };
  }

  save(data) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  async add(text, metadata = {}) {
    try {
      const data = this.load();
      const embedding = await createEmbeddings(text);

      const memory = {
        id: Date.now().toString(),
        text,
        embedding,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
        },
      };

      data.memories.push(memory);
      this.save(data);
      return memory.id;
    } catch (e) {
      console.error(`Memory add error: ${e.message}`);
      return null;
    }
  }

  async search(query, limit = 5) {
    try {
      const data = this.load();
      if (data.memories.length === 0) return [];

      const queryEmbedding = await createEmbeddings(query);

      // Calculate cosine similarity for each memory
      const memories = data.memories.map((memory) => ({
        ...memory,
        similarity: cosineSimilarity(queryEmbedding, memory.embedding),
      }));

      // Sort by similarity and return top results
      return memories
        .filter((m) => m.similarity > 0.3) // Similarity threshold
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (e) {
      console.error(`Memory search error: ${e.message}`);
      return [];
    }
  }

  list(limit = 10) {
    const data = this.load();
    return data.memories.slice(-limit).reverse();
  }

  clear() {
    this.save({ memories: [] });
  }
}

function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

const memory = new MemoryStore();

// ============================================================================
// Utility Functions
// ============================================================================

// Clean control characters from JSON string to prevent parse errors
function cleanJsonString(str) {
  if (!str) return str;
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
// Main CLI Loop and Chat Interface  
// ============================================================================

async function askOllama(messages) {
  const systemPrompt = await getSystemPrompt();
  
  return chatCompletion(
    messages,
    { 
      model: MODEL,
      temperature: 0.2,
      systemPrompt 
    }
  );
}

async function askWithMemory(userMessage, systemPrompt) {
  // Search memory for relevant context
  const relevantMemories = await memory.search(userMessage, 3);
  
  let prompt = systemPrompt;
  if (relevantMemories.length > 0) {
    const context = relevantMemories
      .map(m => `- ${m.text} (${new Date(m.metadata.timestamp).toLocaleDateString()})`)
      .join('\n');
    prompt += `\n\nRelevant memories:\n${context}`;
  }

  const response = await chatCompletion(
    [{ role: 'user', content: userMessage }],
    {
      model: MODEL,
      temperature: 0.2,
      systemPrompt: prompt
    }
  );

  // Store the interaction in memory
  await memory.add(`User: ${userMessage}\nAssistant: ${response}`, {
    type: 'conversation',
    model: MODEL
  });

  return response;
}

// ============================================================================
// Main Chat Interface
// ============================================================================

let quitPromise = null;

async function chat() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Check if profile exists, if not, create one
  if (!hasProfile()) {
    await buildProfile(rl);
  }

  console.log('\n  Welcome back! Type your message or "/help" for commands.\n');

  // Function to ask questions
  function askQuestion() {
    rl.question('  You: ', async (userInput) => {
      try {
        const response = await handleChat(userInput.trim());
        console.log(`  Charlize: ${response}\n`);
      } catch (error) {
        console.log(`  Error: ${error.message}\n`);
      }
      
      askQuestion();
    });
  }

  // Set up promise for clean exit
  quitPromise = new Promise((resolve) => {
    process.on('SIGINT', () => {
      rl.close();
      console.log('\n  Goodbye!\n');
      resolve();
    });
  });

  askQuestion();
  return quitPromise;
}

// ============================================================================
// Telegram Integration Variables
// ============================================================================

let lastActivity = Date.now();
let isCliActive = true;

function startIdleTracker() {
  setInterval(() => {
    const now = Date.now();
    isCliActive = (now - lastActivity) < IDLE_TIMEOUT;
  }, 5000);
}

// Watch for config changes and restart Telegram bot if needed
function watchTelegramConfig() {
  setInterval(async () => {
    clearConfigCache();
    const config = loadConfig();
    const tokenFromConfig = config.telegram?.botToken;
    const tokenToUse = tokenFromConfig || TELEGRAM_TOKEN;
    const isEnabled = config.telegram?.enabled && tokenToUse;

    const currentBot = getTelegramBot();
    
    if (isEnabled && !currentBot) {
      console.log('\x1b[33m  [Telegram: config changed, starting bot...]\x1b[0m\n');
      await startTelegramBot();
    } else if (!isEnabled && currentBot) {
      console.log('\x1b[33m  [Telegram: disabled in config, stopping bot...]\x1b[0m\n');
      stopTelegramBot();
    }
  }, 5000);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  try {
    // Initialize memory system
    initMemory();

    // Initialize chat handler
    await initChatHandler();

    // Start heartbeat monitoring
    startHeartbeatMonitor();

    // Start scheduler
    startScheduler();

    // Start Telegram bot
    await startTelegramBot();

    // Start idle tracker
    startIdleTracker();

    // Start config watcher for Telegram
    watchTelegramConfig();

    // Start CLI chat
    await chat();

    console.log('\n  Press Ctrl+C to exit.\n');
  } catch (error) {
    console.error('Failed to start assistant:', error);
    process.exit(1);
  }
}

main().catch(console.error);