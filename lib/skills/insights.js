/**
 * Insights Engine - Find patterns and correlations across skills
 * 
 * Analyzes skill data to surface interesting observations:
 * - Cross-skill correlations (mood higher on exercise days)
 * - Day-of-week patterns (water drops on weekends)
 * - Streaks and consistency metrics
 * - Anomaly detection (unusually low/high values)
 */

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
function pearsonCorrelation(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Group entries by date
 */
function groupByDate(entries, field = 'value') {
  const byDate = new Map();
  for (const entry of entries) {
    const date = entry.date;
    if (!byDate.has(date)) {
      byDate.set(date, []);
    }
    byDate.get(date).push(parseFloat(entry[field]) || 0);
  }
  
  // Aggregate to single value per date (sum or average depending on context)
  const result = new Map();
  for (const [date, values] of byDate) {
    result.set(date, values.reduce((a, b) => a + b, 0));
  }
  return result;
}

/**
 * Get day of week distribution
 */
function getDayOfWeekStats(entries, field = 'value') {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = { Sun: [], Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] };
  
  for (const entry of entries) {
    const day = days[new Date(entry.date).getDay()];
    byDay[day].push(parseFloat(entry[field]) || 0);
  }
  
  const stats = {};
  for (const [day, values] of Object.entries(byDay)) {
    if (values.length > 0) {
      stats[day] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    }
  }
  
  return stats;
}

export class InsightsEngine {
  constructor(skillManager) {
    this.sm = skillManager;
  }

  /**
   * Find correlation between two skills
   * @returns {{ correlation: number, interpretation: string, sampleSize: number }}
   */
  async correlateSkills(skillA, fieldA, skillB, fieldB) {
    const entriesA = await this.sm.getEntries(skillA, { sort: 'asc' });
    const entriesB = await this.sm.getEntries(skillB, { sort: 'asc' });
    
    const byDateA = groupByDate(entriesA, fieldA);
    const byDateB = groupByDate(entriesB, fieldB);
    
    // Find common dates
    const commonDates = [...byDateA.keys()].filter(d => byDateB.has(d));
    
    if (commonDates.length < 5) {
      return { 
        correlation: null, 
        interpretation: 'Not enough overlapping data (need 5+ days)',
        sampleSize: commonDates.length
      };
    }
    
    const valuesA = commonDates.map(d => byDateA.get(d));
    const valuesB = commonDates.map(d => byDateB.get(d));
    
    const r = pearsonCorrelation(valuesA, valuesB);
    
    let interpretation;
    if (r === null) {
      interpretation = 'Could not calculate correlation';
    } else if (r > 0.7) {
      interpretation = 'Strong positive correlation';
    } else if (r > 0.4) {
      interpretation = 'Moderate positive correlation';
    } else if (r > 0.2) {
      interpretation = 'Weak positive correlation';
    } else if (r > -0.2) {
      interpretation = 'No significant correlation';
    } else if (r > -0.4) {
      interpretation = 'Weak negative correlation';
    } else if (r > -0.7) {
      interpretation = 'Moderate negative correlation';
    } else {
      interpretation = 'Strong negative correlation';
    }
    
    return {
      correlation: r ? Math.round(r * 100) / 100 : null,
      interpretation,
      sampleSize: commonDates.length
    };
  }

  /**
   * Compare a skill on days with vs without another skill activity
   */
  async compareWithActivity(targetSkill, targetField, activitySkill) {
    const targetEntries = await this.sm.getEntries(targetSkill, { sort: 'asc' });
    const activityEntries = await this.sm.getEntries(activitySkill, { sort: 'asc' });
    
    const activityDates = new Set(activityEntries.map(e => e.date));
    const targetByDate = groupByDate(targetEntries, targetField);
    
    const withActivity = [];
    const withoutActivity = [];
    
    for (const [date, value] of targetByDate) {
      if (activityDates.has(date)) {
        withActivity.push(value);
      } else {
        withoutActivity.push(value);
      }
    }
    
    if (withActivity.length < 3 || withoutActivity.length < 3) {
      return {
        insight: null,
        reason: 'Not enough data to compare'
      };
    }
    
    const avgWith = withActivity.reduce((a, b) => a + b, 0) / withActivity.length;
    const avgWithout = withoutActivity.reduce((a, b) => a + b, 0) / withoutActivity.length;
    const diff = avgWith - avgWithout;
    const percentDiff = Math.round((diff / avgWithout) * 100);
    
    return {
      withActivity: { count: withActivity.length, avg: Math.round(avgWith * 10) / 10 },
      withoutActivity: { count: withoutActivity.length, avg: Math.round(avgWithout * 10) / 10 },
      difference: Math.round(diff * 10) / 10,
      percentDiff,
      insight: percentDiff > 10 
        ? `${targetSkill} is ${percentDiff}% higher on days with ${activitySkill}`
        : percentDiff < -10
        ? `${targetSkill} is ${Math.abs(percentDiff)}% lower on days with ${activitySkill}`
        : `No significant difference in ${targetSkill} based on ${activitySkill}`
    };
  }

  /**
   * Find day-of-week patterns for a skill
   */
  async dayOfWeekPattern(skillId, field = 'value') {
    const entries = await this.sm.getEntries(skillId, { sort: 'asc' });
    const stats = getDayOfWeekStats(entries, field);
    
    const days = Object.entries(stats);
    if (days.length < 3) {
      return { patterns: [], reason: 'Not enough data' };
    }
    
    const avgValues = days.map(([_, s]) => s.avg);
    const overallAvg = avgValues.reduce((a, b) => a + b, 0) / avgValues.length;
    
    const patterns = [];
    
    // Find highs and lows
    const sorted = [...days].sort((a, b) => b[1].avg - a[1].avg);
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    
    if (highest[1].avg > overallAvg * 1.2) {
      patterns.push({
        type: 'high',
        day: highest[0],
        value: Math.round(highest[1].avg),
        percent: Math.round((highest[1].avg / overallAvg - 1) * 100)
      });
    }
    
    if (lowest[1].avg < overallAvg * 0.8) {
      patterns.push({
        type: 'low',
        day: lowest[0],
        value: Math.round(lowest[1].avg),
        percent: Math.round((1 - lowest[1].avg / overallAvg) * 100)
      });
    }
    
    // Weekend vs weekday
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      .filter(d => stats[d])
      .map(d => stats[d].avg);
    const weekend = ['Sat', 'Sun']
      .filter(d => stats[d])
      .map(d => stats[d].avg);
    
    if (weekday.length >= 3 && weekend.length >= 1) {
      const weekdayAvg = weekday.reduce((a, b) => a + b, 0) / weekday.length;
      const weekendAvg = weekend.reduce((a, b) => a + b, 0) / weekend.length;
      const diff = Math.round((weekendAvg / weekdayAvg - 1) * 100);
      
      if (Math.abs(diff) > 15) {
        patterns.push({
          type: 'weekend',
          direction: diff > 0 ? 'higher' : 'lower',
          percent: Math.abs(diff)
        });
      }
    }
    
    return { stats, patterns };
  }

  /**
   * Detect anomalies (values significantly different from normal)
   */
  async detectAnomalies(skillId, field = 'value', threshold = 2) {
    const entries = await this.sm.getEntries(skillId, { sort: 'asc' });
    if (entries.length < 10) {
      return { anomalies: [], reason: 'Not enough data (need 10+)' };
    }
    
    const values = entries.map(e => parseFloat(e[field]) || 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    const anomalies = entries.filter(e => {
      const val = parseFloat(e[field]) || 0;
      const zScore = Math.abs((val - mean) / stdDev);
      return zScore > threshold;
    }).map(e => ({
      date: e.date,
      value: parseFloat(e[field]),
      direction: parseFloat(e[field]) > mean ? 'high' : 'low'
    }));
    
    return {
      mean: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10,
      anomalies
    };
  }

  /**
   * Calculate consistency score (how regularly the skill is used)
   */
  async consistencyScore(skillId, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    const entries = await this.sm.getEntries(skillId, { 
      since: since.toISOString().split('T')[0] 
    });
    
    const uniqueDays = new Set(entries.map(e => e.date)).size;
    const score = Math.round((uniqueDays / days) * 100);
    
    let grade;
    if (score >= 90) grade = 'Excellent';
    else if (score >= 70) grade = 'Good';
    else if (score >= 50) grade = 'Fair';
    else if (score >= 30) grade = 'Needs work';
    else grade = 'Just starting';
    
    return {
      daysActive: uniqueDays,
      totalDays: days,
      score,
      grade
    };
  }

  /**
   * Generate a full insights report for a skill
   */
  async generateReport(skillId, field = 'value') {
    const report = {
      skill: skillId,
      generated: new Date().toISOString(),
      sections: {}
    };
    
    // Consistency
    report.sections.consistency = await this.consistencyScore(skillId);
    
    // Day patterns
    report.sections.dayPatterns = await this.dayOfWeekPattern(skillId, field);
    
    // Anomalies
    report.sections.anomalies = await this.detectAnomalies(skillId, field);
    
    return report;
  }

  /**
   * Get natural language insights
   */
  async getInsightMessages(skillId, field = 'value') {
    const messages = [];
    
    // Day patterns
    const dayPatterns = await this.dayOfWeekPattern(skillId, field);
    for (const p of dayPatterns.patterns || []) {
      if (p.type === 'high') {
        messages.push(`📈 ${skillId} peaks on ${p.day}s (${p.percent}% above average)`);
      } else if (p.type === 'low') {
        messages.push(`📉 ${skillId} dips on ${p.day}s (${p.percent}% below average)`);
      } else if (p.type === 'weekend') {
        messages.push(`🗓️ ${skillId} is ${p.percent}% ${p.direction} on weekends`);
      }
    }
    
    // Consistency
    const consistency = await this.consistencyScore(skillId);
    if (consistency.score >= 80) {
      messages.push(`⭐ Great consistency! Active ${consistency.daysActive}/${consistency.totalDays} days`);
    } else if (consistency.score < 50) {
      messages.push(`💡 Tip: Try logging ${skillId} more regularly for better insights`);
    }
    
    return messages;
  }

  /**
   * Cross-skill insight generation
   */
  async getCrossSkillInsights() {
    const insights = [];
    const skills = [...this.sm.skills.keys()].filter(s => !s.startsWith('_'));
    
    // Common correlations to check
    const checks = [
      { target: 'mood', field: 'score', activity: 'exercise' },
      { target: 'mood', field: 'score', activity: 'water' },
    ];
    
    for (const check of checks) {
      if (skills.includes(check.target) && skills.includes(check.activity)) {
        const result = await this.compareWithActivity(
          check.target, check.field, check.activity
        );
        if (result.insight && !result.insight.includes('No significant')) {
          insights.push(result.insight);
        }
      }
    }
    
    return insights;
  }
}

export default InsightsEngine;
