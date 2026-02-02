import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', '..', '.static-rebel', 'data');
const CALORIES_FILE = path.join(DATA_DIR, 'calories.json');

let caloriesInstance = null;

/**
 * Get the Calories tracker singleton instance
 */
export async function getCalories() {
  if (!caloriesInstance) {
    caloriesInstance = new CaloriesTracker();
    await caloriesInstance.init();
  }
  return caloriesInstance;
}

/**
 * Calories Tracker System
 * Logs meals, tracks daily totals, and manages calorie goals
 */
export class CaloriesTracker {
  constructor() {
    this.entries = [];
    this.goals = {
      daily: 2000, // Default daily calorie goal
      weekly: null,
    };
  }

  /**
   * Initialize the calories system
   */
  async init() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await this.loadData();
    } catch (error) {
      console.error('Calories init error:', error);
    }
  }

  /**
   * Load all data from disk
   */
  async loadData() {
    try {
      const data = await fs.readFile(CALORIES_FILE, 'utf-8').catch(() => '{}');
      const parsed = JSON.parse(data);
      this.entries = parsed.entries || [];
      this.goals = parsed.goals || { daily: 2000 };
    } catch (error) {
      console.error('Error loading calories data:', error);
      this.entries = [];
      this.goals = { daily: 2000 };
    }
  }

  /**
   * Save all data to disk
   */
  async saveData() {
    try {
      const data = {
        entries: this.entries,
        goals: this.goals
      };
      await fs.writeFile(CALORIES_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving calories data:', error);
    }
  }

  /**
   * Generate a unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get today's date string (YYYY-MM-DD)
   */
  getToday() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Log a meal with calories
   */
  async logMeal({ mealName, calories, mealType = 'snack', notes = '' }) {
    const entry = {
      id: this.generateId(),
      mealName: mealName || 'Unknown meal',
      calories: parseInt(calories) || 0,
      mealType: this.normalizeMealType(mealType),
      notes,
      date: this.getToday(),
      timestamp: new Date().toISOString()
    };

    this.entries.push(entry);
    await this.saveData();
    return entry;
  }

  /**
   * Normalize meal type to standard values
   */
  normalizeMealType(type) {
    const normalized = (type || 'snack').toLowerCase();
    const types = {
      'breakfast': 'breakfast',
      'morning snack': 'snack',
      'lunch': 'lunch',
      'afternoon snack': 'snack',
      'dinner': 'dinner',
      'evening snack': 'snack',
      'snack': 'snack',
    };
    return types[normalized] || 'snack';
  }

  /**
   * Get today's entries
   */
  getTodayEntries() {
    const today = this.getToday();
    return this.entries.filter(e => e.date === today)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get today's total calories
   */
  getTodayTotal() {
    return this.getTodayEntries().reduce((sum, e) => sum + (e.calories || 0), 0);
  }

  /**
   * Get entries for a specific date
   */
  getEntriesByDate(date) {
    return this.entries.filter(e => e.date === date)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get total for a specific date
   */
  getTotalByDate(date) {
    return this.getEntriesByDate(date).reduce((sum, e) => sum + (e.calories || 0), 0);
  }

  /**
   * Get weekly summary
   */
  getWeeklySummary() {
    const days = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const total = this.getTotalByDate(dateStr);
      const entries = this.getEntriesByDate(dateStr).length;

      days.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        total,
        entryCount: entries
      });
    }

    return days;
  }

  /**
   * Get calories stats
   */
  getStats() {
    const todayTotal = this.getTodayTotal();
    const weekly = this.getWeeklySummary();
    const weeklyTotal = weekly.reduce((sum, d) => sum + d.total, 0);
    const avgDaily = weeklyTotal / 7;

    return {
      todayTotal,
      todayGoal: this.goals.daily,
      todayRemaining: Math.max(0, this.goals.daily - todayTotal),
      todayProgress: Math.min(100, (todayTotal / this.goals.daily) * 100),
      weeklyTotal,
      weeklyAverage: avgDaily,
      totalEntries: this.entries.length,
      streakDays: this.calculateStreak()
    };
  }

  /**
   * Calculate current streak (consecutive days with entries)
   */
  calculateStreak() {
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const total = this.getTotalByDate(dateStr);

      if (total > 0) {
        streak++;
      } else if (i > 0) {
        break; // Streak broken
      }
    }

    return streak;
  }

  /**
   * Set daily calorie goal
   */
  async setGoal({ daily = 2000, weekly = null }) {
    this.goals.daily = parseInt(daily) || 2000;
    if (weekly) this.goals.weekly = parseInt(weekly);
    await this.saveData();
    return this.goals;
  }

  /**
   * Delete an entry
   */
  async deleteEntry(entryId) {
    const index = this.entries.findIndex(e => e.id === entryId);
    if (index === -1) {
      throw new Error(`Entry not found: ${entryId}`);
    }

    const entry = this.entries[index];
    this.entries.splice(index, 1);
    await this.saveData();
    return entry;
  }

  /**
   * Get entries by meal type for today
   */
  getByMealType(mealType) {
    const normalized = this.normalizeMealType(mealType);
    return this.getTodayEntries().filter(e => e.mealType === normalized);
  }

  /**
   * Get recent entries (last N entries)
   */
  getRecentEntries(limit = 10) {
    return [...this.entries]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Parse natural language for logging
   * e.g., "400kcal lunch" or "had a 300 calorie breakfast"
   */
  parseFromText(text) {
    // First, extract and store calories information
    const calMatch = text.match(/(\d+)\s*(kcal|cal|calories|cals)/i);
    const calories = calMatch ? parseInt(calMatch[1]) : null;

    // Extract meal type
    const lower = text.toLowerCase();
    let mealType = 'snack';
    if (/\b(breakfast|morning)\b/i.test(lower)) {
      mealType = 'breakfast';
    } else if (/\b(lunch|noon)\b/i.test(lower)) {
      mealType = 'lunch';
    } else if (/\b(dinner|evening|supper)\b/i.test(lower)) {
      mealType = 'dinner';
    }

    // Extract meal name using a simpler, more robust approach
    let mealName = this.extractMealName(text, calories);

    const result = { mealName, calories, mealType };
    return result;
  }

  /**
   * Extract meal name from text using pattern matching
   */
  extractMealName(text, knownCalories) {
    // Split text into words and filter out common patterns
    const words = text.split(/\s+/);
    const filtered = [];

    const skipPatterns = [
      /^i$/i, /^just$/i, /^had$/i, /^ate$/i, /^consumed$/i, /^eaten$/i,
      /^logged$/i, /^tracked$/i, /^note$/i, /^that$/i, /^for$/i,
      /^a$/i, /^an$/i, /^the$/i, /^my$/i, /^track$/i,
      /^lunch$/i, /^dinner$/i, /^breakfast$/i, /^snack$/i,
      /^was$/i, /^is$/i, /^of$/i,
    ];

    let inParen = false;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Handle opening parenthesis - skip everything until closing paren
      if (word.startsWith('(')) {
        inParen = true;
        continue;
      }

      // Handle closing parenthesis
      if (word.endsWith(')')) {
        inParen = false;
        continue;
      }

      // Skip words inside parentheses (calorie info)
      if (inParen) {
        continue;
      }

      // Skip common leading words
      if (skipPatterns.some(p => p.test(word))) {
        continue;
      }

      // Skip calorie-related words/numbers (standalone or with units)
      if (/^(\d+|calories?|cals?|kcal)$/i.test(word)) {
        continue;
      }

      // Skip words that are just punctuation
      if (/^[():,-]+$/.test(word)) {
        continue;
      }

      // Remove trailing punctuation from words
      const cleanWord = word.replace(/[():,-]+$/, '').replace(/^[():,-]+/, '');

      if (cleanWord && !skipPatterns.some(p => p.test(cleanWord))) {
        filtered.push(cleanWord);
      }
    }

    // Reconstruct meal name
    let mealName = filtered.join(' ').trim();

    if (!mealName) return 'Meal';

    return mealName.charAt(0).toUpperCase() + mealName.slice(1);
  }
}

export default { getCalories, CaloriesTracker };
