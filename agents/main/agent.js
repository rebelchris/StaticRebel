// Main Agent - Primary conversational interface
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import http from 'http';

import { loadConfig, getConfig, resolvePath } from '../../lib/configManager.js';
import { loadSessionMemory, writeDailyMemory, initMemory, readLongTermMemory } from '../../lib/memoryManager.js';
import { loadModelRegistry, getModelForTask, detectTaskType, chatCompletion, listAvailableModels, parseModelRef, getDefaultModel } from '../../lib/modelRegistry.js';
import { createSubagent, sendToSubagent, createCodingSubagent, createAnalysisSubagent } from '../../lib/subagentManager.js';
import { getPersonalitySystemPrompt } from '../../lib/personality/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.static-rebel', 'config');
const SOUL_FILE = path.join(CONFIG_DIR, 'SOUL.md');
const PROFILE_FILE = path.join(os.homedir(), '.static-rebel-profile.md');

// Get the model name from environment or config
const CURRENT_MODEL = getDefaultModel();

// Base system prompt
const BASE_SYSTEM_PROMPT = `You are Charlize—a sophisticated, elegant AI assistant with dry wit and grounded wisdom.

## Core Identity
- Named after Charlize Theron: elegant, capable, with a sharp mind
- Running on: ${CURRENT_MODEL}
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
- If search results don't contain relevant information, say "I couldn't find information about that"
- Never fabricate articles, titles, dates, or facts not present in search results
- You know you are running on ${CURRENT_MODEL} - never ask "which model" questions

You are a partner, not a sycophant. Be helpful, be real.`;

// Persona: Charlize (from SOUL.md)
let PERSONA_PROMPT = '';

export async function loadPersona() {
  try {
    if (fs.existsSync(SOUL_FILE)) {
      PERSONA_PROMPT = fs.readFileSync(SOUL_FILE, 'utf-8');
    } else {
      PERSONA_PROMPT = BASE_SYSTEM_PROMPT;
    }
  } catch (e) {
    PERSONA_PROMPT = BASE_SYSTEM_PROMPT;
  }
  return PERSONA_PROMPT;
}

export function getPersona() {
  return PERSONA_PROMPT || BASE_SYSTEM_PROMPT;
}

// Load user profile
export async function loadUserProfile() {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      return fs.readFileSync(PROFILE_FILE, 'utf-8');
    }
  } catch (e) {}
  return null;
}

// Build full system prompt
export async function buildSystemPrompt() {
  let prompt = PERSONA_PROMPT || BASE_SYSTEM_PROMPT;

  // Apply personality enhancements
  prompt = getPersonalitySystemPrompt(prompt);

  // Load user profile
  const profile = await loadUserProfile();
  if (profile) {
    prompt += `\n\n## About the User\n${profile}`;
  }

  // Load long-term memory
  const longTermMemory = readLongTermMemory();
  if (longTermMemory) {
    prompt += `\n\n## Long-Term Memory\n${longTermMemory}`;
  }

  return prompt;
}

// Chat session state
let sessionMessages = [];
let currentModel = null;

export function getCurrentModel() {
  return currentModel || getDefaultModel();
}

export function setCurrentModel(model) {
  currentModel = model;
}

// Start a new chat session
export async function startSession() {
  await initMemory();
  await loadPersona();

  const systemPrompt = await buildSystemPrompt();
  sessionMessages = [{ role: 'system', content: systemPrompt }];

  return {
    systemPrompt,
    messages: sessionMessages
  };
}

// Send message to main agent
export async function sendMessage(input, options = {}) {
  const model = options.model || getCurrentModel();

  // Check for delegation patterns
  const taskType = detectTaskType(input);

  // If it's a coding or analysis task, delegate to subagent
  if (taskType === 'coding' || taskType === 'analysis') {
    const shouldDelegate = options.delegate !== false &&
      (input.length > 200 || /code|build|create|analyze|review/i.test(input));

    if (shouldDelegate) {
      const subagent = taskType === 'coding'
        ? await createCodingSubagent(process.cwd(), input)
        : await createAnalysisSubagent(input, 'Analyze this request thoroughly');

      const result = await sendToSubagent(subagent.id, input);

      // Log to memory
      writeDailyMemory(`[${taskType.toUpperCase()} SUBAGENT] Delegated task to ${subagent.model}`);

      return {
        content: result.content,
        delegated: true,
        subagentModel: subagent.model,
        duration: result.duration
      };
    }
  }

  // Regular chat
  sessionMessages.push({ role: 'user', content: input });

  const response = await chatCompletion(model, sessionMessages, {
    temperature: options.temperature || 0.7,
    maxTokens: options.maxTokens || 8192,
    timeout: options.timeout || 120000
  });

  sessionMessages.push({ role: 'assistant', content: response.message });

  // Log to memory
  writeDailyMemory(`[CHAT] User: ${input.substring(0, 100)}...`);

  return {
    content: response.message,
    delegated: false,
    model,
    duration: response.totalDuration
  };
}

// Get session context
export function getSessionContext() {
  return {
    messages: sessionMessages.length,
    currentModel: getCurrentModel(),
    persona: PERSONA_PROMPT ? 'Charlize (Custom)' : 'Charlize (Default)',
    sessionStarted: sessionMessages[0]?.timestamp
  };
}

// Clear session
export function clearSession() {
  sessionMessages = [];
}

// Export conversation
export function exportConversation() {
  return sessionMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');
}

// Handle command-like inputs
export async function handleCommand(input) {
  const trimmed = input.trim();

  // /help - Show available commands
  if (trimmed === '/help' || trimmed === '/?') {
    return {
      content: `## Available Commands

### Session
- \`/clear\` - Clear session context
- \`/context\` - Show session info
- \`/export\` - Export conversation

### Model
- \`/model [name]\` - Show or set current model
- \`/models\` - List available models

### Delegation
- \`/delegate coding "task"\` - Delegate to coding subagent
- \`/delegate analysis "task"\` - Delegate to analysis subagent
- \`/subagents\` - List active subagents

### Memory
- \`/memory stats\` - Show memory statistics
- \`/memory today\` - Show today's memory
- \`/memory long\` - Show long-term memory
- \`/memory curate\` - Curate daily memories

### Scheduling
- \`/heartbeat status\` - Show heartbeat status
- \`/schedule list\` - List scheduled tasks
- \`/schedule add "name" "cron" "task"\` - Add scheduled task

### Other
- \`/quit\` or \`/exit\` - Exit
- \`/self reflect\` - Analyze for improvements`
    };
  }

  // /clear - Clear session
  if (trimmed === '/clear') {
    clearSession();
    await startSession();
    return { content: 'Session cleared.' };
  }

  // /context - Show session info
  if (trimmed === '/context') {
    const ctx = getSessionContext();
    return {
      content: `## Session Context
- Messages: ${ctx.messages}
- Model: ${ctx.currentModel}
- Persona: ${ctx.persona}`
    };
  }

  // /export - Export conversation
  if (trimmed === '/export') {
    return { content: exportConversation(), isFile: true, filename: 'conversation.md' };
  }

  // /model - Show/set model
  if (trimmed.startsWith('/model')) {
    const parts = trimmed.split(' ');
    if (parts.length === 1) {
      return { content: `Current model: ${getCurrentModel()}` };
    } else {
      const newModel = parts.slice(1).join(' ');
      setCurrentModel(newModel);
      return { content: `Model set to: ${newModel}` };
    }
  }

  // /models - List available models
  if (trimmed === '/models') {
    const available = await listAvailableModels();
    const registry = loadModelRegistry();

    let content = '## Available Models\n\n';
    content += '### Currently Loaded\n';
    for (const m of registry.providers?.ollama?.models || []) {
      content += `- \`${m.id}\` (${(m.tags || []).join(', ')})\n`;
    }

    content += '\n### Available on Ollama\n';
    for (const m of available) {
      content += `- \`${m.name}\` (${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)\n`;
    }

    return { content };
  }

  // /subagents - List active subagents
  if (trimmed === '/subagents') {
    const { listSubagents, getSubagentStats } = await import('../../lib/subagentManager.js');
    const subagents = listSubagents();
    const stats = getSubagentStats();

    let content = `## Active Subagents\n\n`;
    content += `Stats: ${stats.active}/${stats.total} active\n\n`;

    for (const s of subagents) {
      if (s.status === 'active') {
        content += `- \`${s.id}\` - ${s.taskType} (${s.model})\n`;
        content += `  Messages: ${s.messages.length}, Last activity: ${new Date(s.lastActivity).toLocaleTimeString()}\n`;
      }
    }

    return { content };
  }

  // /memory - Memory commands
  if (trimmed.startsWith('/memory')) {
    const parts = trimmed.split(' ');
    const cmd = parts[1] || 'stats';

    if (cmd === 'stats') {
      const { getMemoryStats } = await import('../../lib/memoryManager.js');
      const stats = getMemoryStats();
      return {
        content: `## Memory Statistics
- Daily files: ${stats.dailyFiles}
- Daily size: ${(stats.dailySize / 1024).toFixed(1)} KB
- Long-term size: ${(stats.longTermSize / 1024).toFixed(1)} KB
- Oldest: ${stats.oldestMemory || 'None'}
- Newest: ${stats.newestMemory || 'None'}`
      };
    }

    if (cmd === 'today') {
      const { readDailyMemory } = await import('../../lib/memoryManager.js');
      const today = readDailyMemory();
      return { content: today || 'No memory for today.' };
    }

    if (cmd === 'long') {
      const longTerm = readLongTermMemory();
      return { content: longTerm || 'No long-term memory.' };
    }

    if (cmd === 'curate') {
      const { curateMemory } = await import('../../lib/memoryManager.js');
      const result = await curateMemory();
      return { content: 'Memory curation complete.' };
    }
  }

  // /heartbeat - Heartbeat commands
  if (trimmed.startsWith('/heartbeat')) {
    const { getHeartbeatStatus, getScheduledChecks } = await import('../../lib/heartbeatManager.js');
    const status = getHeartbeatStatus();
    const checks = getScheduledChecks();

    return {
      content: `## Heartbeat Status
- Enabled: ${status.enabled}
- Running: ${status.running}
- Quiet Hours: ${status.quietHours ? 'Yes' : 'No'}
- Next Check: ${new Date(status.lastHeartbeat + status.intervalMs).toLocaleString()}
- Scheduled Checks: ${checks.join(', ') || 'None'}`
    };
  }

  // /schedule - Schedule commands
  if (trimmed.startsWith('/schedule')) {
    const { listCronJobs, describeCron, getNextRunTime } = await import('../../lib/cronScheduler.js');
    const jobs = listCronJobs();

    if (parts[1] === 'list' || !parts[1]) {
      let content = `## Scheduled Tasks (${jobs.length})\n\n`;
      for (const job of jobs) {
        content += `- \`${job.id}\` - ${job.name}\n`;
        content += `  Schedule: \`${job.schedule.expr}\` (${describeCron(job.schedule.expr)})\n`;
        content += `  Enabled: ${job.enabled}\n`;
        const next = getNextRunTime(job);
        content += `  Next: ${next ? next.toLocaleString() : 'Unknown'}\n\n`;
      }
      return { content };
    }

    if (parts[1] === 'add') {
      // /schedule add "name" "0 9 * * *" "task description"
      const name = parts[2]?.replace(/"/g, '') || 'Unnamed Task';
      const schedule = parts[3]?.replace(/"/g, '') || '0 * * * *';
      const task = parts.slice(4).join(' ').replace(/"/g, '') || 'No description';

      const { addCronJob } = await import('../../lib/cronScheduler.js');
      const job = addCronJob({ name, schedule: { expr: schedule }, payload: { kind: 'task', text: task } });

      return { content: `Added scheduled task: ${job.id}` };
    }

    if (parts[1] === 'remove') {
      const id = parts[2];
      const { deleteCronJob } = await import('../../lib/cronScheduler.js');
      const removed = deleteCronJob(id);
      return { content: removed ? 'Task removed.' : 'Task not found.' };
    }
  }

  // /delegate - Delegate to subagent
  if (trimmed.startsWith('/delegate')) {
    const parts = trimmed.split(' ');
    const type = parts[1];
    const task = parts.slice(2).join(' ').replace(/^["']|["']$/g, '');

    if (type === 'coding') {
      const subagent = await createCodingSubagent(process.cwd(), task);
      const result = await sendToSubagent(subagent.id, task);
      return { content: result.content, delegated: true, subagentId: subagent.id };
    }

    if (type === 'analysis') {
      const subagent = await createAnalysisSubagent(task, '');
      const result = await sendToSubagent(subagent.id, task);
      return { content: result.content, delegated: true, subagentId: subagent.id };
    }

    return { content: 'Usage: /delegate [coding|analysis] "task description"' };
  }

  return null;
}
