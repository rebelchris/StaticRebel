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
      if (!createResult.success) {
        return `Failed to create tracker: ${createResult.error}`;
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

// LLM-based intent analyzer for tracking requests
async function analyzeTrackingIntent(
  input,
  existingTrackers,
  getDefaultModel,
  chatCompletion,
) {
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
  "intentType": "create|log|query|none",
  "trackerType": "nutrition|workout|sleep|habit|mood|hydration|medication|custom|unknown",
  "trackerNeeded": "existing_tracker_name or null if needs new tracker",
  "description": "brief description of what to track (for new trackers)",
  "confidence": 0.0-1.0
}

Intent types:
- "create": User explicitly wants to CREATE/ADD/MAKE a new tracker (e.g., "create a tracker for pushups", "add a custom tracker for...", "make a new tracker", "set up tracking for...", "I want to track X" where X is a new category not in existing trackers)
- "log": User wants to record/log actual data to an existing tracker (e.g., "I had coffee", "did a 5k run", "log 50 pushups", "I ate pizza")
- "query": User wants to retrieve/view data (e.g., "what did I eat", "how many calories", "show my workouts")
- "none": Not tracking-related

IMPORTANT: If the user says "add a tracker", "create a tracker", "new tracker", "set up tracking for", or similar phrases about MAKING a tracker, that is "create" intent, NOT "log" intent.`;

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

    // For non-custom trackers, match by type
    if (trackerType !== 'custom' && trackerType !== 'unknown') {
      const existingTracker = trackers.find(
        (t) =>
          t.type === trackerType ||
          (trackerType === 'nutrition' &&
            (t.type === 'food' || t.type === 'nutrition')),
      );

      if (existingTracker) {
        return existingTracker;
      }
    }

    // For custom trackers, try to match by name/description similarity
    if (trackerType === 'custom' && description) {
      const descLower = description.toLowerCase();
      const keywords = descLower.split(/\s+/).filter((w) => w.length > 2);

      // Look for a tracker whose name or displayName contains relevant keywords
      const matchingTracker = trackers.find((t) => {
        const trackerName = (t.name + ' ' + t.displayName).toLowerCase();
        return keywords.some(
          (kw) => trackerName.includes(kw) || descLower.includes(t.name),
        );
      });

      if (matchingTracker) {
        console.log(
          `  \x1b[36m[Matched existing tracker: @${matchingTracker.name}]\x1b[0m`,
        );
        return matchingTracker;
      }
    }

    // Auto-create the tracker if no match found
    console.log(`  \x1b[36m[Auto-creating ${trackerType} tracker...]\x1b[0m`);

    const trackerConfig = await parseTrackerFromNaturalLanguage(description);
    if (!trackerConfig) {
      return null;
    }

    // Check if name already exists
    const nameExists = trackers.find((t) => t.name === trackerConfig.name);
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

  const exerciseMatch = lower.match(
    /(?:did|completed|finished|started)\s+(?:a\s+)?(?:workout of\s+)?(.+)/,
  );
  if (exerciseMatch) {
    data.exercise = exerciseMatch[1].trim();
  } else {
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
    let parsed = await parseRecordFromText(tracker.name, input, tracker.type);

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

  const totalCals = stats.records.reduce(
    (sum, r) => sum + (r.data?.calories || 0),
    0,
  );

  const validRecords = stats.records.filter((r) => {
    const meal = r.data?.name || r.data?.meal || r.data?.exercise || '';
    return meal && meal.toLowerCase() !== 'no meal mentioned';
  });

  if (validRecords.length === 0) {
    return `No valid entries logged today for ${tracker.displayName}.`;
  }

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
