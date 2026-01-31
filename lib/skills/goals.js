/**
 * Goals & Streaks - Track progress and gamify skill usage
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * GoalTracker - manages goals and streaks for skills
 */
export class GoalTracker {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.goalsFile = path.join(dataDir, '_goals.json');
    this.goals = null;
  }

  async init() {
    try {
      const content = await fs.readFile(this.goalsFile, 'utf-8');
      this.goals = JSON.parse(content);
    } catch {
      this.goals = { skills: {}, achievements: [] };
    }
    return this;
  }

  async save() {
    const tempPath = `${this.goalsFile}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.goals, null, 2));
    await fs.rename(tempPath, this.goalsFile);
  }

  // ============== GOALS ==============

  /**
   * Set a goal for a skill
   * @param {string} skillId 
   * @param {object} goal - { daily: number, weekly: number, unit: string }
   */
  async setGoal(skillId, goal) {
    if (!this.goals.skills[skillId]) {
      this.goals.skills[skillId] = {};
    }
    this.goals.skills[skillId].goal = {
      ...goal,
      setAt: Date.now()
    };
    await this.save();
    return this.goals.skills[skillId].goal;
  }

  /**
   * Get goal for a skill
   */
  getGoal(skillId) {
    return this.goals.skills[skillId]?.goal || null;
  }

  /**
   * Check progress toward goal
   * @param {string} skillId 
   * @param {array} entries - Entries from SkillManager
   * @param {string} field - Field to sum (default: 'value')
   */
  checkGoalProgress(skillId, entries, field = 'value') {
    const goal = this.getGoal(skillId);
    if (!goal) return null;

    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Daily progress
    const todayEntries = entries.filter(e => e.date === today);
    const todayTotal = todayEntries.reduce((sum, e) => sum + (parseFloat(e[field]) || 0), 0);

    // Weekly progress  
    const weekEntries = entries.filter(e => e.date >= weekStartStr);
    const weekTotal = weekEntries.reduce((sum, e) => sum + (parseFloat(e[field]) || 0), 0);

    const result = {
      goal,
      daily: goal.daily ? {
        target: goal.daily,
        current: todayTotal,
        remaining: Math.max(0, goal.daily - todayTotal),
        percent: Math.min(100, Math.round((todayTotal / goal.daily) * 100)),
        met: todayTotal >= goal.daily
      } : null,
      weekly: goal.weekly ? {
        target: goal.weekly,
        current: weekTotal,
        remaining: Math.max(0, goal.weekly - weekTotal),
        percent: Math.min(100, Math.round((weekTotal / goal.weekly) * 100)),
        met: weekTotal >= goal.weekly
      } : null
    };

    return result;
  }

  // ============== STREAKS ==============

  /**
   * Calculate streak for a skill (consecutive days with entries)
   */
  calculateStreak(entries) {
    if (!entries.length) return { current: 0, longest: 0 };

    // Get unique dates, sorted descending
    const dates = [...new Set(entries.map(e => e.date))].sort().reverse();
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Current streak - must include today or yesterday
    let currentStreak = 0;
    if (dates[0] === today || dates[0] === yesterday) {
      currentStreak = 1;
      let checkDate = new Date(dates[0]);
      
      for (let i = 1; i < dates.length; i++) {
        checkDate.setDate(checkDate.getDate() - 1);
        const expected = checkDate.toISOString().split('T')[0];
        if (dates[i] === expected) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    // Longest streak ever
    let longestStreak = 0;
    let tempStreak = 1;
    const sortedAsc = [...dates].sort();
    
    for (let i = 1; i < sortedAsc.length; i++) {
      const prev = new Date(sortedAsc[i - 1]);
      const curr = new Date(sortedAsc[i]);
      const diffDays = Math.round((curr - prev) / 86400000);
      
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return { current: currentStreak, longest: longestStreak };
  }

  /**
   * Update and check streak, returns milestone if hit
   */
  async updateStreak(skillId, entries) {
    const streak = this.calculateStreak(entries);
    
    if (!this.goals.skills[skillId]) {
      this.goals.skills[skillId] = {};
    }
    
    const prev = this.goals.skills[skillId].streak || { current: 0, longest: 0 };
    this.goals.skills[skillId].streak = streak;
    
    // Check for milestones
    const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 365];
    let newMilestone = null;
    
    for (const m of milestones) {
      if (streak.current >= m && prev.current < m) {
        newMilestone = m;
        await this.addAchievement(skillId, `streak-${m}`, `${m}-day streak`);
      }
    }

    // New longest streak
    if (streak.current > prev.longest) {
      await this.addAchievement(skillId, 'new-record', `New record: ${streak.current} days`);
    }

    await this.save();
    
    return { streak, newMilestone, isRecord: streak.current > prev.longest };
  }

  // ============== ACHIEVEMENTS ==============

  async addAchievement(skillId, type, description) {
    const achievement = {
      id: `${skillId}-${type}-${Date.now()}`,
      skillId,
      type,
      description,
      earnedAt: Date.now()
    };
    
    // Avoid duplicates (same skill + type)
    const exists = this.goals.achievements.some(
      a => a.skillId === skillId && a.type === type
    );
    
    if (!exists) {
      this.goals.achievements.push(achievement);
      await this.save();
      return achievement;
    }
    return null;
  }

  getAchievements(skillId = null) {
    if (skillId) {
      return this.goals.achievements.filter(a => a.skillId === skillId);
    }
    return this.goals.achievements;
  }

  // ============== SUMMARY ==============

  /**
   * Get a full progress summary for a skill
   */
  async getSkillProgress(skillId, entries, field = 'value') {
    const goal = this.checkGoalProgress(skillId, entries, field);
    const streakResult = await this.updateStreak(skillId, entries);
    const achievements = this.getAchievements(skillId);

    return {
      goal,
      streak: streakResult.streak,
      achievements,
      newMilestone: streakResult.newMilestone,
      isNewRecord: streakResult.isRecord
    };
  }
}

export default GoalTracker;
