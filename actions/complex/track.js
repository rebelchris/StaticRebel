/**
 * Track Action
 * Tracks nutrition, workouts, habits, and other metrics
 */

import {
  TrackerStore,
  QueryEngine,
  parseRecordFromText,
  parseTrackerFromNaturalLanguage,
} from '../../tracker.js';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clean up duplicate characters in text (e.g., "CCaann" -> "Can")
 * Also removes character repetition patterns like "yyoouu" -> "you"
 */
function cleanDuplicateChars(text) {
  return text
    // Remove triple+ repeats like "CCCaann" -> "Can"
    .replace(/(.)\1{2,}/g, '$1$1')
    // Fix double letter patterns like "yyoouu" -> "you" (but preserve words like "good")
    .replace(/\b(\w)\1(\w)\2\b/g, '$1$2')
    // Handle specific common patterns
    .replace(/\bii\b/g, 'I')
    .replace(/\s+/g, ' ')  // Normalize spaces
    .trim();
}

/**
 * Validate that a response doesn't contain excessive character duplication
 */
function isResponseValid(text) {
  // Check for obvious duplication patterns that indicate model glitch
  const doubleCharRatio = (text.match(/(.)\1/g) || []).length / text.length;
  return doubleCharRatio < 0.15; // Allow up to 15% double chars
}

export default {
  name: 'track',
  displayName: 'Tracking System',
  description:
    'Log and track nutrition, workouts, habits, sleep, and other metrics',
  category: 'tracking',
  version: '1.0.0',

  intentExamples: [
    // Logging intent
    'log my calories',
    'log my food',
    'log my meal',
    'log my workout',
    'log my exercise',
    'log my sleep',
    'log my habit',
    'track my calories',
    'track my food',
    'track my workout',
    'I had',
    'I ate',
    'I drank',
    'I consumed',
    'add a meal',
    'add a workout',
    'record my calories',
    'logging',
    'note this down',
    'I did a run',
    'I went for a run',
    'I went for a walk',
    'I completed a workout',
    // Query intent
    'how many calories',
    'what did I eat',
    'what did I drink',
    'what have I eaten',
    'show my calories',
    'show my food',
    'show my workout',
    // Create intent
    'create a tracker',
    'add a tracker',
    'new tracker',
    'make a tracker',
    'set up a tracker',
    'create a custom tracker',
    'add a custom tracker',
    'I want to track',
    'start tracking',
    'set up tracking for',
    'can you track',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['log', 'query', 'create'],
      description: 'Whether to log data, query existing data, or create a new tracker',
    },
    trackerType: {
      type: 'enum',
      values: [
        'nutrition',
        'workout',
        'sleep',
        'habit',
        'mood',
        'hydration',
        'medication',
        'custom',
      ],
      description: 'Type of tracker to use',
    },
  },

  dependencies: [
    'modelRegistry.getDefaultModel',
    'modelRegistry.chatCompletion',
  ],

  async handler(input, context, params) {
    const { getDefaultModel, chatCompletion } = context.modules.modelRegistry;
    const store = new TrackerStore();
    const trackers = store.listTrackers();

    // Step 1: Use LLM to analyze the intent
    const intent = await analyzeTrackingIntent(
      input,
      trackers,
      getDefaultModel,
      chatCompletion,
    );

    // If not tracking-related or low confidence, return null to let it be handled elsewhere
    if (intent.intentType === 'none' || intent.confidence < 0.6) {
      if (trackers.length === 0) {
        return 'No trackers configured. Create one with: /track new';
      }
      return null;
    }

    // Step 2: Handle CREATE intent - explicitly creating a new tracker
    if (intent.intentType === 'create') {
      const trackerDesc = intent.description || input;
      console.log(`  \x1b[36m[Creating new tracker: ${trackerDesc}]\x1b[0m`);

      const trackerConfig = await parseTrackerFromNaturalLanguage(trackerDesc);
      if (!trackerConfig) {
        return "I couldn't understand what kind of tracker you want. Try: 'create a tracker for pushups' or 'new workout tracker'";
      }

      // Check if a tracker with this name already exists
      const existing = trackers.find((t) => t.name === trackerConfig.name);
      if (existing) {
        return `A tracker named **@${trackerConfig.name}** already exists. Use it with: "@${trackerConfig.name} add..."`;
      }

      const createResult = store.createTracker(trackerConfig);
      if (!createResult) {
        return `Failed to create tracker`;
      }

      return `Created new tracker **@${trackerConfig.name}** (${trackerConfig.displayName})\n\nType: ${trackerConfig.type}\nMetrics: ${trackerConfig.config?.metrics?.join(', ') || 'custom'}\n\nLog entries with: "@${trackerConfig.name} [your entry]"`;
    }

    // Step 3: Handle QUERY intent
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

    // Step 4: Handle LOG intent
    if (intent.intentType === 'log') {
      // Find or create the appropriate tracker
      const tracker = await findOrCreateTracker(
        intent.trackerType,
        intent.description || `${intent.trackerType} tracker`,
        store,
        getDefaultModel,
        chatCompletion,
      );

      if (!tracker) {
        return "I couldn't create a tracker for this. Try: /track new";
      }

      // Log the data
      const result = await logToTracker(
        tracker,
        input,
        store,
        getDefaultModel,
        chatCompletion,
      );

      if (result.success) {
        // Check if this was a newly created tracker
        const wasNew =
          trackers.length === 0 ||
          !trackers.find((t) => t.name === tracker.name);
        if (wasNew) {
          return `✅ [New tracker created!]\n\n${result.message}`;
        }
        return result.message;
      }

      return `Failed to log to ${tracker.displayName}. Try rephrasing with more details.`;
    }

    // Fallback
    return null;
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};

// Query patterns - must check these first
const QUERY_PATTERNS = [
  /^how many/i,
  /^how much/i,
  /^what did i eat/i,
  /^what have i eaten/i,
  /^what've i eaten/i,
  /^what did i log/i,
  /^what have i logged/i,
  /^what've i logged/i,
  /^show me/i,
  /^display/i,
  /^tell me/i,
  /^(what's|whats) my/i,
  /total/i,
];

// Create patterns
const CREATE_PATTERNS = [
  /create (a |an )?tracker/i,
  /add (a |an )?tracker/i,
  /new tracker/i,
  /make (a |an )?tracker/i,
  /set up (a |an )?tracker/i,
  /i want to track/i,
  /start tracking/i,
  /can you track/i,
  /set up tracking/i,
];

// LLM-based intent analyzer for tracking requests
async function analyzeTrackingIntent(
  input,
  existingTrackers,
  getDefaultModel,
  chatCompletion,
) {
  const lower = input.toLowerCase().trim();

  // Step 1: Quick pattern matching for clear intents
  if (CREATE_PATTERNS.some(p => p.test(lower))) {
    return { intentType: 'create', trackerType: 'custom', confidence: 0.9 };
  }

  if (QUERY_PATTERNS.some(p => p.test(lower))) {
    return { intentType: 'query', trackerType: 'custom', confidence: 0.9 };
  }

  // Step 2: Check for logging patterns (must come after query check)
  const logPatterns = [
    /i (just )?(had|ate|drank|consumed|eaten)/i,
    /i did (a |an )?/i,
    /log (my |a )?/i,
    /record (my |a )?/i,
    /add (a |my )?/i,
    /note (this|that)/i,
    /just logged/i,
    /tracking/i,
  ];

  const isLikelyLog = logPatterns.some(p => p.test(lower));

  // Step 3: Use LLM for ambiguous cases or tracker type detection
  try {
    const trackersList =
      existingTrackers.length > 0
        ? existingTrackers
            .map((t) => `- ${t.displayName} (type: ${t.type})`)
            .join('\n')
        : 'No trackers exist yet';

    const intentPrompt = `Analyze this user input and determine the tracking intent:

User input: "${input}"
Is this likely a log/statement? ${isLikelyLog}
Existing trackers:
${trackersList}

Respond with ONLY valid JSON:
{
  "intentType": "create|log|query|none",
  "trackerType": "nutrition|workout|sleep|habit|mood|hydration|medication|custom|unknown",
  "trackerNeeded": "existing_tracker_name or null if needs new tracker",
  "description": "brief description",
  "confidence": 0.0-1.0
}

If it's a statement about something they did (e.g., "I ate lunch", "I had coffee"), it's LOG intent.
If it's a question asking for information (e.g., "how many calories", "what did I eat"), it's QUERY intent.
If it mentions creating a new tracker, it's CREATE intent.`;

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
async function findOrCreateTracker(
  trackerType,
  description,
  store,
  getDefaultModel,
  chatCompletion,
) {
  try {
    const trackers = store.listTrackers();
    const inputLower = description.toLowerCase();

    // Strategy 1: Check if input explicitly mentions an existing tracker name
    // e.g., "@pushups add 50" or "log to pushups tracker"
    for (const t of trackers) {
      const trackerNameLower = t.name.toLowerCase();
      const displayNameLower = t.displayName.toLowerCase();
      // Check if tracker name/displayName appears in the input
      if (inputLower.includes(trackerNameLower) ||
          inputLower.includes(displayNameLower.replace(' tracker', ''))) {
        console.log(`  \x1b[36m[Matched tracker by name: @${t.name}]\x1b[0m`);
        return t;
      }
    }

    // Strategy 2: Match by type - prefer trackers with the same type
    if (trackerType !== 'custom' && trackerType !== 'unknown') {
      const typeMatch = trackers.find(
        (t) =>
          t.type === trackerType ||
          (trackerType === 'nutrition' &&
            (t.type === 'food' || t.type === 'nutrition')),
      );

      if (typeMatch) {
        console.log(`  \x1b[36m[Matched tracker by type: @${typeMatch.name}]\x1b[0m`);
        return typeMatch;
      }
    }

    // Strategy 3: For specific workout types, try to find related trackers
    // e.g., "pushups" should match "Pushup Tracker", "run" should match "Running Tracker"
    const workoutKeywords = {
      'pushup': ['pushup', 'push-up', 'push ups', 'pushup'],
      'run': ['run', 'running', 'jog', 'jogging'],
      'walk': ['walk', 'walking'],
      'bike': ['bike', 'biking', 'cycling', 'cycle'],
      'swim': ['swim', 'swimming'],
      'squat': ['squat', 'squats'],
      'lift': ['lift', 'lifting', 'weights', 'weight'],
    };

    for (const [keyword, variants] of Object.entries(workoutKeywords)) {
      if (variants.some(v => inputLower.includes(v))) {
        const keywordMatch = trackers.find(t =>
          t.name.toLowerCase().includes(keyword) ||
          t.displayName.toLowerCase().includes(keyword)
        );
        if (keywordMatch) {
          console.log(`  \x1b[36m[Matched tracker by keyword: @${keywordMatch.name}]\x1b[0m`);
          return keywordMatch;
        }
      }
    }

    // Strategy 4: For custom trackers, try to match by description keywords
    if (trackerType === 'custom' && description) {
      const keywords = description.toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .filter(w => !['tracker', 'create', 'add', 'new', 'log'].includes(w));

      const keywordMatch = trackers.find((t) => {
        const trackerText = (t.name + ' ' + t.displayName + ' ' + (t.description || '')).toLowerCase();
        return keywords.some(kw => trackerText.includes(kw));
      });

      if (keywordMatch) {
        console.log(`  \x1b[36m[Matched tracker by description: @${keywordMatch.name}]\x1b[0m`);
        return keywordMatch;
      }
    }

    // Strategy 5: If there's only one tracker, use it
    if (trackers.length === 1) {
      console.log(`  \x1b[36m[Using only available tracker: @${trackers[0].name}]\x1b[0m`);
      return trackers[0];
    }

    // Strategy 6: Last resort - create a new tracker only if no match found
    console.log(`  \x1b[36m[No matching tracker found, creating new one...]\x1b[0m`);

    const trackerConfig = await parseTrackerFromNaturalLanguage(description);
    if (!trackerConfig) {
      return null;
    }

    // Check if a tracker with similar name already exists
    const nameExists = trackers.find(
      (t) => t.name.toLowerCase() === trackerConfig.name.toLowerCase()
    );
    if (nameExists) {
      console.log(
        `  \x1b[33m[Tracker @${trackerConfig.name} already exists, using it]\x1b[0m`,
      );
      return nameExists;
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

// Simple heuristic parser for food entries as fallback when LLM fails
function parseFoodHeuristic(text) {
  const lower = text.toLowerCase();

  // Extract food name
  let foodName = '';
  const hadMatch = lower.match(
    /(?:had|ate|drank|consumed)\s+(?:a\s+)?(?:cup of\s+)?(.+)/,
  );
  if (hadMatch) {
    foodName = hadMatch[1]
      .replace(/,?\s*(log|track|record|add)\s*(calories|food|meal).*/i, '')
      .trim();
  } else {
    foodName = text
      .replace(/,?\s*(log|track|record|add)\s*(calories|food|meal).*/i, '')
      .trim();
  }

  // Clean up the food name
  foodName = foodName.replace(/^(i|just|just now|another)\s+/i, '').trim();
  if (foodName.startsWith('a ') || foodName.startsWith('an ')) {
    foodName = foodName.substring(2);
  }
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
    for (const [food, cal] of Object.entries(calorieEstimates)) {
      if (lower.includes(food)) {
        calories = cal;
        break;
      }
    }
    if (!calories && foodName.length > 2 && foodName.length < 50) {
      calories = 200;
    }
  }

  const data = {};
  if (foodName)
    data.meal = foodName.charAt(0).toUpperCase() + foodName.slice(1);
  if (calories) data.calories = calories;

  return data;
}

// Simple heuristic parser for workout entries
function parseWorkoutHeuristic(text) {
  const lower = text.toLowerCase();
  const data = {};

  // Handle "50 pushups" style inputs - FIRST PRIORITY before other patterns
  const pushupMatch = lower.match(/(\d+)\s*(pushups|push-ups|push ups)/i);
  if (pushupMatch) {
    data.exercise = 'pushups';
    data.count = parseInt(pushupMatch[1]);
    return data;
  }

  // Handle "10 more pushups" - extract just the number before pushups
  const morePushupsMatch = lower.match(/(\d+)\s*more\s*(pushups|push-ups|push ups)/i);
  if (morePushupsMatch) {
    data.exercise = 'pushups';
    data.count = parseInt(morePushupsMatch[1]);
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

  // Handle "I did X pushups" pattern
  const didPushupsMatch = lower.match(/i\s+(?:did|did\s+a|completed)\s+(\d+)\s*(pushups|push-ups|push ups)/i);
  if (didPushupsMatch) {
    data.exercise = 'pushups';
    data.count = parseInt(didPushupsMatch[1]);
    return data;
  }

  // Extract any standalone number as count (for workout logging)
  // This catches things like "log 10 more" without explicit units
  const standaloneNumber = lower.match(/(?:^|\s)(\d{1,4})(?:\s|$)/);
  if (standaloneNumber && !data.count) {
    // Only use if it's not part of a time duration
    if (!/\d+\s*(minutes?|mins?|hours?|hrs?)/i.test(lower)) {
      data.count = parseInt(standaloneNumber[1]);
    }
  }

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

async function logToTracker(
  tracker,
  input,
  store,
  getDefaultModel,
  chatCompletion,
) {
  try {
    // Parse the user's input - pass input text and tracker type correctly
    let parsed = await parseRecordFromText(input, tracker.type);

    // Fallback to heuristic parsing if LLM parsing fails
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
      if (!parsed.data.calories) {
        console.log(
          `[Tracker] LLM didn't extract calories, trying heuristic estimates...`,
        );
        const heuristicData = parseFoodHeuristic(input);
        if (heuristicData.calories) {
          parsed.data.calories = heuristicData.calories;
        }
      }
    }

    // VALIDATE: Ensure extracted numbers match the input
    // Extract all numbers from original input
    const inputNumbers = input.match(/\d+/g)?.map(Number) || [];
    if (inputNumbers.length > 0) {
      const extractedValues = Object.values(parsed.data).filter(v => typeof v === 'number');
      // Check if any extracted number is suspiciously different from input
      for (const num of inputNumbers) {
        // If input has "10" and we didn't extract 10, try to fix
        if (!extractedValues.includes(num)) {
          console.log(`[Tracker] LLM may have misparsed: found ${num} in input but not in parsed data`);
          // Let heuristic parser have final say
          if (tracker.type === 'workout') {
            const heuristic = parseWorkoutHeuristic(input);
            if (heuristic.count === num) {
              parsed.data.count = num;
              console.log(`[Tracker] Corrected using heuristic: count = ${num}`);
            }
          } else if (tracker.type === 'nutrition' || tracker.type === 'food') {
            const heuristic = parseFoodHeuristic(input);
            if (heuristic.calories === num) {
              parsed.data.calories = num;
              console.log(`[Tracker] Corrected using heuristic: calories = ${num}`);
            }
          }
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

    const result = store.addRecord(tracker.id, {
      data: parsed.data,
      source: 'natural-language',
    });

    if (result) {
      // Format response with clear, unambiguous values
      const dataEntries = Object.entries(parsed.data)
        .filter(([k, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      // Get timestamp for the entry
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Return a response that clearly states what was logged
      return {
        success: true,
        message: `✓ Logged to **${tracker.displayName}** at ${timestamp}\n\n${dataEntries}`,
      };
    }

    console.error(`[Tracker] Failed to add record`);
    return { success: false, message: null };
  } catch (e) {
    console.error(`[Tracker] Error logging to ${tracker.name}:`, e.message);
    return { success: false, message: null };
  }
}

async function handleTrackQuery(input, tracker, store) {
  const query = new QueryEngine(store);
  const stats = query.getStats(tracker.id);

  if (stats.count === 0) {
    return `No entries logged yet for ${tracker.displayName}.`;
  }

  // Detect time period from user input
  const lower = input.toLowerCase();
  let timePeriod = 'today';
  let startDate = null;

  if (/this week|weekly|past week|last 7 days/i.test(lower)) {
    timePeriod = 'week';
    // Calculate start of week (Monday)
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    startDate = d.toISOString().split('T')[0];
  } else if (/this month|monthly/i.test(lower)) {
    timePeriod = 'month';
    startDate = new Date().toISOString().slice(0, 8) + '01';
  }

  // Get records by the determined time period
  const data = store.getRecordsByDateRange(tracker.id, startDate, null);
  const periodRecords = data.records;

  if (periodRecords.length === 0) {
    return `No entries logged ${timePeriod === 'today' ? 'today' : 'this ' + timePeriod} for ${tracker.displayName}.`;
  }

  const totalCals = periodRecords.reduce(
    (sum, r) => sum + (r.data?.calories || 0),
    0,
  );

  const validRecords = periodRecords.filter((r) => {
    const meal = r.data?.name || r.data?.meal || r.data?.exercise || '';
    return meal && meal.toLowerCase() !== 'no meal mentioned';
  });

  if (validRecords.length === 0) {
    return `No valid entries logged ${timePeriod === 'today' ? 'today' : 'this ' + timePeriod} for ${tracker.displayName}.`;
  }

  if (tracker.type === 'nutrition' || tracker.type === 'food') {
    const entries = validRecords
      .map((r) => {
        const meal = r.data?.name || r.data?.meal || 'Entry';
        const cal = r.data?.calories ? ` (${r.data.calories} cal)` : '';
        const time = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `- ${time}: ${meal}${cal}`;
      })
      .join('\n');

    return (
      `**${tracker.displayName}** ${timePeriod === 'today' ? 'today' : 'this ' + timePeriod}:\n\n` +
      entries +
      `\n\nTotal: ${validRecords.length} entries, ${totalCals.toFixed(0)} calories`
    );
  } else if (tracker.type === 'workout') {
    const entries = validRecords
      .map((r, i) => {
        const exercise = r.data?.exercise || r.data?.name || 'Workout';
        const details = [];
        if (r.data?.count) details.push(`${r.data.count} reps`);
        if (r.data?.duration) details.push(`${r.data.duration} min`);
        if (r.data?.distance) details.push(r.data.distance);
        if (r.data?.sets) details.push(`${r.data.sets} sets`);
        // Format timestamp for the entry
        const time = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const detailStr = details.length > 0 ? ` - ${details.join(', ')}` : '';
        return `- ${time}: ${exercise}${detailStr}`;
      })
      .join('\n');

    return (
      `**${tracker.displayName}** ${timePeriod === 'today' ? 'today' : 'this ' + timePeriod}:\n\n` +
      entries +
      `\n\nTotal: ${validRecords.length} workout entries`
    );
  } else {
    // Generic tracker - show all fields for each entry
    const entries = validRecords
      .map((r, i) => {
        const time = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const fields = Object.entries(r.data)
          .filter(([k, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        return `- ${time}: ${fields || 'No data'}`;
      })
      .join('\n');

    return (
      `**${tracker.displayName}** ${timePeriod === 'today' ? 'today' : 'this ' + timePeriod}:\n\n` +
      entries +
      `\n\nTotal: ${validRecords.length} entries`
    );
  }
}
