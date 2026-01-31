/**
 * ASCII Visualizations for Skills
 * 
 * Render charts and progress bars in text for chat interfaces.
 */

/**
 * Render a horizontal bar
 * @param {number} value - Current value
 * @param {number} max - Maximum value
 * @param {number} width - Bar width in characters
 * @param {string} filled - Character for filled portion
 * @param {string} empty - Character for empty portion
 */
export function progressBar(value, max, width = 10, filled = '█', empty = '░') {
  const percent = Math.min(1, value / max);
  const filledCount = Math.round(percent * width);
  const emptyCount = width - filledCount;
  return filled.repeat(filledCount) + empty.repeat(emptyCount);
}

/**
 * Render a goal progress display
 */
export function goalProgress(label, current, target, unit = '') {
  const bar = progressBar(current, target, 10);
  const percent = Math.min(100, Math.round((current / target) * 100));
  const status = current >= target ? '✅' : '';
  return `${label}: ${bar} ${current}/${target}${unit} (${percent}%) ${status}`;
}

/**
 * Render a weekly bar chart
 * @param {array} data - Array of { day: 'Mon', value: number }
 */
export function weeklyChart(data, max = null, unit = '') {
  if (!data.length) return 'No data';
  
  const maxVal = max || Math.max(...data.map(d => d.value));
  const barWidth = 10;
  
  const lines = data.map(d => {
    const bar = progressBar(d.value, maxVal, barWidth);
    const valStr = d.value.toString().padStart(5);
    return `${d.day.slice(0, 3).padEnd(3)} ${bar} ${valStr}${unit}`;
  });
  
  return lines.join('\n');
}

/**
 * Render a sparkline (mini inline chart)
 * @param {array} values - Array of numbers
 */
export function sparkline(values) {
  if (!values.length) return '';
  
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  return values.map(v => {
    const idx = Math.round(((v - min) / range) * (chars.length - 1));
    return chars[idx];
  }).join('');
}

/**
 * Render a streak display
 */
export function streakDisplay(current, longest, emoji = '🔥') {
  if (current === 0) {
    return `No active streak (best: ${longest} days)`;
  }
  
  const flames = emoji.repeat(Math.min(current, 7)); // Cap visual flames at 7
  return `${flames} ${current}-day streak! (best: ${longest})`;
}

/**
 * Render achievements list
 */
export function achievementsList(achievements) {
  if (!achievements.length) return 'No achievements yet';
  
  const icons = {
    'streak-3': '🌱',
    'streak-7': '⭐',
    'streak-14': '🌟',
    'streak-21': '💫',
    'streak-30': '🏆',
    'streak-60': '👑',
    'streak-90': '💎',
    'streak-100': '🎯',
    'new-record': '📈',
    default: '🏅'
  };
  
  return achievements.map(a => {
    const icon = icons[a.type] || icons.default;
    const date = new Date(a.earnedAt).toLocaleDateString();
    return `${icon} ${a.description} (${date})`;
  }).join('\n');
}

/**
 * Render a full skill summary card
 */
export function skillSummary(skill, stats, progress) {
  const lines = [];
  
  // Header
  lines.push(`📊 ${skill.name}`);
  lines.push('─'.repeat(30));
  
  // Stats
  if (stats.count > 0) {
    lines.push(`Total entries: ${stats.count}`);
    if (stats.sum) lines.push(`Sum: ${stats.sum}`);
    if (stats.avg) lines.push(`Average: ${stats.avg.toFixed(1)}`);
  }
  
  // Goal progress
  if (progress?.goal) {
    lines.push('');
    if (progress.goal.daily) {
      lines.push(goalProgress('Today', progress.goal.daily.current, progress.goal.daily.target));
    }
    if (progress.goal.weekly) {
      lines.push(goalProgress('This week', progress.goal.weekly.current, progress.goal.weekly.target));
    }
  }
  
  // Streak
  if (progress?.streak) {
    lines.push('');
    lines.push(streakDisplay(progress.streak.current, progress.streak.longest));
  }
  
  // Recent achievements
  if (progress?.achievements?.length) {
    lines.push('');
    lines.push('Recent achievements:');
    lines.push(achievementsList(progress.achievements.slice(-3)));
  }
  
  return lines.join('\n');
}

/**
 * Render a mini status for quick feedback
 */
export function miniStatus(action, skill, entry, progress) {
  const parts = [];
  
  // Entry confirmation
  if (action === 'logged') {
    parts.push(`✓ Logged to ${skill}`);
  }
  
  // Value
  if (entry.value) {
    parts.push(`${entry.value}${entry.unit || ''}`);
  }
  
  // Goal progress
  if (progress?.goal?.daily) {
    const g = progress.goal.daily;
    parts.push(`(${g.current}/${g.target} today)`);
  }
  
  // Streak
  if (progress?.streak?.current > 1) {
    parts.push(`🔥${progress.streak.current}`);
  }
  
  // Milestone
  if (progress?.newMilestone) {
    parts.push(`🎉 ${progress.newMilestone}-day streak!`);
  }
  
  return parts.join(' ');
}

export default {
  progressBar,
  goalProgress,
  weeklyChart,
  sparkline,
  streakDisplay,
  achievementsList,
  skillSummary,
  miniStatus
};
