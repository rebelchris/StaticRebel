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
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import http from 'http';
import https from 'https';
import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from './lib/configManager.js';
import { marketplaceCommand } from './lib/marketplace/cli.js';
import { socialCommand } from './lib/social/cli.js';
import { handlePersonalityCommand } from './lib/personality/cli.js';
import { handleBrowserCommand } from './lib/browser/cli.js';
import { emailCommand } from './lib/integrations/cli.js';
import { gmailCommand } from './lib/integrations/gmail-cli.js';
import { apiCommand } from './lib/api/cli.js';
import { slackCommand } from './lib/integrations/slack.js';
import { notionCommand } from './lib/integrations/notion-cli.js';
import { webhookCommand } from './lib/integrations/webhooks-cli.js';
import { integrationCommand } from './lib/integrations/dynamic/cli.js';
import { mediaCommand } from './lib/media/cli.js';
import { speakCommand } from './lib/tts/cli.js';
import {
  initMemory,
  getMemoryStats,
  readDailyMemory,
  readLongTermMemory,
  getRecentDailyMemories,
  writeDailyMemory,
  curateMemory,
} from './lib/memoryManager.js';
import {
  listAvailableModels,
  getModelForTask,
  chatCompletion,
  getDefaultModel,
  checkOllamaConnection,
} from './lib/modelRegistry.js';
import {
  startScheduler,
  listCronJobs,
  addCronJob,
  describeCron,
  getNextRunTime,
  getSchedulerStatus,
  deleteCronJob,
  toggleCronJob,
} from './lib/cronScheduler.js';
import {
  startHeartbeatMonitor,
  getHeartbeatStatus,
  configureHeartbeat,
} from './lib/heartbeatManager.js';
import {
  listSubagents,
  createCodingSubagent,
  createAnalysisSubagent,
  sendToSubagent,
  getSubagentStats,
  terminateSubagent,
} from './lib/subagentManager.js';
import { listSkills, getSkillsStats } from './lib/skillsManager.js';
import {
  loadPersona,
  buildSystemPrompt,
  sendMessage,
} from './agents/main/agent.js';
import {
  runCommand as runCodingCommand,
  readFile,
  executeChange,
} from './agents/coding/agent.js';
import {
  TrackerStore,
  QueryEngine,
  parseRecordFromText,
  matchesAutoDetect,
  parseTrackerFromNaturalLanguage,
} from './tracker.js';
import {
  exportData,
  importData,
  deleteAllUserData,
  getExportStats,
  EXPORT_SCOPES,
  EXPORT_FORMATS
} from './lib/export/index.js';
import {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  generateYearlyReport,
  formatReportAsTerminal,
  formatReportAsMarkdown,
  formatReportAsHTML,
  saveReportToFile,
  scheduleAutomaticReports
} from './lib/analytics/index.js';

// Level 2 AI Assistant - New Imports
import {
  initPersonaManager as initPersonaSystem,
  buildSystemPrompt as getSystemPrompt,
  getAvailablePersonas,
} from './lib/personaManager.js';
import {
  initVectorMemory,
  addMemory,
  searchMemories,
  getMemoryStats as getVectorStats,
  rememberPreference,
} from './lib/vectorMemory.js';
import {
  initWorkerSystem,
  createTask,
  getAllTasks,
  getWorkerStats,
  generateTodoMd,
  TaskStatus,
} from './lib/workerManager.js';
import {
  initApiConnector,
  createConnector,
  getAllConnectors,
  getApiStats,
  storeApiKey,
} from './lib/apiConnector.js';
import {
  routeTask,
  orchestrate,
  streamOllama,
  spawnClaudeCode as runClaudeCode,
} from './orchestrator.js';
import { research, webResearch, streamResearch } from './lib/webOracle.js';
import { classifyIntent } from './lib/intentClassifier.js';
import {
  initActionRegistry,
  executeAction,
  getAllActions,
} from './lib/actionRegistry.js';
import {
  initEvolutionSystem,
  getEvolutionOrchestrator,
} from './lib/evolutionOrchestrator.js';

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
    console.log(
      '\nTo use the dashboard, please install dashboard dependencies:',
    );
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
    /remind me/i,
    /schedule/i,
    /set (a )?reminder/i,
    /set an alarm/i,
    /every day at/i,
    /every week/i,
    /on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /at \d{1,2}(:\d{2})?( ?(am|pm))?/i,
    /cron/i,
    /create (a )?scheduled (task|job)/i,
    /add (a )?task/i,
  ],

  // Subagents / Delegation
  coding: [
    /write (some )?(code|function|class|script)/i,
    /create (a )?(function|class|module|component|api)/i,
    /build (a )?/i,
    /implement/i,
    /code/i,
    /debug/i,
    /fix (the )?(bug|error)/i,
    /refactor/i,
    /review (my )?code/i,
    /program/i,
    /develop/i,
  ],
  analysis: [
    /analyze/i,
    /compare/i,
    /evaluate/i,
    /assess/i,
    /think about/i,
    /what do you think/i,
    /should i/i,
    /pros and cons/i,
    /look into/i,
    /investigate/i,
    /figure out/i,
  ],

  // Memory
  memory: [
    /what did we (talk about|discuss|cover)/i,
    /remember (anything|that)/i,
    /my (memory|stats|history)/i,
    /show (me )?(my )?memories/i,
    /long.?term memory/i,
    /curate/i,
    /forget/i,
  ],

  // Text-to-Speech / Voice
  tts: [
    /read (this|that|it) (aloud|out loud)/i,
    /speak (this|that|it)/i,
    /say (this|that|it) (aloud|out loud)/i,
    /(read|speak|say) the (daily )?summary/i,
    /convert to speech/i,
    /turn into voice/i,
    /voice (this|that|it)/i,
    /text to speech/i,
    /tts/i,
    /speak .+/i,
    /read aloud/i,
  ],

  // Heartbeat / Status
  status: [
    /how are you/i,
    /what'?s (your|the) status/i,
    /system status/i,
    /heartbeat/i,
    /check (on|up) (everything|me)/i,
  ],

  // Task Management
  tasks: [
    /scheduled tasks/i,
    /upcoming tasks/i,
    /what (do i have|are) (scheduled|planned)/i,
    /show (me )?(my )?(tasks|schedule|reminders)/i,
    /cancel (a )?task/i,
  ],

  // Models
  models: [
    /what models/i,
    /list models/i,
    /available models/i,
    /change (the )?model/i,
    /switch model/i,
    /use (a )?different model/i,
  ],

  // Skills
  skills: [
    /what skills/i,
    /list skills/i,
    /installed skills/i,
    /add (a )?skill/i,
  ],

  // Web Search - Only for clearly current-info requests
  search: [
    /^(search|look up|find|google)\s/i,
    /what'?s new\??$/i,
    /latest news\??$/i,
    /what is happening\??$/i,
    /current events\??$/i,
    /search (for |the )(web|internet)/i,
  ],

  // Web Oracle - Deep research queries
  research: [
    /research/i,
    /look into/i,
    /investigate/i,
    /find out about/i,
    /tell me about (the )?(latest|new)/i,
    /what'?s the (latest|new) on/i,
    /hot topic/i,
    /trending/i,
    /current state of/i,
  ],

  // Shell Commands
  run: [/run (a )?(command|shell)/i, /execute/i, /terminal/i, /bash/i],

  // Help
  help: [/help/i, /what can you do/i, /what commands/i, /how (does this|to)/i],

  // Tracking / Logging
  track: [
    /log (my |the )?(calories|food|meal|workout|exercise|sleep|habit)/i,
    /track (my |the )?(calories|food|meal|workout|exercise|sleep|habit)/i,
    /i (just )?(had|ate|drank|consumed)/i,
    /how many (calories|cals)/i,
    /what'?ve i (eaten|drank|drunk|had)/i,
    /what did i (eat|drink|have|consume)/i,
    /what have i (eaten|drank|drunk|had|consumed)/i,
    /show (me )?(my )?(calories|food|meal|workout) (stats|today|history)/i,
    /add (a )?(meal|food|workout|exercise)/i,
    /record (my |a )?(calories|food|meal|workout|exercise)/i,
    /logging/i,
    /just logged/i,
    // Direct tracking requests
    /can you (track|log|record) (this|that|it)/i,
    /track (this|that|it)( for me)?/i,
    /keep (a )?track of/i,
    /note (this|that) down/i,
    // Workout/run specific patterns
    /i (\w+ )?(had|did|went for|completed|finished) (a |an |my )?(\d+k?m?|5k|10k|half.?marathon)?\s*(run|walk|swim|bike|workout|jog|ride)/i,
    /went (for a |)(run|jog|walk|swim|ride|bike)/i,
    /(run|ran|walked|swam|biked|cycled|jogged) (a |for )?\d+/i,
    /zone \d+ (pace|run|workout|training|effort)/i,
    /\d+k\s*(run|walk|jog)/i,
    // General activity patterns
    /today.*(run|walk|swim|bike|workout|jog|ride)/i,
    /(run|walk|swim|bike|workout|jog|ride).*today/i,
  ],

  // Social & Sharing
  social: [
    /share (my )?(streak|achievement|progress|goal)/i,
    /create (a )?challenge/i,
    /challenge.*water/i,
    /water challenge/i,
    /join (a )?challenge/i,
    /show (the )?leaderboard/i,
    /(who|what)'s winning/i,
    /share with.*friend/i,
    /share.*@\w+/i,
    /challenge.*@\w+/i,
    /my (social )?status/i,
    /export.*challenge/i,
    /import.*challenge/i,
    /privacy settings/i,
    /anonymous sharing/i,
  ],

  // Level 2: Persona & Identity
  persona: [
    /change (your )?persona/i,
    /switch (your )?persona/i,
    /use (a )?different (persona|personality)/i,
    /be more (concise|detailed|friendly|technical)/i,
    /adjust (your )?(tone|style|personality)/i,
    /persona/i,
  ],

  // Level 2: Vector Memory & Semantic Search
  memory2: [
    /remember (this|that|information)/i,
    /store (this|that)/i,
    /search (my )?memories/i,
    /semantic search/i,
    /long.?term memory/i,
    /recall (something|anything)/i,
    /vector memory/i,
    /semantic/i,
  ],

  // Level 2: Background Workers & Projects
  worker: [
    /run (in |a )?background/i,
    /long(-|\s)?running task/i,
    /create (a )?project/i,
    /project management/i,
    /background task/i,
    /async task/i,
    /subtask/i,
    /todo\.md/i,
    /task queue/i,
  ],

  // Level 2: API Connectors
  api: [
    /connect (to |an )?api/i,
    /api (connector|integration)/i,
    /new (api|integration)/i,
    /store (api|api key)/i,
    /dynamic (api|connector)/i,
    /webhook/i,
  ],

  // Level 3: Orchestrator (Claude Code CLI + Streaming)
  orchestrator: [
    /use claude code/i,
    /spawn claude/i,
    /run claude cli/i,
    /orchestrate/i,
    /dual stream/i,
    /streaming response/i,
    /complex coding/i,
    /deep refactor/i,
    /full codebase/i,
    /claude.*task/i,
    /advanced debugging/i,
    /architecture review/i,
  ],
};

function detectIntent(text) {
  const lower = text.toLowerCase();

  // Check for scheduling intent first (only with explicit scheduling keywords)
  if (
    /remind me|set (a |an )?reminder|schedule|create (a )?scheduled|cron|every (day|week|hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(
      lower,
    )
  ) {
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
  // 1. Classify intent using LLM
  const classification = await classifyIntent(input, getAllActions());

  // 2. Check if should fallback to chat
  if (
    classification.fallbackToChat ||
    classification.intents.length === 0 ||
    classification.intents[0].confidence < 0.6
  ) {
    return null; // Let regular chat handle it
  }

  // 3. Execute action(s)
  const context = buildActionContext();
  const results = [];

  for (const intent of classification.intents) {
    if (intent.confidence >= 0.6) {
      const result = await executeAction(intent.actionName, input, context);
      if (result.success) {
        results.push(result.result);
      } else {
        console.error(`[Action Error] ${intent.actionName}:`, result.error);
        results.push(`Sorry, something went wrong with ${intent.actionName}.`);
      }
    }
  }

  // 4. Return combined results
  return results.length > 0 ? results.join('\n\n---\n\n') : null;
}

function buildActionContext() {
  return {
    modules: {
      // Simple functions
      listAvailableModels,
      getDefaultModel,
      getModelForTask,
      listSkills,
      getSkillsStats,
      getSubagentStats,
      getMemoryStats,
      getSchedulerStatus,
      getHeartbeatStatus,

      // Module groups
      cronScheduler: {
        listCronJobs,
        addCronJob,
        describeCron,
        getNextRunTime,
        deleteCronJob,
        toggleCronJob,
      },
      memoryManager: {
        readDailyMemory,
        readLongTermMemory,
        getRecentDailyMemories,
        curateMemory,
        getMemoryStats,
      },
      personaManager: {
        getAvailablePersonas,
        setActivePersona,
        modifyPersonaFeedback,
        getSystemPrompt,
      },
      tracker: {
        TrackerStore,
        QueryEngine,
        parseRecordFromText,
        parseTrackerFromNaturalLanguage,
      },
      vectorMemory: {
        addMemory,
        searchMemories,
        getMemoryStats: getVectorStats,
        rememberPreference,
      },
      workerManager: {
        createTask,
        getAllTasks,
        generateTodoMd,
        getWorkerStats,
      },
      apiConnector: {
        createConnector,
        getAllConnectors,
        storeApiKey,
        getApiStats,
      },
      orchestrator: { routeTask, streamOllama, runClaudeCode },
      research: { research, webResearch },
      subagents: {
        createCodingSubagent,
        createAnalysisSubagent,
        sendToSubagent,
      },
      modelRegistry: { getDefaultModel, chatCompletion },
    },
    user: {},
    conversation: {},
  };
}

// ---------- Schedule Handler ----------
async function handleScheduleRequest(input) {
  // Extract time pattern
  const timeMatch = input.match(/(\d{1,2})(:(\d{2}))?( ?(am|pm))?/i);
  const daysMatch = input.match(
    /(every |on )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  );
  const taskMatch = input
    .replace(
      /remind me to?|schedule|every|at \d{1,2}(:\d{2})?( ?(am|pm))?/gi,
      '',
    )
    .trim();

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
  const dayMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  if (daysMatch) {
    const day = dayMap[daysMatch[2].toLowerCase()];
    cronExpr = cronExpr.replace('* *', `* ${day}`);
  }

  // Parse task
  const taskName = taskMatch || 'Scheduled Task';

  const job = addCronJob({
    name: taskName,
    schedule: { expr: cronExpr },
    payload: { text: input },
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
    return (
      `Here's your memory overview:\n\n` +
      `- Daily files: ${memStats.dailyFiles}\n` +
      `- Oldest memory: ${memStats.oldestMemory || 'None'}\n` +
      `- Newest memory: ${memStats.newestMemory || 'None'}\n` +
      `- Storage used: ${((memStats.dailySize + memStats.longTermSize) / 1024).toFixed(1)} KB`
    );
  }

  if (/what did we (talk about|discuss)/i.test(lower)) {
    const recent = getRecentDailyMemories(3);
    if (recent.length === 0) return "We haven't created any memories yet.";

    return (
      "Here's what we've been discussing:\n\n" +
      recent.map((r) => `## ${r.date}\n${r.content}`).join('\n\n---\n\n')
    );
  }

  if (/curate/i.test(lower)) {
    await curateMemory();
    return "I've reviewed your recent memories and updated long-term memory with the important bits.";
  }

  if (/long.?term/i.test(lower)) {
    const longTerm = readLongTermMemory();
    return longTerm || 'No long-term memories yet.';
  }

  // Default: show today's memory
  const today = readDailyMemory();
  return today || 'No memories for today yet.';
}

// ---------- Status Handler ----------
async function handleStatusRequest() {
  const memStats = getMemoryStats();
  const schedulerStatus = getSchedulerStatus();
  const heartbeatStatus = getHeartbeatStatus();
  const subagentStats = getSubagentStats();

  return (
    `Here's my status:\n\n` +
    `**Heartbeat**: ${heartbeatStatus.running ? 'Monitoring' : 'Stopped'}\n` +
    `**Scheduler**: ${schedulerStatus.enabledCount} active tasks\n` +
    `**Subagents**: ${subagentStats.active} active\n` +
    `**Memory**: ${memStats.dailyFiles} daily files\n\n` +
    `Everything's running smoothly!`
  );
}

// ---------- Tasks Handler ----------
async function handleTasksRequest() {
  const jobs = listCronJobs();
  const enabled = jobs.filter((j) => j.enabled);

  if (enabled.length === 0) {
    return 'You don\'t have any scheduled tasks yet. Say something like "Remind me to stretch every hour" and I\'ll set it up!';
  }

  return (
    `Here are your scheduled tasks (${enabled.length}):\n\n` +
    enabled
      .map((job) => {
        const next = getNextRunTime(job);
        return `- **${job.name}**\n  ${describeCron(job.schedule.expr)}\n  Next: ${next?.toLocaleString() || 'Unknown'}`;
      })
      .join('\n\n')
  );
}

// ---------- Models Handler ----------
async function handleModelsRequest() {
  const models = await listAvailableModels();
  const current = getDefaultModel();

  if (models.length === 0) {
    return 'No models detected. Make sure Ollama is running with `ollama serve`.';
  }

  return (
    `Available models on your Ollama:\n\n` +
    models
      .map((m) => {
        const size = m.size ? (m.size / 1024 / 1024 / 1024).toFixed(1) : '?';
        return `- ${m.name} (${size} GB)`;
      })
      .join('\n') +
    `\n\nCurrent default: ${current}`
  );
}

// ---------- Skills Handler ----------
async function handleSkillsRequest() {
  const skills = listSkills();
  const stats = getSkillsStats();

  if (skills.length === 0) {
    return "You don't have any custom skills yet. Skills are reusable prompts and workflows.";
  }

  return (
    `Your skills (${stats.total}):\n\n` +
    skills
      .map(
        (s) =>
          `- **${s.name}**: ${s.description || 'No description'}\n  ${s.triggers.length} triggers`,
      )
      .join('\n\n')
  );
}

// ---------- Social Handler ----------
async function handleSocialRequest(input) {
  const lower = input.toLowerCase();

  // Quick water challenge
  if (/water challenge/i.test(input) || (/challenge.*water/i.test(input))) {
    const args = input.match(/(\d+)\s*day/i);
    const duration = args ? parseInt(args[1]) : 7;
    
    try {
      const result = await socialCommand(['challenge', 'water', 'You', duration.toString()]);
      return result;
    } catch (error) {
      return `Couldn't create water challenge: ${error.message}`;
    }
  }

  // Share streak
  if (/share.*streak/i.test(input)) {
    const anonymous = /anonymous/i.test(input);
    try {
      const result = await socialCommand(['share', 'streak', 'water', ...(anonymous ? ['--anonymous'] : [])]);
      return result;
    } catch (error) {
      return `Couldn't share streak: ${error.message}`;
    }
  }

  // Show leaderboard
  if (/leaderboard|who.*winning/i.test(input)) {
    try {
      const result = await socialCommand(['status']);
      return result;
    } catch (error) {
      return `Couldn't show social status: ${error.message}`;
    }
  }

  // Join challenge
  if (/join.*challenge/i.test(input)) {
    return "To join a challenge, use: `sr social challenge join <shareCode>`\n" +
           "Ask your friend for their share code!";
  }

  // Default social help
  return "🤝 Social Features Available!\n\n" +
         "• `sr social challenge water` - Create a water challenge\n" +
         "• `sr social share streak water` - Share your water streak\n" +
         "• `sr social status` - See your social activity\n" +
         "• `sr social help` - Full social commands help\n\n" +
         "Say things like:\n" +
         "- \"Create a water challenge\"\n" +
         "- \"Share my water streak\"\n" +
         "- \"Show the leaderboard\"";
}

// ---------- Web Search ----------

// ---------- Shell Command ----------
async function handleRunRequest(input) {
  const cmd = input.replace(/run|execute|terminal|bash|command/i, '').trim();
  if (!cmd) return 'What command should I run?';

  const result = await runShellCommand(cmd);
  return `Command output:\n\n${result}`;
}

// ---------- Help ----------
function handleHelp() {
  return (
    `I'm Charlize, your Level 3 AI assistant! Just talk to me naturally:\n\n` +
    `**Scheduling**\n"Remind me to stretch every hour"\n"Schedule a daily summary at 9am"\n"Set a reminder for Monday at 3pm"\n\n` +
    `**Tasks & Delegation**\n"Write a function to sort an array"\n"Create a React component for a button"\n"Analyze the pros and cons of these options"\n"Think about whether I should use SQL or NoSQL"\n\n` +
    `**Tracking**\n"I had a cappuccino, log it"\n"Log 450 calories for my sandwich"\n"How many calories today?"\n\n` +
    `**Memory**\n"What did we talk about today?"\n"Show me my memory stats"\n"Curate my memories"\n\n` +
    `**Level 2 Features**\n"Be more concise" - Adjust my personality\n"Remember this information" - Store in vector memory\n"Create a project" - Generate TODO.md with background tasks\n"Connect to API" - Set up dynamic API connectors\n\n` +
    `**Email & Communication**\n"Check my email" - Get unread email summary\n"Send an email to john@example.com about the meeting"\n"Search my emails for invoices"\n"Find emails from GitHub"\n\n` +
    `**Level 3: Web Oracle (Research)**\n"Research the latest AI developments"\n"Investigate climate change technologies"\n"What's new in quantum computing?"\n"Research Rust vs C++ performance"\n\n` +
    `**Level 3: Orchestrator (Claude Code)**\n"Debug this complex bug in my codebase"\n"Refactor the entire project structure"\n"Do a full architecture review"\n"Use claude code for a complete rewrite"\n\n` +
    `**Current Information**\n"Search for latest AI news"\n"What's new in tech?"\n"What's happening today?"\n\n` +
    `**Quick Info**\n"What models do I have?"\n"Show me my scheduled tasks"\n\n` +
    `Just say what you need - I'll figure it out!`
  );
}

// ---------- Orchestrator Handler (Level 3) ----------
async function handleOrchestratorRequest(input) {
  const task = input
    .replace(
      /use claude code|spawn claude|run claude cli|orchestrate|dual stream|streaming response|complex coding|deep refactor|full codebase|claude.*task|advanced debugging|architecture review/gi,
      '',
    )
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
    console.log(
      '[ORCHESTRATOR] Running with both Ollama and Claude Code in parallel...\n',
    );
    return `I've dispatched your task to both local Ollama and Claude Code CLI for comprehensive assistance. Check the output above!`;
  }
}

// ---------- Tracking ----------
// LLM-based intent analyzer for tracking requests
async function analyzeTrackingIntent(input, existingTrackers) {
  try {
    const trackersList =
      existingTrackers.length > 0
        ? existingTrackers
            .map((t) => `- ${t.displayName} (type: ${t.type})`)
            .join('\n')
        : 'No trackers exist yet';

    const intentPrompt = `Analyze this user input and determine the tracking intent:

User input: "${input}"

Existing trackers:
${trackersList}

Respond with ONLY valid JSON:
{
  "intentType": "log|query|none",
  "trackerType": "nutrition|workout|sleep|habit|mood|hydration|medication|custom|unknown",
  "trackerNeeded": "existing_tracker_name or null if needs new tracker",
  "description": "brief description of what tracker this needs (if new)",
  "confidence": 0.0-1.0
}

Intent types:
- "log": User wants to record/log data (e.g., "I had coffee", "did a 5k run", "log calories")
- "query": User wants to retrieve/view data (e.g., "what did I eat", "how many calories", "show my workouts")
- "none": Not tracking-related

Examples:
- "I had a cappuccino" -> {intentType: "log", trackerType: "nutrition", confidence: 0.95}
- "What did I drink today?" -> {intentType: "query", trackerType: "nutrition", confidence: 0.95}
- "I did a 5k run at zone 2" -> {intentType: "log", trackerType: "workout", confidence: 0.95}
- "Show me my workouts this week" -> {intentType: "query", trackerType: "workout", confidence: 0.95}
- "What's the weather?" -> {intentType: "none", confidence: 0.0}

If a matching tracker exists, set "trackerNeeded" to its type. If a new tracker is needed, set it to null.`;

    const model = getDefaultModel();
    const response = await chatCompletion(model, [
      {
        role: 'system',
        content: 'You are an intent classifier. Output only valid JSON.',
      },
      { role: 'user', content: intentPrompt },
    ]);

    const content = response.message;
    const intent = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');

    return intent;
  } catch (e) {
    console.error('[Track] Intent analysis failed:', e.message);
    return { intentType: 'none', confidence: 0 };
  }
}

// Helper function to find or create appropriate tracker
async function findOrCreateTracker(trackerType, description, store) {
  try {
    // Check if a tracker of this type already exists
    const trackers = store.listTrackers();
    const existingTracker = trackers.find(
      (t) =>
        t.type === trackerType ||
        (trackerType === 'nutrition' &&
          (t.type === 'food' || t.type === 'nutrition')),
    );

    if (existingTracker) {
      return existingTracker;
    }

    // Auto-create the tracker
    console.log(`  \x1b[36m[Auto-creating ${trackerType} tracker...]\x1b[0m`);

    const trackerConfig = await parseTrackerFromNaturalLanguage(description);
    if (!trackerConfig) {
      return null;
    }

    // Create the tracker
    const createResult = store.createTracker(trackerConfig);
    if (!createResult.success) {
      console.error(`[Track] Failed to create tracker: ${createResult.error}`);
      return null;
    }

    console.log(`  \x1b[32m[Created tracker: @${trackerConfig.name}]\x1b[0m`);
    return trackerConfig;
  } catch (e) {
    console.error('[Track] Tracker creation failed:', e.message);
    return null;
  }
}

async function handleTrackRequest(input) {
  const store = new TrackerStore();
  const trackers = store.listTrackers();

  // Step 1: Use LLM to analyze the intent
  const intent = await analyzeTrackingIntent(input, trackers);

  // If not tracking-related or low confidence, return null to let it be handled elsewhere
  if (intent.intentType === 'none' || intent.confidence < 0.6) {
    if (trackers.length === 0) {
      return 'No trackers configured. Create one with: /track new';
    }
    return null;
  }

  // Step 2: Handle QUERY intent
  if (intent.intentType === 'query') {
    if (trackers.length === 0) {
      return "No trackers configured yet. Start logging data and I'll create one for you!";
    }

    // Find the appropriate tracker for the query
    const tracker =
      trackers.find(
        (t) =>
          t.type === intent.trackerType ||
          (intent.trackerType === 'nutrition' &&
            (t.type === 'food' || t.type === 'nutrition')),
      ) || trackers[0];

    return await handleTrackQuery(input, tracker, store);
  }

  // Step 3: Handle LOG intent
  if (intent.intentType === 'log') {
    // Find or create the appropriate tracker
    const tracker = await findOrCreateTracker(
      intent.trackerType,
      intent.description || `${intent.trackerType} tracker`,
      store,
    );

    if (!tracker) {
      return "I couldn't create a tracker for this. Try: /track new";
    }

    // Log the data
    const result = await logToTracker(tracker, input, store);

    if (result.success) {
      // Check if this was a newly created tracker
      const wasNew =
        trackers.length === 0 || !trackers.find((t) => t.name === tracker.name);
      if (wasNew) {
        return `\x1b[32m[New tracker created!]\x1b[0m\n\n${result.message}`;
      }
      return result.message;
    }

    return `Failed to log to ${tracker.displayName}. Try rephrasing with more details.`;
  }

  // Fallback
  return null;
}

// Simple heuristic parser for food entries as fallback when LLM fails
function parseFoodHeuristic(text) {
  const lower = text.toLowerCase();

  // Extract food name - look for text after "had", "ate", "drank" or at the start
  let foodName = '';
  const hadMatch = lower.match(
    /(?:had|ate|drank|consumed)\s+(?:a\s+)?(?:cup of\s+)?(.+)/,
  );
  if (hadMatch) {
    foodName = hadMatch[1]
      .replace(/,?\s*(log|track|record|add)\s*(calories|food|meal).*/i, '')
      .trim();
  } else {
    // Try to extract from the beginning
    foodName = text
      .replace(/,?\s*(log|track|record|add)\s*(calories|food|meal).*/i, '')
      .trim();
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
    coffee: 5,
    espresso: 3,
    cappuccino: 120,
    latte: 190,
    tea: 2,
    'green tea': 0,
    'black coffee': 5,
    egg: 78,
    eggs: 156,
    toast: 80,
    bread: 80,
    banana: 105,
    apple: 95,
    orange: 62,
    chicken: 165,
    beef: 250,
    fish: 136,
    salmon: 208,
    rice: 130,
    pasta: 220,
    salad: 150,
    pizza: 285,
    burger: 350,
    fries: 230,
    sandwich: 350,
    milk: 103,
    'orange juice': 110,
    water: 0,
    yogurt: 150,
    cereal: 120,
    oatmeal: 150,
    avocado: 160,
    nuts: 180,
    almonds: 164,
    cheese: 110,
    chocolate: 150,
    'ice cream': 270,
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
  if (foodName)
    data.meal = foodName.charAt(0).toUpperCase() + foodName.slice(1);
  if (calories) data.calories = calories;

  return data;
}

// Simple heuristic parser for workout entries as fallback when LLM fails
function parseWorkoutHeuristic(text) {
  const lower = text.toLowerCase();

  const data = {};

  // Extract exercise name
  const exerciseMatch = lower.match(
    /(?:did|completed|finished|started)\s+(?:a\s+)?(?:workout of\s+)?(.+)/,
  );
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
      console.log(
        `[Tracker] LLM parsing failed, trying heuristic parser for ${tracker.type}`,
      );

      if (tracker.type === 'nutrition' || tracker.type === 'food') {
        parsed = { success: true, data: parseFoodHeuristic(input) };
      } else if (tracker.type === 'workout') {
        parsed = { success: true, data: parseWorkoutHeuristic(input) };
      }
    } else if (
      parsed.success &&
      (tracker.type === 'nutrition' || tracker.type === 'food')
    ) {
      // For nutrition, merge heuristic estimates if calories are missing
      if (!parsed.data.calories) {
        console.log(
          `[Tracker] LLM didn't extract calories, trying heuristic estimates...`,
        );
        const heuristicData = parseFoodHeuristic(input);
        // Merge heuristic calories into LLM-parsed data
        if (heuristicData.calories) {
          parsed.data.calories = heuristicData.calories;
        }
      }
    }

    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      console.error(`[Tracker] No data extracted from "${input}"`);
      return { success: false, message: null };
    }

    console.log(
      `[Tracker] Extracted data for ${tracker.name}:`,
      JSON.stringify(parsed.data),
    );

    const result = store.addRecord(tracker.name, {
      data: parsed.data,
      source: 'natural-language',
    });

    if (result.success) {
      // Format the logged data nicely
      const dataEntries = Object.entries(parsed.data)
        .filter(([k, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      return {
        success: true,
        message: `Logged to **${tracker.displayName}**:\n${dataEntries}`,
      };
    }

    console.error(`[Tracker] Failed to add record:`, result.error);
    return { success: false, message: null };
  } catch (e) {
    console.error(`[Tracker] Error logging to ${tracker.name}:`, e.message);
    return { success: false, message: null };
  }
}

async function handleTrackQuery(input, tracker, store) {
  const query = new QueryEngine();
  const stats = query.getStats(tracker.name, 'today');

  if (stats.totalEntries === 0) {
    return `No entries logged today for ${tracker.displayName}.`;
  }

  // Calculate total calories manually from records (for nutrition trackers)
  const totalCals = stats.records.reduce(
    (sum, r) => sum + (r.data?.calories || 0),
    0,
  );

  // Filter out invalid entries like "No meal mentioned"
  const validRecords = stats.records.filter((r) => {
    const meal = r.data?.name || r.data?.meal || r.data?.exercise || '';
    return meal && meal.toLowerCase() !== 'no meal mentioned';
  });

  if (validRecords.length === 0) {
    return `No valid entries logged today for ${tracker.displayName}.`;
  }

  // Format response based on tracker type
  if (tracker.type === 'nutrition' || tracker.type === 'food') {
    const entries = validRecords
      .map((r) => {
        const meal = r.data?.name || r.data?.meal || 'Entry';
        const cal = r.data?.calories ? ` (${r.data.calories} cal)` : '';
        return `- ${meal}${cal}`;
      })
      .join('\n');

    return (
      `**${tracker.displayName}** today:\n\n` +
      entries +
      `\n\nTotal: ${validRecords.length} entries, ${totalCals.toFixed(0)} calories`
    );
  } else if (tracker.type === 'workout') {
    const entries = validRecords
      .map((r) => {
        const exercise = r.data?.exercise || r.data?.name || 'Workout';
        const details = [];
        if (r.data?.duration) details.push(`${r.data.duration}`);
        if (r.data?.distance) details.push(`${r.data.distance}`);
        if (r.data?.sets) details.push(`${r.data.sets} sets`);
        const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
        return `- ${exercise}${detailStr}`;
      })
      .join('\n');

    return (
      `**${tracker.displayName}** today:\n\n` +
      entries +
      `\n\nTotal: ${validRecords.length} workouts`
    );
  } else {
    // Generic tracker display
    const entries = validRecords
      .map((r, i) => {
        const mainField = Object.entries(r.data)[0];
        return `- Entry ${i + 1}: ${mainField ? `${mainField[0]}=${mainField[1]}` : 'No data'}`;
      })
      .join('\n');

    return (
      `**${tracker.displayName}** today:\n\n` +
      entries +
      `\n\nTotal: ${validRecords.length} entries`
    );
  }
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

${Object.values(personas)
  .map((p) => `- **${p.name}** (${p.role})`)
  .join('\n')}

Say "Use <persona name>" to switch.`;
  }

  if (/be more|adjust/i.test(lower)) {
    // Modify current persona
    const result = modifyPersonaFeedback('charlize', input);
    if (result.success) {
      return (
        `Updated persona preferences:\n\n` +
        `- ${result.modifications.join('\n- ')}\n\n` +
        `These changes are now permanent.`
      );
    }
    return 'Could not update persona. Try rephrasing your request.';
  }

  // Default: show current persona
  const current = getSystemPrompt();
  return (
    `Current persona: Charlize\n\n` +
    `Say "be more concise" or "be more friendly" to adjust my behavior.\n` +
    `Say "change persona" to see all available personas.`
  );
}

// ============================================================================
// Level 2: Vector Memory Handler
// ============================================================================

async function handleMemory2Request(input) {
  const lower = input.toLowerCase();

  if (/remember|store/i.test(lower)) {
    // Store new memory
    const content = input.replace(/remember|store|this|that/i, '').trim();
    if (!content) return 'What would you like me to remember?';

    await addMemory(content, { type: 'user_preference' });
    await rememberPreference('user_instruction', content, input);

    return `Got it! I'll remember: "${content}"`;
  }

  if (/search/i.test(lower)) {
    // Semantic search
    const query = input.replace(/search|my|memories/i, '').trim();
    const results = await searchMemories(query || input, { limit: 5 });

    if (results.length === 0) {
      return 'No matching memories found.';
    }

    return `**Semantic Search Results:**

${results.map((r, i) => `${i + 1}. ${r.content} (${(r.score * 100).toFixed(0)}% match)`).join('\n\n')}`;
  }

  // Memory stats
  const stats = getVectorStats();
  return `**Vector Memory Stats:**

Total memories: ${stats.totalMemories}
${Object.entries(stats.byType)
  .map(([type, count]) => `- ${type}: ${count}`)
  .join('\n')}`;
}

// ============================================================================
// Level 2: Background Worker Handler
// ============================================================================

async function handleWorkerRequest(input) {
  const lower = input.toLowerCase();

  if (/create (a )?project/i.test(lower)) {
    // Create project with TODO.md
    const projectName =
      input.replace(/create|a|project/i, '').trim() || 'New Project';

    const task = createTask({
      name: projectName,
      type: 'project',
      payload: { description: input },
      subtasks: [
        { name: 'Set up project structure', type: 'process' },
        { name: 'Research dependencies', type: 'research' },
        { name: 'Implement core features', type: 'code' },
        { name: 'Write tests', type: 'process' },
        { name: 'Documentation', type: 'process' },
      ],
    });

    // Generate TODO.md
    const todoContent = generateTodoMd(projectName, task.subtasks);
    const todoPath = path.join(process.cwd(), 'TODO.md');
    fs.writeFileSync(todoPath, todoContent);

    return (
      `Created project "${projectName}"!\n\n` +
      `- Background task created: ${task.id}\n` +
      `- TODO.md generated at: ${todoPath}\n` +
      `- Subtasks: ${task.subtasks.length}`
    );
  }

  if (/run (in |a )?background|async/i.test(lower)) {
    // Create background task
    const taskName =
      input.replace(/run|in|background|async|long|running|task/i, '').trim() ||
      'Background Task';
    const taskType = /research/i.test(lower)
      ? 'research'
      : /code|build/i.test(lower)
        ? 'code'
        : 'process';

    const task = createTask({
      name: taskName,
      type: taskType,
      payload: { description: input },
      priority: 'normal',
    });

    return (
      `Started background task: **${task.name}**\n` +
      `- Task ID: ${task.id}\n` +
      `- Status: ${task.status}\n` +
      `Check back later for results!`
    );
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

${connectors.length > 0 ? connectors.map((c) => `- ${c.name} (${c.type})`).join('\n') : 'No connectors configured yet.'}

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
// Colors & Styling (Enhanced with Chalk)
// ============================================================================

// Enhanced styled output functions using chalk
const styles = {
  user: (text) => chalk.cyanBright(text),
  assistant: (text) => chalk.greenBright(text),
  error: (text) => chalk.redBright(text),
  warning: (text) => chalk.yellowBright(text),
  info: (text) => chalk.blueBright(text),
  dim: (text) => chalk.gray(text),
  heading: (text) => chalk.whiteBright.bold(text),
  command: (text) => chalk.magentaBright(text),
  success: (text) => chalk.greenBright(text),
  spinner: (text) => chalk.cyan(text),
  stats: (text) => chalk.blue(text),
  export: (text) => chalk.green(text),
  bold: (text) => chalk.bold(text),
  underline: (text) => chalk.underline(text),
};

function timestamp() {
  const now = new Date();
  return styles.dim(now.toLocaleTimeString('en-US', { hour12: false }));
}

function promptSymbol() {
  return chalk.yellowBright('>');
}

// Global spinner instance for loading operations
let globalSpinner = null;

function startSpinner(text, color = 'cyan') {
  if (globalSpinner) {
    globalSpinner.stop();
  }
  globalSpinner = ora({
    text: chalk[color](text),
    spinner: 'dots',
    color: color,
  }).start();
  return globalSpinner;
}

function updateSpinner(text, color = 'cyan') {
  if (globalSpinner) {
    globalSpinner.text = chalk[color](text);
  }
}

function stopSpinner(text, symbol = '✓', color = 'green') {
  if (globalSpinner) {
    if (text) {
      globalSpinner.succeed(chalk[color](text));
    } else {
      globalSpinner.stop();
    }
    globalSpinner = null;
  }
}

function failSpinner(text, symbol = '✗', color = 'red') {
  if (globalSpinner) {
    globalSpinner.fail(chalk[color](text || 'Operation failed'));
    globalSpinner = null;
  }
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
  /current events/i,
];

async function webSearch(query) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'duckduckgo.com',
        path: `/?q=${encodeURIComponent(query)}&t=h_&ia=web`,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const results = [];

          // DuckDuckGo HTML format: <a class="result__a" href="...">Actual Title</a>
          const linkRegex =
            /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          let match;

          while ((match = linkRegex.exec(data)) && results.length < 5) {
            let title = match[2]
              .trim()
              .replace(/<[^>]*>/g, '') // Remove any nested HTML
              .replace(/&#x27;/g, "'")
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');

            const url = match[1];

            // Skip empty or noise titles
            if (
              title &&
              title.length > 15 &&
              !title.match(
                /^(Web|Images|Videos|News|Maps|More|Settings|Privacy)$/,
              )
            ) {
              results.push({ title, url });
            }
          }

          resolve(results);
        });
      },
    );
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

async function handleWebSearch(input) {
  // Web search temporarily disabled - requires API configuration
  return `🔍 Web search is temporarily disabled.\n\nTo enable web search, configure one of:\n\n1. **Tavily API** (Recommended):\n   - Get API key: https://tavily.com/\n   - Add to .env: TAVILY_API_KEY=your-key\n\n2. **Self-hosted SearxNG**:\n   - Install: https://searxng.github.io/searxng/\n   - Add to .env: SEARXNG_URL=http://localhost:8080\n\nNote: Local Ollama models cannot perform web searches directly.`;

  /* Original implementation disabled
  const query = input
    .replace(/search|look up|find|what's new|latest|google|web|internet/i, '')
    .trim()
    .replace(/^(for |the )/, '');

  if (!query) {
    return 'What would you like me to search for? Try: "Search for latest AI news"';
  }

  const results = await webSearch(query);

  if (results.length === 0) {
    return `No results found for "${query}". Try a different search term.`;
  }

  return (
    `**Web Search: ${query}**\n\n` +
    results
      .slice(0, 5)
      .map((r, i) => {
        const url = r.url ? `\n   ${r.url}` : '';
        return `${i + 1}. ${r.title}${url}`;
      })
      .join('\n\n') +
    `\n\n_${results.length} results found_`
  );
}

// ---------- Web Oracle Research Handler ----------
async function handleResearchRequest(input) {
  const query = input
    .replace(
      /research|look into|investigate|find out about|tell me about|what's the|whats the|latest|hot topic|trending|current state of/gi,
      '',
    )
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
  */
}

const SAFE_COMMANDS = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'pwd',
  'date',
  'echo',
  'git status',
  'git log --oneline',
]);

async function runShellCommand(cmd, confirm = true) {
  const isDangerous = !SAFE_COMMANDS.some((c) => cmd.startsWith(c));

  if (isDangerous && confirm) {
    process.stdout.write(`\n⚠️  Run "${cmd}"? (y/n): `);
    const ans = await new Promise((r) => process.stdin.once('data', r));
    if (ans.toString().trim().toLowerCase() !== 'y') {
      return 'Cancelled.';
    }
  }

  return new Promise((resolve) => {
    const proc = spawn(cmd, { shell: true });
    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (out += d));
    proc.on('close', (code) => resolve(out || `(exit ${code})`));
  });
}

// ============================================================================
// Interactive Chat Loop
// ============================================================================

// Import unified chat handler
import { handleChat, initChatHandler } from './lib/chatHandler.js';

// Session state
let messageCount = 0;
const sessionStart = new Date();

// Command handlers
const CLI_COMMANDS = {
  '/help': {
    description: 'Show available commands',
    execute: async () => {
      return (
        `${styles.heading('╔═══ Available Commands ═══╗')}\n` +
        `${styles.command('/help')}     ${styles.dim('Show this help message')}\n` +
        `${styles.command('/clear')}    ${styles.dim('Clear the screen')}\n` +
        `${styles.command('/history')}  ${styles.dim('Show conversation stats')}\n` +
        `${styles.command('/stats')}    ${styles.dim('Show usage statistics')}\n` +
        `${styles.command('/export')}   ${styles.dim('Backup your data')}\n` +
        `${styles.command('/models')}   ${styles.dim('List available models')}\n` +
        `${styles.command('/status')}   ${styles.dim('Show system status')}\n` +
        `${styles.command('/tasks')}    ${styles.dim('Show scheduled tasks')}\n` +
        `${styles.command('/skills')}   ${styles.dim('List available skills')}\n` +
        `${styles.command('/mem')}      ${styles.dim('Show memory stats')}\n` +
        `${styles.command('/quit')}     ${styles.dim('Exit the assistant')}\n` +
        `${styles.dim('─'.repeat(35))}\n` +
        `${styles.dim('Tip: Multi-line input:')}\n` +
        `${styles.dim('  Type your message and press ')}${styles.command('Enter')}\n` +
        `${styles.dim('  for a new line. Send with an ')}${styles.command('empty line')}${styles.dim('.')}`
      );
    },
  },

  '/clear': {
    description: 'Clear the screen',
    execute: async () => {
      clearScreen();
      showBanner();
      return styles.info('Screen cleared. Ready for new conversation!');
    },
  },

  '/history': {
    description: 'Show conversation statistics',
    execute: async () => {
      const duration = Math.floor((new Date() - sessionStart) / 1000);
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      return (
        `${styles.heading('╔═══ Session Statistics ═══╗')}\n` +
        `${styles.info('Messages:')} ${messageCount}\n` +
        `${styles.info('Session time:')} ${mins}m ${secs}s\n` +
        `${styles.info('Started:')} ${sessionStart.toLocaleString()}`
      );
    },
  },

  '/models': {
    description: 'List available Ollama models',
    execute: async () => {
      const { listAvailableModels, getDefaultModel } = await import(
        './lib/modelRegistry.js'
      );
      const models = await listAvailableModels();
      const defaultModel = getDefaultModel();
      if (models.length === 0) {
        return styles.warning('No models available. Make sure Ollama is running.');
      }
      return (
        `${styles.heading('╔═══ Available Models ═══╗')}\n` +
        models
          .map((m) => {
            const isDefault = m.name === defaultModel ? ` ${styles.success('[default]')}` : '';
            return `${styles.command('•')} ${m.name}${isDefault}`;
          })
          .join('\n')
      );
    },
  },

  '/status': {
    description: 'Show system status',
    execute: async () => {
      const { getMemoryStats } = await import('./lib/memoryManager.js');
      const { getSchedulerStatus } = await import('./lib/cronScheduler.js');
      const { getHeartbeatStatus } = await import('./lib/heartbeatManager.js');
      const { getSubagentStats } = await import('./lib/subagentManager.js');
      const { getDefaultModel } = await import('./lib/modelRegistry.js');

      const memStats = getMemoryStats();
      const schedulerStatus = getSchedulerStatus();
      const heartbeatStatus = getHeartbeatStatus();
      const subagentStats = getSubagentStats();
      const model = getDefaultModel();

      return (
        `${styles.heading('╔═══ System Status ═══╗')}\n` +
        `${styles.info('Model:')} ${model}\n` +
        `${styles.info('Heartbeat:')} ${heartbeatStatus.running ? styles.success('Running') : styles.dim('Stopped')}\n` +
        `${styles.info('Scheduler:')} ${schedulerStatus.enabledCount} active tasks\n` +
        `${styles.info('Subagents:')} ${subagentStats.active} active\n` +
        `${styles.info('Memory files:')} ${memStats.dailyFiles}`
      );
    },
  },

  '/tasks': {
    description: 'Show scheduled tasks',
    execute: async () => {
      const { listCronJobs, describeCron, getNextRunTime } = await import(
        './lib/cronScheduler.js'
      );
      const jobs = listCronJobs();
      const enabled = jobs.filter((j) => j.enabled);

      if (enabled.length === 0) {
        return styles.dim('No scheduled tasks.');
      }

      return (
        `${styles.heading('╔═══ Scheduled Tasks ═══╗')}\n` +
        enabled
          .map((job) => {
            const next = getNextRunTime(job);
            return `${styles.command('•')} ${job.name}\n  ${styles.dim(describeCron(job.schedule.expr))} ${next ? `@ ${next.toLocaleTimeString()}` : ''}`;
          })
          .join('\n')
      );
    },
  },

  '/skills': {
    description: 'List available skills',
    execute: async () => {
      const { listSkills } = await import('./lib/skillsManager.js');
      const skills = listSkills();

      if (skills.length === 0) {
        return styles.dim('No skills configured.');
      }

      return (
        `${styles.heading('╔═══ Available Skills ═══╗')}\n` +
        skills
          .map((s) => `${styles.command('•')} ${s.name}: ${s.description || 'No description'}`)
          .join('\n')
      );
    },
  },

  '/mem': {
    description: 'Show memory statistics',
    execute: async () => {
      const { getMemoryStats } = await import('./lib/memoryManager.js');
      const { getMemoryStats: getVectorStats } = await import('./lib/vectorMemory.js');
      const memStats = getMemoryStats();
      const vectorStats = getVectorStats();

      return (
        `${styles.heading('╔═══ Memory Statistics ═══╗')}\n` +
        `${styles.info('Daily files:')} ${memStats.dailyFiles}\n` +
        `${styles.info('Oldest memory:')} ${memStats.oldestMemory || 'None'}\n` +
        `${styles.info('Vector memories:')} ${vectorStats.totalMemories}\n` +
        `${styles.info('Storage used:')} ${((memStats.dailySize + memStats.longTermSize) / 1024).toFixed(1)} KB`
      );
    },
  },

  '/stats': {
    description: 'Show comprehensive usage statistics',
    execute: async () => {
      const spinner = startSpinner('Gathering stats...', 'cyan');
      
      try {
        const { getMemoryStats } = await import('./lib/memoryManager.js');
        const { getSkillsStats } = await import('./lib/skillsManager.js');
        const { getSubagentStats } = await import('./lib/subagentManager.js');
        const { getWorkerStats } = await import('./lib/workerManager.js');
        
        // Session stats
        const duration = Math.floor((new Date() - sessionStart) / 1000);
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        
        // Memory stats
        const memStats = getMemoryStats();
        
        // Skills stats
        const skillsStats = getSkillsStats();
        
        // Subagent stats
        const subagentStats = getSubagentStats();
        
        // Worker stats (if available)
        let workerStats = { active: 0, completed: 0, failed: 0 };
        try {
          workerStats = getWorkerStats();
        } catch (e) {
          // Worker system not initialized
        }

        // Calculate streaks (simple implementation)
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const todayFile = path.join(os.homedir(), '.static-rebel', 'memory', `${today}.md`);
        const yesterdayFile = path.join(os.homedir(), '.static-rebel', 'memory', `${yesterday}.md`);
        
        let streak = 0;
        if (fs.existsSync(todayFile)) streak++;
        if (fs.existsSync(yesterdayFile)) streak++;
        
        stopSpinner('Stats gathered!');
        
        return (
          `${styles.heading('╔═══ StaticRebel Usage Statistics ═══╗')}\n` +
          `${styles.stats('Session Stats:')}\n` +
          `  ${styles.info('Messages this session:')} ${messageCount}\n` +
          `  ${styles.info('Session duration:')} ${mins}m ${secs}s\n` +
          `  ${styles.info('Started at:')} ${sessionStart.toLocaleString()}\n` +
          `\n${styles.stats('Memory & Storage:')}\n` +
          `  ${styles.info('Daily memory files:')} ${memStats.dailyFiles}\n` +
          `  ${styles.info('Oldest memory:')} ${memStats.oldestMemory || 'None'}\n` +
          `  ${styles.info('Storage used:')} ${((memStats.dailySize + memStats.longTermSize) / 1024).toFixed(1)} KB\n` +
          `  ${styles.info('Activity streak:')} ${streak} day(s)\n` +
          `\n${styles.stats('Skills & Capabilities:')}\n` +
          `  ${styles.info('Available skills:')} ${skillsStats.total}\n` +
          `  ${styles.info('Skills used:')} ${skillsStats.used || 0}\n` +
          `  ${styles.info('Active subagents:')} ${subagentStats.active}\n` +
          `  ${styles.info('Worker tasks:')} ${workerStats.active} active, ${workerStats.completed} completed\n` +
          `\n${styles.success('💡 Tip:')} ${styles.dim('Use /export to backup your data')}`
        );
      } catch (error) {
        failSpinner('Failed to gather stats');
        return styles.error(`Error gathering stats: ${error.message}`);
      }
    },
  },

  '/export': {
    description: 'Export/backup data',
    execute: async () => {
      const spinner = startSpinner('Preparing export...', 'green');
      
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const exportDir = path.join(os.homedir(), '.static-rebel', 'exports');
        const exportFile = path.join(exportDir, `staticrebel-backup-${timestamp}.tar.gz`);
        
        // Create exports directory if it doesn't exist
        if (!fs.existsSync(exportDir)) {
          fs.mkdirSync(exportDir, { recursive: true });
        }
        
        updateSpinner('Creating backup archive...', 'green');
        
        // Simple backup - copy important directories
        const dataDir = path.join(os.homedir(), '.static-rebel');
        const memoryDir = path.join(dataDir, 'memory');
        const configDir = path.join(dataDir, 'config');
        
        // Create a simple backup by copying files
        const backupData = {
          timestamp: new Date().toISOString(),
          version: '2.0.0',
          memory: {},
          config: {},
          stats: {
            files: 0,
            size: 0
          }
        };
        
        // Backup memory files
        if (fs.existsSync(memoryDir)) {
          const memoryFiles = fs.readdirSync(memoryDir);
          for (const file of memoryFiles) {
            if (file.endsWith('.md')) {
              const filePath = path.join(memoryDir, file);
              const content = fs.readFileSync(filePath, 'utf8');
              backupData.memory[file] = content;
              backupData.stats.files++;
              backupData.stats.size += content.length;
            }
          }
        }
        
        // Backup config files
        if (fs.existsSync(configDir)) {
          const configFiles = fs.readdirSync(configDir);
          for (const file of configFiles) {
            const filePath = path.join(configDir, file);
            if (fs.statSync(filePath).isFile()) {
              const content = fs.readFileSync(filePath, 'utf8');
              backupData.config[file] = content;
              backupData.stats.files++;
              backupData.stats.size += content.length;
            }
          }
        }
        
        // Write backup file
        const backupJson = path.join(exportDir, `staticrebel-backup-${timestamp}.json`);
        fs.writeFileSync(backupJson, JSON.stringify(backupData, null, 2));
        
        stopSpinner('Export completed!');
        
        return (
          `${styles.heading('╔═══ Data Export Complete ═══╗')}\n` +
          `${styles.export('Backup created:')}\n` +
          `  ${styles.info('Location:')} ${backupJson}\n` +
          `  ${styles.info('Files backed up:')} ${backupData.stats.files}\n` +
          `  ${styles.info('Total size:')} ${(backupData.stats.size / 1024).toFixed(1)} KB\n` +
          `  ${styles.info('Timestamp:')} ${backupData.timestamp}\n` +
          `\n${styles.success('✅ Your data is safely backed up!')}\n` +
          `${styles.dim('Backup includes: memory files, config, and metadata')}`
        );
        
      } catch (error) {
        failSpinner('Export failed');
        return styles.error(`Export failed: ${error.message}`);
      }
    },
  },
};

// Export command handler
async function handleExportCommand(args) {
  const command = args[0];
  const options = {};
  
  // Parse command line arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--format' || arg === '-f') {
      options.format = args[i + 1];
      i++; // Skip next arg
    } else if (arg === '--scope' || arg === '-s') {
      if (!options.scopes) options.scopes = [];
      options.scopes.push(args[i + 1]);
      i++; // Skip next arg
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = args[i + 1];
      i++; // Skip next arg
    } else if (arg === '--start-date') {
      options.startDate = args[i + 1];
      i++; // Skip next arg
    } else if (arg === '--end-date') {
      options.endDate = args[i + 1];
      i++; // Skip next arg
    } else if (arg === '--skills') {
      if (!options.skills) options.skills = [];
      options.skills.push(args[i + 1]);
      i++; // Skip next arg
    } else if (arg === '--csv') {
      options.format = EXPORT_FORMATS.CSV;
    } else if (arg === '--json') {
      options.format = EXPORT_FORMATS.JSON;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--help' || arg === '-h') {
      return showExportHelp(command);
    }
  }

  // Set defaults
  if (!options.format) options.format = EXPORT_FORMATS.JSON;
  if (!options.scopes) options.scopes = [EXPORT_SCOPES.ALL];

  switch (command) {
    case 'export':
      return await handleExport(options);
    case 'import':
      if (args.length < 2) {
        return 'Error: Import file path required. Usage: sr import <file>';
      }
      const importFile = args[1];
      return await handleImport(importFile, options);
    case 'delete-all-data':
      return await handleDeleteAllData(options);
    default:
      return 'Unknown export command';
  }
}

async function handleExport(options) {
  console.log('Starting data export...');
  
  const startTime = Date.now();
  let progressUpdate = '';
  
  options.onProgress = (current, total, operation) => {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressUpdate = `${operation} (${current}/${total}) ${percent}%`;
    process.stdout.write(`\r${progressUpdate}`);
  };

  try {
    const exportedData = await exportData(options);
    
    // Clear progress line
    process.stdout.write(`\r${' '.repeat(progressUpdate.length)}\r`);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const outputPath = options.outputPath || 
                      path.join(os.homedir(), '.static-rebel', 'exports', `export-${timestamp}`);
    
    // Ensure exports directory exists
    const exportsDir = path.dirname(outputPath);
    await fsPromises.mkdir(exportsDir, { recursive: true });
    
    if (options.format === EXPORT_FORMATS.CSV) {
      // Create multiple CSV files
      const createdFiles = [];
      for (const [dataType, csvContent] of Object.entries(exportedData)) {
        if (dataType !== 'metadata' && csvContent) {
          const csvFile = `${outputPath}-${dataType}.csv`;
          await fsPromises.writeFile(csvFile, csvContent);
          createdFiles.push(csvFile);
        }
      }
      
      const duration = Date.now() - startTime;
      const stats = await getExportStats();
      
      return (
        `Export completed in ${duration}ms!\n\n` +
        `Files created:\n${createdFiles.map(f => `  - ${f}`).join('\n')}\n\n` +
        `Export summary:\n` +
        `  Skills: ${stats.skills}\n` +
        `  Trackers: ${stats.trackers}\n` +
        `  Memory files: ${stats.memoryFiles}\n` +
        `  Checkpoint sessions: ${stats.checkpointSessions}\n` +
        `  Database tables: ${stats.databaseTables}`
      );
    } else {
      // Create single JSON file
      const jsonFile = `${outputPath}.json`;
      await fsPromises.writeFile(jsonFile, JSON.stringify(exportedData, null, 2));
      
      const duration = Date.now() - startTime;
      const stats = await getExportStats();
      const fileSize = (await fsPromises.stat(jsonFile)).size;
      
      return (
        `Export completed in ${duration}ms!\n\n` +
        `File created: ${jsonFile}\n` +
        `Size: ${(fileSize / 1024).toFixed(1)} KB\n\n` +
        `Export summary:\n` +
        `  Skills: ${stats.skills}\n` +
        `  Trackers: ${stats.trackers}\n` +
        `  Memory files: ${stats.memoryFiles}\n` +
        `  Checkpoint sessions: ${stats.checkpointSessions}\n` +
        `  Database tables: ${stats.databaseTables}\n\n` +
        `Scopes: ${options.scopes.join(', ')}`
      );
    }
  } catch (error) {
    process.stdout.write(`\r${' '.repeat(progressUpdate.length)}\r`);
    throw error;
  }
}

async function handleImport(importFile, options) {
  console.log(`Importing data from: ${importFile}`);
  
  try {
    // Check if file exists
    try {
      await fsPromises.access(importFile);
    } catch {
      return `Error: Import file not found: ${importFile}`;
    }
    
    // Read import file
    const content = await fsPromises.readFile(importFile, 'utf-8');
    const parsedData = JSON.parse(content);
    
    let progressUpdate = '';
    options.onProgress = (current, total, operation) => {
      progressUpdate = `${operation} (${current}/${total})`;
      process.stdout.write(`\r${progressUpdate}`);
    };
    
    const startTime = Date.now();
    const results = await importData(parsedData, options);
    
    // Clear progress line
    process.stdout.write(`\r${' '.repeat(progressUpdate.length)}\r`);
    
    const duration = Date.now() - startTime;
    
    let output = `Import completed in ${duration}ms!\n\n`;
    output += `Results:\n`;
    output += `  Imported: ${results.imported} data types\n`;
    output += `  Skipped: ${results.skipped} data types\n`;
    
    if (results.errors.length > 0) {
      output += `\nErrors:\n`;
      for (const error of results.errors) {
        output += `  - ${error.dataType}: ${error.error}\n`;
      }
    }
    
    if (options.dryRun) {
      output += `\n(Dry run - no data was actually imported)`;
    }
    
    return output;
  } catch (error) {
    if (error.name === 'SyntaxError') {
      return `Error: Invalid JSON in import file: ${error.message}`;
    }
    throw error;
  }
}

async function handleDeleteAllData(options) {
  if (!options.force) {
    return (
      'WARNING: This will permanently delete ALL StaticRebel data!\n\n' +
      'This includes:\n' +
      '  - All skills and tracker data\n' +
      '  - Memory files and conversations\n' +
      '  - Configuration and preferences\n' +
      '  - Checkpoints and backups\n' +
      '  - Database and vector memory\n\n' +
      'This action cannot be undone!\n\n' +
      'To proceed, add --force flag: sr delete-all-data --force'
    );
  }
  
  console.log('GDPR Data Deletion - Removing all user data...');
  
  let progressUpdate = '';
  options.onProgress = (current, total, operation) => {
    progressUpdate = `${operation} (${current}/${total})`;
    process.stdout.write(`\r${progressUpdate}`);
  };
  
  try {
    const startTime = Date.now();
    const deletionLog = await deleteAllUserData(options);
    
    // Clear progress line
    process.stdout.write(`\r${' '.repeat(progressUpdate.length)}\r`);
    
    const duration = Date.now() - startTime;
    
    let output = `Data deletion completed in ${duration}ms!\n\n`;
    output += `Deleted paths: ${deletionLog.deletedPaths.length}\n`;
    
    if (deletionLog.errors.length > 0) {
      output += `\nErrors during deletion:\n`;
      for (const error of deletionLog.errors) {
        output += `  - ${error.path}: ${error.error}\n`;
      }
    }
    
    if (options.dryRun) {
      output += `\n(Dry run - no data was actually deleted)`;
    } else {
      output += `\nAll user data has been permanently removed.`;
    }
    
    return output;
  } catch (error) {
    process.stdout.write(`\r${' '.repeat(progressUpdate.length)}\r`);
    throw error;
  }
}

function showExportHelp(command) {
  switch (command) {
    case 'export':
      return `
Usage: sr export [options]

Export your StaticRebel data in JSON or CSV format.

Options:
  --format, -f <format>    Export format: json (default) or csv
  --scope, -s <scope>      Data scope: all (default), skills, trackers, 
                          memories, database, checkpoints, config
  --output, -o <path>      Output file path (default: auto-generated)
  --start-date <date>      Filter data from date (YYYY-MM-DD)
  --end-date <date>        Filter data to date (YYYY-MM-DD)  
  --skills <skill>         Export specific skills (can be repeated)
  --csv                    Export as CSV (shortcut for --format csv)
  --json                   Export as JSON (shortcut for --format json)

Examples:
  sr export                               # Export everything as JSON
  sr export --csv                         # Export everything as CSV
  sr export --scope skills --scope trackers  # Export only skills and trackers
  sr export --skills water --skills pushups  # Export specific skills
  sr export --start-date 2024-01-01      # Export data from Jan 1st 2024
`;

    case 'import':
      return `
Usage: sr import <file> [options]

Import StaticRebel data from a JSON export file.

Options:
  --dry-run                Run without making changes

Examples:
  sr import export-2024-01-01.json       # Import data from export file
  sr import backup.json --dry-run        # Preview import without changes
`;

    case 'delete-all-data':
      return `
Usage: sr delete-all-data [options]

Permanently delete ALL StaticRebel user data (GDPR compliance).

Options:
  --force                  Required to actually delete data
  --dry-run                Show what would be deleted without deleting

Examples:
  sr delete-all-data                      # Show deletion preview
  sr delete-all-data --force              # Actually delete all data
  sr delete-all-data --force --dry-run    # Show what would be deleted
`;

    default:
      return `
StaticRebel Data Export & Portability Commands:

  export                   Export your data as JSON or CSV
  import <file>            Import data from StaticRebel export
  delete-all-data          GDPR-compliant data deletion

Use 'sr <command> --help' for detailed usage information.
`;
  }
}

// ============================================================================
// Analytics and Reporting Command Handler
// ============================================================================

async function handleReportCommand(args) {
  const command = args[0];
  const options = {};
  
  // Parse command line arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--format' || arg === '-f') {
      options.format = args[i + 1];
      i++; // Skip next arg
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = args[i + 1];
      i++; // Skip next arg
    } else if (arg === '--date' || arg === '-d') {
      options.date = args[i + 1];
      i++; // Skip next arg
    } else if (arg === '--save') {
      options.save = true;
    } else if (arg === '--auto') {
      options.auto = true;
    } else if (arg === '--schedule') {
      options.schedule = true;
    } else if (arg === '--help' || arg === '-h') {
      return showReportHelp(command);
    }
  }

  // Set defaults
  if (!options.format) options.format = 'terminal';
  
  const reportDate = options.date ? new Date(options.date) : new Date();

  try {
    let report;
    
    switch (command) {
      case 'daily':
        report = await generateDailyReport(reportDate);
        break;
      case 'weekly':
        report = await generateWeeklyReport(reportDate);
        break;
      case 'monthly':
        report = await generateMonthlyReport(reportDate);
        break;
      case 'yearly':
        report = await generateYearlyReport(reportDate);
        break;
      case 'schedule':
        await scheduleAutomaticReports();
        return '✅ Automatic reports have been scheduled successfully!\n\n' +
               'Daily reports: 9:00 PM every day\n' +
               'Weekly reports: 8:00 PM every Sunday\n' +
               'Monthly reports: 9:00 AM on the 1st of each month';
      case 'help':
      default:
        return showReportHelp();
    }

    if (!report) {
      return 'Error: Unable to generate report. No data available.';
    }

    // Format output
    let output = '';
    switch (options.format) {
      case 'markdown':
      case 'md':
        output = formatReportAsMarkdown(report);
        break;
      case 'html':
        output = formatReportAsHTML(report);
        break;
      case 'json':
        output = JSON.stringify(report, null, 2);
        break;
      case 'terminal':
      default:
        output = formatReportAsTerminal(report);
        break;
    }

    // Save to file if requested
    if (options.save || options.outputPath) {
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = options.outputPath || 
                      `${command}-report-${timestamp}.${options.format === 'terminal' ? 'txt' : options.format}`;
      
      const savedPath = await saveReportToFile(report, 
        options.format === 'terminal' ? 'markdown' : options.format, 
        filename);
      
      output += `\n📁 Report saved to: ${savedPath}\n`;
    }

    // Return the formatted output
    return output;

  } catch (error) {
    return `Error generating ${command} report: ${error.message}`;
  }
}

function showReportHelp(command) {
  if (command) {
    switch (command) {
      case 'daily':
        return `
Usage: sr report daily [options]

Generate a daily summary report with completion rates and activity breakdown.

Options:
  --date, -d <date>        Report date (YYYY-MM-DD, default: today)
  --format, -f <format>    Output format: terminal (default), markdown, html, json
  --output, -o <file>      Save to file (optional)
  --save                   Save to auto-generated filename

Examples:
  sr report daily                         # Today's report in terminal
  sr report daily --date 2024-01-15      # Specific date
  sr report daily --format markdown --save # Save as markdown
`;

      case 'weekly':
        return `
Usage: sr report weekly [options]

Generate a weekly analytics report with trends and correlations.

Options:
  --date, -d <date>        Report week containing this date (default: this week)
  --format, -f <format>    Output format: terminal (default), markdown, html, json
  --output, -o <file>      Save to file (optional)
  --save                   Save to auto-generated filename

Examples:
  sr report weekly                        # This week's report
  sr report weekly --date 2024-01-15     # Week containing Jan 15th
  sr report weekly --format html --save  # Save as HTML
`;

      case 'monthly':
        return `
Usage: sr report monthly [options]

Generate a monthly review with best/worst days analysis and detailed insights.

Options:
  --date, -d <date>        Report month containing this date (default: this month)
  --format, -f <format>    Output format: terminal (default), markdown, html, json
  --output, -o <file>      Save to file (optional)
  --save                   Save to auto-generated filename

Examples:
  sr report monthly                       # This month's report
  sr report monthly --date 2024-01-01    # January 2024 report
  sr report monthly --format json        # JSON format
`;

      case 'yearly':
        return `
Usage: sr report yearly [options]

Generate a comprehensive year in review with all metrics and achievements.

Options:
  --date, -d <date>        Report year containing this date (default: this year)
  --format, -f <format>    Output format: terminal (default), markdown, html, json
  --output, -o <file>      Save to file (optional)
  --save                   Save to auto-generated filename

Examples:
  sr report yearly                        # This year's report
  sr report yearly --date 2023-06-15     # Year 2023 report
  sr report yearly --format html --save  # Full HTML report
`;

      case 'schedule':
        return `
Usage: sr report schedule

Set up automatic report generation on a schedule.

This will configure:
  - Daily reports at 9:00 PM
  - Weekly reports on Sunday at 8:00 PM  
  - Monthly reports on the 1st at 9:00 AM

Examples:
  sr report schedule                      # Set up automatic reports
`;

      default:
        return showReportHelp();
    }
  }

  return `
StaticRebel Analytics & Reporting Commands:

📊 REPORT TYPES:
  daily                    Daily summary with completion rates
  weekly                   Weekly trends and correlations
  monthly                  Monthly review with best/worst days
  yearly                   Comprehensive year in review

🔧 REPORT MANAGEMENT:
  schedule                 Set up automatic report generation

📤 OUTPUT OPTIONS:
  --format terminal        Display in terminal (default)
  --format markdown        Markdown format
  --format html           HTML format  
  --format json           JSON format
  --save                  Save to auto-generated file
  --output <file>         Save to specific file

📅 DATE OPTIONS:
  --date <YYYY-MM-DD>     Generate report for specific date/period

Examples:
  sr report daily                         # Quick daily summary
  sr report weekly --save                 # Save weekly report
  sr report monthly --format html        # HTML monthly review
  sr report yearly --date 2023-01-01     # 2023 year in review
  sr report schedule                      # Set up automation

Use 'sr report <type> --help' for detailed information about each report type.
`;
}

// Tab completion function
function setupTabCompletion(rl) {
  const commands = Object.keys(CLI_COMMANDS);
  
  rl.on('complete', (line) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('/')) {
      // Command completion
      const partial = trimmed.substring(1);
      const matches = commands
        .filter(cmd => cmd.substring(1).startsWith(partial))
        .map(cmd => cmd.substring(1));
      
      return [matches, partial];
    }
    
    // For non-command input, we could add skill name completion
    return [[], line];
  });
}

// Graceful shutdown handler
function setupGracefulShutdown(rl) {
  let shutdownInProgress = false;
  
  const gracefulShutdown = async () => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    
    console.log(`\n\n${styles.warning('⚠️  Shutdown initiated...')}`);
    
    const spinner = startSpinner('Saving state and cleaning up...', 'yellow');
    
    try {
      // Stop any running spinner
      if (globalSpinner && globalSpinner !== spinner) {
        globalSpinner.stop();
      }
      
      // Save session end to memory
      writeDailyMemory('[SESSION END]');
      
      updateSpinner('Finalizing session data...', 'yellow');
      
      // Give time for any pending operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      stopSpinner('State saved successfully', '✓', 'green');
      
      console.log(`${styles.success('✅ Goodbye! Your session data has been saved.')}`);
      console.log(`${styles.dim('Thank you for using StaticRebel!')}\n`);
      
      rl.close();
      process.exit(0);
      
    } catch (error) {
      failSpinner('Cleanup error');
      console.log(`${styles.error('Error during shutdown:')} ${error.message}`);
      rl.close();
      process.exit(1);
    }
  };
  
  // Handle Ctrl+C
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
  
  // Handle readline close
  rl.on('close', gracefulShutdown);
  
  return gracefulShutdown;
}

async function chatLoop() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: '',
    completer: (line) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('/')) {
        // Command completion
        const partial = trimmed.substring(1);
        const commands = Object.keys(CLI_COMMANDS);
        const matches = commands
          .filter(cmd => cmd.substring(1).startsWith(partial))
          .map(cmd => cmd);
        
        return [matches, trimmed];
      }
      
      return [[], line];
    }
  });

  // Setup graceful shutdown
  const gracefulShutdown = setupGracefulShutdown(rl);

  await loadPersona();
  await initChatHandler();
  writeDailyMemory('[SESSION START]');

  console.log(`\n${styles.success('🤖 Charlize')} ${styles.dim('is ready!')}\n`);

  // Enhanced startup help with new features highlighted
  console.log(`${styles.heading('✨ Quick Commands:')}`);
  console.log(`  ${styles.command('/help')}     ${styles.dim('Show all commands')}`);
  console.log(`  ${styles.command('/stats')}    ${chalk.green('📊 Usage statistics (NEW!)')}`);
  console.log(`  ${styles.command('/export')}   ${chalk.green('💾 Backup data (NEW!)')}`);
  console.log(`  ${styles.command('/status')}   ${styles.dim('System status')}`);
  console.log(`  ${styles.command('/models')}   ${styles.dim('List models')}`);
  console.log(`  ${styles.command('/quit')}     ${styles.dim('Exit (Ctrl+C also works)')}`);
  console.log(`  ${styles.dim('─'.repeat(45))}`);
  console.log(`  ${chalk.yellow('💡 Tip:')} ${styles.dim('Tab completion works for commands!')}\n`);

  let inputBuffer = [];
  let isMultiLine = false;

  const askQuestion = () => {
    const promptText = isMultiLine
      ? `${styles.dim('...')} `
      : `${timestamp()} ${promptSymbol()} `;

    rl.setPrompt(promptText);
    rl.prompt(true);
  };

  rl.on('line', async (input) => {
    const trimmed = input.trim();

    // Empty line ends multi-line input
    if (isMultiLine && trimmed === '') {
      const message = inputBuffer.join('\n').trim();
      inputBuffer = [];
      isMultiLine = false;

      if (!message) {
        askQuestion();
        return;
      }

      messageCount++;
      console.log('');

      // Start spinner for LLM processing
      const spinner = startSpinner('🧠 Thinking...', 'cyan');

      const startTime = Date.now();
      const result = await handleChat(message, { source: 'enhanced-cli' });
      const duration = Date.now() - startTime;

      stopSpinner('Response generated', '✓', 'green');

      if (result.content) {
        console.log(`\n${styles.assistant(result.content)}\n`);
        console.log(
          styles.dim(`  [${result.type} · ${duration}ms${result.confidence ? ` · ${(result.confidence * 100).toFixed(0)}%` : ''}]`)
        );
      } else {
        console.log(`\n${styles.dim("I didn't understand that.")}\n`);
      }

      askQuestion();
      return;
    }

    // Check for commands
    if (!isMultiLine && trimmed.startsWith('/')) {
      const [cmd] = trimmed.split(' ');
      const command = CLI_COMMANDS[cmd];

      if (command) {
        messageCount++;
        console.log('');
        const response = await command.execute();
        console.log(`\n${response}\n`);
      } else if (['/quit', '/exit', '/q', 'bye', 'goodbye'].includes(cmd.toLowerCase())) {
        await gracefulShutdown();
        return;
      } else {
        console.log(`\n${styles.error(`Unknown command: ${cmd}`)}`);
        console.log(`${styles.dim("Type ")}${styles.command('/help')}${styles.dim(" for available commands.")}\n`);
      }

      askQuestion();
      return;
    }

    // Multi-line mode trigger: ends with \ or \
    if (!isMultiLine && (trimmed.endsWith('\\') || trimmed.endsWith('\\'))) {
      inputBuffer.push(trimmed.slice(0, -1));
      isMultiLine = true;
      askQuestion();
      return;
    }

    // Single line mode
    if (!isMultiLine) {
      if (!trimmed) {
        askQuestion();
        return;
      }

      messageCount++;
      console.log('');

      // Start spinner for LLM processing
      const spinner = startSpinner('🧠 Processing...', 'cyan');

      const startTime = Date.now();
      const result = await handleChat(trimmed, { source: 'enhanced-cli' });
      const duration = Date.now() - startTime;

      stopSpinner('Response ready', '✓', 'green');

      if (result.content) {
        console.log(`\n${styles.assistant(result.content)}\n`);
        console.log(
          styles.dim(`  [${result.type} · ${duration}ms${result.confidence ? ` · ${(result.confidence * 100).toFixed(0)}%` : ''}]`)
        );
      } else {
        console.log(`\n${styles.dim("I didn't understand that.")}\n`);
      }
    } else {
      inputBuffer.push(input);
    }

    askQuestion();
  });

  rl.on('close', () => {
    process.exit(0);
  });

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
    console.log(
      `[+] Ollama connected - ${health.models.length} models available`,
    );
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

  // Check for marketplace commands
  if (args.length > 0) {
    const marketplaceCommands = ['install', 'uninstall', 'remove', 'search', 'list', 'update', 'publish', 'init', 'validate', 'stats'];
    const exportCommands = ['export', 'import', 'delete-all-data'];
    
    if (marketplaceCommands.includes(args[0])) {
      try {
        const result = await marketplaceCommand(args);
        console.log(result);
        return;
      } catch (error) {
        console.error('Marketplace error:', error.message);
        return;
      }
    }
    
    // Check for social commands
    if (args[0] === 'social') {
      try {
        const result = await socialCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('Social error:', error.message);
        return;
      }
    }
    
    // Check for email commands
    if (args[0] === 'email') {
      try {
        const result = await emailCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('Email error:', error.message);
        return;
      }
    }
    
    // Check for Gmail commands
    if (args[0] === 'gmail') {
      try {
        const result = await gmailCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('Gmail error:', error.message);
        return;
      }
    }
    
    // Check for notion commands
    if (args[0] === 'notion') {
      try {
        const result = await notionCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('Notion error:', error.message);
        return;
      }
    }
    
    // Check for slack commands
    if (args[0] === 'slack') {
      try {
        const result = await slackCommand(args.slice(1));
        if (result) {
          console.log(result);
        }
        return;
      } catch (error) {
        console.error('Slack error:', error.message);
        return;
      }
    }
    
    // Check for webhook commands
    if (args[0] === 'webhook' || args[0] === 'webhooks') {
      try {
        const result = await webhookCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('Webhook error:', error.message);
        return;
      }
    }
    
    // Check for integration commands
    if (args[0] === 'integration' || args[0] === 'integrations') {
      try {
        const result = await integrationCommand(args.slice(1));
        if (result) {
          console.log(result);
        }
        return;
      } catch (error) {
        console.error('Integration error:', error.message);
        return;
      }
    }
    
    // Check for media commands
    if (args[0] === 'media') {
      try {
        const result = await mediaCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('Media error:', error.message);
        return;
      }
    }
    
    if (exportCommands.includes(args[0])) {
      try {
        const result = await handleExportCommand(args);
        console.log(result);
        return;
      } catch (error) {
        console.error('Export error:', error.message);
        return;
      }
    }
    
    // Check for personality command
    if (args[0] === 'personality') {
      try {
        const result = await handlePersonalityCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('Personality error:', error.message);
        return;
      }
    }
    
    // Check for API command
    if (args[0] === 'api') {
      try {
        const result = await apiCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('API error:', error.message);
        return;
      }
    }
    
    // Check for browser command
    if (args[0] === 'browser') {
      try {
        const result = await handleBrowserCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('Browser error:', error.message);
        return;
      }
    }
    
    // Check for speak command
    if (args[0] === 'speak') {
      try {
        await speakCommand(args.slice(1));
        return;
      } catch (error) {
        console.error('Speak error:', error.message);
        return;
      }
    }
    
    // Check for report command
    if (args[0] === 'report') {
      try {
        const result = await handleReportCommand(args.slice(1));
        console.log(result);
        return;
      } catch (error) {
        console.error('Report error:', error.message);
        return;
      }
    }
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

  // Initialize Action Registry and Chat Handler
  await initActionRegistry();
  await initChatHandler();

  // Start background services
  startScheduler(async (job) => {
    console.log(`\n[Scheduled Task] ${job.name}\n`);
    
    // Handle different job types
    if (job.data?.type === 'email') {
      const { executeEmailJob } = await import('./lib/integrations/email-cron.js');
      await executeEmailJob(job);
    } else {
      // Handle other job types here (existing functionality)
      console.log(`[Cron] Executed: ${job.name}`);
    }
  });

  startHeartbeatMonitor((results) => {
    const msg = results.map((r) => `${r.label}: ${r.result}`).join(', ');
    console.log(`\n[Heartbeat Check] ${msg}\n`);
    writeDailyMemory(`[HEARTBEAT] ${msg}`);
  });

  // Initialize Evolution System (Project Prometheus)
  try {
    const evolutionOrchestrator = await initEvolutionSystem();
    // Inject external dependencies
    evolutionOrchestrator.setDependencies({
      cronScheduler: { scheduleJob: addCronJob },
      workerManager: { createTask },
      vectorMemory: { addMemory, searchMemories },
      reflectionEngine: null, // Will be set if available
      feedbackManager: null,  // Will be set if available
      sessionMemory: null,    // Will be set if available
    });
    await evolutionOrchestrator.start();
    console.log('[Evolution] Self-evolution system activated');
  } catch (e) {
    console.warn('[Evolution] Failed to initialize:', e.message);
  }

  // Check Ollama connection early
  const ollamaOk = await checkOllamaAndNotify();
  if (!ollamaOk && !message) {
    // In interactive mode, still allow startup but warn user
    console.log('Starting in limited mode - some features may not work.\n');
  }

  if (message) {
    // Single message mode
    if (!ollamaOk) {
      console.log(
        '\nError: Ollama is not running. Please start Ollama first.\n',
      );
      process.exit(1);
    }
    // Use unified chat handler
    const result = await handleChat(message, { source: 'enhanced-cli' });
    if (result.content) {
      console.log(`\n${result.content}\n`);
    } else {
      console.log(`\nI didn't understand that. Could you rephrase?\n`);
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
