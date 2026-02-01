/**
 * StaticRebel Analytics and Reporting System
 * 
 * Features:
 * - Daily summary reports
 * - Weekly analytics
 * - Monthly reviews
 * - Year in review
 * - Completion rates
 * - Streak analysis
 * - Trend detection
 * - Skill correlations
 * - Best/worst days analysis
 * - Multiple output formats (Terminal, Markdown, HTML, PDF)
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import {
  createBarChart,
  createLineChart,
  createSparkline,
  createTable,
  createProgressBar,
  createDashboard,
  createMetricCards
} from './terminalCharts.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const GOALS_FILE = path.join(DATA_DIR, '_goals.json');
const SKILL_LOGS_FILE = path.join(DATA_DIR, 'skill-logs.json');
const TRACKERS_DIR = path.join(os.homedir(), '.static-rebel', 'trackers');
const TRACKERS_REGISTRY = path.join(TRACKERS_DIR, 'trackers.json');

// ============================================================================
// Data Loading Utilities
// ============================================================================

async function loadSkillLogs() {
  try {
    const content = await fs.readFile(SKILL_LOGS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('No skill logs found, returning empty array');
    return [];
  }
}

async function loadGoals() {
  try {
    const content = await fs.readFile(GOALS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('No goals found, returning empty object');
    return { skills: {}, achievements: [] };
  }
}

async function loadTrackers() {
  try {
    const content = await fs.readFile(TRACKERS_REGISTRY, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('No trackers found, returning empty object');
    return { trackers: [] };
  }
}

async function loadTrackerRecords(trackerId) {
  try {
    const recordsFile = path.join(TRACKERS_DIR, `${trackerId}.json`);
    const content = await fs.readFile(recordsFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return { records: [] };
  }
}

// ============================================================================
// Date Utilities
// ============================================================================

function getDateRange(period, referenceDate = new Date()) {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);
  
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  
  switch (period) {
    case 'daily':
      break; // start and end are already set to today
    
    case 'weekly':
      start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
      end.setDate(start.getDate() + 6); // End of week (Saturday)
      break;
    
    case 'monthly':
      start.setDate(1); // Start of month
      end.setMonth(end.getMonth() + 1);
      end.setDate(0); // Last day of month
      break;
    
    case 'yearly':
      start.setMonth(0, 1); // January 1st
      end.setMonth(11, 31); // December 31st
      break;
  }
  
  return { start, end };
}

function isDateInRange(date, start, end) {
  const d = new Date(date);
  return d >= start && d <= end;
}

function formatDateRange(start, end, period) {
  const options = { 
    year: 'numeric', 
    month: period === 'yearly' ? undefined : 'long', 
    day: period === 'yearly' ? undefined : 'numeric' 
  };
  
  if (period === 'daily') {
    return start.toLocaleDateString('en-US', options);
  } else if (period === 'yearly') {
    return start.getFullYear().toString();
  } else {
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  }
}

// ============================================================================
// Analytics Calculation Functions
// ============================================================================

function calculateCompletionRates(logs, goals, period) {
  const { start, end } = getDateRange(period);
  const filteredLogs = logs.filter(log => isDateInRange(log.timestamp, start, end));
  
  const skillStats = {};
  
  // Initialize stats for all skills with goals
  Object.keys(goals.skills).forEach(skill => {
    skillStats[skill] = {
      completed: 0,
      total: 0,
      goal: goals.skills[skill].goal,
      completionRate: 0
    };
  });
  
  // Count completions
  filteredLogs.forEach(log => {
    const skill = log.skill_id;
    if (skillStats[skill]) {
      skillStats[skill].completed++;
    }
  });
  
  // Calculate expected total based on period and daily goals
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  Object.keys(skillStats).forEach(skill => {
    const dailyGoal = skillStats[skill].goal?.daily || 1;
    skillStats[skill].total = dailyGoal * days;
    skillStats[skill].completionRate = skillStats[skill].total > 0 ? 
      (skillStats[skill].completed / skillStats[skill].total * 100) : 0;
  });
  
  return skillStats;
}

function calculateStreaks(logs) {
  const skillStreaks = {};
  
  // Group logs by skill and date
  const skillDates = {};
  logs.forEach(log => {
    const skill = log.skill_id;
    const date = new Date(log.timestamp).toDateString();
    
    if (!skillDates[skill]) {
      skillDates[skill] = new Set();
    }
    skillDates[skill].add(date);
  });
  
  // Calculate streaks for each skill
  Object.keys(skillDates).forEach(skill => {
    const dates = Array.from(skillDates[skill]).sort((a, b) => new Date(a) - new Date(b));
    let currentStreak = 0;
    let longestStreak = 0;
    let lastDate = null;
    
    dates.forEach(dateStr => {
      const date = new Date(dateStr);
      
      if (lastDate) {
        const daysDiff = (date - lastDate) / (1000 * 60 * 60 * 24);
        if (daysDiff === 1) {
          currentStreak++;
        } else {
          currentStreak = 1;
        }
      } else {
        currentStreak = 1;
      }
      
      longestStreak = Math.max(longestStreak, currentStreak);
      lastDate = date;
    });
    
    skillStreaks[skill] = {
      current: isToday(lastDate) ? currentStreak : 0,
      longest: longestStreak,
      totalActiveDays: dates.length
    };
  });
  
  return skillStreaks;
}

function isToday(date) {
  if (!date) return false;
  const today = new Date();
  const checkDate = new Date(date);
  return checkDate.toDateString() === today.toDateString();
}

function detectTrends(logs, period = 'weekly') {
  const trends = {};
  const { start, end } = getDateRange(period);
  
  // Group data by weeks
  const weeklyData = {};
  logs.forEach(log => {
    if (!isDateInRange(log.timestamp, start, end)) return;
    
    const date = new Date(log.timestamp);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = {};
    }
    
    const skill = log.skill_id;
    weeklyData[weekKey][skill] = (weeklyData[weekKey][skill] || 0) + 1;
  });
  
  // Calculate trends for each skill
  const weeks = Object.keys(weeklyData).sort();
  if (weeks.length < 2) return trends;
  
  const skillNames = new Set();
  Object.values(weeklyData).forEach(week => {
    Object.keys(week).forEach(skill => skillNames.add(skill));
  });
  
  skillNames.forEach(skill => {
    const values = weeks.map(week => weeklyData[week][skill] || 0);
    const trend = calculateTrendDirection(values);
    
    trends[skill] = {
      direction: trend.direction,
      percentage: trend.percentage,
      weeklyData: values
    };
  });
  
  return trends;
}

function calculateTrendDirection(values) {
  if (values.length < 2) return { direction: 'stable', percentage: 0 };
  
  const first = values.slice(0, Math.ceil(values.length / 2)).reduce((a, b) => a + b, 0);
  const second = values.slice(Math.floor(values.length / 2)).reduce((a, b) => a + b, 0);
  
  const firstAvg = first / Math.ceil(values.length / 2);
  const secondAvg = second / Math.ceil(values.length / 2);
  
  if (firstAvg === 0 && secondAvg === 0) return { direction: 'stable', percentage: 0 };
  if (firstAvg === 0) return { direction: 'increasing', percentage: 100 };
  
  const change = ((secondAvg - firstAvg) / firstAvg) * 100;
  
  let direction = 'stable';
  if (change > 5) direction = 'increasing';
  else if (change < -5) direction = 'decreasing';
  
  return { direction, percentage: Math.abs(change) };
}

function findSkillCorrelations(logs, period = 'monthly') {
  const { start, end } = getDateRange(period);
  const filteredLogs = logs.filter(log => isDateInRange(log.timestamp, start, end));
  
  // Group by date
  const dailyActivity = {};
  filteredLogs.forEach(log => {
    const date = new Date(log.timestamp).toDateString();
    if (!dailyActivity[date]) {
      dailyActivity[date] = {};
    }
    const skill = log.skill_id;
    dailyActivity[date][skill] = (dailyActivity[date][skill] || 0) + 1;
  });
  
  const skills = [...new Set(filteredLogs.map(log => log.skill_id))];
  const correlations = [];
  
  // Calculate correlations between all pairs of skills
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const skill1 = skills[i];
      const skill2 = skills[j];
      
      const correlation = calculateCorrelation(skill1, skill2, dailyActivity);
      if (Math.abs(correlation) > 0.3) { // Only show meaningful correlations
        correlations.push({
          skill1,
          skill2,
          correlation: Math.round(correlation * 100) / 100,
          strength: Math.abs(correlation) > 0.7 ? 'strong' : 'moderate'
        });
      }
    }
  }
  
  return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

function calculateCorrelation(skill1, skill2, dailyActivity) {
  const dates = Object.keys(dailyActivity);
  const x = dates.map(date => dailyActivity[date][skill1] || 0);
  const y = dates.map(date => dailyActivity[date][skill2] || 0);
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

function analyzeBestWorstDays(logs, period = 'monthly') {
  const { start, end } = getDateRange(period);
  const filteredLogs = logs.filter(log => isDateInRange(log.timestamp, start, end));
  
  // Group by date and day of week
  const dailyStats = {};
  const dayOfWeekStats = {
    0: { name: 'Sunday', total: 0, count: 0 },
    1: { name: 'Monday', total: 0, count: 0 },
    2: { name: 'Tuesday', total: 0, count: 0 },
    3: { name: 'Wednesday', total: 0, count: 0 },
    4: { name: 'Thursday', total: 0, count: 0 },
    5: { name: 'Friday', total: 0, count: 0 },
    6: { name: 'Saturday', total: 0, count: 0 }
  };
  
  filteredLogs.forEach(log => {
    const date = new Date(log.timestamp);
    const dateKey = date.toDateString();
    const dayOfWeek = date.getDay();
    
    dailyStats[dateKey] = (dailyStats[dateKey] || 0) + 1;
    dayOfWeekStats[dayOfWeek].total++;
  });
  
  // Calculate averages for days of week
  Object.keys(dayOfWeekStats).forEach(day => {
    const stats = dayOfWeekStats[day];
    // Count how many times this day occurred in the period
    const occurrences = Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 7));
    stats.count = Math.max(1, occurrences);
    stats.average = stats.total / stats.count;
  });
  
  // Find best and worst individual days
  const sortedDays = Object.entries(dailyStats)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.count - a.count);
  
  const bestDays = sortedDays.slice(0, 3);
  const worstDays = sortedDays.slice(-3).reverse();
  
  // Find best and worst days of week
  const sortedDayOfWeek = Object.values(dayOfWeekStats)
    .sort((a, b) => b.average - a.average);
  
  return {
    bestIndividualDays: bestDays,
    worstIndividualDays: worstDays,
    bestDayOfWeek: sortedDayOfWeek[0],
    worstDayOfWeek: sortedDayOfWeek[6],
    dayOfWeekAverages: sortedDayOfWeek
  };
}

// ============================================================================
// Report Generation Functions
// ============================================================================

export async function generateDailyReport(date = new Date()) {
  const logs = await loadSkillLogs();
  const goals = await loadGoals();
  
  const completionRates = calculateCompletionRates(logs, goals, 'daily');
  const streaks = calculateStreaks(logs);
  
  const { start, end } = getDateRange('daily', date);
  const todayLogs = logs.filter(log => isDateInRange(log.timestamp, start, end));
  
  return {
    type: 'daily',
    date: formatDateRange(start, end, 'daily'),
    summary: {
      totalActivities: todayLogs.length,
      skillsEngaged: new Set(todayLogs.map(log => log.skill_id)).size,
      completionRates,
      streaks
    },
    details: {
      activities: todayLogs,
      hourlyDistribution: calculateHourlyDistribution(todayLogs)
    }
  };
}

export async function generateWeeklyReport(date = new Date()) {
  const logs = await loadSkillLogs();
  const goals = await loadGoals();
  
  const completionRates = calculateCompletionRates(logs, goals, 'weekly');
  const streaks = calculateStreaks(logs);
  const trends = detectTrends(logs, 'weekly');
  const correlations = findSkillCorrelations(logs, 'weekly');
  
  const { start, end } = getDateRange('weekly', date);
  const weekLogs = logs.filter(log => isDateInRange(log.timestamp, start, end));
  
  return {
    type: 'weekly',
    dateRange: formatDateRange(start, end, 'weekly'),
    summary: {
      totalActivities: weekLogs.length,
      skillsEngaged: new Set(weekLogs.map(log => log.skill_id)).size,
      completionRates,
      streaks,
      trends
    },
    insights: {
      correlations: correlations.slice(0, 5),
      dailyDistribution: calculateDailyDistribution(weekLogs)
    }
  };
}

export async function generateMonthlyReport(date = new Date()) {
  const logs = await loadSkillLogs();
  const goals = await loadGoals();
  
  const completionRates = calculateCompletionRates(logs, goals, 'monthly');
  const streaks = calculateStreaks(logs);
  const trends = detectTrends(logs, 'monthly');
  const correlations = findSkillCorrelations(logs, 'monthly');
  const bestWorstDays = analyzeBestWorstDays(logs, 'monthly');
  
  const { start, end } = getDateRange('monthly', date);
  const monthLogs = logs.filter(log => isDateInRange(log.timestamp, start, end));
  
  return {
    type: 'monthly',
    dateRange: formatDateRange(start, end, 'monthly'),
    summary: {
      totalActivities: monthLogs.length,
      skillsEngaged: new Set(monthLogs.map(log => log.skill_id)).size,
      completionRates,
      streaks,
      trends
    },
    insights: {
      correlations: correlations.slice(0, 10),
      bestWorstDays,
      weeklyProgress: calculateWeeklyProgress(monthLogs, start, end)
    }
  };
}

export async function generateYearlyReport(date = new Date()) {
  const logs = await loadSkillLogs();
  const goals = await loadGoals();
  
  const completionRates = calculateCompletionRates(logs, goals, 'yearly');
  const streaks = calculateStreaks(logs);
  const trends = detectTrends(logs, 'yearly');
  const correlations = findSkillCorrelations(logs, 'yearly');
  const bestWorstDays = analyzeBestWorstDays(logs, 'yearly');
  
  const { start, end } = getDateRange('yearly', date);
  const yearLogs = logs.filter(log => isDateInRange(log.timestamp, start, end));
  
  return {
    type: 'yearly',
    dateRange: formatDateRange(start, end, 'yearly'),
    summary: {
      totalActivities: yearLogs.length,
      skillsEngaged: new Set(yearLogs.map(log => log.skill_id)).size,
      totalDaysActive: new Set(yearLogs.map(log => new Date(log.timestamp).toDateString())).size,
      completionRates,
      streaks,
      trends
    },
    insights: {
      correlations,
      bestWorstDays,
      monthlyProgress: calculateMonthlyProgress(yearLogs, start, end),
      achievements: goals.achievements || [],
      topSkills: calculateTopSkills(yearLogs)
    }
  };
}

// ============================================================================
// Helper Analysis Functions
// ============================================================================

function calculateHourlyDistribution(logs) {
  const hours = {};
  for (let i = 0; i < 24; i++) {
    hours[i] = 0;
  }
  
  logs.forEach(log => {
    const hour = new Date(log.timestamp).getHours();
    hours[hour]++;
  });
  
  return hours;
}

function calculateDailyDistribution(logs) {
  const days = {};
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  dayNames.forEach((day, index) => {
    days[day] = 0;
  });
  
  logs.forEach(log => {
    const dayName = dayNames[new Date(log.timestamp).getDay()];
    days[dayName]++;
  });
  
  return days;
}

function calculateWeeklyProgress(logs, start, end) {
  const weeks = {};
  const current = new Date(start);
  
  while (current <= end) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const weekKey = `Week ${Math.ceil((current - start) / (1000 * 60 * 60 * 24 * 7)) + 1}`;
    const weekLogs = logs.filter(log => {
      const date = new Date(log.timestamp);
      return date >= weekStart && date <= weekEnd;
    });
    
    weeks[weekKey] = weekLogs.length;
    current.setDate(current.getDate() + 7);
  }
  
  return weeks;
}

function calculateMonthlyProgress(logs, start, end) {
  const months = {};
  const current = new Date(start);
  
  while (current.getFullYear() === start.getFullYear() && current <= end) {
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    
    const monthName = monthStart.toLocaleDateString('en-US', { month: 'long' });
    const monthLogs = logs.filter(log => {
      const date = new Date(log.timestamp);
      return date >= monthStart && date <= monthEnd;
    });
    
    months[monthName] = monthLogs.length;
    current.setMonth(current.getMonth() + 1);
  }
  
  return months;
}

function calculateTopSkills(logs) {
  const skillCounts = {};
  
  logs.forEach(log => {
    skillCounts[log.skill_id] = (skillCounts[log.skill_id] || 0) + 1;
  });
  
  return Object.entries(skillCounts)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// ============================================================================
// Output Formatters
// ============================================================================

export function formatReportAsTerminal(report) {
  const sections = [];
  
  // Header section
  const header = `📊 ${report.type.toUpperCase()} REPORT\n📅 ${report.dateRange || report.date}`;
  
  // Summary metrics cards
  const summaryMetrics = [
    {
      title: 'Total Activities',
      value: report.summary.totalActivities,
      color: 'cyan'
    },
    {
      title: 'Skills Engaged',
      value: report.summary.skillsEngaged,
      color: 'green'
    }
  ];
  
  if (report.summary.totalDaysActive) {
    summaryMetrics.push({
      title: 'Days Active',
      value: report.summary.totalDaysActive,
      color: 'yellow'
    });
  }
  
  sections.push({
    content: createMetricCards(summaryMetrics)
  });
  
  // Completion Rates with visual bars
  if (Object.keys(report.summary.completionRates).length > 0) {
    let completionContent = chalk.yellow.bold('🎯 COMPLETION RATES\n\n');
    
    Object.entries(report.summary.completionRates).forEach(([skill, stats]) => {
      const rate = stats.completionRate;
      const progressBar = createProgressBar(stats.completed, stats.total, {
        width: 25,
        showPercentage: true,
        showValues: true
      });
      
      completionContent += `${skill.padEnd(15)} ${progressBar}\n`;
    });
    
    // Add bar chart for completion rates
    const completionData = {};
    Object.entries(report.summary.completionRates).forEach(([skill, stats]) => {
      completionData[skill] = stats.completionRate;
    });
    
    completionContent += '\n' + createBarChart(completionData, {
      title: 'Completion Rates Overview',
      width: 40,
      showValues: false
    });
    
    sections.push({
      content: completionContent
    });
  }
  
  // Streaks with sparklines
  if (Object.keys(report.summary.streaks).length > 0) {
    let streakContent = chalk.yellow.bold('🔥 STREAKS\n\n');
    
    const streakTableData = [];
    Object.entries(report.summary.streaks).forEach(([skill, streak]) => {
      // Create a simple sparkline for streak visualization
      const streakData = new Array(streak.longest).fill(0).map((_, i) => i < streak.current ? 1 : 0.3);
      
      streakTableData.push({
        Skill: skill,
        Current: chalk.cyan(streak.current),
        Longest: chalk.red(streak.longest),
        'Total Days': streak.totalActiveDays,
        Trend: createSparkline(streakData, { width: 15 })
      });
    });
    
    streakContent += createTable(streakTableData, {
      alignment: ['left', 'right', 'right', 'right', 'left'],
      maxWidth: 80
    });
    
    sections.push({
      content: streakContent
    });
  }
  
  // Trends (for weekly+ reports)
  if (report.summary.trends && Object.keys(report.summary.trends).length > 0) {
    let trendContent = chalk.yellow.bold('📈 TRENDS\n\n');
    
    const trendTableData = [];
    Object.entries(report.summary.trends).forEach(([skill, trend]) => {
      const arrow = trend.direction === 'increasing' ? '📈' : 
                   trend.direction === 'decreasing' ? '📉' : '➡️';
      const changeColor = trend.direction === 'increasing' ? chalk.green : 
                         trend.direction === 'decreasing' ? chalk.red : chalk.gray;
      
      trendTableData.push({
        Skill: skill,
        Direction: `${arrow} ${trend.direction}`,
        Change: changeColor(`${trend.percentage.toFixed(1)}%`),
        Trend: createSparkline(trend.weeklyData || [1, 2, 1, 3, 2, 4, 3], { width: 20 })
      });
    });
    
    trendContent += createTable(trendTableData, {
      alignment: ['left', 'left', 'right', 'left'],
      maxWidth: 80
    });
    
    sections.push({
      content: trendContent
    });
  }
  
  // Insights section
  if (report.insights) {
    let insightsContent = '';
    
    // Correlations
    if (report.insights.correlations && report.insights.correlations.length > 0) {
      insightsContent += chalk.yellow.bold('🔗 SKILL CORRELATIONS\n\n');
      
      const correlationTableData = report.insights.correlations.slice(0, 5).map(corr => ({
        'Skill 1': corr.skill1,
        'Skill 2': corr.skill2,
        Correlation: corr.correlation > 0 ? 
          chalk.green(`+${corr.correlation.toFixed(2)}`) : 
          chalk.red(corr.correlation.toFixed(2)),
        Strength: corr.strength
      }));
      
      insightsContent += createTable(correlationTableData, {
        alignment: ['left', 'left', 'center', 'left'],
        maxWidth: 70
      });
      insightsContent += '\n';
    }
    
    // Best/worst days with bar chart
    if (report.insights.bestWorstDays) {
      const { bestDayOfWeek, worstDayOfWeek, dayOfWeekAverages } = report.insights.bestWorstDays;
      
      insightsContent += chalk.yellow.bold('📅 BEST/WORST DAYS\n\n');
      insightsContent += `Best day: ${chalk.green(bestDayOfWeek.name)} (avg: ${bestDayOfWeek.average.toFixed(1)})\n`;
      insightsContent += `Worst day: ${chalk.red(worstDayOfWeek.name)} (avg: ${worstDayOfWeek.average.toFixed(1)})\n\n`;
      
      // Day of week chart
      const dayOfWeekData = {};
      dayOfWeekAverages.forEach(day => {
        dayOfWeekData[day.name.substr(0, 3)] = day.average;
      });
      
      insightsContent += createBarChart(dayOfWeekData, {
        title: 'Average Activity by Day of Week',
        width: 35,
        showValues: false
      });
    }
    
    // Top skills
    if (report.insights.topSkills) {
      insightsContent += chalk.yellow.bold('🏆 TOP SKILLS\n\n');
      
      const topSkillsData = {};
      report.insights.topSkills.slice(0, 5).forEach((skill, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
        topSkillsData[`${medal} ${skill.skill}`] = skill.count;
      });
      
      insightsContent += createBarChart(topSkillsData, {
        title: 'Most Active Skills',
        width: 30,
        showValues: true
      });
    }
    
    if (insightsContent) {
      sections.push({
        content: insightsContent
      });
    }
  }
  
  // Create the dashboard
  return createDashboard(sections, {
    title: `${report.type} Analytics Report`,
    width: 80
  });
}

export function formatReportAsMarkdown(report) {
  let md = '';
  
  // Header
  md += `# 📊 ${report.type.toUpperCase()} REPORT\n\n`;
  md += `**Date:** ${report.dateRange || report.date}\n\n`;
  
  // Summary
  md += '## 📈 Summary\n\n';
  md += `- **Total Activities:** ${report.summary.totalActivities}\n`;
  md += `- **Skills Engaged:** ${report.summary.skillsEngaged}\n`;
  
  if (report.summary.totalDaysActive) {
    md += `- **Days Active:** ${report.summary.totalDaysActive}\n`;
  }
  
  md += '\n';
  
  // Completion Rates
  if (Object.keys(report.summary.completionRates).length > 0) {
    md += '## 🎯 Completion Rates\n\n';
    md += '| Skill | Rate | Progress |\n';
    md += '|-------|------|----------|\n';
    Object.entries(report.summary.completionRates).forEach(([skill, stats]) => {
      const rate = stats.completionRate.toFixed(1);
      const progress = '█'.repeat(Math.floor(rate / 10)) + '░'.repeat(10 - Math.floor(rate / 10));
      md += `| ${skill} | ${rate}% | ${progress} |\n`;
    });
    md += '\n';
  }
  
  // Streaks
  if (Object.keys(report.summary.streaks).length > 0) {
    md += '## 🔥 Streaks\n\n';
    md += '| Skill | Current | Longest | Total Days |\n';
    md += '|-------|---------|---------|------------|\n';
    Object.entries(report.summary.streaks).forEach(([skill, streak]) => {
      md += `| ${skill} | ${streak.current} | ${streak.longest} | ${streak.totalActiveDays} |\n`;
    });
    md += '\n';
  }
  
  // Trends
  if (report.summary.trends && Object.keys(report.summary.trends).length > 0) {
    md += '## 📈 Trends\n\n';
    Object.entries(report.summary.trends).forEach(([skill, trend]) => {
      const arrow = trend.direction === 'increasing' ? '📈' : 
                   trend.direction === 'decreasing' ? '📉' : '➡️';
      md += `- **${skill}:** ${arrow} ${trend.direction} (${trend.percentage.toFixed(1)}%)\n`;
    });
    md += '\n';
  }
  
  // Add insights for larger reports
  if (report.insights) {
    if (report.insights.correlations && report.insights.correlations.length > 0) {
      md += '## 🔗 Skill Correlations\n\n';
      report.insights.correlations.forEach(corr => {
        const type = corr.correlation > 0 ? 'positive' : 'negative';
        md += `- **${corr.skill1}** ↔ **${corr.skill2}**: ${type} correlation (${Math.abs(corr.correlation)})\n`;
      });
      md += '\n';
    }
    
    if (report.insights.topSkills) {
      md += '## 🏆 Top Skills\n\n';
      report.insights.topSkills.slice(0, 5).forEach((skill, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        md += `${index + 1}. ${medal} **${skill.skill}**: ${skill.count} activities\n`;
      });
    }
  }
  
  return md;
}

export function formatReportAsHTML(report) {
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${report.type.toUpperCase()} Report - StaticRebel</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-value { font-size: 24px; font-weight: bold; color: #3498db; }
        .metric-label { font-size: 14px; color: #7f8c8d; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: 600; }
        .progress-bar { width: 100px; height: 20px; background: #ecf0f1; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #e74c3c, #f39c12, #2ecc71); border-radius: 10px; }
        .trend-up { color: #27ae60; }
        .trend-down { color: #e74c3c; }
        .trend-stable { color: #7f8c8d; }
        .correlation-positive { color: #27ae60; }
        .correlation-negative { color: #e74c3c; }
    </style>
</head>
<body>`;
  
  // Header
  html += `<h1>📊 ${report.type.toUpperCase()} REPORT</h1>`;
  html += `<p><strong>Date:</strong> ${report.dateRange || report.date}</p>`;
  
  // Summary
  html += '<div class="summary">';
  html += '<h2>📈 Summary</h2>';
  html += `<div class="metric"><div class="metric-value">${report.summary.totalActivities}</div><div class="metric-label">Total Activities</div></div>`;
  html += `<div class="metric"><div class="metric-value">${report.summary.skillsEngaged}</div><div class="metric-label">Skills Engaged</div></div>`;
  
  if (report.summary.totalDaysActive) {
    html += `<div class="metric"><div class="metric-value">${report.summary.totalDaysActive}</div><div class="metric-label">Days Active</div></div>`;
  }
  
  html += '</div>';
  
  // Completion Rates
  if (Object.keys(report.summary.completionRates).length > 0) {
    html += '<h2>🎯 Completion Rates</h2>';
    html += '<table><thead><tr><th>Skill</th><th>Rate</th><th>Progress</th><th>Completed/Goal</th></tr></thead><tbody>';
    
    Object.entries(report.summary.completionRates).forEach(([skill, stats]) => {
      const rate = stats.completionRate.toFixed(1);
      html += `<tr>
        <td>${skill}</td>
        <td>${rate}%</td>
        <td><div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(rate, 100)}%"></div></div></td>
        <td>${stats.completed}/${stats.total}</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
  }
  
  // Streaks
  if (Object.keys(report.summary.streaks).length > 0) {
    html += '<h2>🔥 Streaks</h2>';
    html += '<table><thead><tr><th>Skill</th><th>Current Streak</th><th>Longest Streak</th><th>Total Active Days</th></tr></thead><tbody>';
    
    Object.entries(report.summary.streaks).forEach(([skill, streak]) => {
      html += `<tr>
        <td>${skill}</td>
        <td>${streak.current} days</td>
        <td>${streak.longest} days</td>
        <td>${streak.totalActiveDays} days</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
  }
  
  // Trends
  if (report.summary.trends && Object.keys(report.summary.trends).length > 0) {
    html += '<h2>📈 Trends</h2>';
    html += '<table><thead><tr><th>Skill</th><th>Direction</th><th>Change</th></tr></thead><tbody>';
    
    Object.entries(report.summary.trends).forEach(([skill, trend]) => {
      const className = trend.direction === 'increasing' ? 'trend-up' : 
                      trend.direction === 'decreasing' ? 'trend-down' : 'trend-stable';
      const arrow = trend.direction === 'increasing' ? '📈' : 
                   trend.direction === 'decreasing' ? '📉' : '➡️';
      
      html += `<tr>
        <td>${skill}</td>
        <td class="${className}">${arrow} ${trend.direction}</td>
        <td>${trend.percentage.toFixed(1)}%</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
  }
  
  html += '</body></html>';
  return html;
}

// ============================================================================
// Scheduler Integration
// ============================================================================

export async function scheduleAutomaticReports() {
  const { addCronJob } = await import('../cronScheduler.js');
  
  // Daily report at 9 PM
  addCronJob({
    name: 'Daily Analytics Report',
    schedule: { expr: '0 21 * * *' },
    description: 'Generate daily analytics report',
    payload: { command: 'sr report daily --auto' }
  });
  
  // Weekly report on Sunday at 8 PM  
  addCronJob({
    name: 'Weekly Analytics Report',
    schedule: { expr: '0 20 * * 0' },
    description: 'Generate weekly analytics report', 
    payload: { command: 'sr report weekly --auto' }
  });
  
  // Monthly report on the 1st at 9 AM
  addCronJob({
    name: 'Monthly Analytics Report',
    schedule: { expr: '0 9 1 * *' },
    description: 'Generate monthly analytics report',
    payload: { command: 'sr report monthly --auto' }
  });
  
  console.log('✅ Automatic reports scheduled successfully!');
}

// ============================================================================
// File Export Functions  
// ============================================================================

export async function saveReportToFile(report, format, filename) {
  const reportsDir = path.join(process.cwd(), 'reports');
  
  try {
    await fs.mkdir(reportsDir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
  
  const filePath = path.join(reportsDir, filename);
  let content;
  
  switch (format) {
    case 'markdown':
      content = formatReportAsMarkdown(report);
      break;
    case 'html':
      content = formatReportAsHTML(report);
      break;
    case 'json':
      content = JSON.stringify(report, null, 2);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
  
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

export default {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  generateYearlyReport,
  formatReportAsTerminal,
  formatReportAsMarkdown,
  formatReportAsHTML,
  saveReportToFile,
  scheduleAutomaticReports
};