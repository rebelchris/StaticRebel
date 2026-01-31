/**
 * Proactive Nudges - Smart reminders based on behavior patterns
 * 
 * Learns when users typically log entries and suggests timely nudges.
 * - Time-based patterns (usually log water at 9am)
 * - Streak protection (3-day streak about to break)
 * - Gap detection (haven't logged mood today)
 * - Goal nudges (200ml away from daily goal)
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * NudgeEngine - generates contextual nudges based on user patterns
 */
export class NudgeEngine {
  constructor(skillManager, goalTracker, dataDir) {
    this.sm = skillManager;
    this.goals = goalTracker;
    this.patternsFile = path.join(dataDir, '_patterns.json');
    this.patterns = null;
  }

  async init() {
    try {
      const content = await fs.readFile(this.patternsFile, 'utf-8');
      this.patterns = JSON.parse(content);
    } catch {
      this.patterns = { skills: {}, lastAnalyzed: null };
    }
    return this;
  }

  async save() {
    const tempPath = `${this.patternsFile}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.patterns, null, 2));
    await fs.rename(tempPath, this.patternsFile);
  }

  // ============== PATTERN LEARNING ==============

  /**
   * Analyze entries to learn time patterns
   */
  async learnPatterns(skillId) {
    const entries = await this.sm.getEntries(skillId, { sort: 'asc' });
    if (entries.length < 7) return null;

    // Group by hour of day
    const hourCounts = new Array(24).fill(0);
    const dayOfWeekCounts = new Array(7).fill(0);
    
    for (const entry of entries) {
      const date = new Date(entry.timestamp);
      hourCounts[date.getHours()]++;
      dayOfWeekCounts[date.getDay()]++;
    }

    // Find peak hours (top 3)
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(h => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(h => h.hour);

    // Find active days
    const totalEntries = entries.length;
    const activeDays = dayOfWeekCounts
      .map((count, day) => ({ day, ratio: count / totalEntries }))
      .filter(d => d.ratio > 0.1)
      .map(d => d.day);

    // Average entries per day
    const uniqueDays = new Set(entries.map(e => e.date)).size;
    const avgPerDay = entries.length / uniqueDays;

    const pattern = {
      peakHours,
      activeDays,
      avgPerDay: Math.round(avgPerDay * 10) / 10,
      totalEntries: entries.length,
      analyzedAt: Date.now()
    };

    if (!this.patterns.skills[skillId]) {
      this.patterns.skills[skillId] = {};
    }
    this.patterns.skills[skillId].learned = pattern;
    this.patterns.lastAnalyzed = Date.now();
    await this.save();

    return pattern;
  }

  /**
   * Get learned patterns for a skill
   */
  getPatterns(skillId) {
    return this.patterns.skills[skillId]?.learned || null;
  }

  // ============== NUDGE GENERATION ==============

  /**
   * Check if it's a good time to nudge for a skill
   */
  isGoodTimeToNudge(skillId) {
    const pattern = this.getPatterns(skillId);
    if (!pattern) return { good: true, reason: 'no pattern data' };

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    // Check if current hour is in peak hours
    const isInPeakHour = pattern.peakHours.includes(currentHour);
    
    // Check if today is an active day
    const isActiveDay = pattern.activeDays.includes(currentDay);

    if (isInPeakHour && isActiveDay) {
      return { good: true, reason: 'peak time' };
    } else if (isInPeakHour) {
      return { good: true, reason: 'usual hour' };
    } else if (isActiveDay) {
      return { good: false, reason: 'active day but not usual hour' };
    }

    return { good: false, reason: 'not typical time' };
  }

  /**
   * Generate all applicable nudges for current moment
   */
  async generateNudges() {
    const nudges = [];
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    for (const [skillId, skill] of this.sm.skills) {
      if (skillId.startsWith('_')) continue; // Skip meta-skills

      const entries = await this.sm.getEntries(skillId);
      const todayEntries = entries.filter(e => e.date === today);
      const pattern = this.getPatterns(skillId);

      // 1. STREAK PROTECTION
      const streak = this.goals ? await this.checkStreakRisk(skillId, entries, todayEntries) : null;
      if (streak?.atRisk) {
        nudges.push({
          type: 'streak',
          skillId,
          priority: 'high',
          message: `🔥 ${streak.current}-day ${skill.name} streak! Don't forget to log today.`,
          data: streak
        });
      }

      // 2. GOAL PROGRESS
      if (this.goals) {
        const goalNudge = await this.checkGoalProgress(skillId, entries, todayEntries);
        if (goalNudge) {
          nudges.push({
            type: 'goal',
            skillId,
            priority: goalNudge.priority,
            message: goalNudge.message,
            data: goalNudge
          });
        }
      }

      // 3. TIME-BASED (usual time to log)
      if (pattern && pattern.peakHours.includes(currentHour) && todayEntries.length === 0) {
        nudges.push({
          type: 'time',
          skillId,
          priority: 'low',
          message: `⏰ You usually log ${skill.name} around now. How's it going?`,
          data: { hour: currentHour }
        });
      }

      // 4. GAP DETECTION (missed yesterday)
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const yesterdayEntries = entries.filter(e => e.date === yesterdayStr);
      
      if (yesterdayEntries.length === 0 && entries.length > 7 && todayEntries.length === 0) {
        // Had activity before but missed yesterday and today
        nudges.push({
          type: 'gap',
          skillId,
          priority: 'medium',
          message: `📝 Haven't seen ${skill.name} entries lately. Want to log something?`,
          data: { daysMissed: 2 }
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    nudges.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return nudges;
  }

  /**
   * Check if a streak is at risk
   */
  async checkStreakRisk(skillId, entries, todayEntries) {
    if (!this.goals) return null;

    const streak = this.goals.calculateStreak(entries);
    
    if (streak.current >= 3 && todayEntries.length === 0) {
      const now = new Date();
      const hoursLeft = 24 - now.getHours();
      
      return {
        atRisk: true,
        current: streak.current,
        hoursLeft,
        urgency: hoursLeft < 6 ? 'high' : hoursLeft < 12 ? 'medium' : 'low'
      };
    }

    return { atRisk: false, current: streak.current };
  }

  /**
   * Check goal progress and generate nudges
   */
  async checkGoalProgress(skillId, entries, todayEntries) {
    const goal = this.goals.getGoal(skillId);
    if (!goal?.daily) return null;

    const todayTotal = todayEntries.reduce((sum, e) => sum + (parseFloat(e.value) || 0), 0);
    const remaining = goal.daily - todayTotal;
    const percent = Math.round((todayTotal / goal.daily) * 100);

    // Close to goal (80-99%)
    if (percent >= 80 && percent < 100) {
      return {
        priority: 'medium',
        message: `🎯 Almost there! ${remaining}${goal.unit || ''} more to hit your ${skillId} goal.`,
        current: todayTotal,
        target: goal.daily,
        remaining
      };
    }

    // Haven't started and it's afternoon
    const hour = new Date().getHours();
    if (todayTotal === 0 && hour >= 14) {
      return {
        priority: 'low',
        message: `💡 No ${skillId} logged today. Goal: ${goal.daily}${goal.unit || ''}`,
        current: 0,
        target: goal.daily,
        remaining: goal.daily
      };
    }

    return null;
  }

  /**
   * Get a single contextual nudge (for chat integration)
   */
  async getContextualNudge() {
    const nudges = await this.generateNudges();
    
    if (nudges.length === 0) {
      return null;
    }

    // Return highest priority nudge
    return nudges[0];
  }

  /**
   * Get nudges formatted for display
   */
  async getNudgeMessages(limit = 3) {
    const nudges = await this.generateNudges();
    return nudges.slice(0, limit).map(n => n.message);
  }

  /**
   * Should we nudge now? (Avoid over-nudging)
   */
  async shouldNudge(cooldownMinutes = 60) {
    const lastNudge = this.patterns.lastNudge;
    if (!lastNudge) return true;

    const elapsed = Date.now() - lastNudge;
    return elapsed > cooldownMinutes * 60 * 1000;
  }

  /**
   * Mark that we nudged (to avoid over-nudging)
   */
  async markNudged() {
    this.patterns.lastNudge = Date.now();
    await this.save();
  }

  // ============== SMART SUGGESTIONS ==============

  /**
   * Suggest a skill to log based on patterns and gaps
   */
  async suggestSkillToLog() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    const suggestions = [];

    for (const [skillId, skill] of this.sm.skills) {
      if (skillId.startsWith('_')) continue;

      const entries = await this.sm.getEntries(skillId);
      const todayEntries = entries.filter(e => e.date === today);
      const pattern = this.getPatterns(skillId);

      let score = 0;
      const reasons = [];

      // Boost if it's peak hour
      if (pattern?.peakHours.includes(currentHour)) {
        score += 30;
        reasons.push('usual time');
      }

      // Boost if streak at risk
      if (this.goals) {
        const streak = this.goals.calculateStreak(entries);
        if (streak.current >= 3 && todayEntries.length === 0) {
          score += 50;
          reasons.push(`${streak.current}-day streak`);
        }
      }

      // Boost if goal set but not started
      if (this.goals?.getGoal(skillId) && todayEntries.length === 0) {
        score += 20;
        reasons.push('goal set');
      }

      // Slight boost if nothing logged today
      if (todayEntries.length === 0) {
        score += 10;
        reasons.push('not logged today');
      }

      if (score > 0) {
        suggestions.push({
          skillId,
          name: skill.name,
          score,
          reasons
        });
      }
    }

    suggestions.sort((a, b) => b.score - a.score);
    return suggestions[0] || null;
  }
}

export default NudgeEngine;
