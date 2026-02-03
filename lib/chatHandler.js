/**
 * Unified Chat Handler
 * Single entry point for all chat interfaces (enhanced.js, assistant.js, dashboard/api/chat.js)
 * 
 * NOW USES INTELLIGENT ROUTER BY DEFAULT:
 * - LLM-first intent detection (no more rigid patterns)
 * - Smart skill discovery and creation
 * - Web search when needed
 * - Conversational fallback
 * 
 * Set USE_INTELLIGENT_ROUTER=false to use legacy pattern-based routing
 */

import {
  initActionRegistry,
  executeAction,
  getAllActions,
} from './actionRegistry.js';
import {
  getDefaultModel,
  chatCompletion,
  listAvailableModels,
  getModelForTask,
} from './modelRegistry.js';
import { sendMessage } from '../agents/main/agent.js';
import {
  writeDailyMemory,
  readDailyMemory,
  readLongTermMemory,
  getRecentDailyMemories,
  curateMemory,
  getMemoryStats,
} from './memoryManager.js';
import { addMemory, searchMemories, getMemoryStats as getVectorStats, rememberPreference } from './vectorMemory.js';
import { recordActivity } from './idleDetector.js';
import {
  processSchedulingRequest,
  detectSchedulingIntent
} from './scheduling/conversation-handler.js';
import {
  listCronJobs,
  addCronJob,
  describeCron,
  getNextRunTime,
  deleteCronJob,
  toggleCronJob,
  getSchedulerStatus,
} from './cronScheduler.js';
import {
  startHeartbeatMonitor,
  getHeartbeatStatus,
  configureHeartbeat,
} from './heartbeatManager.js';
import {
  listSubagents,
  createCodingSubagent,
  createAnalysisSubagent,
  sendToSubagent,
  getSubagentStats,
  terminateSubagent,
} from './subagentManager.js';
import { listSkills, getSkillsStats } from './skillsManager.js';
import {
  applyPersonalityFilter,
  getPersonalitySystemPrompt
} from './personality/index.js';
import {
  initPersonaManager,
  getAvailablePersonas,
  buildSystemPrompt as getPersonaSystemPrompt,
} from './personaManager.js';
import { handleDynamicIntegration } from './integrations/dynamic/index.js';
import { browserLLM } from './browser/cli.js';
import tts from './tts/index.js';

// New integrations
import { getUpcomingEvents, formatEventsForDisplay, getScheduleContext } from './calendar/index.js';
import SlackIntegration from './integrations/slack.js';
import { DiscordIntegration } from './integrations/discord.js';
import NotionIntegration from './integrations/notion.js';
import WhatsAppIntegration from './integrations/whatsapp.js';
import { WebhookManager } from './integrations/webhooks.js';
import { EmailService, getEmailService } from './integrations/email.js';
import { generateDailyReport, generateWeeklyReport, generateMonthlyReport } from './analytics/index.js';
import { analyzeMedia, isImage, isVideo } from './media/index.js';
import { exportData, importData, EXPORT_SCOPES } from './export/index.js';
import IntelligentCreator from './skills/intelligent-creator.js';
import { getAutoSkillCreator } from './skills/auto-skill-creator.js';
import {
  TrackerStore,
  QueryEngine,
  parseRecordFromText,
  parseTrackerFromNaturalLanguage,
} from '../tracker.js';
import {
  initWorkerSystem,
  createTask,
  getAllTasks,
  getWorkerStats,
  generateTodoMd,
  TaskStatus,
} from './workerManager.js';
import {
  initApiConnector,
  createConnector,
  getAllConnectors,
  getApiStats,
  storeApiKey,
} from './apiConnector.js';
import {
  routeTask,
  orchestrate,
  streamOllama,
  spawnClaudeCode,
} from '../orchestrator.js';
import { research, webResearch, streamResearch } from './webOracle.js';
import { getCRM } from './skills/crm.js';
import { IntentParser, getIntentParser, INTENT_TYPES } from './intent-parser.js';

// NEW: Simple Router (deterministic first, LLM second)
import { routeSimply } from './simpleRouter.js';

// OpenClaw-inspired input/output handling
import { redactSensitive, containsSensitive, createRedactingLogger } from './input/redact.js';
import { initCommands, findCommand, parseCommandArgs, listCommands, generateHelp } from './commands/index.js';
import { createReplyCoalescer, wrapWithCoalescing } from './output/coalescer.js';
import { parseDirectives, hasDirectives, stripDirectives, toTelegramMarkup, toDiscordComponents } from './output/directives.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // NEW: Use intelligent LLM-first router (set to false for legacy behavior)
  USE_INTELLIGENT_ROUTER: process.env.USE_INTELLIGENT_ROUTER !== 'false',
  
  // Confidence thresholds
  DEFAULT_CONFIDENCE_THRESHOLD: 0.6,
  TRACKING_CONFIDENCE_THRESHOLD: 0.4, // Lower threshold for tracking-related inputs

  // Intent detection (legacy mode only)
  USE_PATTERN_MATCHING: true,
  USE_LLM_CLASSIFICATION: true,
  USE_COMMAND_REGISTRY: true, // Use declarative command registry

  // Tracker matching
  TRACKER_MATCH_BY_KEYWORDS: true,
  TRACKER_MATCH_BY_TYPE: true,

  // Auto-skill creation
  AUTO_CREATE_SKILLS: process.env.AUTO_CREATE_SKILLS === 'true' || true, // NOW DEFAULT TRUE
  AUTO_SKILL_CONFIDENCE_THRESHOLD: 0.8, // Threshold for automatic creation without asking

  // Output processing
  USE_REPLY_COALESCING: false, // Enable reply coalescing (experimental)
  USE_DIRECTIVES: true, // Parse inline directives from LLM output
  REDACT_SENSITIVE: true, // Redact sensitive data in logs

  // Debug
  DEBUG: process.env.DEBUG_CHAT === 'true',
};

// ============================================================================
// Secure Logging Helper (redacts sensitive data)
// ============================================================================

/**
 * Log a message with sensitive data redaction
 * @param {string} level - Log level ('log', 'error', 'warn', 'debug')
 * @param {...any} args - Arguments to log
 */
function secureLog(level, ...args) {
  if (!CONFIG.REDACT_SENSITIVE) {
    console[level](...args);
    return;
  }

  const redactedArgs = args.map(arg => {
    if (typeof arg === 'string') {
      return redactSensitive(arg);
    }
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.parse(redactSensitive(JSON.stringify(arg)));
      } catch {
        return arg;
      }
    }
    return arg;
  });

  console[level](...redactedArgs);
}

/**
 * Debug log with redaction
 */
function debugLog(...args) {
  if (CONFIG.DEBUG) {
    secureLog('log', '[ChatHandler]', ...args);
  }
}

// ============================================================================
// Intent Patterns (revived from enhanced.js)
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
    /show (me )?my memories/i,
    /memory stats/i,
    /curate/i,
    /long.?term/i,
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
    /spoken reminder/i,
    /voice reminder/i,
    /speak.*reminder/i,
    /remind me.*aloud/i,
    /audio reminder/i,
  ],

  // Status
  status: [
    /status/i,
    /how are you/i,
    /what('s| is) your status/i,
    /system (info|status)/i,
  ],

  // Tasks
  tasks: [
    /list (my )?tasks/i,
    /show (my )?tasks/i,
    /what('s| is) scheduled/i,
    /my (cron|scheduled)/i,
  ],

  // Models
  models: [
    /list (available )?models/i,
    /what models/i,
    /available models/i,
    /show models/i,
  ],

  // Skills
  skills: [/list (my )?skills/i, /what skills/i, /my skills/i, /show skills/i],

  // CRM / Contacts
  crm: [
    /add (a )?contact/i,
    /new contact/i,
    /list (my )?contacts/i,
    /show contact/i,
    /search contacts/i,
    /find contact/i,
    /log (a )?interaction/i,
    /set (a )?reminder/i,
    /due reminders/i,
    /follow up with/i,
    /crm/i,
    /relationship management/i,
    /my network/i,
    /personal relationship/i,
  ],

  // Calendar integration
  calendar: [
    /check my calendar/i,
    /what('s| is) on my calendar/i,
    /calendar for (today|tomorrow|this week|next week)/i,
    /upcoming (events|meetings|appointments)/i,
    /schedule for/i,
    /calendar/i,
    /meetings today/i,
    /what('s| is) scheduled/i,
    /my agenda/i,
    /today('s| is) calendar/i,
  ],

  // Slack integration
  slack: [
    /send (a )?slack (message|msg) to/i,
    /slack (message|msg|post|send)/i,
    /post (this )?to slack/i,
    /send (this )?to slack/i,
    /slack (#|@)/i,
    /notify (me|them|everyone) on slack/i,
    /slack (nudge|reminder)/i,
  ],

  // Discord integration
  discord: [
    /send (a )?discord (message|msg) to/i,
    /discord (message|msg|post|send)/i,
    /post (this )?to discord/i,
    /send (this )?to discord/i,
    /discord (#|@)/i,
    /notify (me|them|everyone) on discord/i,
    /discord (nudge|reminder)/i,
  ],

  // Notion integration
  notion: [
    /add (this )?to notion/i,
    /create (a )?notion (page|entry|note)/i,
    /notion (page|entry|note)/i,
    /sync (this )?to notion/i,
    /save (this )?to notion/i,
    /notion database/i,
    /update notion/i,
  ],

  // WhatsApp integration
  whatsapp: [
    /send (a )?whatsapp (message|msg) to/i,
    /whatsapp (message|msg|send)/i,
    /send (this )?via whatsapp/i,
    /whatsapp to/i,
    /message (mom|dad|family|friend) on whatsapp/i,
  ],

  // Webhooks integration
  webhooks: [
    /trigger (a )?webhook/i,
    /send (a )?webhook to/i,
    /webhook (trigger|send)/i,
    /call (the )?webhook/i,
    /fire webhook/i,
    /webhook notification/i,
  ],

  // Email integration (separate from Gmail)
  email: [
    /send (an )?email/i,
    /compose (an )?email/i,
    /draft (an )?email/i,
    /email (someone|to)/i,
    /send email to/i,
  ],

  // Analytics and reports
  analytics: [
    /show (my )?analytics/i,
    /(generate|show|create) (a )?report/i,
    /daily summary/i,
    /weekly report/i,
    /monthly report/i,
    /my (stats|statistics|progress)/i,
    /performance report/i,
    /analytics dashboard/i,
    /usage stats/i,
    /data insights/i,
  ],

  // Media understanding
  media: [
    /(analyze|examine|describe) (this )?image/i,
    /(analyze|examine|describe) (this )?photo/i,
    /what('s| is) in (this )?image/i,
    /what('s| is) in (this )?photo/i,
    /(read|extract) text from (image|photo)/i,
    /ocr (this )?image/i,
    /image analysis/i,
    /photo analysis/i,
    /(analyze|examine|describe) (this )?video/i,
  ],

  // Export/Import
  export: [
    /export (my )?data/i,
    /download (my )?data/i,
    /backup (my )?data/i,
    /export as (json|csv)/i,
    /data export/i,
    /save (my )?data/i,
  ],

  import: [
    /import data/i,
    /load data/i,
    /import from/i,
    /restore data/i,
    /upload data/i,
  ],

  // Intelligent skill creator
  skill_creator: [
    /create (a )?skill (like|for)/i,
    /build (a )?skill/i,
    /make (a )?skill/i,
    /generate (a )?skill/i,
    /skill creator/i,
    /intelligent skill/i,
    /replace (.*) with (a )?skill/i,
    /turn (.*) into (a )?skill/i,
  ],
  
  // Integrations - broad patterns for any external service interaction
  integration: [
    /post (this )?to my (blog|website|site)/i,
    /send (this )?to (my )?/i,
    /update my/i,
    /publish (this )?to/i,
    /create.*(in|on|via).*(blog|site|platform|service|api|system)/i,
    /get.*from my/i,
    /fetch.*from/i,
    /retrieve.*from/i,
    /check my/i,
    /notify/i,
    /trigger/i,
    /webhook/i,
    /api call/i,
    /send notification/i,
    /alert/i,
    /ping/i,
  ],

  // Gmail - specific email patterns
  gmail: [
    /check my (gmail|email|inbox|mail)/i,
    /show (my )?(unread )?(gmail|emails?|messages?|inbox|mail)/i,
    /any new (emails?|messages?|mail)/i,
    /what('s| is) in my (gmail|inbox|email)/i,
    /read my (gmail|emails?|messages?|mail)/i,
    /send (an )?email to/i,
    /compose (an )?email/i,
    /email (someone|to)/i,
    /search my (gmail|emails?|mail) for/i,
    /find emails? (from|about|containing)/i,
    /gmail/i,
    /my email/i,
    /unread emails?/i,
    /latest emails?/i,
    /recent emails?/i,
    /email summary/i,
    /check for new (mail|emails?|messages?)/i,
    /summarize my (unread )?(emails?|mail|inbox)/i,
  ],

  // Help
  help: [/help/i, /what can you do/i, /what commands/i, /how (does this|to)/i],

  // Tracking / Logging - ENHANCED patterns
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
    // Tracker creation patterns
    /create (a )?tracker/i,
    /add (a )?tracker/i,
    /new tracker/i,
    /make (a )?tracker/i,
    /set up (a )?tracker/i,
    /i want to track/i,
    /start tracking/i,
    /set up tracking/i,
    /can you track/i,
  ],

  // Persona & Identity
  persona: [
    /change (your )?persona/i,
    /switch (your )?persona/i,
    /use (a )?different (persona|personality)/i,
    /be more (concise|detailed|friendly|technical)/i,
    /adjust (your )?(tone|style|personality)/i,
    /persona/i,
  ],

  // Vector Memory & Semantic Search
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

  // Background Workers & Projects
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

  // API Connectors
  api: [
    /connect (to |an )?api/i,
    /api (connector|integration)/i,
    /new (api|integration)/i,
    /store (api|api key)/i,
    /dynamic (api|connector)/i,
    /webhook/i,
  ],

  // Orchestrator
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

  // Research
  research: [
    /research/i,
    /look into/i,
    /investigate/i,
    /find out about/i,
    /tell me about/i,
    /what('s| is) the latest/i,
    /latest (news|updates)/i,
    /current (events|news)/i,
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
};

// ============================================================================
// Pattern-Based Intent Detection
// ============================================================================

/**
 * Detect intent using pattern matching
 * @param {string} text - User input
 * @returns {Object} Detected intent with type and confidence
 */
function detectIntentByPattern(text) {
  const lower = text.toLowerCase();

  // Check each intent pattern
  for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        return {
          type: intentType,
          confidence: 0.8, // Pattern matches have high confidence
          method: 'pattern',
          original: text,
        };
      }
    }
  }

  return {
    type: 'chat',
    confidence: 0.3,
    method: 'pattern',
    original: text,
  };
}

/**
 * Detect intent using the declarative command registry
 * @param {string} text - User input
 * @returns {Object|null} Detected intent or null
 */
function detectIntentByCommandRegistry(text) {
  if (!CONFIG.USE_COMMAND_REGISTRY) {
    return null;
  }

  const match = findCommand(text);
  
  if (!match || !match.command) {
    return null;
  }

  return {
    type: match.command.key,
    confidence: match.confidence,
    method: match.method === 'alias' || match.method === 'key' ? 'command' : 'registry_pattern',
    original: text,
    command: match.command,
    parsedArgs: match.argString ? parseCommandArgs(match.argString, match.command.args) : null,
  };
}

/**
 * Process LLM output for directives
 * @param {string} output - LLM output text
 * @returns {Object} Processed output with text and parsed directives
 */
function processOutputDirectives(output) {
  if (!CONFIG.USE_DIRECTIVES || !hasDirectives(output)) {
    return { text: output, directives: null };
  }

  const parsed = parseDirectives(output);
  
  return {
    text: parsed.text,
    directives: {
      quickReplies: parsed.quickReplies,
      confirm: parsed.confirm,
      buttons: parsed.buttons,
      typing: parsed.typing,
      react: parsed.react,
      media: parsed.media,
    },
    telegramMarkup: toTelegramMarkup(parsed),
    discordComponents: toDiscordComponents(parsed),
  };
}

/**
 * Check if input looks like a tracking request
 * Only returns true for CLEAR tracking requests with explicit intent
 * @param {string} text - User input
 * @returns {boolean}
 */
function looksLikeTracking(text) {
  const lower = text.toLowerCase();

  // Must have explicit tracking intent - not just casual statements
  // Only match when there's a clear action verb or explicit tracking language
  const trackingIndicators = [
    // Explicit action verbs for logging
    /^(?:log|track|record|add|note)\s+(?:my|the|a|an)\s+/i,
    /^(?:i\s+)?(?:just\s+)?(?:log|track|record|add)\s+/i,
    /^(?:i\s+)?(?:just\s+)?(?:ate|drank|had)\s+\d+\s*/i,  // "ate 500", "drank 300ml"
    /^(?:i\s+)?(?:just\s+)?(?:completed|finished|did)\s+\d+\s*/i,
    // Explicit query patterns
    /^(?:how\s+(?:many|much)\s+|what\s+(?:did|have)\s+i)\s+\w+\s*(?:today|today\?|)/i,
    // Self-referential tracking statements (must start with "I" and have explicit tracking word)
    /^i\s+(?:just\s+)?(?:ate|drank|had|completed|did)\s+\d+/i,
  ];

  // Check if input clearly starts with tracking intent
  if (trackingIndicators.some((pattern) => pattern.test(lower))) {
    return true;
  }

  // For number-based patterns, require them to be at the start or after explicit tracking words
  // This prevents "I had 400kcal meal" from matching, but allows "log 400kcal"
  const strictPatterns = [
    /\d+\s*(cal|calorie|kcal)\s*(meal|food|breakfast|lunch|dinner|snack)?/i,
    /\d+\s*(ml|l|oz)\s*water/i,
    /\d+\s*(km|miles?|meters?)\s*(run|walk|jog|ride|bike)/i,
    /\d+\s*(pushups|push-ups|pullups|squats?|reps?)\s*((?!meal|food).)*$/i,
  ];

  // Only match if the number comes after an explicit tracking word
  const afterTrackingWord = lower.match(/^(?:log|track|record|add|note)\s+\S/i) ||
                            lower.match(/^(?:i\s+)?(?:just\s+)?(?:ate|drank|had|completed|did)\s+\d/i);

  if (afterTrackingWord) {
    return true;
  }

  // Check for zone pattern (always explicit)
  if (/zone\s*\d/i.test(lower)) {
    return true;
  }

  return false;
}

// ============================================================================
// LLM-Based Intent Classification
// ============================================================================

/**
 * Classify intent using LLM
 * @param {string} input - User input
 * @param {Array} actions - Available actions
 * @returns {Object} Classification result
 */
async function classifyIntentWithLLM(input, actions) {
  try {
    const model = getDefaultModel();

    const actionDescriptions = actions
      .map(
        (a) =>
          `- ${a.name}: ${a.description} (examples: ${a.intentExamples?.slice(0, 3).join(', ') || 'none'})`,
      )
      .join('\n');

    const prompt = `Analyze this user input and classify the intent:

User input: "${input}"

Available actions:
${actionDescriptions}

DECISION GUIDE:
- Questions ("How big is the moon?", "What's the weather?", "What do you think about X?") → fallbackToChat: true
- Casual conversation ("Hi", "Thanks", "How are you?") → fallbackToChat: true
- Clear action requests ("log 500ml water", "schedule meeting at 3pm", "analyze this code") → fallbackToChat: false

IMPORTANT:
- "track" is for LOGGING DATA (calories, food, workouts, habits), NOT for code tracking
- "coding" is for WRITING CODE, NOT for tracking metrics
- "I had a meal" with numbers → likely track (confidence ~0.7-0.9)
- "I had a 400kcal meal" → definitely track (confidence 0.9+)
- "I ate 500 calories" → definitely track (confidence 0.9+)
- "How big is the moon?" → fallbackToChat: true (this is a question)

Respond with ONLY valid JSON:
{
  "intents": [
    {
      "actionName": "action_name",
      "confidence": 0.0-1.0,
      "reasoning": "brief explanation"
    }
  ],
  "fallbackToChat": false,
  "suggestedResponse": null
}

Rules:
- Only return intents with confidence >= 0.5
- Set fallbackToChat to true for questions and conversation
- Confidence should reflect how certain you are (0.0-1.0)
- Multiple intents can be returned if applicable`;

    const response = await chatCompletion(model, [
      {
        role: 'system',
        content:
          'You are an intent classifier. Output only valid JSON. Be precise about action matching.',
      },
      { role: 'user', content: prompt },
    ]);

    const content = response?.message || '';

    // Handle empty or invalid responses
    if (!content) {
      const modelName = model.includes('/') ? model.split('/')[1] : model;
      console.error('[ChatHandler] LLM returned empty response. Endpoint: /api/chat, Model:', modelName);
      return { intents: [], fallbackToChat: true };
    }

    // Robust JSON parsing with error recovery
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // Try to extract JSON from response if it has surrounding text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (secondError) {
          console.error('[ChatHandler] JSON parse failed after extraction:', secondError.message);
          console.debug('[ChatHandler] Raw content:', content.substring(0, 500));
          return {
            intents: [],
            fallbackToChat: true,
          };
        }
      } else {
        console.error('[ChatHandler] Failed to parse LLM response as JSON:', parseError.message);
        console.debug('[ChatHandler] Raw content:', content.substring(0, 500));
        return {
          intents: [],
          fallbackToChat: true,
        };
      }
    }

    return {
      intents: result.intents || [],
      fallbackToChat: result.fallbackToChat ?? true,
      suggestedResponse: result.suggestedResponse,
    };
  } catch (error) {
    const modelName = model.includes('/') ? model.split('/')[1] : model;
    console.error('[ChatHandler] LLM classification failed:', error.message, '- Model:', modelName, '- Endpoint: /api/chat');
    return {
      intents: [],
      fallbackToChat: true,
    };
  }
}

// ============================================================================
// Enhanced Intent Parsing (uses new intent-parser.js)
// ============================================================================

/**
 * Parse intent using the enhancedLM-based parser
 * @param L {string} input - User input
 * @returns {Object} Enhanced parsing result
 */
async function parseIntentEnhanced(input) {
  try {
    const parser = await getIntentParser();
    return await parser.parse(input);
  } catch (error) {
    console.error('[ChatHandler] Enhanced intent parsing failed:', error.message);
    return null;
  }
}

/**
 * Handle tracking intent using enhanced parser
 * @param {Object} parseResult - Result from enhanced parser
 * @param {Object} context - Execution context
 * @returns {Object|null} Action result or null
 */
async function handleTrackingIntentEnhanced(parseResult, context) {
  if (!parseResult.skill) {
    return null;
  }

  // If skill exists, execute the tracking action
  if (parseResult.skill.exists) {
    try {
      // Normalize value (handle object, string, or number formats)
      let valueObj = parseResult.value;
      let amount, unit;

      if (CONFIG.DEBUG) {
        console.log(`[ChatHandler] Value parsing - original:`, JSON.stringify(valueObj));
      }

      if (typeof valueObj === 'object' && valueObj !== null) {
        // Handle both full and abbreviated keys
        amount = valueObj?.amount ?? valueObj?.a ?? valueObj?.value ?? 1;
        unit = valueObj?.unit ?? valueObj?.u ?? valueObj?.type ?? 'count';
      } else if (typeof valueObj === 'string') {
        // Parse string like "2 glasses" or "500ml"
        const match = valueObj.match(/^([\d.]+)\s*(\w+)?$/);
        if (match) {
          amount = parseFloat(match[1]);
          unit = match[2] || 'count';
        } else {
          amount = 1;
          unit = 'count';
        }
      } else {
        amount = valueObj ?? 1;
        unit = 'count';
      }

      if (CONFIG.DEBUG) {
        console.log(`[ChatHandler] Value parsing - result: amount=${amount}, unit=${unit}`);
      }

      const store = new TrackerStore();
      const result = await store.addRecord(
        parseResult.skill.id,
        {
          value: amount,
          note: parseResult.rawInput
        }
      );

      if (result) {
        return {
          type: 'tracking',
          action: 'log_entry',
          skill: parseResult.skill.id,
          value: { amount, unit },
          content: `Logged ${amount} ${unit} for ${parseResult.skill.name}`,
          confidence: parseResult.confidence,
          debug: parseResult.debug
        };
      }
    } catch (error) {
      console.error('[ChatHandler] Enhanced tracking failed:', error.message);
    }
    return null;
  }

  // If skill doesn't exist but should be auto-created
  if (parseResult.autoCreateSkill && CONFIG.AUTO_CREATE_SKILLS) {
    try {
      const autoCreator = await getAutoSkillCreator();
      const result = await autoCreator.createSkillAndLog(
        parseResult.autoCreateSkill.suggestion,
        parseResult.rawInput
      );

      if (result.success) {
        return {
          type: 'tracking',
          action: 'auto_created_skill',
          skill: result.skill.id,
          value: parseResult.value,
          content: result.message,
          confidence: parseResult.autoCreateSkill.confidence,
          debug: parseResult.debug
        };
      }
    } catch (error) {
      console.error('[ChatHandler] Auto-skill creation failed:', error.message);
    }
  }

  // Skill doesn't exist and can't auto-create
  return {
    type: 'tracking',
    action: 'skill_not_found',
    skill: parseResult.skill.id,
    suggestedSkill: parseResult.autoCreateSkill?.suggestion,
    content: `I don't have a ${parseResult.skill.name} skill yet. Would you like me to create it?`,
    confidence: parseResult.confidence,
    debug: parseResult.debug
  };
}

/**
 * Handle question intent - delegate to chat/LLM
 * @param {Object} parseResult - Result from enhanced parser
 * @param {Object} context - Execution context
 * @returns {Object} Chat response
 */
async function handleQuestionIntent(parseResult, context) {
  const chatResponse = await sendMessage(parseResult.rawInput);

  return {
    type: 'question',
    content: applyPersonalityFilter(chatResponse?.content || "I'm not sure how to answer that."),
    confidence: parseResult.confidence,
    debug: parseResult.debug
  };
}

/**
 * Handle command intent
 * @param {Object} parseResult - Result from enhanced parser
 * @param {Object} context - Execution context
 * @returns {Object|null} Command result or null
 */
async function handleCommandIntent(parseResult, context) {
  const { action } = parseResult;

  switch (action) {
    case 'list_skills':
      const skills = await listSkills();
      return {
        type: 'command',
        action: 'list_skills',
        content: skills || "No skills configured yet.",
        confidence: parseResult.confidence,
        debug: parseResult.debug
      };

    case 'show_stats':
      const stats = await getSkillsStats();
      return {
        type: 'command',
        action: 'show_stats',
        content: stats || "No stats available.",
        confidence: parseResult.confidence,
        debug: parseResult.debug
      };

    default:
      // For unknown commands, fallback to chat
      return null;
  }
}

// ============================================================================
// Smart Tracker Lookup
// ============================================================================

/**
 * Find tracker by semantic matching (keywords, names, types)
 * @param {string} trackerType - Type of tracker
 * @param {string} description - Description to match against
 * @param {TrackerStore} store - Tracker store instance
 * @returns {Object|null} Matching tracker or null
 */
function findTrackerSmart(trackerType, description, store) {
  const trackers = store.listTrackers();

  if (trackers.length === 0) {
    return null;
  }

  // 1. Try exact type match first
  if (CONFIG.TRACKER_MATCH_BY_TYPE) {
    const typeMatch = trackers.find(
      (t) =>
        t.type === trackerType ||
        (trackerType === 'nutrition' &&
          (t.type === 'food' || t.type === 'nutrition')),
    );
    if (typeMatch) {
      if (CONFIG.DEBUG) {
        console.log(`[ChatHandler] Found tracker by type: ${typeMatch.name}`);
      }
      return typeMatch;
    }
  }

  // 2. Try keyword matching for custom trackers
  if (CONFIG.TRACKER_MATCH_BY_KEYWORDS && description) {
    const descLower = description.toLowerCase();
    const keywords = descLower
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .filter((w) => !['the', 'and', 'for', 'with', 'from'].includes(w));

    // Look for keyword matches in tracker names
    const keywordMatch = trackers.find((t) => {
      const trackerText =
        `${t.name} ${t.displayName} ${t.description || ''}`.toLowerCase();
      return keywords.some(
        (kw) =>
          trackerText.includes(kw) ||
          kw.includes(t.name.toLowerCase()) ||
          t.name.toLowerCase().includes(kw),
      );
    });

    if (keywordMatch) {
      if (CONFIG.DEBUG) {
        console.log(
          `[ChatHandler] Found tracker by keywords: ${keywordMatch.name}`,
        );
      }
      return keywordMatch;
    }
  }

  // 3. For tracking inputs, return the first tracker if only one exists
  if (trackers.length === 1 && looksLikeTracking(description)) {
    if (CONFIG.DEBUG) {
      console.log(
        `[ChatHandler] Using only available tracker: ${trackers[0].name}`,
      );
    }
    return trackers[0];
  }

  return null;
}

/**
 * Find or create tracker with smart matching
 * @param {string} trackerType - Type of tracker
 * @param {string} description - Description
 * @param {TrackerStore} store - Tracker store
 * @returns {Object|null} Tracker object or null
 */
async function findOrCreateTrackerSmart(trackerType, description, store) {
  // Try to find existing tracker
  const existing = findTrackerSmart(trackerType, description, store);
  if (existing) {
    return existing;
  }

  // Check if we're in dashboard context (suppress verbose output)
  const isDashboard = process.env.NEXT_PHASE ||
    typeof window !== 'undefined' ||
    process.env.RUNNING_IN_NEXTJS === 'true';

  if (!isDashboard) {
    console.log(`  \x1b[36m[Auto-creating ${trackerType} tracker...]\x1b[0m`);
  }

  try {
    const trackerConfig = await parseTrackerFromNaturalLanguage(
      description || `${trackerType} tracker`,
    );

    if (!trackerConfig) {
      return null;
    }

    // Check if name already exists
    const trackers = store.listTrackers();
    const nameExists = trackers.find((t) => t.name === trackerConfig.name);
    if (nameExists) {
      // Generate unique name
      trackerConfig.name = `${trackerConfig.name}_${Date.now()}`;
    }

    const result = store.createTracker(trackerConfig);
    if (result.success) {
      return result.tracker;
    }
  } catch (error) {
    console.error('[ChatHandler] Failed to create tracker:', error.message);
  }

  return null;
}

// ============================================================================
// Core Chat Handler
// ============================================================================

/**
 * Main chat handler - unified entry point
 * @param {string} input - User input
 * @param {Object} options - Handler options
 * @returns {Promise<Object>} Response object
 */
export async function handleChat(input, options = {}) {
  const startTime = Date.now();

  const {
    source = 'unknown',
    context = {},
    skipPatternMatching = false,
    skipLLMClassification = false,
    confidenceThreshold = null,
    useIntelligentRouter = CONFIG.USE_INTELLIGENT_ROUTER,
  } = options;

  // Record user activity for idle detection (evolution system)
  recordActivity();

  if (CONFIG.DEBUG) {
    console.log(`[ChatHandler] Processing from ${source}: "${input}" (intelligent=${useIntelligentRouter})`);
  }

  // ============================================================================
  // NEW: Simple Router Mode (deterministic first, LLM second)
  // ============================================================================
  if (useIntelligentRouter) {
    try {
      const result = await routeSimply(input, {
        context,
        source,
      });
      
      // Normalize response format for backwards compatibility
      return {
        success: result.success !== false,
        response: result.content,
        content: result.content,
        type: result.type,
        action: result.type,
        duration: result.duration,
        source: source,
        // Include any extra data
        ...result,
      };
    } catch (error) {
      console.error('[ChatHandler] Simple router failed, falling back to legacy:', error.message);
      // Fall through to legacy processing
    }
  }

  // ============================================================================
  // Legacy Mode: Pattern Matching + LLM Classification
  // ============================================================================

  // Initialize action registry if needed
  await initActionRegistry();

  // Step 0: Check for natural language scheduling first
  const schedulingIntent = detectSchedulingIntent(input);
  if (schedulingIntent.detected && schedulingIntent.confidence >= 0.7) {
    if (CONFIG.DEBUG) {
      console.log(`[ChatHandler] Processing scheduling request with confidence ${schedulingIntent.confidence}`);
    }
    
    const schedulingResult = processSchedulingRequest(input, context);
    
    if (schedulingResult.success) {
      // Record successful scheduling interaction
      writeDailyMemory(`Scheduled task via natural language: ${input} -> ${schedulingResult.reply}`);
      
      const duration = Date.now() - startTime;
      return {
        success: true,
        response: schedulingResult.reply,
        type: 'scheduling_success',
        jobId: schedulingResult.jobId,
        action: 'schedule',
        duration,
        source
      };
    } else if (schedulingResult.reply) {
      // Return helpful error or clarification
      const duration = Date.now() - startTime;
      return {
        success: false,
        response: schedulingResult.reply,
        type: 'scheduling_help',
        error: schedulingResult.type,
        duration,
        source
      };
    }
    // If scheduling failed without a reply, fall through to normal processing
  }

  // Step 0.5: Check for dynamic integration requests
  const detectedIntegrationIntent = detectIntentByPattern(input);
  if (detectedIntegrationIntent && detectedIntegrationIntent.type === 'integration' && detectedIntegrationIntent.confidence >= 0.6) {
    try {
      if (CONFIG.DEBUG) {
        console.log(`[ChatHandler] Detected integration request with confidence ${detectedIntegrationIntent.confidence}`);
      }
      
      const integrationResult = await handleDynamicIntegration(input, context);
      
      if (integrationResult.success) {
        // Record successful integration interaction
        writeDailyMemory(`Used integration via natural language: ${input} -> ${integrationResult.integration}.${integrationResult.action}`);
        
        const duration = Date.now() - startTime;
        return {
          success: true,
          content: integrationResult.message,
          response: integrationResult.message,
          type: 'integration_success',
          integration: integrationResult.integration,
          action: integrationResult.action,
          duration,
          source
        };
      } else {
        // Integration failed but might have a helpful message
        if (integrationResult.message && !integrationResult.message.includes('couldn\'t find a suitable integration')) {
          const duration = Date.now() - startTime;
          return {
            success: false,
            content: integrationResult.message,
            response: integrationResult.message,
            type: 'integration_error',
            error: integrationResult.error,
            duration,
            source
          };
        }
        // If no suitable integration found, fall through to normal processing
      }
    } catch (error) {
      if (CONFIG.DEBUG) {
        console.log(`[ChatHandler] Integration error: ${error.message}`);
      }
      // Fall through to normal processing on integration error
    }
  }

  // Step 0.6: Check for Gmail requests
  const gmailIntent = detectIntentByPattern(input);
  if (gmailIntent && gmailIntent.type === 'gmail' && gmailIntent.confidence >= 0.6) {
    try {
      if (CONFIG.DEBUG) {
        console.log(`[ChatHandler] Detected Gmail request with confidence ${gmailIntent.confidence}`);
      }
      
      const gmailResult = await handleGmailIntent(input, context);
      
      if (gmailResult.success) {
        // Record successful Gmail interaction
        writeDailyMemory(`Used Gmail via natural language: ${input} -> ${gmailResult.action}`);
        
        const duration = Date.now() - startTime;
        return {
          success: true,
          content: gmailResult.content,
          response: gmailResult.content,
          type: 'gmail_success',
          action: gmailResult.action,
          duration,
          source
        };
      } else {
        // Gmail failed but might have a helpful message
        const duration = Date.now() - startTime;
        return {
          success: false,
          content: gmailResult.content || 'Gmail operation failed',
          response: gmailResult.content || 'Gmail operation failed',
          type: 'gmail_error',
          error: gmailResult.error,
          duration,
          source
        };
      }
    } catch (error) {
      if (CONFIG.DEBUG) {
        console.log(`[ChatHandler] Gmail error: ${error.message}`);
      }
      // Return error message
      const duration = Date.now() - startTime;
      return {
        success: false,
        content: `Gmail error: ${error.message}`,
        response: `Gmail error: ${error.message}`,
        type: 'gmail_error',
        error: error.message,
        duration,
        source
      };
    }
  }

  // Step 0.7: Check for browser automation requests
  try {
    const browserResult = await browserLLM.processCommand(input, context);
    if (browserResult && !browserResult.error) {
      if (CONFIG.DEBUG) {
        console.log(`[ChatHandler] Browser automation executed: ${browserResult.type}`);
      }
      
      // Record successful browser interaction
      writeDailyMemory(`Used browser automation: ${input} -> ${browserResult.type}`);
      
      const duration = Date.now() - startTime;
      let responseMessage = browserResult.message;
      
      // Add details based on browser result type
      if (browserResult.type === 'screenshot') {
        responseMessage += `\n📁 Saved to: ${browserResult.filepath}\n📊 Size: ${browserResult.size}`;
      } else if (browserResult.type === 'scrape') {
        responseMessage += `\n📊 Text length: ${browserResult.textLength} characters`;
        if (browserResult.text) {
          responseMessage += `\n\n📄 Content preview:\n${browserResult.text.substring(0, 500)}${browserResult.text.length > 500 ? '...' : ''}`;
        }
      } else if (browserResult.type === 'pricing') {
        responseMessage += `\n💰 Found ${browserResult.pricingElements.length} pricing elements`;
        if (browserResult.pricingElements.length > 0) {
          responseMessage += '\n\nPricing information found:';
          browserResult.pricingElements.slice(0, 5).forEach(element => {
            responseMessage += `\n• ${element.text}`;
          });
        }
      }
      
      return {
        success: true,
        content: responseMessage,
        response: responseMessage,
        type: 'browser_automation',
        browserResult,
        duration,
        source
      };
    } else if (browserResult && browserResult.error) {
      // Browser automation failed
      const duration = Date.now() - startTime;
      return {
        success: false,
        content: browserResult.message,
        response: browserResult.message,
        type: 'browser_error',
        error: browserResult.message,
        duration,
        source
      };
    }
    // If browserResult is null, it wasn't a browser command, so fall through
  } catch (error) {
    if (CONFIG.DEBUG) {
      console.log(`[ChatHandler] Browser automation error: ${error.message}`);
    }
    // Fall through to normal processing on browser error
  }

  // Step 1: Intent detection via command registry (fast path, preferred)
  let detectedIntent = null;
  
  // Try command registry first (declarative commands)
  if (CONFIG.USE_COMMAND_REGISTRY && !skipPatternMatching) {
    const registryIntent = detectIntentByCommandRegistry(input);
    if (registryIntent && registryIntent.confidence >= 0.6) {
      detectedIntent = registryIntent;
      debugLog(`Command registry match: ${registryIntent.type} (${registryIntent.confidence.toFixed(2)})`);
    }
  }
  
  // Fall back to legacy pattern matching if no registry match
  if (!detectedIntent && CONFIG.USE_PATTERN_MATCHING && !skipPatternMatching) {
    detectedIntent = detectIntentByPattern(input);

    // If high-confidence pattern match for tracking, lower the threshold
    if (detectedIntent.type === 'track' && looksLikeTracking(input)) {
      detectedIntent.confidence = 0.9;
    }
  }

  // Step 1.5: Enhanced intent parsing (NEW - uses intent-parser.js)
  // This provides richer intent detection with skill checking and auto-creation
  let enhancedResult = null;
  if (!skipLLMClassification) {
    try {
      const parseResult = await parseIntentEnhanced(input);

      if (parseResult && parseResult.confidence >= 0.7) {
        enhancedResult = parseResult;

        if (CONFIG.DEBUG) {
          console.log(`[ChatHandler] Enhanced intent: ${parseResult.intentType} (${parseResult.confidence})`);
        }

        // Handle based on intent type
        if (parseResult.intentType === INTENT_TYPES.TRACKING) {
          const trackingResult = await handleTrackingIntentEnhanced(parseResult, context);
          if (trackingResult) {
            const duration = Date.now() - startTime;
            return {
              ...trackingResult,
              duration,
              source,
            };
          }
        } else if (parseResult.intentType === INTENT_TYPES.QUESTION) {
          const questionResult = await handleQuestionIntent(parseResult, context);
          const duration = Date.now() - startTime;
          return {
            ...questionResult,
            duration,
            source,
          };
        } else if (parseResult.intentType === INTENT_TYPES.COMMAND) {
          const commandResult = await handleCommandIntent(parseResult, context);
          if (commandResult) {
            const duration = Date.now() - startTime;
            return {
              ...commandResult,
              duration,
              source,
            };
          }
        }
        // For GENERAL_CHAT, fall through to normal processing
      }
    } catch (error) {
      if (CONFIG.DEBUG) {
        console.log(`[ChatHandler] Enhanced parsing error: ${error.message}`);
      }
      // Fall through to normal processing
    }
  }

  // Step 2: LLM-based classification
  let classification = null;
  if (CONFIG.USE_LLM_CLASSIFICATION && !skipLLMClassification) {
    const actions = getAllActions();
    classification = await classifyIntentWithLLM(input, actions);
  }

  // Step 3: Determine the best action to take
  const result = await determineAndExecuteAction(
    input,
    detectedIntent,
    classification,
    context,
    confidenceThreshold,
  );

  const duration = Date.now() - startTime;

  if (CONFIG.DEBUG) {
    console.log(`[ChatHandler] Completed in ${duration}ms`);
  }

  return {
    ...result,
    duration,
    source,
  };
}

/**
 * Determine and execute the appropriate action
 * Simplified LLM-first flow: trust classification → execute intent → fallback to chat
 * @private
 */
async function determineAndExecuteAction(
  input,
  detectedIntent,
  classification,
  context,
  overrideThreshold,
) {
  // Build execution context
  const actionContext = buildActionContext(context);

  // If LLM says fallback to chat, do it
  if (classification?.fallbackToChat) {
    return await fallbackToChat(input, actionContext);
  }

  // Use the classification threshold or default
  const effectiveThreshold = overrideThreshold ?? CONFIG.DEFAULT_CONFIDENCE_THRESHOLD;

  // Get intents from classification, sorted by confidence
  const intents = classification?.intents?.length > 0
    ? [...classification.intents].sort((a, b) => b.confidence - a.confidence)
    : [];

  // Try to execute intents in order of confidence
  for (const intent of intents) {
    if (intent.confidence >= effectiveThreshold) {
      // Try to execute this intent
      const result = await executeIntentWithHandler(intent, input, actionContext);

      if (result?.success && result?.content) {
        return {
          type: 'action',
          action: intent.actionName,
          content: applyPersonalityFilter(result.content),
          confidence: intent.confidence,
        };
      }
    }
  }

  // No matching intent or all failed - use LLM's suggested response or chat
  const fallbackContent = classification?.suggestedResponse || null;
  return await fallbackToChat(input, actionContext, fallbackContent);
}

/**
 * Execute an intent using its handler
 * @private
 */
async function executeIntentWithHandler(intent, input, actionContext) {
  const actions = getAllActions();
  const action = actions.find((a) => a.name === intent.actionName);

  if (!action) {
    // Check built-in intents
    const builtInResult = await handleBuiltInIntent(intent.actionName, input, actionContext);
    if (builtInResult) {
      return { success: true, content: builtInResult };
    }
    return { success: false };
  }

  try {
    const result = await executeAction(intent.actionName, input, actionContext);
    if (result.success) {
      return { success: true, content: result.result };
    }
  } catch (error) {
    if (CONFIG.DEBUG) {
      console.log(`[ChatHandler] Action ${intent.actionName} error:`, error.message);
    }
  }

  return { success: false };
}

/**
 * Fall back to regular chat
 * @private
 */
async function fallbackToChat(input, actionContext, suggestedResponse = null) {
  // Try LLM's suggested response first if available
  if (suggestedResponse?.trim()) {
    return {
      type: 'chat',
      content: applyPersonalityFilter(suggestedResponse),
      confidence: 1.0,
    };
  }

  // Otherwise do actual chat
  let chatContent = '';
  try {
    const chatResponse = await sendMessage(input);
    chatContent = chatResponse?.content || '';
  } catch (e) {
    console.error('[ChatHandler] Chat fallback failed:', e.message);
  }

  if (!chatContent.trim()) {
    return {
      type: 'chat',
      content: "Sorry, I can't connect to Ollama. Make sure it's running with 'ollama serve'.",
      confidence: 1.0,
    };
  }

  return {
    type: 'chat',
    content: applyPersonalityFilter(chatContent),
    confidence: 1.0,
  };
}

/**
 * Handle built-in intents that don't have registered actions
 * @private
 */
async function handleBuiltInIntent(intentType, input, context) {
  switch (intentType) {
    case 'status':
      return await handleStatusIntent(context);

    case 'tasks':
      return await handleTasksIntent(context);

    case 'models':
      return await handleModelsIntent(context);

    case 'skills':
      return await handleSkillsIntent(context);

    case 'crm':
      return await handleCRMIntent(input, context);

    case 'social':
      return await handleSocialIntent(input, context);

    case 'gmail':
      return await handleGmailIntent(input, context);

    case 'tts':
      return await handleTTSIntent(input, context);

    // New integrations
    case 'calendar':
      return await handleCalendarIntent(input, context);

    case 'slack':
      return await handleSlackIntent(input, context);

    case 'discord':
      return await handleDiscordIntent(input, context);

    case 'notion':
      return await handleNotionIntent(input, context);

    case 'whatsapp':
      return await handleWhatsAppIntent(input, context);

    case 'webhooks':
      return await handleWebhooksIntent(input, context);

    case 'email':
      return await handleEmailIntent(input, context);

    case 'analytics':
      return await handleAnalyticsIntent(input, context);

    case 'media':
      return await handleMediaIntent(input, context);

    case 'export':
      return await handleExportIntent(input, context);

    case 'import':
      return await handleImportIntent(input, context);

    case 'skill_creator':
      return await handleSkillCreatorIntent(input, context);

    default:
      return null;
  }
}

/**
 * Handle tracking intent with smart skill lookup and auto-creation
 * @private
 */
async function handleTrackingIntent(input, store, context) {
  const chatId = context?.chatId || context?.userId || 'default';

  try {
    // Use the enhanced auto-skill creator for intelligent tracking
    const autoCreator = await getAutoSkillCreator();
    const result = await autoCreator.handleTrackingWithAutoCreation(input, chatId);

    // Handle different result types
    if (result.success) {
      if (result.autoCreated) {
        // Successfully auto-created skill and logged entry
        return result.message;
      } else if (result.useExistingSkill) {
        // Found existing skill - use the existing skill system
        return await handleExistingSkillTracking(input, result.skill, result.parsed);
      }
    } else if (result.needsConfirmation) {
      // Need user confirmation for skill creation
      return result.message;
    } else if (!result.isTrackingAttempt) {
      // Not a tracking attempt - fall back to legacy tracker system
      return await handleLegacyTracking(input, store, context);
    }

    // Fallback to legacy system if auto-creation fails
    return await handleLegacyTracking(input, store, context);

  } catch (error) {
    console.error('[ChatHandler] Auto-skill creation failed:', error);
    // Fallback to legacy tracker system
    return await handleLegacyTracking(input, store, context);
  }
}

/**
 * Handle tracking with existing skills
 * @private
 */
async function handleExistingSkillTracking(input, skill, parsed) {
  try {
    const { getSkillManager } = await import('./skills/skill-manager.js');
    const { parseInput } = await import('./skills/nlp-parser.js');
    
    const skillManager = await getSkillManager();
    
    // Parse the input for logging
    const logData = parseInput(input);
    
    if (logData.intent === 'log' && logData.entry) {
      // Log to the existing skill
      const logResult = await skillManager.addEntry(skill.id, {
        value: logData.entry.value || 1,
        note: logData.entry.note,
        source: 'natural-language'
      });
      
      return `✅ Logged to **${skill.name}**: ${logData.entry.value || 1}${skill.unit ? ' ' + skill.unit : ''}`;
    }
    
    // Handle queries about existing skill
    if (logData.intent === 'query') {
      const todayStats = await skillManager.getTodayStats(skill.id);
      
      if (todayStats.count === 0) {
        return `No entries logged today for **${skill.name}**.`;
      }
      
      return `**${skill.name}** today: ${todayStats.sum}${skill.unit ? ' ' + skill.unit : ''} (${todayStats.count} entries)`;
    }
    
    return `Found existing skill: **${skill.name}**. Try: "${skill.triggers?.[0] || skill.name.toLowerCase()} [amount]"`;
    
  } catch (error) {
    console.error('[ChatHandler] Error with existing skill tracking:', error);
    return `Error logging to ${skill.name}: ${error.message}`;
  }
}

/**
 * Legacy tracker handling for backward compatibility
 * @private
 */
async function handleLegacyTracking(input, store, context) {
  const trackers = store?.listTrackers ? store.listTrackers() : [];

  // Analyze if this is a log, query, or create intent
  const lower = input.toLowerCase();

  // Query patterns
  if (
    /how many|what did|what have|show me|display|stats/i.test(lower) &&
    trackers.length > 0
  ) {
    // Find appropriate tracker
    const tracker = findTrackerSmart('custom', input, store) || trackers[0];
    return await handleTrackQuery(input, tracker, store);
  }

  // Create patterns
  if (/create (a )?tracker|add (a )?tracker|new tracker|set up/i.test(lower)) {
    const trackerConfig = await parseTrackerFromNaturalLanguage(input);
    if (trackerConfig) {
      const result = store.createTracker(trackerConfig);
      if (result.success) {
        return `Created new tracker **@${trackerConfig.name}** (${trackerConfig.displayName})\n\nType: ${trackerConfig.type}\nMetrics: ${trackerConfig.config?.metrics?.join(', ') || 'custom'}\n\nLog entries with: "@${trackerConfig.name} [your entry]"`;
      }
    }
    return "I couldn't create a tracker from that description. Try: 'create a tracker for pushups'";
  }

  // Log patterns - try to find or create tracker
  const tracker = await findOrCreateTrackerSmart('custom', input, store);

  if (!tracker) {
    if (trackers.length === 0) {
      return 'No trackers configured. Create one with: "create a tracker for [activity]"';
    }
    return "I couldn't determine which tracker to use. Try specifying: '@trackername [your entry]'";
  }

  // Log to tracker
  const result = await logToTracker(tracker, input, store);

  if (result.success) {
    return result.message;
  }

  return `Failed to log to ${tracker.displayName}. Try rephrasing with more details.`;
}

/**
 * Handle track query
 * @private
 */
async function handleTrackQuery(input, tracker, store) {
  const query = new QueryEngine(store);
  const stats = query.getStats(tracker.id);

  if (stats.count === 0) {
    return `No entries logged yet for ${tracker.displayName}.`;
  }

  // Get today's records
  const data = store.getRecordsByDateRange(tracker.id, null, null);
  const today = new Date().toISOString().split('T')[0];
  const todayRecords = data.records.filter((r) => r.timestamp?.startsWith(today));

  if (todayRecords.length === 0) {
    return `No entries logged today for ${tracker.displayName}.`;
  }

  // Filter valid records
  const validRecords = todayRecords.filter((r) => {
    const mainField =
      r.data?.name || r.data?.meal || r.data?.exercise || r.data?.entry;
    return mainField && !mainField.toLowerCase().includes('no ');
  });

  if (validRecords.length === 0) {
    return `No valid entries logged today for ${tracker.displayName}.`;
  }

  // Format based on tracker type
  if (tracker.type === 'nutrition' || tracker.type === 'food') {
    const totalCals = validRecords.reduce(
      (sum, r) => sum + (r.data?.calories || 0),
      0,
    );
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
  }

  // Generic display
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

/**
 * Log data to tracker
 * @private
 */
async function logToTracker(tracker, input, store) {
  try {
    // Parse the user's input into structured record data
    let parsed = await parseRecordFromText(input, tracker.type);

    // Fallback to heuristic parsing if LLM fails
    if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
      if (tracker.type === 'nutrition' || tracker.type === 'food') {
        parsed = { success: true, data: parseFoodHeuristic(input) };
      } else if (tracker.type === 'workout') {
        parsed = { success: true, data: parseWorkoutHeuristic(input) };
      }
    }

    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return { success: false, message: null };
    }

    const result = store.addRecord(tracker.id, {
      data: parsed.data,
      source: 'natural-language',
    });

    if (result) {
      const dataEntries = Object.entries(parsed.data)
        .filter(([k, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      return {
        success: true,
        message: `Logged to **${tracker.displayName}**:\n${dataEntries}`,
      };
    }

    return { success: false, message: null };
  } catch (e) {
    console.error(`[ChatHandler] Error logging to ${tracker.name}:`, e.message);
    return { success: false, message: null };
  }
}

/**
 * Parse food data heuristically
 * @private
 */
function parseFoodHeuristic(text) {
  const lower = text.toLowerCase();
  const foodMatch = lower.match(
    /(?:had|ate|drank|consumed|ate|eat|drink)\s+(?:a |an |some )?(.+)/,
  );
  const foodName = foodMatch ? foodMatch[1].trim() : '';

  const calorieEstimates = {
    coffee: 5,
    cappuccino: 120,
    latte: 190,
    espresso: 5,
    tea: 2,
    'green tea': 2,
    pizza: 285,
    burger: 350,
    salad: 150,
    sandwich: 350,
    water: 0,
  };

  let calories = null;
  const calMatch = lower.match(/(\d+)\s*(calories|cals)/i);
  if (calMatch) {
    calories = parseInt(calMatch[1]);
  } else {
    for (const [food, cal] of Object.entries(calorieEstimates)) {
      if (lower.includes(food)) {
        calories = cal;
        break;
      }
    }
    if (!calories && foodName.length > 2) {
      calories = 200; // Generic estimate
    }
  }

  const data = {};
  if (foodName)
    data.meal = foodName.charAt(0).toUpperCase() + foodName.slice(1);
  if (calories) data.calories = calories;

  return data;
}

/**
 * Parse workout data heuristically
 * @private
 */
function parseWorkoutHeuristic(text) {
  const lower = text.toLowerCase();
  const data = {};

  // Handle "I did X pushups" style inputs
  const pushupMatch = lower.match(/(\d+)\s*(pushups|push-ups|push ups)/i);
  if (pushupMatch) {
    data.exercise = 'pushups';
    data.count = parseInt(pushupMatch[1]);
    return data;
  }

  // Handle "X reps" style inputs
  const repsMatch = lower.match(/(\d+)\s*(reps|repetitions)/i);
  if (repsMatch) {
    data.exercise = 'reps';
    data.count = parseInt(repsMatch[1]);
    return data;
  }

  // Handle "X km run" style inputs
  const runMatch = lower.match(/(\d+(?:\.\d+)?)\s*(km|miles?|meters?)\s*(run|running|jog)/i);
  if (runMatch) {
    data.exercise = 'running';
    data.distance = `${runMatch[1]} ${runMatch[2]}`;
    return data;
  }

  // Original workout patterns
  const exerciseMatch = lower.match(
    /(?:did|completed|finished|started)\s+(?:a\s+)?(?:workout of\s+)?(.+)/,
  );
  if (exerciseMatch) {
    data.exercise = exerciseMatch[1].trim();
  } else if (!data.count) {
    data.exercise = 'Workout';
  }

  const durationMatch = lower.match(/(\d+)\s*(minutes?|mins?|hours?|hrs?)/i);
  if (durationMatch) {
    const val = parseInt(durationMatch[1]);
    if (durationMatch[2].startsWith('min')) data.duration = val;
    else if (durationMatch[2].startsWith('hour')) data.duration = val * 60;
  }

  return data;
}

/**
 * Handle status intent
 * @private
 */
async function handleStatusIntent(context) {
  const { getMemoryStats } = await import('./memoryManager.js');
  const { getSchedulerStatus } = await import('./cronScheduler.js');
  const { getHeartbeatStatus } = await import('./heartbeatManager.js');
  const { getSubagentStats } = await import('./subagentManager.js');

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

/**
 * Handle tasks intent
 * @private
 */
async function handleTasksIntent(context) {
  const { listCronJobs, describeCron, getNextRunTime } =
    await import('./cronScheduler.js');

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

/**
 * Handle models intent
 * @private
 */
async function handleModelsIntent(context) {
  const { listAvailableModels, getDefaultModel } =
    await import('./modelRegistry.js');

  const models = await listAvailableModels();
  const defaultModel = getDefaultModel();

  if (models.length === 0) {
    return 'No models available. Make sure Ollama is running.';
  }

  return (
    `**Available Models** (${models.length}):\n\n` +
    models
      .map((m) => {
        const isDefault = m.name === defaultModel ? ' (default)' : '';
        return `- ${m.name}${isDefault}`;
      })
      .join('\n')
  );
}

/**
 * Handle skills intent
 * @private
 */
async function handleSkillsIntent(context) {
  const { listSkills } = await import('./skillsManager.js');

  const skills = listSkills();

  if (skills.length === 0) {
    return 'No skills configured yet.';
  }

  return (
    `**Your Skills** (${skills.length}):\n\n` +
    skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
  );
}

/**
 * Handle CRM / Contacts intent
 * @private
 */
async function handleCRMIntent(input, context) {
  try {
    const { getCRM } = await import('./skills/crm.js');
    const crm = await getCRM();

    const lower = input.toLowerCase();

    // List contacts
    if (/list (my )?contacts/i.test(lower)) {
      const contacts = crm.getAllContacts();
      if (contacts.length === 0) {
        return 'You don\'t have any contacts yet. Say "add contact: John, email: john@example.com" to add your first contact!';
      }
      const list = contacts.map(c => {
        const info = [c.name];
        if (c.company) info.push(`@ ${c.company}`);
        if (c.tags?.length) info.push(`[${c.tags.join(', ')}]`);
        return `- ${info.join(' ')}`;
      }).join('\n');
      return `**Your Contacts** (${contacts.length}):\n\n${list}`;
    }

    // Add contact
    if (/add (a )?contact/i.test(lower)) {
      const nameMatch = input.match(/add (?:a )?contact[:\s]+([A-Za-z\s]+)/i) ||
                        input.match(/contact[:\s]+([A-Za-z\s]+)/i);
      const emailMatch = input.match(/email[:\s]+([^\s,]+)/i);
      const phoneMatch = input.match(/phone[:\s]+([^\s,]+)/i);
      const companyMatch = input.match(/company[:\s]+([^,\n]+)/i);

      if (nameMatch) {
        const name = nameMatch[1].trim();
        const contact = await crm.addContact({
          name,
          email: emailMatch?.[1],
          phone: phoneMatch?.[1],
          company: companyMatch?.[1],
          source: 'manual'
        });
        return `Added contact: **${contact.name}**${contact.email ? `\nEmail: ${contact.email}` : ''}${contact.company ? `\nCompany: ${contact.company}` : ''}`;
      }
      return 'To add a contact, say something like: "Add contact: John Smith, email: john@example.com, company: Acme"';
    }

    // Search contacts
    if (/search (my )?contacts/i.test(lower) || /find contact/i.test(lower)) {
      const queryMatch = input.match(/(?:search|find) (?:my )?contacts? (?:for )?(.+)/i) ||
                         input.match(/find (.+) in my contacts/i);
      if (queryMatch) {
        const query = queryMatch[1].trim();
        const results = crm.searchContacts(query);
        if (results.length === 0) {
          return `No contacts found matching "${query}".`;
        }
        const list = results.map(c => `- ${c.name}${c.company ? ` @ ${c.company}` : ''}`).join('\n');
        return `Found ${results.length} contact(s) matching "${query}":\n\n${list}`;
      }
      return 'What would you like to search for? Try: "search contacts for John"';
    }

    // Log interaction
    if (/log (a )?interaction/i.test(lower)) {
      const contactMatch = input.match(/with\s+([A-Za-z]+)/i);
      const typeMatch = input.match(/\b(meeting|call|email|message|linkedin|event)\b/i);
      const descMatch = input.match(/(?:about|for|re:|saying)[:\s]+(.+)/i);

      if (contactMatch) {
        const name = contactMatch[1];
        const contacts = crm.searchContacts(name);
        if (contacts.length === 0) {
          return `Contact "${name}" not found.`;
        }
        const type = typeMatch?.[1] || 'meeting';
        const description = descMatch?.[1] || 'General interaction';

        const interaction = await crm.logInteraction(contacts[0].id, {
          type,
          description,
          notes: input
        });
        return `Logged ${type} with **${contacts[0].name}**: "${description}"`;
      }
      return 'To log an interaction, say: "Log interaction with John about the project proposal"';
    }

    // Set reminder
    if (/set (a )?reminder/i.test(lower)) {
      const contactMatch = input.match(/with\s+([A-Za-z]+)/i) || input.match(/to\s+([A-Za-z]+)/i);
      const dateMatch = input.match(/(?:on |at |next |tomorrow |)(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|next week|tomorrow|today)/i);
      const noteMatch = input.match(/(?:about|to |for )[:\s]+(.+)/i);

      if (contactMatch && dateMatch && noteMatch) {
        const name = contactMatch[1];
        const contacts = crm.searchContacts(name);
        if (contacts.length === 0) {
          return `Contact "${name}" not found.`;
        }
        let dateStr = dateMatch[1];
        if (dateStr.toLowerCase() === 'tomorrow') {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          dateStr = d.toISOString().split('T')[0];
        } else if (dateStr.toLowerCase() === 'next week') {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          dateStr = d.toISOString().split('T')[0];
        }

        const reminder = await crm.setReminder(contacts[0].id, {
          date: dateStr,
          note: noteMatch[1]
        });
        return `Set reminder for **${contacts[0].name}** on ${dateStr}: "${reminder.note}"`;
      }
      return 'To set a reminder, say: "Set reminder for John next week about the proposal"';
    }

    // Due reminders
    if (/due reminders/i.test(lower) || /follow[ -]?ups?/i.test(lower)) {
      const overdue = crm.getOverdueReminders();
      const dueToday = crm.getDueReminders();

      if (overdue.length === 0 && dueToday.length === 0) {
        return 'No pending reminders. You\'re all caught up!';
      }

      let response = '';
      if (overdue.length > 0) {
        response += `Overdue (${overdue.length}):\n`;
        response += overdue.map(r => `- ${r.contactName}: ${r.note} (due ${r.date})`).join('\n') + '\n\n';
      }
      if (dueToday.length > 0) {
        response += `Due Today (${dueToday.length}):\n`;
        response += dueToday.map(r => `- ${r.contactName}: ${r.note}`).join('\n');
      }
      return response;
    }

    // CRM stats
    if (/crm stats/i.test(lower) || /contact stats/i.test(lower)) {
      const stats = crm.getStats();
      return (
        `**CRM Statistics:**\n\n` +
        `Contacts: ${stats.totalContacts}\n` +
        `Interactions: ${stats.totalInteractions} (${stats.interactionsThisMonth} this month)\n` +
        `Pending Reminders: ${stats.pendingReminders}\n` +
        `Overdue: ${stats.overdueReminders}`
      );
    }

    return (
      'Personal Relationship Manager\n\n' +
      'Available commands:\n' +
      '- "List my contacts" - Show all contacts\n' +
      '- "Add contact: John, email: john@example.com" - Add new contact\n' +
      '- "Search contacts for John" - Find contacts\n' +
      '- "Log interaction with John about the project" - Record interaction\n' +
      '- "Set reminder for John next week about proposal" - Set follow-up\n' +
      '- "Show due reminders" - View pending follow-ups\n' +
      '- "CRM stats" - View contact statistics'
    );

  } catch (error) {
    console.error('CRM intent handler error:', error);
    return `CRM error: ${error.message}. Make sure the CRM system is initialized.`;
  }
}

/**
 * Handle Gmail intent with natural language processing
 * @private
 */
async function handleGmailIntent(input, context) {
  try {
    // Import Gmail service
    const { getGmailService, checkEmail, sendEmail, searchEmails } = await import('./integrations/gmail.js');
    
    const gmailService = await getGmailService();
    
    if (!gmailService.isConfigured()) {
      return {
        success: false,
        content: "Gmail is not configured. Please run `sr gmail setup` to set up Gmail integration first.",
        error: 'not_configured'
      };
    }

    const lower = input.toLowerCase();

    // Check unread emails / inbox
    if (
      /check my (gmail|email|inbox|mail)/i.test(input) ||
      /show (my )?(unread )?(gmail|emails?|messages?|inbox|mail)/i.test(input) ||
      /any new (emails?|messages?|mail)/i.test(input) ||
      /what('s| is) in my (gmail|inbox|email)/i.test(input) ||
      /unread emails?/i.test(input) ||
      /latest emails?/i.test(input) ||
      /recent emails?/i.test(input) ||
      /summarize my (unread )?(emails?|mail|inbox)/i.test(input)
    ) {
      const summary = await checkEmail();
      return {
        success: true,
        content: summary,
        action: 'check_email'
      };
    }

    // Send email
    if (
      /send (an )?email to/i.test(input) ||
      /compose (an )?email/i.test(input) ||
      /email (someone|to)/i.test(input)
    ) {
      // Extract email address and message from natural language
      const emailMatch = input.match(/to\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      const aboutMatch = input.match(/about\s+(.+)/i) || input.match(/saying\s+(.+)/i) || input.match(/that\s+(.+)/i);
      
      if (emailMatch && aboutMatch) {
        const to = emailMatch[1];
        const subject = aboutMatch[1].length > 50 ? aboutMatch[1].substring(0, 47) + '...' : aboutMatch[1];
        const body = aboutMatch[1];
        
        try {
          const result = await sendEmail(to, subject, body);
          return {
            success: true,
            content: `✅ Email sent successfully to ${to}!\nSubject: ${subject}\nMessage ID: ${result.id}`,
            action: 'send_email'
          };
        } catch (error) {
          return {
            success: false,
            content: `Failed to send email: ${error.message}`,
            error: error.message
          };
        }
      } else {
        return {
          success: false,
          content: "To send an email via natural language, say something like: \"Send an email to john@example.com about the meeting tomorrow\"",
          error: 'missing_details'
        };
      }
    }

    // Search emails
    if (
      /search my (gmail|emails?|mail) for/i.test(input) ||
      /find emails? (from|about|containing)/i.test(input)
    ) {
      // Extract search query
      const searchMatch = input.match(/for\s+(.+)/i) || 
                          input.match(/from\s+(.+)/i) || 
                          input.match(/about\s+(.+)/i) || 
                          input.match(/containing\s+(.+)/i);
      
      if (searchMatch) {
        const query = searchMatch[1];
        try {
          const results = await searchEmails(query, 5);
          
          if (results.length === 0) {
            return {
              success: true,
              content: `No emails found matching "${query}".`,
              action: 'search_email'
            };
          }

          let content = `🔍 Found ${results.length} email${results.length > 1 ? 's' : ''} matching "${query}":\n\n`;
          for (const email of results) {
            const subject = email.subject.length > 50 ? email.subject.substring(0, 47) + '...' : email.subject;
            content += `• **${subject}**\n  From: ${email.from}\n  ${email.snippet}\n\n`;
          }
          
          return {
            success: true,
            content: content.trim(),
            action: 'search_email'
          };
        } catch (error) {
          return {
            success: false,
            content: `Search failed: ${error.message}`,
            error: error.message
          };
        }
      } else {
        return {
          success: false,
          content: "Please specify what to search for, like: \"Search my emails for invoice\" or \"Find emails from John\"",
          error: 'missing_query'
        };
      }
    }

    // Default Gmail help
    return {
      success: true,
      content: "📧 **Gmail Commands Available:**\n\n" +
               "• \"Check my email\" or \"Show unread emails\"\n" +
               "• \"Send an email to user@example.com about the meeting\"\n" +
               "• \"Search my emails for invoice\"\n" +
               "• \"Find emails from GitHub\"\n\n" +
               "For more options, use: `sr gmail help`",
      action: 'help'
    };

  } catch (error) {
    console.error('Gmail intent handler error:', error);
    return {
      success: false,
      content: `Gmail error: ${error.message}`,
      error: error.message
    };
  }
}

async function handleSocialIntent(input, context) {
  const { socialCommand } = await import('./social/cli.js');
  const lower = input.toLowerCase();

  try {
    // Quick water challenge
    if (/water challenge/i.test(input) || (/challenge.*water/i.test(input))) {
      const args = input.match(/(\d+)\s*day/i);
      const duration = args ? parseInt(args[1]) : 7;
      
      const result = await socialCommand(['challenge', 'water', 'You', duration.toString()]);
      return result;
    }

    // Share streak
    if (/share.*streak/i.test(input)) {
      const anonymous = /anonymous/i.test(input);
      const result = await socialCommand(['share', 'streak', 'water', ...(anonymous ? ['--anonymous'] : [])]);
      return result;
    }

    // Show leaderboard or status
    if (/leaderboard|who.*winning|social.*status/i.test(input)) {
      const result = await socialCommand(['status']);
      return result;
    }

    // Join challenge
    if (/join.*challenge/i.test(input)) {
      return "To join a challenge, use: `sr social challenge join <shareCode>`\n" +
             "Ask your friend for their share code!";
    }

    // Default social help
    return "🤝 Social Features Available!\n\n" +
           "• Create water challenge: \"Create a water challenge\"\n" +
           "• Share your progress: \"Share my water streak\"\n" +
           "• Check status: \"Show my social status\"\n" +
           "• Join challenges: \"Join a challenge\"\n\n" +
           "For detailed commands, use: `sr social help`";

  } catch (error) {
    return `Sorry, there was an issue with social features: ${error.message}`;
  }
}

/**
 * Handle TTS intent - Convert text to speech
 * @private
 */
async function handleTTSIntent(input, context) {
  try {
    const lower = input.toLowerCase();
    
    // Determine what text to speak
    let textToSpeak = '';
    let voice = 'aria'; // default voice
    let shouldPlay = true;
    
    if (/read (this|that|it) (aloud|out loud)/i.test(input)) {
      // Extract text after "read this/that/it aloud"
      const match = input.match(/read (?:this|that|it) (?:aloud|out loud)[:\-\s]*(.+)/i);
      textToSpeak = match ? match[1].trim() : 'I need some text to read aloud.';
    } else if (/speak (this|that|it)/i.test(input)) {
      // Extract text after "speak this/that/it"
      const match = input.match(/speak (?:this|that|it)[:\-\s]*(.+)/i);
      textToSpeak = match ? match[1].trim() : 'I need some text to speak.';
    } else if (/(read|speak|say) the (daily )?summary/i.test(input)) {
      // Handle daily summary request
      try {
        const { readDailyMemory } = await import('./memoryManager.js');
        const today = new Date().toISOString().split('T')[0];
        const dailyMemory = readDailyMemory(today);
        
        if (dailyMemory && dailyMemory.length > 0) {
          textToSpeak = `Here's your daily summary: ${dailyMemory.join('. ')}`;
          voice = 'guy'; // Use professional voice for summaries
        } else {
          textToSpeak = 'No daily summary available yet. Start logging your activities and I\'ll create one for you!';
        }
      } catch (error) {
        textToSpeak = 'Sorry, I couldn\'t retrieve your daily summary at the moment.';
      }
    } else if (/spoken reminder|voice reminder|audio reminder/i.test(input)) {
      // Handle spoken reminder setup
      try {
        const { nudges } = await import('./tts/index.js');
        
        // Extract reminder details
        const reminderMatch = input.match(/(?:spoken|voice|audio) reminder[:\s]+(.+)/i);
        if (reminderMatch) {
          const reminderText = reminderMatch[1].trim();
          
          // Check if it's a quick reminder type
          if (/water|hydrat/i.test(reminderText)) {
            await nudges.createQuickReminder('water', '30 minutes');
            return '💧 Created spoken water reminder! I\'ll remind you to drink water every 30 minutes.';
          } else if (/break|rest/i.test(reminderText)) {
            await nudges.createQuickReminder('break', '60 minutes');
            return '☕ Created spoken break reminder! I\'ll remind you to take breaks every hour.';
          } else if (/stretch|posture/i.test(reminderText)) {
            await nudges.createQuickReminder('stretch', '45 minutes');
            return '🧘 Created spoken stretch reminder! I\'ll remind you to stretch every 45 minutes.';
          } else if (/eyes/i.test(reminderText)) {
            await nudges.createQuickReminder('eyes', '20 minutes');
            return '👀 Created spoken eye break reminder! I\'ll remind you to rest your eyes every 20 minutes.';
          } else {
            // Custom reminder
            await nudges.speakReminder(reminderText);
            return `🔊 Spoken reminder created and delivered: "${reminderText}"`;
          }
        } else {
          return 'What would you like me to remind you about? Try "spoken reminder: drink water" or "voice reminder: take a break".';
        }
      } catch (error) {
        return `Sorry, I couldn't set up the spoken reminder: ${error.message}`;
      }
    } else if (/speak\s+(.+)/i.test(input)) {
      // Extract text after "speak"
      const match = input.match(/speak\s+(.+)/i);
      textToSpeak = match ? match[1].trim() : 'I need some text to speak.';
    } else {
      textToSpeak = 'What would you like me to read aloud? Try "speak Hello world" or "read this aloud: your text here".';
      shouldPlay = false; // Don't actually speak the help message
    }
    
    if (!textToSpeak || textToSpeak.trim().length === 0) {
      return 'I need some text to convert to speech. Try saying "speak Hello world" or "read this aloud: your text".';
    }
    
    // Remove quotes if present
    textToSpeak = textToSpeak.replace(/^["'](.*)["']$/, '$1');
    
    if (shouldPlay) {
      // Generate and play the speech
      console.log('🗣️ Converting to speech...');
      const result = await tts.readAloud(textToSpeak, { voice: voice });
      
      return `🔊 Speech generated successfully! Played "${textToSpeak.length > 50 ? textToSpeak.substring(0, 50) + '...' : textToSpeak}" using ${result.provider} with ${result.voice} voice.`;
    } else {
      return textToSpeak;
    }
    
  } catch (error) {
    console.error('TTS Error:', error.message);
    return `Sorry, I encountered an error with text-to-speech: ${error.message}. Make sure your TTS providers are configured properly.`;
  }
}

/**
 * Handle calendar intent
 * @private
 */
async function handleCalendarIntent(input, context) {
  try {
    const lower = input.toLowerCase();
    
    // Determine time range
    let daysAhead = 7; // default week view
    if (/today/i.test(input)) {
      daysAhead = 0;
    } else if (/tomorrow/i.test(input)) {
      daysAhead = 1;
    } else if (/this week/i.test(input)) {
      daysAhead = 7;
    } else if (/next week/i.test(input)) {
      daysAhead = 14;
    }

    const events = await getUpcomingEvents(daysAhead);
    
    if (events.length === 0) {
      return `📅 No events found for the${daysAhead === 0 ? ' rest of today' : daysAhead === 1 ? ' tomorrow' : ` next ${daysAhead} days`}.`;
    }

    const formattedEvents = formatEventsForDisplay(events);
    return `📅 **Your Calendar**\n\n${formattedEvents}`;
  } catch (error) {
    console.error('Calendar intent error:', error);
    return `Calendar error: ${error.message}. Make sure your calendar is configured with \`sr calendar setup\`.`;
  }
}

/**
 * Handle Slack intent
 * @private
 */
async function handleSlackIntent(input, context) {
  try {
    const slack = new SlackIntegration();
    
    if (!await slack.init()) {
      return '❌ Slack not configured. Run `sr slack setup` to configure Slack integration first.';
    }

    const lower = input.toLowerCase();
    
    // Extract channel and message
    const channelMatch = input.match(/#(\w+)/);
    const channel = channelMatch ? channelMatch[1] : null;
    
    // Extract message content
    let message = '';
    if (/send.*to slack/i.test(input)) {
      const msgMatch = input.match(/send\s+(.+?)\s+to slack/i);
      message = msgMatch ? msgMatch[1] : '';
    } else if (/slack.*message/i.test(input)) {
      const msgMatch = input.match(/slack.*message[:\s]+(.+)/i);
      message = msgMatch ? msgMatch[1] : '';
    } else if (/post.*to slack/i.test(input)) {
      const msgMatch = input.match(/post\s+(.+?)\s+to slack/i);
      message = msgMatch ? msgMatch[1] : '';
    }

    if (!message) {
      return '📱 **Slack Integration Available**\n\nUsage examples:\n• "Send hello world to Slack"\n• "Post this to Slack #general"\n• "Slack message: Hello team!"\n\nFor setup: `sr slack setup`';
    }

    const success = await slack.sendNudge(message, channel);
    await slack.disconnect();
    
    if (success) {
      return `✅ Message sent to Slack${channel ? ` #${channel}` : ''}!`;
    } else {
      return '❌ Failed to send Slack message. Check your configuration.';
    }
  } catch (error) {
    console.error('Slack intent error:', error);
    return `Slack error: ${error.message}`;
  }
}

/**
 * Handle Discord intent
 * @private
 */
async function handleDiscordIntent(input, context) {
  try {
    const discord = new DiscordIntegration();
    
    const lower = input.toLowerCase();
    
    // Extract channel and message
    const channelMatch = input.match(/#(\w+)/);
    const channel = channelMatch ? channelMatch[1] : null;
    
    // Extract message content
    let message = '';
    if (/send.*to discord/i.test(input)) {
      const msgMatch = input.match(/send\s+(.+?)\s+to discord/i);
      message = msgMatch ? msgMatch[1] : '';
    } else if (/discord.*message/i.test(input)) {
      const msgMatch = input.match(/discord.*message[:\s]+(.+)/i);
      message = msgMatch ? msgMatch[1] : '';
    } else if (/post.*to discord/i.test(input)) {
      const msgMatch = input.match(/post\s+(.+?)\s+to discord/i);
      message = msgMatch ? msgMatch[1] : '';
    }

    if (!message) {
      return '💜 **Discord Integration Available**\n\nUsage examples:\n• "Send hello world to Discord"\n• "Post this to Discord #general"\n• "Discord message: Hello server!"\n\nFor setup: `sr discord setup`';
    }

    if (!discord.config.token) {
      return '❌ Discord not configured. Set DISCORD_BOT_TOKEN environment variable or run `sr discord setup`.';
    }

    await discord.start();
    const success = await discord.sendMessage(message, channel);
    await discord.stop();
    
    if (success) {
      return `✅ Message sent to Discord${channel ? ` #${channel}` : ''}!`;
    } else {
      return '❌ Failed to send Discord message. Check your configuration.';
    }
  } catch (error) {
    console.error('Discord intent error:', error);
    return `Discord error: ${error.message}`;
  }
}

/**
 * Handle Notion intent
 * @private
 */
async function handleNotionIntent(input, context) {
  try {
    const notion = new NotionIntegration();
    
    if (!notion.isConfigured()) {
      return '❌ Notion not configured. Set NOTION_API_KEY environment variable or run `sr notion setup`.';
    }

    const lower = input.toLowerCase();
    
    // Extract content to save
    let content = '';
    let title = '';
    
    if (/add.*to notion/i.test(input)) {
      const match = input.match(/add\s+(.+?)\s+to notion/i);
      content = match ? match[1] : '';
    } else if (/save.*to notion/i.test(input)) {
      const match = input.match(/save\s+(.+?)\s+to notion/i);
      content = match ? match[1] : '';
    } else if (/create.*notion page/i.test(input)) {
      const match = input.match(/create.*notion page[:\s]+(.+)/i);
      content = match ? match[1] : '';
    }

    if (!content) {
      return '📝 **Notion Integration Available**\n\nUsage examples:\n• "Add this idea to Notion"\n• "Create a Notion page: Meeting Notes"\n• "Save this to Notion: Important info"\n\nFor setup: `sr notion setup`';
    }

    // Try to extract title from content
    const lines = content.split('\n');
    if (lines.length > 1) {
      title = lines[0];
      content = lines.slice(1).join('\n');
    } else {
      title = content.length > 50 ? content.substring(0, 47) + '...' : content;
    }

    const result = await notion.createPage(title, content);
    
    if (result.success) {
      return `✅ Created Notion page: "${title}"\n🔗 ${result.url}`;
    } else {
      return `❌ Failed to create Notion page: ${result.error}`;
    }
  } catch (error) {
    console.error('Notion intent error:', error);
    return `Notion error: ${error.message}`;
  }
}

/**
 * Handle WhatsApp intent
 * @private
 */
async function handleWhatsAppIntent(input, context) {
  try {
    const whatsapp = new WhatsAppIntegration();
    
    if (!whatsapp.isConfigured()) {
      return '❌ WhatsApp not configured. Run `sr whatsapp setup` to configure WhatsApp integration first.';
    }

    const lower = input.toLowerCase();
    
    // Extract recipient and message
    const toMatch = input.match(/whatsapp.*to\s+(.+)/i) || input.match(/message\s+(.+?)\s+on whatsapp/i);
    const recipient = toMatch ? toMatch[1] : '';
    
    // Extract message content
    let message = '';
    if (/send.*whatsapp/i.test(input)) {
      const msgMatch = input.match(/send\s+(.+?)\s+via whatsapp/i) || 
                       input.match(/send\s+(.+?)\s+whatsapp/i);
      message = msgMatch ? msgMatch[1] : '';
    } else if (/whatsapp.*message/i.test(input)) {
      const msgMatch = input.match(/whatsapp.*message[:\s]+(.+)/i);
      message = msgMatch ? msgMatch[1] : '';
    }

    if (!message || !recipient) {
      return '💬 **WhatsApp Integration Available**\n\nUsage examples:\n• "Send hello to mom on WhatsApp"\n• "WhatsApp message to John: How are you?"\n• "Message dad on WhatsApp: I\'ll be late"\n\nFor setup: `sr whatsapp setup`';
    }

    const result = await whatsapp.sendMessage(recipient, message);
    
    if (result.success) {
      return `✅ WhatsApp message sent to ${recipient}!`;
    } else {
      return `❌ Failed to send WhatsApp message: ${result.error}`;
    }
  } catch (error) {
    console.error('WhatsApp intent error:', error);
    return `WhatsApp error: ${error.message}`;
  }
}

/**
 * Handle webhooks intent
 * @private
 */
async function handleWebhooksIntent(input, context) {
  try {
    const webhookManager = new WebhookManager();
    
    const lower = input.toLowerCase();
    
    // Extract webhook name/URL and payload
    const webhookMatch = input.match(/webhook\s+(.+)/i) || input.match(/trigger\s+(.+)/i);
    const webhookName = webhookMatch ? webhookMatch[1] : '';
    
    if (!webhookName) {
      return '🔗 **Webhook Integration Available**\n\nUsage examples:\n• "Trigger webhook alerts"\n• "Send webhook to monitoring"\n• "Fire webhook notification"\n\nFor setup: `sr webhooks setup`';
    }

    const result = await webhookManager.triggerWebhook(webhookName, { 
      message: input,
      timestamp: new Date().toISOString(),
      source: 'chat_handler'
    });
    
    if (result.success) {
      return `✅ Webhook "${webhookName}" triggered successfully!`;
    } else {
      return `❌ Failed to trigger webhook: ${result.error}`;
    }
  } catch (error) {
    console.error('Webhooks intent error:', error);
    return `Webhook error: ${error.message}`;
  }
}

/**
 * Handle email intent (separate from Gmail)
 * @private
 */
async function handleEmailIntent(input, context) {
  try {
    const emailService = await getEmailService();
    
    if (!emailService.isConfigured()) {
      return '❌ Email not configured. Run `sr email setup` to configure email integration first.';
    }

    const lower = input.toLowerCase();
    
    // Extract recipient, subject, and body
    const toMatch = input.match(/email.*to\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    const recipient = toMatch ? toMatch[1] : '';
    
    const aboutMatch = input.match(/about\s+(.+)/i) || input.match(/subject[:\s]+(.+)/i);
    const subject = aboutMatch ? aboutMatch[1] : 'Message from StaticRebel';
    
    let body = '';
    if (/send.*email/i.test(input)) {
      const bodyMatch = input.match(/send\s+(.+?)\s+email/i);
      body = bodyMatch ? bodyMatch[1] : subject;
    }

    if (!recipient) {
      return '📧 **Email Integration Available**\n\nUsage examples:\n• "Send email to john@example.com about meeting"\n• "Compose email to team@company.com: Project update"\n\nFor setup: `sr email setup`';
    }

    const result = await emailService.sendCustomEmail(recipient, subject, body);
    
    if (result) {
      return `✅ Email sent to ${recipient}!\nSubject: ${subject}`;
    } else {
      return `❌ Failed to send email. Check your email configuration.`;
    }
  } catch (error) {
    console.error('Email intent error:', error);
    return `Email error: ${error.message}`;
  }
}

/**
 * Handle analytics intent
 * @private
 */
async function handleAnalyticsIntent(input, context) {
  try {
    const lower = input.toLowerCase();
    
    // Determine report type
    if (/daily summary/i.test(input)) {
      const report = await generateDailyReport();
      return `📊 **Daily Summary**\n\n${report.formatted || report.summary || 'No data available for today.'}`;
    } else if (/weekly report/i.test(input)) {
      const report = await generateWeeklyReport();
      return `📈 **Weekly Report**\n\n${report.formatted || report.summary || 'No data available for this week.'}`;
    } else if (/monthly report/i.test(input)) {
      const report = await generateMonthlyReport();
      return `📅 **Monthly Report**\n\n${report.formatted || report.summary || 'No data available for this month.'}`;
    } else {
      // General analytics overview - default to daily
      const report = await generateDailyReport();
      return `📊 **Analytics Overview**\n\n${report.formatted || report.summary || 'No analytics data available yet.'}`;
    }
  } catch (error) {
    console.error('Analytics intent error:', error);
    return `Analytics error: ${error.message}. Make sure you have data to analyze.`;
  }
}

/**
 * Handle media understanding intent
 * @private
 */
async function handleMediaIntent(input, context) {
  try {
    // Extract file path from input
    const pathMatch = input.match(/image\s+(.+)|photo\s+(.+)|video\s+(.+)/i);
    let filePath = pathMatch ? (pathMatch[1] || pathMatch[2] || pathMatch[3]) : '';
    
    // Remove quotes if present
    filePath = filePath.replace(/^["'](.*)["']$/, '$1');
    
    if (!filePath) {
      return '🖼️ **Media Understanding Available**\n\nUsage examples:\n• "Analyze this image: /path/to/image.jpg"\n• "What\'s in this photo: screenshot.png"\n• "Describe this image: photo.png"\n• "Extract text from image: document.jpg"\n\nI can analyze images and videos to describe their contents, extract text (OCR), and more.';
    }

    const lower = input.toLowerCase();
    let task = 'analyze';
    
    if (/extract text|ocr/i.test(input)) {
      task = 'extract-text';
    } else if (/describe/i.test(input)) {
      task = 'describe';
    }

    const result = await analyzeMedia(filePath, { task });
    
    if (result.success) {
      let response = `✅ **Media Analysis Result**\n\n`;
      if (result.description) {
        response += `**Description:** ${result.description}\n\n`;
      }
      if (result.text) {
        response += `**Extracted Text:** ${result.text}\n\n`;
      }
      if (result.analysis) {
        response += `**Analysis:** ${result.analysis}`;
      }
      return response;
    } else {
      return `❌ Failed to analyze media: ${result.error}`;
    }
  } catch (error) {
    console.error('Media intent error:', error);
    return `Media analysis error: ${error.message}`;
  }
}

/**
 * Handle export intent
 * @private
 */
async function handleExportIntent(input, context) {
  try {
    const lower = input.toLowerCase();
    
    // Determine export format
    let format = 'json';
    if (/csv/i.test(input)) {
      format = 'csv';
    }

    // Determine scopes to export
    let scopes = [EXPORT_SCOPES.ALL];
    if (/skills/i.test(input)) {
      scopes = [EXPORT_SCOPES.SKILLS];
    } else if (/trackers/i.test(input)) {
      scopes = [EXPORT_SCOPES.TRACKERS];
    } else if (/memories/i.test(input)) {
      scopes = [EXPORT_SCOPES.MEMORIES];
    }

    const result = await exportData({
      format,
      scopes,
      onProgress: (current, total, operation) => {
        // Progress callback - could emit progress events
        console.log(`Exporting: ${current}/${total} - ${operation}`);
      }
    });
    
    if (result.success) {
      return `✅ **Data Export Complete**\n\nExported to: ${result.filePath}\nFormat: ${format.toUpperCase()}\nSize: ${(result.size / 1024).toFixed(1)} KB\n\nYour data has been successfully exported!`;
    } else {
      return `❌ Export failed: ${result.error}`;
    }
  } catch (error) {
    console.error('Export intent error:', error);
    return `Export error: ${error.message}`;
  }
}

/**
 * Handle import intent
 * @private
 */
async function handleImportIntent(input, context) {
  try {
    // Extract file path from input
    const pathMatch = input.match(/import.*from\s+(.+)|import\s+(.+)|load\s+(.+)/i);
    let filePath = pathMatch ? (pathMatch[1] || pathMatch[2] || pathMatch[3]) : '';
    
    // Remove quotes if present
    filePath = filePath.replace(/^["'](.*)["']$/, '$1');
    
    if (!filePath) {
      return '📥 **Data Import Available**\n\nUsage examples:\n• "Import data from backup.json"\n• "Load data from export.csv"\n• "Restore data from data-export.json"\n\nI can import previously exported StaticRebel data.';
    }

    const result = await importData(filePath, {
      onProgress: (current, total, operation) => {
        console.log(`Importing: ${current}/${total} - ${operation}`);
      }
    });
    
    if (result.success) {
      return `✅ **Data Import Complete**\n\nImported from: ${filePath}\nRecords imported: ${result.recordsImported}\n\nYour data has been successfully imported!`;
    } else {
      return `❌ Import failed: ${result.error}`;
    }
  } catch (error) {
    console.error('Import intent error:', error);
    return `Import error: ${error.message}`;
  }
}

/**
 * Handle intelligent skill creator intent
 * @private
 */
async function handleSkillCreatorIntent(input, context) {
  try {
    const creator = new IntelligentCreator();
    
    const lower = input.toLowerCase();
    
    // Extract app/service name
    const likeMatch = input.match(/skill like\s+(.+)/i) || 
                      input.match(/replace\s+(.+?)\s+with/i) ||
                      input.match(/turn\s+(.+?)\s+into/i);
    
    let appName = likeMatch ? likeMatch[1] : '';
    
    // Extract from "create skill for X" patterns
    const forMatch = input.match(/skill for\s+(.+)/i);
    if (forMatch && !appName) {
      appName = forMatch[1];
    }
    
    if (!appName) {
      return '🧠 **Intelligent Skill Creator Available**\n\nI can research apps and create replacement skills for you!\n\nUsage examples:\n• "Create a skill like Habitica"\n• "Build a skill for tracking workouts"\n• "Replace MyFitnessPal with a skill"\n• "Generate a skill like Todoist"\n\nJust tell me what app or service you want to replace!';
    }

    // Research and create the skill
    const result = await creator.createSkillFromDescription(appName, {
      research: true,
      autoImplement: true
    });
    
    if (result.success) {
      let response = `✅ **Skill Created Successfully!**\n\n`;
      response += `**App researched:** ${appName}\n`;
      response += `**Skills created:** ${result.skills.length}\n\n`;
      
      for (const skill of result.skills) {
        response += `📝 **${skill.name}** - ${skill.description}\n`;
      }
      
      response += `\n🎯 You can now start using these skills with natural language!`;
      return response;
    } else {
      return `❌ Failed to create skill: ${result.error}`;
    }
  } catch (error) {
    console.error('Skill creator intent error:', error);
    return `Skill creator error: ${error.message}`;
  }
}

/**
 * Build action execution context
 * @private
 */
function buildActionContext(userContext = {}) {
  return {
    modules: {
      // Simple functions at root level for backward compatibility
      listAvailableModels,
      getDefaultModel,
      getModelForTask,
      listSkills,
      getSkillsStats,
      getSubagentStats,
      getMemoryStats,
      getSchedulerStatus,
      getHeartbeatStatus,
      getVectorStats,
      readDailyMemory,
      readLongTermMemory,
      getRecentDailyMemories,
      curateMemory,
      writeDailyMemory,
      getAvailablePersonas,
      createTask,
      getAllTasks,
      getWorkerStats,
      generateTodoMd,
      createConnector,
      getAllConnectors,
      storeApiKey,
      getApiStats,
      addMemory,
      searchMemories,
      rememberPreference,

      // Module groups - as expected by actions
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
        writeDailyMemory,
      },
      personaManager: {
        getAvailablePersonas,
        buildSystemPrompt: getPersonaSystemPrompt,
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
        TaskStatus,
      },
      apiConnector: {
        createConnector,
        getAllConnectors,
        storeApiKey,
        getApiStats,
      },
      orchestrator: {
        routeTask,
        orchestrate,
        streamOllama,
        runClaudeCode: spawnClaudeCode,
      },
      research: {
        research,
        webResearch,
        streamResearch,
      },
      subagents: {
        listSubagents,
        createCodingSubagent,
        createAnalysisSubagent,
        sendToSubagent,
        getSubagentStats,
        terminateSubagent,
      },
      modelRegistry: {
        getDefaultModel,
        chatCompletion,
        listAvailableModels,
      },
      tracker: {
        TrackerStore,
        QueryEngine,
        parseRecordFromText,
        parseTrackerFromNaturalLanguage,
      },
      crm: {
        getCRM,
      },
    },
    user: userContext.user || {},
    conversation: userContext.conversation || {},
    ...userContext,
  };
}

// ============================================================================
// Auto-Skill Creation Helpers
// ============================================================================

/**
 * Enable or disable auto-skill creation
 * @param {boolean} enabled - Whether to enable auto-creation
 */
export async function setAutoCreateSkills(enabled) {
  await configureChatHandler({ AUTO_CREATE_SKILLS: enabled });
}

/**
 * Set the confidence threshold for auto-creation
 * @param {number} threshold - Confidence threshold (0.0 to 1.0)
 */
export async function setAutoSkillThreshold(threshold) {
  if (threshold < 0 || threshold > 1) {
    throw new Error('Threshold must be between 0.0 and 1.0');
  }
  await configureChatHandler({ AUTO_SKILL_CONFIDENCE_THRESHOLD: threshold });
}

/**
 * Get auto-skill creation status
 * @returns {Object} Current auto-skill settings
 */
export function getAutoSkillStatus() {
  return {
    enabled: CONFIG.AUTO_CREATE_SKILLS,
    threshold: CONFIG.AUTO_SKILL_CONFIDENCE_THRESHOLD,
    description: CONFIG.AUTO_CREATE_SKILLS 
      ? `Auto-creating skills with ${(CONFIG.AUTO_SKILL_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%+ confidence`
      : 'Asking for confirmation before creating skills'
  };
}

/**
 * Handle pending skill confirmations manually
 * @param {string} chatId - Chat session ID
 * @param {string} response - User response ('yes' or 'no')
 * @returns {Object} Result of confirmation
 */
export async function handleSkillConfirmation(chatId, response) {
  try {
    const autoCreator = await getAutoSkillCreator();
    return await autoCreator.handleConfirmation(chatId, response);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Configuration API
// ============================================================================

/**
 * Update chat handler configuration
 * @param {Object} newConfig - Configuration updates
 */
export async function configureChatHandler(newConfig) {
  Object.assign(CONFIG, newConfig);
  
  // Update auto-skill creator configuration if relevant settings changed
  if (newConfig.AUTO_CREATE_SKILLS !== undefined || newConfig.AUTO_SKILL_CONFIDENCE_THRESHOLD !== undefined) {
    try {
      const autoCreator = await getAutoSkillCreator();
      autoCreator.updateConfig({
        AUTO_CREATE_SKILLS: CONFIG.AUTO_CREATE_SKILLS,
        CONFIDENCE_THRESHOLD: CONFIG.AUTO_SKILL_CONFIDENCE_THRESHOLD
      });
    } catch (error) {
      console.warn('[ChatHandler] Failed to update auto-skill creator config:', error.message);
    }
  }
}

/**
 * Get current configuration
 * @returns {Object} Current configuration
 */
export function getChatHandlerConfig() {
  return { ...CONFIG };
}

// ============================================================================
// Initialization
// ============================================================================

let isInitialized = false;

/**
 * Initialize the chat handler
 */
export async function initChatHandler() {
  if (isInitialized) return;

  // Initialize command registry
  if (CONFIG.USE_COMMAND_REGISTRY) {
    initCommands();
    console.log('[ChatHandler] Command registry initialized');
  }

  await initActionRegistry();
  isInitialized = true;

  console.log('[ChatHandler] Initialized');
}

// ============================================================================
// Additional Exports for New Features
// ============================================================================

/**
 * Get available commands from the registry
 * @param {Object} options - Filter options
 * @returns {Array} List of commands
 */
export function getAvailableCommands(options = {}) {
  return listCommands(options);
}

/**
 * Get help text for commands
 * @param {string} commandKey - Specific command or null for all
 * @returns {string} Help text
 */
export function getCommandHelp(commandKey = null) {
  return generateHelp(commandKey);
}

/**
 * Process output with directive parsing
 * @param {string} output - LLM output text
 * @returns {Object} Processed output
 */
export function processOutput(output) {
  return processOutputDirectives(output);
}

/**
 * Redact sensitive data from text
 * @param {string} text - Text to redact
 * @returns {string} Redacted text
 */
export { redactSensitive };

/**
 * Create a reply coalescer for batching outputs
 * @param {Object} config - Coalescer config
 * @returns {Object} Coalescer instance
 */
export { createReplyCoalescer };

// Default export
export default {
  handleChat,
  initChatHandler,
  configureChatHandler,
  getChatHandlerConfig,
  findTrackerSmart,
  findOrCreateTrackerSmart,
  setAutoCreateSkills,
  setAutoSkillThreshold,
  getAutoSkillStatus,
  handleSkillConfirmation,
  // New exports
  getAvailableCommands,
  getCommandHelp,
  processOutput,
  redactSensitive,
  createReplyCoalescer,
};
