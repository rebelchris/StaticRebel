/**
 * Unified Chat Handler
 * Single entry point for all chat interfaces (enhanced.js, assistant.js, dashboard/api/chat.js)
 * Consolidates intent detection, action execution, and tracker handling
 */

import {
  initActionRegistry,
  executeAction,
  getAllActions,
} from './actionRegistry.js';
import { getDefaultModel, chatCompletion } from './modelRegistry.js';
import {
  TrackerStore,
  QueryEngine,
  parseRecordFromText,
  parseTrackerFromNaturalLanguage,
} from '../tracker.js';
import { sendMessage } from '../agents/main/agent.js';
import { writeDailyMemory } from './memoryManager.js';
import { addMemory, searchMemories } from './vectorMemory.js';
import { recordActivity } from './idleDetector.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Confidence thresholds
  DEFAULT_CONFIDENCE_THRESHOLD: 0.6,
  TRACKING_CONFIDENCE_THRESHOLD: 0.4, // Lower threshold for tracking-related inputs

  // Intent detection
  USE_PATTERN_MATCHING: true,
  USE_LLM_CLASSIFICATION: true,

  // Tracker matching
  TRACKER_MATCH_BY_KEYWORDS: true,
  TRACKER_MATCH_BY_TYPE: true,

  // Debug
  DEBUG: process.env.DEBUG_CHAT === 'true',
};

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
 * Check if input looks like a tracking request
 * @param {string} text - User input
 * @returns {boolean}
 */
function looksLikeTracking(text) {
  const lower = text.toLowerCase();

  // Quick heuristics for tracking-like inputs
  const trackingIndicators = [
    /\d+\s*(cal|calorie|kcal)/i,
    /\d+\s*(km|miles?|meters?)/i,
    /\d+\s*(min|minutes?|hours?|hrs?)/i,
    /\d+\s*(sets?|reps?)/i,
    /\d+\s*(pushups?|pullups?|squats?)/i,
    /\d+k\s*run/i,
    /zone\s*\d/i,
    /i\s+(had|ate|drank|did|ran|walked|swam|biked)/i,
  ];

  return trackingIndicators.some((pattern) => pattern.test(lower));
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

IMPORTANT RULES:
- "track" is for LOGGING DATA (calories, food, workouts, habits), NOT for code tracking
- "coding" is for WRITING CODE, NOT for tracking metrics
- "track my calories" should route to "track" action, not "coding"
- "build a tracker" means creating a tracking record, NOT building code

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
  "suggestedResponse": "optional direct response if no action matches"
}

Rules:
- If the input is clearly an action request, set fallbackToChat to false
- If the input is casual conversation, set fallbackToChat to true
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

    const content = response.message;

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
    console.error('[ChatHandler] LLM classification failed:', error.message);
    return {
      intents: [],
      fallbackToChat: true,
    };
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
  } = options;

  // Record user activity for idle detection (evolution system)
  recordActivity();

  if (CONFIG.DEBUG) {
    console.log(`[ChatHandler] Processing from ${source}: "${input}"`);
  }

  // Initialize action registry if needed
  await initActionRegistry();

  // Step 1: Pattern-based intent detection (fast path)
  let detectedIntent = null;
  if (CONFIG.USE_PATTERN_MATCHING && !skipPatternMatching) {
    detectedIntent = detectIntentByPattern(input);

    // If high-confidence pattern match for tracking, lower the threshold
    if (detectedIntent.type === 'track' && looksLikeTracking(input)) {
      detectedIntent.confidence = 0.9;
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

  // Check for tracking intent with proactive detection
  const isTrackingRelated =
    detectedIntent?.type === 'track' || looksLikeTracking(input);

  // Use lower threshold for tracking-related inputs
  const effectiveThreshold =
    overrideThreshold ??
    (isTrackingRelated
      ? CONFIG.TRACKING_CONFIDENCE_THRESHOLD
      : CONFIG.DEFAULT_CONFIDENCE_THRESHOLD);

  // Try pattern-matched intent first if high confidence
  if (detectedIntent && detectedIntent.confidence >= effectiveThreshold) {
    // Check if there's a matching action
    const actions = getAllActions();
    const matchingAction = actions.find(
      (a) =>
        a.name === detectedIntent.type || a.category === detectedIntent.type,
    );

    if (matchingAction) {
      const result = await executeAction(
        matchingAction.name,
        input,
        actionContext,
      );

      if (result.success) {
        return {
          type: 'action',
          action: matchingAction.name,
          content: result.result,
          confidence: detectedIntent.confidence,
        };
      }
    }

    // Handle built-in intents that don't have actions
    const builtInResult = await handleBuiltInIntent(
      detectedIntent.type,
      input,
      actionContext,
    );
    if (builtInResult) {
      return {
        type: 'builtin',
        action: detectedIntent.type,
        content: builtInResult,
        confidence: detectedIntent.confidence,
      };
    }
  }

  // Try LLM-classified actions
  if (classification && !classification.fallbackToChat) {
    const topIntent = classification.intents[0];

    if (topIntent && topIntent.confidence >= effectiveThreshold) {
      const result = await executeAction(
        topIntent.actionName,
        input,
        actionContext,
      );

      if (result.success) {
        return {
          type: 'action',
          action: topIntent.actionName,
          content: result.result,
          confidence: topIntent.confidence,
        };
      }
    }
  }

  // Fall back to regular chat
  const chatResponse = await sendMessage(input);

  // Write to memory
  try {
    writeDailyMemory(`[CHAT] ${input.substring(0, 80)}...`);
  } catch (e) {
    // Ignore memory write errors
  }

  return {
    type: 'chat',
    content: chatResponse.content,
    confidence: 1.0,
  };
}

/**
 * Handle built-in intents that don't have registered actions
 * @private
 */
async function handleBuiltInIntent(intentType, input, context) {
  const store = new TrackerStore();

  switch (intentType) {
    case 'track':
      // Use smart tracker handling
      return await handleTrackingIntent(input, store, context);

    case 'status':
      return await handleStatusIntent(context);

    case 'tasks':
      return await handleTasksIntent(context);

    case 'models':
      return await handleModelsIntent(context);

    case 'skills':
      return await handleSkillsIntent(context);

    default:
      return null;
  }
}

/**
 * Handle tracking intent with smart tracker lookup
 * @private
 */
async function handleTrackingIntent(input, store, context) {
  const trackers = store.listTrackers();

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
 * Build action execution context
 * @private
 */
function buildActionContext(userContext = {}) {
  return {
    modules: {
      modelRegistry: {
        getDefaultModel,
        chatCompletion,
      },
    },
    user: userContext.user || {},
    conversation: userContext.conversation || {},
    ...userContext,
  };
}

// ============================================================================
// Configuration API
// ============================================================================

/**
 * Update chat handler configuration
 * @param {Object} newConfig - Configuration updates
 */
export function configureChatHandler(newConfig) {
  Object.assign(CONFIG, newConfig);
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

  await initActionRegistry();
  isInitialized = true;

  console.log('[ChatHandler] Initialized');
}

// Default export
export default {
  handleChat,
  initChatHandler,
  configureChatHandler,
  getChatHandlerConfig,
  findTrackerSmart,
  findOrCreateTrackerSmart,
};
