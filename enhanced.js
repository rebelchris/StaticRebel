#!/usr/bin/env node

/**
 * Charlize - Ollama AI Assistant v2.0 (Natural Language Edition)
 * Just talk to Charlize - she understands what you need
 *
 * Usage:
 *   node enhanced.js                 # Interactive - just talk!
 *   node enhanced.js chat "hello"    # Single message
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import http from 'http';
import https from 'https';
import { spawn } from 'child_process';
import { loadConfig } from './lib/configManager.js';
import { initMemory, getMemoryStats, readDailyMemory, readLongTermMemory, getRecentDailyMemories, writeDailyMemory, curateMemory } from './lib/memoryManager.js';
import { listAvailableModels, getModelForTask, chatCompletion, getDefaultModel, checkOllamaConnection } from './lib/modelRegistry.js';
import { startScheduler, listCronJobs, addCronJob, describeCron, getNextRunTime, getSchedulerStatus, deleteCronJob, toggleCronJob } from './lib/cronScheduler.js';
import { startHeartbeatMonitor, getHeartbeatStatus, configureHeartbeat } from './lib/heartbeatManager.js';
import { listSubagents, createCodingSubagent, createAnalysisSubagent, sendToSubagent, getSubagentStats, terminateSubagent } from './lib/subagentManager.js';
import { listSkills, getSkillsStats } from './lib/skillsManager.js';
import { loadPersona, buildSystemPrompt, sendMessage } from './agents/main/agent.js';
import { runCommand as runCodingCommand, readFile, executeChange } from './agents/coding/agent.js';
import { TrackerStore, QueryEngine, parseRecordFromText, matchesAutoDetect } from './tracker.js';

// Level 2 AI Assistant - New Imports
import {
  initPersonaSystem, getSystemPrompt, modifyPersonaFeedback, getAvailablePersonas,
  setActivePersona, createPersona, analyzeForImprovements
} from './lib/personaManager.js';
import { initVectorMemory, addMemory, searchMemories, getMemoryStats as getVectorStats, rememberPreference } from './lib/vectorMemory.js';
import {
  initWorkerSystem, createTask, getAllTasks, getWorkerStats, generateTodoMd,
  TaskStatus
} from './lib/workerManager.js';
import {
  initApiConnector, createConnector, getAllConnectors, getApiStats, storeApiKey
} from './lib/apiConnector.js';
import { routeTask, orchestrate, streamOllama, runClaudeCode } from './orchestrator.js';
import { research, webResearch, streamResearch } from './lib/webOracle.js';

const PROFILE_FILE = path.join(os.homedir(), '.static-rebel-profile.md');

// ============================================================================
// Dashboard Server
// ============================================================================

async function startDashboard() {
  console.log('Starting Dashboard Server...');

  try {
    // Dynamic import to avoid requiring dashboard dependencies in main package
    const dashboardPath = path.join(__dirname, 'dashboard', 'server.js');
    const { default: dashboard } = await import(dashboardPath);
    return dashboard;
  } catch (error) {
    console.error('Failed to start dashboard:', error.message);
    console.log('\nTo use the dashboard, please install dashboard dependencies:');
    console.log('  cd dashboard && npm install\n');
    process.exit(1);
  }
}

// ============================================================================
// Intent Detection & Natural Language Understanding
// ============================================================================

const INTENT_PATTERNS = {
  // Scheduling
  schedule: [
    /remind me/i, /schedule/i, /set (a )?reminder/i, /set an alarm/i,
    /every day at/i, /every week/i, /on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /at \d{1,2}(:\d{2})?( ?(am|pm))?/i, /cron/i,
    /create (a )?scheduled (task|job)/i, /add (a )?task/i
  ],

  // Subagents / Delegation
  coding: [
    /write (some )?(code|function|class|script)/i, /create (a )?(function|class|module|component|api)/i,
    /build (a )?/i, /implement/i, /code/i, /debug/i, /fix (the )?(bug|error)/i,
    /refactor/i, /review (my )?code/i, /program/i, /develop/i
  ],
  analysis: [
    /analyze/i, /compare/i, /evaluate/i, /assess/i, /think about/i,
    /what do you think/i, /should i/i, /pros and cons/i,
    /look into/i, /investigate/i, /figure out/i
  ],

  // Memory
  memory: [
    /what did we (talk about|discuss|cover)/i, /remember (anything|that)/i,
    /my (memory|stats|history)/i, /show (me )?(my )?memories/i,
    /long.?term memory/i, /curate/i, /forget/i
  ],

  // Heartbeat / Status
  status: [
    /how are you/i, /what'?s (your|the) status/i, /system status/i,
    /heartbeat/i, /check (on|up) (everything|me)/i
  ],

  // Task Management
  tasks: [
    /scheduled tasks/i, /upcoming tasks/i, /what (do i have|are) (scheduled|planned)/i,
    /show (me )?(my )?(tasks|schedule|reminders)/i, /cancel (a )?task/i
  ],

  // Models
  models: [
    /what models/i, /list models/i, /available models/i, /change (the )?model/i,
    /switch model/i, /use (a )?different model/i
  ],

  // Skills
  skills: [
    /what skills/i, /list skills/i, /installed skills/i, /add (a )?skill/i
  ],

  // Web Search - Only for clearly current-info requests
  search: [
    /^(search|look up|find|google)\s/i,
    /what'?s new\??$/i,
    /latest news\??$/i,
    /what is happening\??$/i,
    /current events\??$/i,
    /search (for |the )(web|internet)/i
  ],

  // Web Oracle - Deep research queries
  research: [
    /research/i, /look into/i, /investigate/i,
    /find out about/i, /tell me about (the )?(latest|new)/i,
    /what'?s the (latest|new) on/i, /hot topic/i,
    /trending/i, /current state of/i
  ],

  // Shell Commands
  run: [
    /run (a )?(command|shell)/i, /execute/i, /terminal/i, /bash/i
  ],

  // Help
  help: [
    /help/i, /what can you do/i, /what commands/i, /how (does this|to)/i
  ],

  // Tracking / Logging
  track: [
    /log (my |the )?(calories|food|meal|workout|exercise|sleep|habit)/i,
    /track (my |the )?(calories|food|meal|workout|exercise|sleep|habit)/i,
    /i (just )?(had|ate|drank|consumed)/i,
    /how many (calories|cals)/i,
    /what'?ve i eaten/i, /what did i eat/i,
    /show (me )?(my )?(calories|food|meal|workout) (stats|today|history)/i,
    /add (a )?(meal|food|workout|exercise)/i,
    /record (my |a )?(calories|food|meal|workout|exercise)/i,
    /logging/i,
    /just logged/i
  ],

  // Level 2: Persona & Identity
  persona: [
    /change (your )?persona/i, /switch (your )?persona/i, /use (a )?different (persona|personality)/i,
    /be more (concise|detailed|friendly|technical)/i,
    /adjust (your )?(tone|style|personality)/i,
    /persona/i
  ],

  // Level 2: Vector Memory & Semantic Search
  memory2: [
    /remember (this|that|information)/i, /store (this|that)/i,
    /search (my )?memories/i, /semantic search/i,
    /long.?term memory/i, /recall (something|anything)/i,
    /vector memory/i, /semantic/i
  ],

  // Level 2: Background Workers & Projects
  worker: [
    /run (in |a )?background/i, /long(-|\s)?running task/i,
    /create (a )?project/i, /project management/i,
    /background task/i, /async task/i, /subtask/i,
    /todo\.md/i, /task queue/i
  ],

  // Level 2: API Connectors
  api: [
    /connect (to |an )?api/i, /api (connector|integration)/i,
    /new (api|integration)/i, /store (api|api key)/i,
    /dynamic (api|connector)/i, /webhook/i
  ],

  // Level 3: Orchestrator (Claude Code CLI + Streaming)
  orchestrator: [
    /use claude code/i, /spawn claude/i, /run claude cli/i,
    /orchestrate/i, /dual stream/i, /streaming response/i,
    /complex coding/i, /deep refactor/i, /full codebase/i,
    /claude.*task/i, /advanced debugging/i, /architecture review/i
  ]
};

function detectIntent(text) {
  const lower = text.toLowerCase();

  // Check for scheduling intent first (only with explicit scheduling keywords)
  if (/remind me|set (a |an )?reminder|schedule|create (a )?scheduled|cron|every (day|week|hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lower)) {
    return { type: 'schedule', original: text };
  }

  // Check other intents
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === 'schedule') continue; // Already checked above
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        return { type: intent, original: text };
      }
    }
  }

  return { type: 'chat', original: text };
}

// ============================================================================
// Natural Language Handlers
// ============================================================================

async function handleNaturalLanguage(input) {
  const intent = detectIntent(input);
  const lower = input.toLowerCase();

  switch (intent.type) {
    case 'schedule':
      return await handleScheduleRequest(input);
    case 'coding':
      return await handleCodingRequest(input);
    case 'analysis':
      return await handleAnalysisRequest(input);
    case 'memory':
      return await handleMemoryRequest(input);
    case 'status':
      return await handleStatusRequest();
    case 'tasks':
      return await handleTasksRequest();
    case 'models':
      return await handleModelsRequest();
    case 'skills':
      return await handleSkillsRequest();
    case 'search':
      return await handleWebSearch(input);
    case 'research':
      return await handleResearchRequest(input);
    case 'run':
      return await handleRunRequest(input);
    case 'track':
      return await handleTrackRequest(input);
    // Level 2 Handlers
    case 'persona':
      return handlePersonaRequest(input);
    case 'memory2':
      return await handleMemory2Request(input);
    case 'worker':
      return await handleWorkerRequest(input);
    case 'api':
      return handleApiRequest(input);
    // Level 3: Orchestrator
    case 'orchestrator':
      return await handleOrchestratorRequest(input);
    case 'help':
      return handleHelp();
    default:
      return null; // Let regular chat handle it
  }
}

// ---------- Schedule Handler ----------
async function handleScheduleRequest(input) {
  // Extract time pattern
  const timeMatch = input.match(/(\d{1,2})(:(\d{2}))?( ?(am|pm))?/i);
  const daysMatch = input.match(/(every |on )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  const taskMatch = input.replace(/remind me to?|schedule|every|at \d{1,2}(:\d{2})?( ?(am|pm))?/gi, '').trim();

  let cronExpr = '* * * * *';

  // Parse time
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const minute = timeMatch[3] || '0';
    const period = (timeMatch[4] || '').toLowerCase();

    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;

    cronExpr = `${minute} ${hour} * * *`;
  }

  // Parse days
  const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  if (daysMatch) {
    const day = dayMap[daysMatch[2].toLowerCase()];
    cronExpr = cronExpr.replace('* *', `* ${day}`);
  }

  // Parse task
  const taskName = taskMatch || 'Scheduled Task';

  const job = addCronJob({
    name: taskName,
    schedule: { expr: cronExpr },
    payload: { text: input }
  });

  const nextRun = getNextRunTime(job);
  const humanSchedule = describeCron(cronExpr);

  return `Done! I've scheduled "${taskName}" to run ${humanSchedule}.\nNext run: ${nextRun?.toLocaleString() || 'soon'}`;
}

// ---------- Coding Handler ----------
async function handleCodingRequest(input) {
  const subagent = await createCodingSubagent(process.cwd(), input);
  const result = await sendToSubagent(subagent.id, input);

  return `[Coding agent using ${subagent.model}]\n\n${result.content}`;
}

// ---------- Analysis Handler ----------
async function handleAnalysisRequest(input) {
  const subagent = await createAnalysisSubagent(input, '');
  const result = await sendToSubagent(subagent.id, input);

  return `[Analysis using ${subagent.model}]\n\n${result.content}`;
}

// ---------- Memory Handler ----------
async function handleMemoryRequest(input) {
  const lower = input.toLowerCase();

  if (/stats/i.test(lower)) {
    const memStats = getMemoryStats();
    return `Here's your memory overview:\n\n` +
      `- Daily files: ${memStats.dailyFiles}\n` +
      `- Oldest memory: ${memStats.oldestMemory || 'None'}\n` +
      `- Newest memory: ${memStats.newestMemory || 'None'}\n` +
      `- Storage used: ${((memStats.dailySize + memStats.longTermSize) / 1024).toFixed(1)} KB`;
  }

  if (/what did we (talk about|discuss)/i.test(lower)) {
    const recent = getRecentDailyMemories(3);
    if (recent.length === 0) return "We haven't created any memories yet.";

    return "Here's what we've been discussing:\n\n" +
      recent.map(r => `## ${r.date}\n${r.content}`).join('\n\n---\n\n');
  }

  if (/curate/i.test(lower)) {
    await curateMemory();
    return "I've reviewed your recent memories and updated long-term memory with the important bits.";
  }

  if (/long.?term/i.test(lower)) {
    const longTerm = readLongTermMemory();
    return longTerm || "No long-term memories yet.";
  }

  // Default: show today's memory
  const today = readDailyMemory();
  return today || "No memories for today yet.";
}

// ---------- Status Handler ----------
async function handleStatusRequest() {
  const memStats = getMemoryStats();
  const schedulerStatus = getSchedulerStatus();
  const heartbeatStatus = getHeartbeatStatus();
  const subagentStats = getSubagentStats();

  return `Here's my status:\n\n` +
    `**Heartbeat**: ${heartbeatStatus.running ? 'Monitoring' : 'Stopped'}\n` +
    `**Scheduler**: ${schedulerStatus.enabledCount} active tasks\n` +
    `**Subagents**: ${subagentStats.active} active\n` +
    `**Memory**: ${memStats.dailyFiles} daily files\n\n` +
    `Everything's running smoothly!`;
}

// ---------- Tasks Handler ----------
async function handleTasksRequest() {
  const jobs = listCronJobs();
  const enabled = jobs.filter(j => j.enabled);

  if (enabled.length === 0) {
    return "You don't have any scheduled tasks yet. Say something like \"Remind me to stretch every hour\" and I'll set it up!";
  }

  return `Here are your scheduled tasks (${enabled.length}):\n\n` +
    enabled.map(job => {
      const next = getNextRunTime(job);
      return `- **${job.name}**\n  ${describeCron(job.schedule.expr)}\n  Next: ${next?.toLocaleString() || 'Unknown'}`;
    }).join('\n\n');
}

// ---------- Models Handler ----------
async function handleModelsRequest() {
  const models = await listAvailableModels();
  const current = getDefaultModel();

  if (models.length === 0) {
    return "No models detected. Make sure Ollama is running with `ollama serve`.";
  }

  return `Available models on your Ollama:\n\n` +
    models.map(m => {
      const size = m.size ? (m.size / 1024 / 1024 / 1024).toFixed(1) : '?';
      return `- ${m.name} (${size} GB)`;
    }).join('\n') +
    `\n\nCurrent default: ${current}`;
}

// ---------- Skills Handler ----------
async function handleSkillsRequest() {
  const skills = listSkills();
  const stats = getSkillsStats();

  if (skills.length === 0) {
    return "You don't have any custom skills yet. Skills are reusable prompts and workflows.";
  }

  return `Your skills (${stats.total}):\n\n` +
    skills.map(s => `- **${s.name}**: ${s.description || 'No description'}\n  ${s.triggers.length} triggers`).join('\n\n');
}

// ---------- Web Search ----------

// ---------- Shell Command ----------
async function handleRunRequest(input) {
  const cmd = input.replace(/run|execute|terminal|bash|command/i, '').trim();
  if (!cmd) return "What command should I run?";

  const result = await runShellCommand(cmd);
  return `Command output:\n\n${result}`;
}

// ---------- Help ----------
function handleHelp() {
  return `I'm Charlize, your Level 3 AI assistant! Just talk to me naturally:\n\n` +
    `**Scheduling**\n"Remind me to stretch every hour"\n"Schedule a daily summary at 9am"\n"Set a reminder for Monday at 3pm"\n\n` +

    `**Tasks & Delegation**\n"Write a function to sort an array"\n"Create a React component for a button"\n"Analyze the pros and cons of these options"\n"Think about whether I should use SQL or NoSQL"\n\n` +

    `**Tracking**\n"I had a cappuccino, log it"\n"Log 450 calories for my sandwich"\n"How many calories today?"\n\n` +

    `**Memory**\n"What did we talk about today?"\n"Show me my memory stats"\n"Curate my memories"\n\n` +

    `**Level 2 Features**\n"Be more concise" - Adjust my personality\n"Remember this information" - Store in vector memory\n"Create a project" - Generate TODO.md with background tasks\n"Connect to API" - Set up dynamic API connectors\n\n` +

    `**Level 3: Web Oracle (Research)**\n"Research the latest AI developments"\n"Investigate climate change technologies"\n"What's new in quantum computing?"\n"Research Rust vs C++ performance"\n\n` +

    `**Level 3: Orchestrator (Claude Code)**\n"Debug this complex bug in my codebase"\n"Refactor the entire project structure"\n"Do a full architecture review"\n"Use claude code for a complete rewrite"\n\n` +

    `**Current Information**\n"Search for latest AI news"\n"What's new in tech?"\n"What's happening today?"\n\n` +

    `**Quick Info**\n"What models do I have?"\n"Show me my scheduled tasks"\n\n` +

    `Just say what you need - I'll figure it out!`;
}

// ---------- Orchestrator Handler (Level 3) ----------
async function handleOrchestratorRequest(input) {
  const task = input
    .replace(/use claude code|spawn claude|run claude cli|orchestrate|dual stream|streaming response|complex coding|deep refactor|full codebase|claude.*task|advanced debugging|architecture review/gi, '')
    .trim();

  if (!task) {
    return `**Orchestrator - Claude Code CLI + Streaming**

I can delegate complex tasks to Claude Code CLI for powerful coding assistance.

Try:
- "Debug this complex issue in my codebase"
- "Refactor the entire project structure"
- "Do a full architecture review"
- "Advanced debugging with trace logs"

Or use direct mode:
- "Use claude code to fix this bug"
- "Spawn claude for a complete rewrite"
`;
  }

  // Determine the best route
  const route = routeTask(task);
  console.log(`\n[ORCHESTRATOR] Task: "${task.substring(0, 50)}..."`);
  console.log(`[ORCHESTRATOR] Route: ${route}\n`);

  // Route to appropriate handler
  if (route === 'ollama') {
    process.stdout.write('[OLLAMA] ');
    for await (const token of streamOllama(task)) {
      if (token.type === 'token') {
        process.stdout.write(token.content);
      } else if (token.type === 'thinking') {
        console.log(`\n[${token.source.toUpperCase()}] ${token.content}`);
      } else if (token.type === 'done') {
        console.log('\n[OLLAMA] Done\n');
      }
    }
    return '';
  } else if (route === 'claude-code') {
    try {
      await runClaudeCode(task);
      return '';
    } catch (error) {
      return `[Claude Code Error] ${error.message}`;
    }
  } else {
    // Orchestrate - use both
    console.log('[ORCHESTRATOR] Running with both Ollama and Claude Code in parallel...\n');
    return `I've dispatched your task to both local Ollama and Claude Code CLI for comprehensive assistance. Check the output above!`;
  }
}

// ---------- Tracking ----------
async function handleTrackRequest(input) {
  const lower = input.toLowerCase();
  const store = new TrackerStore();
  const trackers = store.listTrackers();

  if (trackers.length === 0) {
    return "No trackers configured. Create one with: /track new";
  }

  // Query patterns - don't auto-log questions
  if (/how many|what'?ve i|what did i|show me|stats/i.test(lower)) {
    return await handleTrackQuery(input, lower, store, trackers);
  }

  // Check for explicit tracker specification: "log to <tracker>" or "add to <tracker>"
  const explicitTrackerMatch = lower.match(/log (to |in )?(\w+)|add (to |in )?(\w+)|record (to |in )?(\w+)/);
  if (explicitTrackerMatch) {
    const trackerName = explicitTrackerMatch[2] || explicitTrackerMatch[4] || explicitTrackerMatch[6];
    const matchedTracker = trackers.find(t =>
      t.name.toLowerCase().includes(trackerName.toLowerCase()) ||
      t.displayName.toLowerCase().includes(trackerName.toLowerCase())
    );
    if (matchedTracker) {
      const result = await logToTracker(matchedTracker, input, store);
      if (result.success) {
        return result.message;
      }
      return `Failed to log to ${matchedTracker.displayName}. Try rephrasing your request.`;
    }
  }

  // Check all trackers for auto-detect triggers and log to matching ones
  for (const tracker of trackers) {
    if (matchesAutoDetect(tracker, input)) {
      const result = await logToTracker(tracker, input, store);
      if (result.success) {
        return result.message;
      }
      // If auto-detect matched but logging failed, continue to try other trackers
    }
  }

  // Try to find specific tracker based on keywords - expanded list
  const foodKeywords = /calories?|foods?|meal|ate|had|drank|eating|drinking|snack|dinner|lunch|breakfast|coffee|cappuccino|latte|tea|milk|protein|carb|fat/i;
  const workoutKeywords = /workouts?|exercises?|gym|lifted|ran|walked|swam|biked|cycled|weights?|reps|sets|mile|km|steps/i;

  // Check for explicit "log <thing>" or "track <thing>" patterns
  const logPattern = /(?:log|track|record|add)\s+(?:my|the|a|an)?\s*(calories?|foods?|meals?|workouts?|exercises?)/i;
  const logMatch = lower.match(logPattern);

  if (logMatch) {
    // User said something like "log calories" or "track food"
    const thing = logMatch[1].toLowerCase();
    const isFood = /calories?|foods?|meals?/.test(thing);
    const isWorkout = /workouts?|exercises?/.test(thing);

    if (isFood) {
      const foodTracker = trackers.find(t => t.type === 'nutrition' || t.name.includes('food'));
      if (foodTracker) {
        const result = await logToTracker(foodTracker, input, store);
        if (result.success) {
          return result.message;
        }
      }
    }

    if (isWorkout) {
      const workoutTracker = trackers.find(t => t.type === 'workout');
      if (workoutTracker) {
        const result = await logToTracker(workoutTracker, input, store);
        if (result.success) {
          return result.message;
        }
      }
    }
  }

  if (foodKeywords.test(lower)) {
    const foodTracker = trackers.find(t => t.type === 'nutrition' || t.name.includes('food'));
    if (foodTracker) {
      const result = await logToTracker(foodTracker, input, store);
      if (result.success) {
        return result.message;
      }
    }
  }

  if (workoutKeywords.test(lower)) {
    const workoutTracker = trackers.find(t => t.type === 'workout');
    if (workoutTracker) {
      const result = await logToTracker(workoutTracker, input, store);
      if (result.success) {
        return result.message;
      }
    }
  }

  // If there's only one tracker, try logging to it
  if (trackers.length === 1) {
    const result = await logToTracker(trackers[0], input, store);
    if (result.success) {
      return result.message;
    }
  }

  // Build helpful fallback message with explicit options
  const trackerOptions = trackers.map(t => {
    const typeHint = t.type === 'nutrition' ? '(food/calories)' : t.type === 'workout' ? '(workouts/exercise)' : '';
    return `- "${t.displayName}" ${typeHint}`;
  }).join('\n');

  return `I wasn't sure which tracker to use. You can:\n` +
    `- Say "log to <tracker-name>" (e.g., "log to Food Tracker")\n` +
    `- Use tracker-specific keywords like "calories" or "workout"\n\n` +
    `Available trackers:\n${trackerOptions || '- No trackers configured'}`;
}

// Simple heuristic parser for food entries as fallback when LLM fails
function parseFoodHeuristic(text) {
  const lower = text.toLowerCase();

  // Extract food name - look for text after "had", "ate", "drank" or at the start
  let foodName = '';
  const hadMatch = lower.match(/(?:had|ate|drank|consumed)\s+(?:a\s+)?(?:cup of\s+)?(.+)/);
  if (hadMatch) {
    foodName = hadMatch[1].replace(/,?\s*(log|track|record|add)\s*(calories|food|meal).*/i, '').trim();
  } else {
    // Try to extract from the beginning
    foodName = text.replace(/,?\s*(log|track|record|add)\s*(calories|food|meal).*/i, '').trim();
  }

  // Clean up the food name
  foodName = foodName.replace(/^(i|just|just now|another)\s+/i, '').trim();
  if (foodName.startsWith('a ') || foodName.startsWith('an ')) {
    foodName = foodName.substring(2);
  }
  // Remove trailing prepositions/phrases
  foodName = foodName.replace(/\s+(for|with|and)\s+.*$/i, '').trim();

  // Estimate calories based on common foods
  const calorieEstimates = {
    'coffee': 5, 'espresso': 3, 'cappuccino': 120, 'latte': 190,
    'tea': 2, 'green tea': 0, 'black coffee': 5,
    'egg': 78, 'eggs': 156, 'toast': 80, 'bread': 80,
    'banana': 105, 'apple': 95, 'orange': 62,
    'chicken': 165, 'beef': 250, 'fish': 136, 'salmon': 208,
    'rice': 130, 'pasta': 220, 'salad': 150,
    'pizza': 285, 'burger': 350, 'fries': 230, 'sandwich': 350,
    'milk': 103, 'orange juice': 110, 'water': 0,
    'yogurt': 150, 'cereal': 120, 'oatmeal': 150,
    'avocado': 160, 'nuts': 180, 'almonds': 164,
    'cheese': 110, 'chocolate': 150, 'ice cream': 270
  };

  let calories = null;
  const calMatch = lower.match(/(\d+)\s*(calories|cals)/i);
  if (calMatch) {
    calories = parseInt(calMatch[1]);
  } else {
    // Try to estimate - find the best matching food
    for (const [food, cal] of Object.entries(calorieEstimates)) {
      if (lower.includes(food)) {
        calories = cal;
        break;
      }
    }
    // Default estimate for unknown foods
    if (!calories && foodName.length > 2 && foodName.length < 50) {
      calories = 200; // Generic estimate
    }
  }

  const data = {};
  if (foodName) data.meal = foodName.charAt(0).toUpperCase() + foodName.slice(1);
  if (calories) data.calories = calories;

  return data;
}

// Simple heuristic parser for workout entries as fallback when LLM fails
function parseWorkoutHeuristic(text) {
  const lower = text.toLowerCase();

  const data = {};

  // Extract exercise name
  const exerciseMatch = lower.match(/(?:did|completed|finished|started)\s+(?:a\s+)?(?:workout of\s+)?(.+)/);
  if (exerciseMatch) {
    data.exercise = exerciseMatch[1].trim();
  } else {
    data.exercise = 'Workout';
  }

  // Extract duration
  const durationMatch = lower.match(/(\d+)\s*(minutes?|mins?|hours?|hrs?)/i);
  if (durationMatch) {
    const val = parseInt(durationMatch[1]);
    if (durationMatch[2].startsWith('min')) data.duration = val;
    else if (durationMatch[2].startsWith('hour')) data.duration = val * 60;
  }

  return data;
}

async function logToTracker(tracker, input, store) {
  try {
    let parsed = await parseRecordFromText(tracker.name, input, tracker.type);

    // Fallback to heuristic parsing if LLM parsing fails or returns empty
    if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
      console.log(`[Tracker] LLM parsing failed, trying heuristic parser for ${tracker.type}`);

      if (tracker.type === 'nutrition' || tracker.type === 'food') {
        parsed = { success: true, data: parseFoodHeuristic(input) };
      } else if (tracker.type === 'workout') {
        parsed = { success: true, data: parseWorkoutHeuristic(input) };
      }
    }

    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      console.error(`[Tracker] No data extracted from "${input}"`);
      return { success: false, message: null };
    }

    console.log(`[Tracker] Extracted data for ${tracker.name}:`, JSON.stringify(parsed.data));

    const result = store.addRecord(tracker.name, {
      data: parsed.data,
      source: 'natural-language'
    });

    if (result.success) {
      // Format the logged data nicely
      const dataEntries = Object.entries(parsed.data)
        .filter(([k, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      return { success: true, message: `Logged to **${tracker.displayName}**:\n${dataEntries}` };
    }

    console.error(`[Tracker] Failed to add record:`, result.error);
    return { success: false, message: null };
  } catch (e) {
    console.error(`[Tracker] Error logging to ${tracker.name}:`, e.message);
    return { success: false, message: null };
  }
}

async function handleTrackQuery(input, lower, store, trackers) {
  const query = new QueryEngine();

  // Calories query
  if (/calories|cals/i.test(lower)) {
    const foodTracker = trackers.find(t =>
      t.type === 'nutrition' ||
      t.name.includes('food') ||
      (t.config?.metrics && t.config.metrics.includes('calories'))
    );

    if (foodTracker) {
      const stats = query.getStats(foodTracker.name, 'today');

      if (stats.totalEntries === 0) {
        return `No food entries logged today for ${foodTracker.displayName}.`;
      }

      const totalCals = stats.aggregations?.calories?.total || 0;
      return `**${foodTracker.displayName}** today:\n\n` +
        `Total entries: ${stats.totalEntries}\n` +
        `Total calories: **${totalCals.toFixed(0)}**\n\n` +
        stats.records.slice(0, 5).map(r =>
          `- ${r.data?.name || r.data?.meal || 'Entry'}: ${r.data?.calories || 0} cal`
        ).join('\n');
    }
  }

  // General stats query
  if (/stats|today|history/i.test(lower)) {
    // Find relevant tracker
    let tracker = trackers[0];
    if (/food|meal|calories/i.test(lower)) {
      tracker = trackers.find(t => t.type === 'nutrition' || t.name.includes('food')) || tracker;
    } else if (/workout|exercise/i.test(lower)) {
      tracker = trackers.find(t => t.type === 'workout') || tracker;
    }

    if (!tracker) {
      return "No trackers found.";
    }

    const stats = query.getStats(tracker.name, 'today');
    return `**${tracker.displayName}** today:\n\n` +
      `Total entries: ${stats.totalEntries}\n` +
      (stats.aggregations && Object.keys(stats.aggregations).length > 0
        ? Object.entries(stats.aggregations).map(([k, v]) =>
            `- ${k}: ${v.total?.toFixed(1) || 'N/A'} (avg: ${v.average?.toFixed(1) || 'N/A'})`
          ).join('\n')
        : '- No aggregations available');
  }

  return "Try asking:\n- 'How many calories today?'\n- 'Show me my food stats'\n- 'What did I eat?'";
}

// ============================================================================
// Level 2: Persona & Identity Handler
// ============================================================================

function handlePersonaRequest(input) {
  const lower = input.toLowerCase();
  const personas = getAvailablePersonas();

  if (/change|switch|use/i.test(lower) && !/be more/i.test(lower)) {
    // List available personas
    return `**Available Personas:**

${Object.values(personas).map(p => `- **${p.name}** (${p.role})`).join('\n')}

Say "Use <persona name>" to switch.`;
  }

  if (/be more|adjust/i.test(lower)) {
    // Modify current persona
    const result = modifyPersonaFeedback('charlize', input);
    if (result.success) {
      return `Updated persona preferences:\n\n` +
        `- ${result.modifications.join('\n- ')}\n\n` +
        `These changes are now permanent.`;
    }
    return "Could not update persona. Try rephrasing your request.";
  }

  // Default: show current persona
  const current = getSystemPrompt();
  return `Current persona: Charlize\n\n` +
    `Say "be more concise" or "be more friendly" to adjust my behavior.\n` +
    `Say "change persona" to see all available personas.`;
}

// ============================================================================
// Level 2: Vector Memory Handler
// ============================================================================

async function handleMemory2Request(input) {
  const lower = input.toLowerCase();

  if (/remember|store/i.test(lower)) {
    // Store new memory
    const content = input.replace(/remember|store|this|that/i, '').trim();
    if (!content) return "What would you like me to remember?";

    await addMemory(content, { type: 'user_preference' });
    await rememberPreference('user_instruction', content, input);

    return `Got it! I'll remember: "${content}"`;
  }

  if (/search/i.test(lower)) {
    // Semantic search
    const query = input.replace(/search|my|memories/i, '').trim();
    const results = await searchMemories(query || input, { limit: 5 });

    if (results.length === 0) {
      return "No matching memories found.";
    }

    return `**Semantic Search Results:**

${results.map((r, i) => `${i + 1}. ${r.content} (${(r.score * 100).toFixed(0)}% match)`).join('\n\n')}`;
  }

  // Memory stats
  const stats = getVectorStats();
  return `**Vector Memory Stats:**

Total memories: ${stats.totalMemories}
${Object.entries(stats.byType).map(([type, count]) => `- ${type}: ${count}`).join('\n')}`;
}

// ============================================================================
// Level 2: Background Worker Handler
// ============================================================================

async function handleWorkerRequest(input) {
  const lower = input.toLowerCase();

  if (/create (a )?project/i.test(lower)) {
    // Create project with TODO.md
    const projectName = input.replace(/create|a|project/i, '').trim() || 'New Project';

    const task = createTask({
      name: projectName,
      type: 'project',
      payload: { description: input },
      subtasks: [
        { name: 'Set up project structure', type: 'process' },
        { name: 'Research dependencies', type: 'research' },
        { name: 'Implement core features', type: 'code' },
        { name: 'Write tests', type: 'process' },
        { name: 'Documentation', type: 'process' }
      ]
    });

    // Generate TODO.md
    const todoContent = generateTodoMd(projectName, task.subtasks);
    const todoPath = path.join(process.cwd(), 'TODO.md');
    fs.writeFileSync(todoPath, todoContent);

    return `Created project "${projectName}"!\n\n` +
      `- Background task created: ${task.id}\n` +
      `- TODO.md generated at: ${todoPath}\n` +
      `- Subtasks: ${task.subtasks.length}`;
  }

  if (/run (in |a )?background|async/i.test(lower)) {
    // Create background task
    const taskName = input.replace(/run|in|background|async|long|running|task/i, '').trim() || 'Background Task';
    const taskType = /research/i.test(lower) ? 'research' : /code|build/i.test(lower) ? 'code' : 'process';

    const task = createTask({
      name: taskName,
      type: taskType,
      payload: { description: input },
      priority: 'normal'
    });

    return `Started background task: **${task.name}**\n` +
      `- Task ID: ${task.id}\n` +
      `- Status: ${task.status}\n` +
      `Check back later for results!`;
  }

  // Show worker stats
  const stats = getWorkerStats();
  return `**Background Workers Stats:**

Pending: ${stats.pending}
Running: ${stats.running}
Completed: ${stats.completed}
Failed: ${stats.failed}
Max Workers: ${stats.maxWorkers}

Say "create a project" to start a new project with TODO.md generation.`;
}

// ============================================================================
// Level 2: API Connector Handler
// ============================================================================

function handleApiRequest(input) {
  const lower = input.toLowerCase();
  const connectors = getAllConnectors();
  const stats = getApiStats();

  if (/connect|new|integration/i.test(lower)) {
    // Create new connector
    return `**Create New API Connector**

To connect an API, provide:
- Base URL (e.g., https://api.example.com)
- Authentication type (apikey, bearer, basic, oauth2)
- API key (stored securely)
- Endpoints you want to use

Example:
"Connect to Weather API with base URL https://api.openweathermap.org/data/2.5 and API key xxx"`;
  }

  if (/api key|store/i.test(lower)) {
    // Store API key
    return "To store an API key, say: 'Store API key for <service-name>'";
  }

  return `**API Connectors**

Total connectors: ${stats.totalConnectors}
Active: ${stats.activeConnectors}

${connectors.length > 0 ? connectors.map(c => `- ${c.name} (${c.type})`).join('\n') : 'No connectors configured yet.'}

Say 'connect to API' to add a new one.`;
}

// ============================================================================
// Utility Functions
// ============================================================================

// ============================================================================
// Utility Functions
// ============================================================================

function log(message) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${ts} [INFO] ${message}`);
}

function clearScreen() {
  console.clear();
}

function showBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██████╗ ██████╗ ███████╗ █████╗  ██████╗██╗  ██╗           ║
║  ██╔════╝██╔═══██╗██╔════╝██╔══██╗██╔════╝██║  ██║           ║
║  ██║     ██║   ██║█████╗  ███████║██║     ███████║           ║
║  ██║     ██║   ██║██╔══╝  ██╔══██║██║     ██╔══██║           ║
║  ╚██████╗╚██████╔╝███████╗██║  ██║╚██████╗██║  ██║           ║
║   ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝           ║
║                                                               ║
║     Ollama AI Assistant v2.0 (Level 2 - Evolution Edition)    ║
║     Dynamic Personas | Vector Memory | Background Workers     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

// ============================================================================
// Web Search Tool - LLM-aware intelligent search
// ============================================================================

// These patterns indicate the user wants current/real-time information
const CURRENT_INFO_PATTERNS = [
  /latest news/i,
  /what's new/i,
  /current (price|stock|weather|status)/i,
  /today'?s (weather|news|headlines)/i,
  /recent (news|updates|events)/i,
  /breaking news/i,
  /search (for |the )(web|internet)/i,
  /look up/i,
  /find information/i,
  /google/i,
  /what does the internet say/i,
  /what is happening/i,
  /what is going on/i,
  /current events/i
];

async function webSearch(query) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'duckduckgo.com',
      path: `/?q=${encodeURIComponent(query)}&t=h_&ia=web`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const results = [];

        // DuckDuckGo HTML format: <a class="result__a" href="...">Actual Title</a>
        const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = linkRegex.exec(data)) && results.length < 5) {
          let title = match[2].trim()
            .replace(/<[^>]*>/g, '') // Remove any nested HTML
            .replace(/&#x27;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

          const url = match[1];

          // Skip empty or noise titles
          if (title && title.length > 15 && !title.match(/^(Web|Images|Videos|News|Maps|More|Settings|Privacy)$/)) {
            results.push({ title, url });
          }
        }

        resolve(results);
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

async function handleWebSearch(input) {
  const query = input
    .replace(/search|look up|find|what's new|latest|google|web|internet/i, '')
    .trim()
    .replace(/^(for |the )/, '');

  if (!query) {
    return "What would you like me to search for? Try: \"Search for latest AI news\"";
  }

  const results = await webSearch(query);

  if (results.length === 0) {
    return `No results found for "${query}". Try a different search term.`;
  }

  return `**Web Search: ${query}**\n\n` +
    results.slice(0, 5).map((r, i) => {
      const url = r.url ? `\n   ${r.url}` : '';
      return `${i + 1}. ${r.title}${url}`;
    }).join('\n\n') +
    `\n\n_${results.length} results found_`;
}

// ---------- Web Oracle Research Handler ----------
async function handleResearchRequest(input) {
  const query = input
    .replace(/research|look into|investigate|find out about|tell me about|what's the|whats the|latest|hot topic|trending|current state of/gi, '')
    .trim()
    .replace(/^(on |about |the )/, '');

  if (!query) {
    return `**Web Oracle - Research Tool**

I can research any topic for you using web search.

Try:
- "Research the latest AI developments"
- "Investigate climate change technologies"
- "What's new in quantum computing?"
- "Research Rust vs C++ performance"
- "Find out about GPT-5 rumors"

I'll search the web and provide comprehensive results with sources.
`;
  }

  console.log(`\n[WEB ORACLE] Researching: "${query}"...`);

  try {
    const result = await research(query);
    return result;
  } catch (error) {
    return `[Research Error] ${error.message}`;
  }
}

const SAFE_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'pwd', 'date', 'echo', 'git status', 'git log --oneline']);

async function runShellCommand(cmd, confirm = true) {
  const isDangerous = !SAFE_COMMANDS.some(c => cmd.startsWith(c));

  if (isDangerous && confirm) {
    process.stdout.write(`\n⚠️  Run "${cmd}"? (y/n): `);
    const ans = await new Promise(r => process.stdin.once('data', r));
    if (ans.toString().trim().toLowerCase() !== 'y') {
      return 'Cancelled.';
    }
  }

  return new Promise((resolve) => {
    const proc = spawn(cmd, { shell: true });
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => out += d);
    proc.on('close', code => resolve(out || `(exit ${code})`));
  });
}

// ============================================================================
// Interactive Chat Loop
// ============================================================================

async function chatLoop() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await loadPersona();
  writeDailyMemory('[SESSION START]');

  const askQuestion = () => {
    rl.question('\n> ', async (q) => {
      if (!q.trim()) { askQuestion(); return; }

      // Exit commands
      if (['/quit', '/exit', '/q', 'bye', 'goodbye'].includes(q.toLowerCase())) {
        writeDailyMemory('[SESSION END]');
        console.log('\nGoodbye! Talk soon!\n');
        rl.close();
        return;
      }

      // Handle as natural language
      const result = await handleNaturalLanguage(q);

      if (result) {
        console.log(`\n${result}\n`);
      } else {
        // Regular chat
        const response = await sendMessage(q);
        console.log(`\n${response.content}\n`);
        writeDailyMemory(`[CHAT] ${q.substring(0, 80)}...`);
      }

      askQuestion();
    });
  };

  console.log('\nJust talk to me! Try things like:\n');
  console.log('  "Remind me to stretch every hour"');
  console.log('  "I had a cappuccino, log calories"');
  console.log('  "How many calories today?"');
  console.log('  "Write a function to calculate fibonacci"');
  console.log('  "What did we talk about yesterday?"');
  console.log('  "Search for latest AI news"');
  console.log('  -- Level 2 Features --');
  console.log('  "Be more concise" (adjust persona)');
  console.log('  "Remember this important info" (vector memory)');
  console.log('  "Create a project" (background workers + TODO.md)');
  console.log('  "Connect to API" (dynamic API connectors)\n');
  console.log('Type /quit when you\'re done.\n');

  askQuestion();
}

// ============================================================================
// Main
// ============================================================================

async function checkOllamaAndNotify() {
  const health = await checkOllamaConnection();

  if (!health.connected) {
    console.log('\n[!] Ollama Connection Issue\n');
    console.log(health.errorMessage);
    console.log('\n');
    return false;
  }

  if (health.models && health.models.length > 0) {
    console.log(`[+] Ollama connected - ${health.models.length} models available`);
  } else {
    console.log('[+] Ollama connected - no models installed yet');
    console.log('    To download a model: ollama pull <model-name>');
    console.log('    Recommended: ollama pull qwen3-coder\n');
  }
  return true;
}

async function main() {
  const args = process.argv.slice(2);

  // Check for dashboard flag
  if (args.includes('--dashboard') || args.includes('-d')) {
    await startDashboard();
    return;
  }

  const message = args.join(' ');

  // Initialize
  initMemory();
  await loadPersona();

  // Initialize Level 2 Systems
  initPersonaSystem();
  initVectorMemory();
  initWorkerSystem();
  initApiConnector();

  // Start background services
  startScheduler((job) => {
    console.log(`\n[Scheduled Task] ${job.name}\n`);
  });

  startHeartbeatMonitor((results) => {
    const msg = results.map(r => `${r.label}: ${r.result}`).join(', ');
    console.log(`\n[Heartbeat Check] ${msg}\n`);
    writeDailyMemory(`[HEARTBEAT] ${msg}`);
  });

  // Check Ollama connection early
  const ollamaOk = await checkOllamaAndNotify();
  if (!ollamaOk && !message) {
    // In interactive mode, still allow startup but warn user
    console.log('Starting in limited mode - some features may not work.\n');
  }

  if (message) {
    // Single message mode
    if (!ollamaOk) {
      console.log('\nError: Ollama is not running. Please start Ollama first.\n');
      process.exit(1);
    }
    const result = await handleNaturalLanguage(message);
    if (result) {
      console.log(`\n${result}\n`);
    } else {
      const response = await sendMessage(message);
      console.log(`\n${response.content}\n`);
    }
  } else {
    // Interactive mode
    clearScreen();
    showBanner();
    console.log('Initializing...\n');

    const memStats = getMemoryStats();
    const schedulerStatus = getSchedulerStatus();
    console.log(`Memory: ${memStats.dailyFiles} files`);
    console.log(`Scheduled tasks: ${schedulerStatus.enabledCount}\n`);

    await chatLoop();
  }
}

main().catch(console.error);
