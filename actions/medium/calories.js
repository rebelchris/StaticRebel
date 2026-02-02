/**
 * Calories Action
 * Log meals, track daily totals, and manage calorie goals
 */

import { getCalories } from '../../lib/skills/calories.js';

export default {
  name: 'calories',
  displayName: 'Calories Tracker',
  description: 'Log meals, track daily calorie intake, and manage nutrition goals',
  category: 'tracking',
  version: '1.0.0',

  intentExamples: [
    // Logging
    'log my calories',
    'I had a meal',
    'I ate lunch',
    'I had breakfast',
    'log dinner',
    'track my food',
    'add a meal',
    'I consumed 400 calories',
    'had 300kcal for breakfast',
    'logging my meal',
    'note that I ate',

    // Querying
    'how many calories today',
    'what did I eat today',
    'show my calories',
    'total calories today',
    'calories so far',
    'what have I eaten',
    'how much have I eaten',
    'breakfast calories',
    'lunch total',

    // Goals
    'set calorie goal',
    'change my calories target',
    'my daily calorie target',
    'calories remaining',

    // Stats
    'weekly calories',
    'calorie stats',
    'calories this week',
    'average calories',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['log', 'query', 'setGoal', 'stats', 'delete'],
      description: 'What to do with calories',
    },
    calories: {
      type: 'number',
      description: 'Number of calories',
      required: false,
    },
    mealType: {
      type: 'enum',
      values: ['breakfast', 'lunch', 'dinner', 'snack'],
      description: 'Type of meal',
      required: false,
    },
  },

  dependencies: [],

  async handler(input, context, params) {
    const caloriesTracker = await getCalories();

    // Determine action from input and params
    const action = determineAction(input, params);

    try {
      switch (action) {
        case 'log':
          return await handleLog(input, caloriesTracker);
        case 'query':
          return await handleQuery(input, caloriesTracker);
        case 'setGoal':
          return await handleSetGoal(input, caloriesTracker);
        case 'stats':
          return await handleStats(caloriesTracker);
        case 'delete':
          return await handleDelete(input, caloriesTracker);
        default:
          return await handleDefault(input, caloriesTracker);
      }
    } catch (error) {
      console.error('Calories action error:', error);
      return `Error: ${error.message}`;
    }
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-02-02',
};

/**
 * Determine the intended action from input and params
 */
function determineAction(input, params) {
  const lower = input.toLowerCase();

  // Explicit actions from params
  if (params?.action) return params.action;

  // Delete patterns
  if (/delete|remove|cancel|undo/i.test(lower)) return 'delete';

  // Goal patterns
  if (/set.*goal|target|limit|change.*calories.*to/i.test(lower)) return 'setGoal';

  // Stats patterns
  if (/stats|summary|weekly|average|streak/i.test(lower)) return 'stats';

  // Query patterns
  if (/\b(how many|total|what did|show me|remaining|left)\b/i.test(lower)) return 'query';

  // Log patterns - statements about eating/having meals
  if (/\b(had|ate|consumed|eaten|logged|tracked|add.*meal|note.*ate)\b/i.test(lower)) return 'log';

  // Default to query if asking about status
  if (/\b(calories|cals|kcal)\b/i.test(lower)) return 'query';

  return 'log';
}

/**
 * Handle logging a meal
 */
async function handleLog(input, tracker) {
  const parsed = tracker.parseFromText(input);

  if (!parsed.calories) {
    // Try to extract number from input
    const numMatch = input.match(/(\d+)/);
    if (numMatch) {
      parsed.calories = parseInt(numMatch[1]);
    }
  }

  if (!parsed.calories) {
    return 'How many calories was that? Please include the calorie amount.';
  }

  if (!parsed.mealName) {
    parsed.mealName = 'Meal';
  }

  const entry = await tracker.logMeal({
    mealName: parsed.mealName,
    calories: parsed.calories,
    mealType: parsed.mealType
  });

  const stats = tracker.getStats();
  const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return `Logged **${entry.mealName}** (${entry.calories} cal) at ${time}\n\n` +
    `**Today:** ${stats.todayTotal} / ${stats.todayGoal} cal ` +
    `(${stats.todayRemaining} remaining)`;
}

/**
 * Handle querying calories
 */
async function handleQuery(input, tracker) {
  const lower = input.toLowerCase();
  const stats = tracker.getStats();

  // Check for specific time periods
  if (/this week|weekly|last 7/i.test(lower)) {
    return formatWeeklySummary(tracker);
  }

  if (/yesterday/i.test(lower)) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    const entries = tracker.getEntriesByDate(dateStr);
    const total = tracker.getTotalByDate(dateStr);

    if (entries.length === 0) {
      return `No entries logged for yesterday.`;
    }

    return formatDaySummary(yesterday.toLocaleDateString('en-US', { weekday: 'long' }), entries, total);
  }

  // Check for meal type specific query
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
  for (const mealType of mealTypes) {
    if (lower.includes(mealType)) {
      const entries = tracker.getByMealType(mealType);
      const total = entries.reduce((sum, e) => sum + e.calories, 0);
      const capitalizedMeal = mealType.charAt(0).toUpperCase() + mealType.slice(1);

      if (entries.length === 0) {
        return `No entries logged for ${mealType} today.`;
      }

      return `${capitalizedMeal} today:\n` +
        entries.map(e => `- ${e.mealName}: ${e.calories} cal`).join('\n') +
        `\n\nTotal: ${total} calories`;
    }
  }

  // Default: show today's summary
  const entries = tracker.getTodayEntries();

  if (entries.length === 0) {
    return `No meals logged today yet.\n\n**Goal:** ${stats.todayGoal} calories\n\nStart logging to track your intake!`;
  }

  const total = stats.todayTotal;
  const remaining = stats.todayRemaining;
  const progressBar = createProgressBar(total, stats.todayGoal);

  return `**Today's Calories** ${progressBar}\n\n` +
    entries.slice(0, 5).map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `- ${time} ${e.mealName}: **${e.calories}** cal`;
    }).join('\n') +
    (entries.length > 5 ? `\n... and ${entries.length - 5} more` : '') +
    `\n\n**Total:** ${total} / ${stats.todayGoal} cal ` +
    (remaining > 0 ? `(${remaining} remaining)` : `(over by ${Math.abs(remaining)})`);
}

/**
 * Handle setting calorie goal
 */
async function handleSetGoal(input, tracker) {
  const numMatch = input.match(/(\d{3,5})/);
  const daily = numMatch ? parseInt(numMatch[1]) : null;

  if (!daily) {
    return 'What would you like to set your daily calorie goal to?';
  }

  await tracker.setGoal({ daily });
  return `Daily calorie goal set to **${daily}** calories.`;
}

/**
 * Handle stats request
 */
async function handleStats(tracker) {
  const stats = tracker.getStats();
  const weekly = tracker.getWeeklySummary();

  return `**Calories Statistics**

**Today:**
- Total: ${stats.todayTotal} / ${stats.todayGoal} cal
- Remaining: ${stats.todayRemaining} cal
- Progress: ${stats.todayProgress.toFixed(0)}%

**This Week:**
- Total: ${stats.weeklyTotal} cal
- Daily Average: ${stats.weeklyAverage.toFixed(0)} cal
- Streak: ${stats.streakDays} day${stats.streakDays !== 1 ? 's' : ''}

**All Time:**
- Total entries: ${stats.totalEntries}
`;
}

/**
 * Handle delete request
 */
async function handleDelete(input, tracker) {
  // Try to find the most recent entry to delete
  const recent = tracker.getRecentEntries(1);

  if (recent.length === 0) {
    return 'No entries to delete.';
  }

  const entry = recent[0];
  await tracker.deleteEntry(entry.id);

  return `Deleted entry: **${entry.mealName}** (${entry.calories} cal)`;
}

/**
 * Handle default case - show today's summary
 */
async function handleDefault(input, tracker) {
  return handleQuery(input, tracker);
}

/**
 * Format weekly summary
 */
function formatWeeklySummary(tracker) {
  const weekly = tracker.getWeeklySummary();
  const stats = tracker.getStats();

  let summary = `**This Week's Calories**\n\n`;

  weekly.forEach(day => {
    const bar = createProgressBar(day.total, stats.todayGoal, 10);
    summary += `${day.dayName}: ${bar} ${day.total} cal\n`;
  });

  summary += `\n**Weekly Total:** ${stats.weeklyTotal} cal`;
  summary += `\n**Daily Average:** ${stats.weeklyAverage.toFixed(0)} cal`;

  return summary;
}

/**
 * Format day summary
 */
function formatDaySummary(dateStr, entries, total) {
  return `**${dateStr}**\n\n` +
    entries.map(e => `- ${e.mealName}: ${e.calories} cal`).join('\n') +
    `\n\n**Total:** ${total} calories`;
}

/**
 * Create a text-based progress bar
 */
function createProgressBar(current, max, length = 15) {
  const percent = Math.min(1, current / max);
  const filled = Math.round(percent * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}
