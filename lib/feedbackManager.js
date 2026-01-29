/**
 * Feedback Manager - User feedback collection and analytics
 * Handles 👍/👎 ratings and response improvement tracking
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const FEEDBACK_DIR = path.join(os.homedir(), '.static-rebel', 'feedback');
const FEEDBACK_LOG_FILE = path.join(FEEDBACK_DIR, 'feedback-log.json');
const ANALYTICS_FILE = path.join(FEEDBACK_DIR, 'analytics.json');

/**
 * Initialize feedback system
 */
export function initFeedbackManager() {
  if (!fs.existsSync(FEEDBACK_DIR)) {
    fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  }

  if (!fs.existsSync(FEEDBACK_LOG_FILE)) {
    fs.writeFileSync(
      FEEDBACK_LOG_FILE,
      JSON.stringify({ entries: [] }, null, 2),
    );
  }

  if (!fs.existsSync(ANALYTICS_FILE)) {
    fs.writeFileSync(
      ANALYTICS_FILE,
      JSON.stringify(
        {
          totalFeedback: 0,
          positiveCount: 0,
          negativeCount: 0,
          byCategory: {},
          byIntent: {},
          trends: [],
        },
        null,
        2,
      ),
    );
  }
}

/**
 * Log feedback entry
 */
export function logFeedback(feedback) {
  const entry = {
    id: `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    ...feedback,
  };

  try {
    const data = JSON.parse(fs.readFileSync(FEEDBACK_LOG_FILE, 'utf-8'));
    data.entries.push(entry);

    // Keep only last 1000 entries
    if (data.entries.length > 1000) {
      data.entries = data.entries.slice(-1000);
    }

    fs.writeFileSync(FEEDBACK_LOG_FILE, JSON.stringify(data, null, 2));

    // Update analytics
    updateAnalytics(entry);

    return entry;
  } catch (e) {
    console.error('Failed to log feedback:', e.message);
    return null;
  }
}

/**
 * Update analytics based on feedback
 */
function updateAnalytics(entry) {
  try {
    const analytics = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));

    analytics.totalFeedback++;

    if (entry.rating === '👍') {
      analytics.positiveCount++;
    } else if (entry.rating === '👎') {
      analytics.negativeCount++;
    }

    // Track by category
    if (entry.category) {
      analytics.byCategory[entry.category] = analytics.byCategory[
        entry.category
      ] || { positive: 0, negative: 0 };
      analytics.byCategory[entry.category][
        entry.rating === '👍' ? 'positive' : 'negative'
      ]++;
    }

    // Track by intent
    if (entry.intent) {
      analytics.byIntent[entry.intent] = analytics.byIntent[entry.intent] || {
        positive: 0,
        negative: 0,
      };
      analytics.byIntent[entry.intent][
        entry.rating === '👍' ? 'positive' : 'negative'
      ]++;
    }

    // Add to trends (last 30 days)
    const today = new Date().toISOString().split('T')[0];
    const todayTrend = analytics.trends.find((t) => t.date === today);

    if (todayTrend) {
      todayTrend[entry.rating === '👍' ? 'positive' : 'negative']++;
    } else {
      analytics.trends.push({
        date: today,
        positive: entry.rating === '👍' ? 1 : 0,
        negative: entry.rating === '👎' ? 1 : 0,
      });
    }

    // Keep only last 30 days of trends
    if (analytics.trends.length > 30) {
      analytics.trends = analytics.trends.slice(-30);
    }

    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
  } catch (e) {
    console.error('Failed to update analytics:', e.message);
  }
}

/**
 * Get feedback analytics
 */
export function getFeedbackAnalytics() {
  try {
    return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
  } catch (e) {
    return {
      totalFeedback: 0,
      positiveCount: 0,
      negativeCount: 0,
      byCategory: {},
      byIntent: {},
      trends: [],
    };
  }
}

/**
 * Get recent feedback entries
 */
export function getRecentFeedback(count = 50) {
  try {
    const data = JSON.parse(fs.readFileSync(FEEDBACK_LOG_FILE, 'utf-8'));
    return data.entries.slice(-count);
  } catch (e) {
    return [];
  }
}

/**
 * Get feedback for a specific interaction
 */
export function getFeedbackForInteraction(interactionId) {
  try {
    const data = JSON.parse(fs.readFileSync(FEEDBACK_LOG_FILE, 'utf-8'));
    return data.entries.find((e) => e.interactionId === interactionId);
  } catch (e) {
    return null;
  }
}

/**
 * Get low-rated responses for improvement
 */
export function getLowRatedResponses(count = 10) {
  try {
    const data = JSON.parse(fs.readFileSync(FEEDBACK_LOG_FILE, 'utf-8'));
    return data.entries.filter((e) => e.rating === '👎').slice(-count);
  } catch (e) {
    return [];
  }
}

/**
 * Get improvement suggestions based on feedback
 */
export function getImprovementSuggestions() {
  const analytics = getFeedbackAnalytics();
  const suggestions = [];

  // Check for problematic intents
  Object.entries(analytics.byIntent || {}).forEach(([intent, stats]) => {
    const total = stats.positive + stats.negative;
    if (total > 5 && stats.negative / total > 0.3) {
      suggestions.push({
        type: 'intent',
        target: intent,
        issue: 'High negative feedback rate',
        rate: ((stats.negative / total) * 100).toFixed(1) + '%',
        recommendation: 'Review prompts and examples for this intent',
      });
    }
  });

  // Check for problematic categories
  Object.entries(analytics.byCategory || {}).forEach(([category, stats]) => {
    const total = stats.positive + stats.negative;
    if (total > 5 && stats.negative / total > 0.3) {
      suggestions.push({
        type: 'category',
        target: category,
        issue: 'High negative feedback rate',
        rate: ((stats.negative / total) * 100).toFixed(1) + '%',
        recommendation: 'Consider improving handling for this category',
      });
    }
  });

  return suggestions;
}

/**
 * Generate feedback summary report
 */
export function generateFeedbackReport() {
  const analytics = getFeedbackAnalytics();
  const recent = getRecentFeedback(20);

  const positiveRate =
    analytics.totalFeedback > 0
      ? ((analytics.positiveCount / analytics.totalFeedback) * 100).toFixed(1)
      : 0;

  return {
    summary: {
      totalFeedback: analytics.totalFeedback,
      positiveRate: `${positiveRate}%`,
      recentTrend: analytics.trends.slice(-7),
    },
    topIssues: getImprovementSuggestions().slice(0, 5),
    recentFeedback: recent,
  };
}

/**
 * Clear all feedback data
 */
export function clearFeedbackData() {
  try {
    fs.writeFileSync(
      FEEDBACK_LOG_FILE,
      JSON.stringify({ entries: [] }, null, 2),
    );
    fs.writeFileSync(
      ANALYTICS_FILE,
      JSON.stringify(
        {
          totalFeedback: 0,
          positiveCount: 0,
          negativeCount: 0,
          byCategory: {},
          byIntent: {},
          trends: [],
        },
        null,
        2,
      ),
    );
    return true;
  } catch (e) {
    console.error('Failed to clear feedback:', e.message);
    return false;
  }
}
