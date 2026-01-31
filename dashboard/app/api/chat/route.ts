import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';

const STATIC_REBEL_DIR = path.join(os.homedir(), '.static-rebel');
const SKILLS_DIR = path.join(STATIC_REBEL_DIR, 'skills');
const DATA_DIR = path.join(STATIC_REBEL_DIR, 'data');

// Modules
let skillManager: any = null;
let nlpParser: any = null;

// Track last entry for undo
let lastEntry: { skillId: string; entryId: string; entry: any } | null = null;

async function getSkillManager(forceReload = false) {
  if (skillManager && !forceReload) return skillManager;
  
  try {
    const SkillManagerModule = await import('../../../../lib/skills/skill-manager.js');
    const sm = new SkillManagerModule.SkillManager({
      skillsDir: SKILLS_DIR,
      dataDir: DATA_DIR
    });
    await sm.init();
    skillManager = sm;
    return sm;
  } catch (error: any) {
    console.error('Failed to load SkillManager:', error.message);
    return null;
  }
}

async function getNlpParser() {
  if (nlpParser) return nlpParser;
  
  try {
    nlpParser = await import('../../../../lib/skills/nlp-parser.js');
    return nlpParser;
  } catch (error: any) {
    console.error('Failed to load NLP parser:', error.message);
    return null;
  }
}

// Chat history
let chatHistory: Array<{ role: string; content: string; timestamp: string }> = [];
const MAX_HISTORY = 50;

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const sanitizedMessage = message.trim().slice(0, 10000);
    if (!sanitizedMessage) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    chatHistory.push({
      role: 'user',
      content: sanitizedMessage,
      timestamp: new Date().toISOString(),
    });

    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(-MAX_HISTORY);
    }

    const responseText = await processMessage(sanitizedMessage);

    chatHistory.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      response: responseText,
      history: chatHistory.slice(-10),
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process message', details: error.message },
      { status: 500 }
    );
  }
}

async function processMessage(message: string): Promise<string> {
  const parser = await getNlpParser();
  const sm = await getSkillManager();
  
  if (!parser || !sm) {
    return "⚠️ Skills system not available. Please check the server logs.";
  }

  const parsed = parser.parseInput(message);
  console.log('[Chat] Parsed:', JSON.stringify(parsed, null, 2));

  // Handle different intents
  switch (parsed.intent) {
    case 'command':
      return await handleCommand(sm, parsed);
    case 'query':
      return await handleQuery(sm, parsed);
    case 'log':
      return await handleLog(sm, parsed);
    default:
      return getUnknownResponse(message);
  }
}

async function handleCommand(sm: any, parsed: any): Promise<string> {
  switch (parsed.command) {
    case 'help':
      return getHelpText();
      
    case 'list':
      return await listSkills(sm);
      
    case 'undo':
      return await undoLastEntry(sm);
      
    case 'greet':
      const skills = sm.getAllSkills();
      if (skills.length === 0) {
        return "Hey! 👋 I'm your habit tracker. Get started by saying:\n\n• \"drank 2 glasses of water\"\n• \"did 20 pushups\"\n• \"walked 5k steps\"\n\nI'll track everything for you! 📊";
      }
      // Show quick status
      const summary = await getQuickSummary(sm);
      return `Hey! 👋 Here's your status today:\n\n${summary}\n\nWhat would you like to log?`;
      
    case 'thanks':
      return pickRandom([
        "You're welcome! Keep up the great work! 💪",
        "Happy to help! You're doing great! 🌟",
        "Anytime! Keep crushing those goals! 🎯",
        "No problem! Stay consistent! 🔥"
      ]);
      
    default:
      return "I didn't understand that command. Type **help** to see what I can do!";
  }
}

async function handleQuery(sm: any, parsed: any): Promise<string> {
  // General query - show all skills
  if (!parsed.skillId) {
    const skills = sm.getAllSkills();
    if (skills.length === 0) {
      return "You haven't tracked anything yet! Start by saying:\n• \"drank 500ml water\"\n• \"did 20 pushups\"\n• \"walked 5k steps\"";
    }
    
    const summary = await getQuickSummary(sm);
    return `📊 **Today's Progress:**\n\n${summary}`;
  }

  // Query specific skill
  let skill = await findSkill(sm, parsed.skillId);
  
  if (!skill) {
    return `I don't have a tracker for "${parsed.skillName || parsed.skillId}" yet.\n\nStart tracking by saying something like:\n• "did 20 ${parsed.skillId}"`;
  }

  return await getSkillDetails(sm, skill, parsed.period);
}

async function handleLog(sm: any, parsed: any): Promise<string> {
  const { skillId, skillName, skillDefaults, entry, timeContext } = parsed;
  
  // Get or create skill
  let skill = await findSkill(sm, skillId);
  
  if (!skill) {
    console.log(`[Chat] Creating skill: ${skillId}`);
    const defaults = skillDefaults || { unit: 'count', goal: null, icon: '📊', name: skillId };
    
    skill = await sm.createSkill(defaults.name || skillId, {
      description: `Track ${defaults.name || skillId}`,
      triggers: [skillId],
      unit: defaults.unit,
      dailyGoal: defaults.goal,
      icon: defaults.icon
    });
    
    // Force reload to pick up new skill
    await getSkillManager(true);
  }
  
  // Log the entry
  const loggedEntry = await sm.addEntry(skill.id, entry);
  
  // Track for undo
  lastEntry = { skillId: skill.id, entryId: loggedEntry.id, entry: loggedEntry };
  
  // Get updated stats
  const todayStats = await sm.getTodayStats(skill.id);
  
  // Build response
  return formatLogResponse(skill, entry, todayStats, timeContext);
}

async function undoLastEntry(sm: any): Promise<string> {
  if (!lastEntry) {
    return "Nothing to undo! Your last entry has already been removed or there's nothing logged yet.";
  }
  
  try {
    // Load skill data
    const data = await sm.loadData(lastEntry.skillId);
    const index = data.entries.findIndex((e: any) => e.id === lastEntry.entryId);
    
    if (index === -1) {
      lastEntry = null;
      return "That entry was already removed.";
    }
    
    // Remove the entry
    const removed = data.entries.splice(index, 1)[0];
    await sm.saveData(lastEntry.skillId, data);
    
    const skill = sm.skills.get(lastEntry.skillId);
    const icon = skill?.icon || '📊';
    const unit = skill?.unit || '';
    
    lastEntry = null;
    
    return `↩️ Removed: **${removed.value}${unit ? ' ' + unit : ''}** from ${icon} ${skill?.name || lastEntry?.skillId}`;
  } catch (error) {
    console.error('Undo error:', error);
    return "Couldn't undo that entry. Please try again.";
  }
}

async function findSkill(sm: any, skillId: string): Promise<any> {
  // Direct match
  let skill = sm.skills.get(skillId);
  if (skill) return skill;
  
  // Search by name or triggers
  const allSkills = sm.getAllSkills();
  return allSkills.find((s: any) => 
    s.id.toLowerCase() === skillId.toLowerCase() ||
    s.name?.toLowerCase() === skillId.toLowerCase() ||
    s.triggers?.some((t: string) => t.toLowerCase() === skillId.toLowerCase())
  );
}

async function getQuickSummary(sm: any): Promise<string> {
  const skills = sm.getAllSkills();
  const lines = [];
  
  for (const skill of skills) {
    const stats = await sm.getTodayStats(skill.id);
    if (stats.count === 0 && !skill.dailyGoal) continue; // Skip inactive skills without goals
    
    const icon = skill.icon || '📊';
    let line = `${icon} **${skill.name}**: ${stats.sum} ${skill.unit || ''}`;
    
    if (skill.dailyGoal) {
      const pct = Math.round((stats.sum / skill.dailyGoal) * 100);
      const bar = generateMiniBar(pct);
      line += ` ${bar} ${pct}%`;
      if (pct >= 100) line += ' ✓';
    }
    
    lines.push(line);
  }
  
  if (lines.length === 0) {
    return "No activity logged today yet!";
  }
  
  return lines.join('\n');
}

async function getSkillDetails(sm: any, skill: any, period: string): Promise<string> {
  const icon = skill.icon || '📊';
  const todayStats = await sm.getTodayStats(skill.id);
  const allStats = await sm.getStats(skill.id);
  
  let response = `${icon} **${skill.name}**\n\n`;
  
  // Today's progress
  response += `**Today:** ${todayStats.sum} ${skill.unit || ''}`;
  if (skill.dailyGoal) {
    const pct = Math.min(100, Math.round((todayStats.sum / skill.dailyGoal) * 100));
    response += ` / ${skill.dailyGoal} (${pct}%)\n`;
    response += generateProgressBar(pct) + '\n';
    if (pct >= 100) response += '🎉 Goal reached!\n';
    else if (pct >= 75) response += '💪 Almost there!\n';
    else if (pct >= 50) response += '👍 Halfway!\n';
  } else {
    response += '\n';
  }
  
  // Week summary
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const weekEntries = (await sm.getEntries(skill.id)).filter((e: any) => e.date >= weekAgo);
  const weekSum = weekEntries.reduce((sum: number, e: any) => sum + (parseFloat(e.value) || 0), 0);
  const uniqueDays = new Set(weekEntries.map((e: any) => e.date)).size;
  
  response += `\n**This week:** ${Math.round(weekSum * 10) / 10} ${skill.unit || ''} (${uniqueDays}/7 days)`;
  
  // Streak
  const streak = calculateStreak(await sm.getEntries(skill.id));
  if (streak > 1) {
    response += `\n🔥 **${streak} day streak!**`;
  }
  
  // All time
  response += `\n\n**All time:** ${Math.round(allStats.sum * 10) / 10} ${skill.unit || ''} (${allStats.count} entries)`;
  
  return response;
}

function formatLogResponse(skill: any, entry: any, todayStats: any, timeContext: any): string {
  const icon = skill.icon || '📊';
  const value = entry.value || 1;
  const unit = entry.unit || skill.unit || '';
  const isYesterday = timeContext?.label === 'yesterday';
  
  // Celebration for milestones
  let celebration = '';
  if (skill.dailyGoal) {
    const pct = Math.round((todayStats.sum / skill.dailyGoal) * 100);
    if (pct >= 100 && todayStats.sum - value < skill.dailyGoal) {
      celebration = '\n\n🎉 **Goal reached!** Amazing work!';
    } else if (pct >= 75 && (todayStats.sum - value) / skill.dailyGoal < 0.75) {
      celebration = '\n\n💪 **75%!** You\'re crushing it!';
    } else if (pct >= 50 && (todayStats.sum - value) / skill.dailyGoal < 0.5) {
      celebration = '\n\n👍 **Halfway there!** Keep going!';
    }
  }
  
  // Format value nicely
  let valueStr = formatNumber(value);
  if (entry.sets && entry.reps) {
    valueStr = `${entry.sets}×${entry.reps} (${value})`;
  }
  
  let response = `${icon} **+${valueStr}${unit ? ' ' + unit : ''}** ${skill.name}`;
  if (isYesterday) response += ' (yesterday)';
  response += ' logged!';
  
  // Show progress
  response += `\n\nToday: **${formatNumber(todayStats.sum)}** ${skill.unit || ''}`;
  
  if (skill.dailyGoal) {
    const pct = Math.min(100, Math.round((todayStats.sum / skill.dailyGoal) * 100));
    response += ` / ${skill.dailyGoal}`;
    response += `\n${generateProgressBar(pct)} ${pct}%`;
  }
  
  response += celebration;
  
  return response;
}

async function listSkills(sm: any): Promise<string> {
  const skills = sm.getAllSkills();
  
  if (skills.length === 0) {
    return "📋 **No skills yet!**\n\nStart tracking by saying:\n• \"drank 500ml water\"\n• \"did 20 pushups\"\n• \"walked 5000 steps\"\n• \"slept 7 hours\"";
  }
  
  const lines = [];
  for (const skill of skills) {
    const stats = await sm.getTodayStats(skill.id);
    const icon = skill.icon || '📊';
    let line = `${icon} **${skill.name}** — ${stats.sum} ${skill.unit || ''} today`;
    
    if (skill.dailyGoal) {
      const pct = Math.round((stats.sum / skill.dailyGoal) * 100);
      if (pct >= 100) line += ' ✓';
      else line += ` (${pct}%)`;
    }
    
    lines.push(line);
  }
  
  return `📋 **Your Skills:**\n\n${lines.join('\n')}\n\n_Type a skill name to see details_`;
}

function calculateStreak(entries: any[]): number {
  if (entries.length === 0) return 0;
  
  const dates = [...new Set(entries.map(e => e.date))].sort().reverse();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  if (dates[0] !== today && dates[0] !== yesterday) return 0;
  
  let streak = 0;
  let checkDate = new Date(dates[0]);
  
  for (const date of dates) {
    const expected = checkDate.toISOString().split('T')[0];
    if (date === expected) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (date < expected) {
      break;
    }
  }
  
  return streak;
}

function generateProgressBar(percent: number): string {
  const filled = Math.round(Math.min(100, percent) / 10);
  return '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

function generateMiniBar(percent: number): string {
  const filled = Math.round(Math.min(100, percent) / 20);
  return '▓'.repeat(filled) + '░'.repeat(5 - filled);
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  if (n === Math.floor(n)) return n.toString();
  return n.toFixed(1);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getUnknownResponse(message: string): string {
  // Check if it contains a number - might be trying to log
  if (/\d/.test(message)) {
    return "I see you mentioned a number, but I'm not sure what to track.\n\nTry being more specific:\n• \"drank 500ml water\"\n• \"did 20 pushups\"\n• \"walked 3km\"";
  }
  
  return "I'm not sure what you want to do. Try:\n• **Log:** \"drank 500ml water\"\n• **Check:** \"how's my water?\"\n• **List:** \"my skills\"\n• **Help:** \"help\"";
}

function getHelpText(): string {
  return `**🎯 Habit Tracker**

**Log activities:**
• "drank 500ml water" or "2 glasses of water"
• "did 20 pushups" or "3 sets of 10 pushups"
• "walked 5000 steps" or "ran 3km"
• "slept 7 hours"
• "feeling great" (mood 1-10)
• "meditated 15 min"
• "read 20 pages"

**Check progress:**
• "how's my water?"
• "show my pushups"
• "my skills" — list all trackers

**Commands:**
• "undo" — remove last entry
• "help" — show this

**Tips:**
• I'll auto-create new skills when you track something new
• Use "yesterday" to log for the previous day
• "3 sets of 10" = 30 total`;
}

export async function GET() {
  return NextResponse.json({
    history: chatHistory.slice(-20),
    total: chatHistory.length,
  });
}

export async function DELETE() {
  chatHistory = [];
  lastEntry = null;
  return NextResponse.json({ success: true, message: 'Chat history cleared' });
}
