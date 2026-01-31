import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';

const STATIC_REBEL_DIR = path.join(os.homedir(), '.static-rebel');
const SKILLS_DIR = path.join(STATIC_REBEL_DIR, 'skills');
const DATA_DIR = path.join(STATIC_REBEL_DIR, 'data');

// Lazy-loaded modules
let skillManager: any = null;
let nlpParser: any = null;

async function getSkillManager() {
  if (skillManager) return skillManager;
  
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

// In-memory chat history
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

    // Add user message to history
    chatHistory.push({
      role: 'user',
      content: sanitizedMessage,
      timestamp: new Date().toISOString(),
    });

    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(-MAX_HISTORY);
    }

    // Process the message
    const responseText = await processMessage(sanitizedMessage);

    // Add assistant response to history
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
    return "Skills system not available. Please check the server logs.";
  }

  // Check for meta commands first
  const lower = message.toLowerCase().trim();
  
  if (lower === 'help' || lower === '?') {
    return getHelpText();
  }
  
  if (lower === 'my skills' || lower === 'list skills' || lower === 'skills') {
    return await listSkills(sm);
  }

  // Parse the message
  const parsed = parser.parseInput(message);
  
  console.log('[Chat] Parsed:', JSON.stringify(parsed, null, 2));

  // Handle based on intent
  if (parsed.intent === 'query') {
    return await handleQuery(sm, parsed);
  }
  
  if (parsed.intent === 'log' && parsed.skillId) {
    return await handleLog(sm, parsed);
  }

  // Check if it's a greeting
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(lower)) {
    return "Hey! 👋 I'm your habit tracker. Try:\n• \"drank 500ml water\"\n• \"did 20 pushups\"\n• \"how's my water today?\"\n\nType **help** for more options.";
  }

  // Unknown intent
  return "I'm not sure what you want to track. Try:\n• \"drank 500ml water\" (to log)\n• \"how's my water?\" (to check progress)\n• \"my skills\" (to see all trackers)\n\nType **help** for more examples.";
}

async function handleQuery(sm: any, parsed: any): Promise<string> {
  if (!parsed.skillId) {
    // General query - show summary of all skills
    const skills = sm.getAllSkills();
    if (skills.length === 0) {
      return "You haven't tracked anything yet! Try saying \"drank 500ml water\" or \"did 20 pushups\".";
    }
    
    const today = new Date().toISOString().split('T')[0];
    const lines = [];
    
    for (const skill of skills) {
      const todayStats = await sm.getTodayStats(skill.id);
      const icon = skill.icon || '📊';
      let line = `${icon} **${skill.name}**: ${todayStats.sum} ${skill.unit || ''}`;
      
      if (skill.dailyGoal) {
        const pct = Math.round((todayStats.sum / skill.dailyGoal) * 100);
        line += ` / ${skill.dailyGoal} (${pct}%)`;
      }
      
      lines.push(line);
    }
    
    return `📊 **Today's Progress:**\n\n${lines.join('\n')}`;
  }

  // Query specific skill
  let skill = sm.skills.get(parsed.skillId);
  
  if (!skill) {
    // Check if any skill matches
    const allSkills = sm.getAllSkills();
    skill = allSkills.find((s: any) => 
      s.id === parsed.skillId || 
      s.triggers?.includes(parsed.skillId) ||
      s.name.toLowerCase() === parsed.skillId
    );
  }
  
  if (!skill) {
    return `I don't have a tracker for "${parsed.skillId}" yet. Start tracking by saying something like "did 20 ${parsed.skillId}".`;
  }

  // Get stats based on period
  const today = new Date().toISOString().split('T')[0];
  const todayStats = await sm.getTodayStats(skill.id);
  const allStats = await sm.getStats(skill.id);
  
  const icon = skill.icon || '📊';
  let response = `${icon} **${skill.name}**\n\n`;
  
  // Today
  response += `**Today:** ${todayStats.sum} ${skill.unit || ''}`;
  if (skill.dailyGoal) {
    const pct = Math.min(100, Math.round((todayStats.sum / skill.dailyGoal) * 100));
    response += ` / ${skill.dailyGoal} (${pct}%)\n`;
    response += generateProgressBar(pct) + '\n';
    if (pct >= 100) response += '🎉 Goal reached!\n';
  } else {
    response += '\n';
  }
  
  // Week summary
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const weekEntries = (await sm.getEntries(skill.id)).filter((e: any) => e.date >= weekAgo);
  const weekSum = weekEntries.reduce((sum: number, e: any) => sum + (parseFloat(e.value) || 0), 0);
  response += `**This week:** ${Math.round(weekSum * 10) / 10} ${skill.unit || ''}\n`;
  
  // Total
  response += `**All time:** ${Math.round(allStats.sum * 10) / 10} ${skill.unit || ''} (${allStats.count} entries)`;
  
  return response;
}

async function handleLog(sm: any, parsed: any): Promise<string> {
  const { skillId, skillDefaults, entry } = parsed;
  
  // Get or create skill
  let skill = sm.skills.get(skillId);
  
  if (!skill) {
    // Auto-create the skill
    console.log(`[Chat] Auto-creating skill: ${skillId}`);
    const defaults = skillDefaults || { unit: 'count', goal: null, icon: '📊' };
    
    skill = await sm.createSkill(skillId, {
      description: `Track ${skillId}`,
      triggers: [skillId],
      unit: defaults.unit,
      dailyGoal: defaults.goal,
      icon: defaults.icon
    });
    
    console.log(`[Chat] Created skill:`, skill.id);
  }
  
  // Log the entry
  const loggedEntry = await sm.addEntry(skill.id, entry);
  const todayStats = await sm.getTodayStats(skill.id);
  
  // Build response
  const icon = skill.icon || '📊';
  const value = entry.value || 1;
  const unit = entry.unit || skill.unit || '';
  
  let response = `${icon} **+${value}${unit ? ' ' + unit : ''}** ${skill.name} logged!\n\n`;
  response += `Today: **${todayStats.sum}** ${skill.unit || ''}`;
  
  if (skill.dailyGoal) {
    const pct = Math.min(100, Math.round((todayStats.sum / skill.dailyGoal) * 100));
    response += ` / ${skill.dailyGoal} (${pct}%)\n`;
    response += generateProgressBar(pct);
    if (pct >= 100) response += '\n🎉 Goal reached!';
  }
  
  return response;
}

async function listSkills(sm: any): Promise<string> {
  const skills = sm.getAllSkills();
  
  if (skills.length === 0) {
    return "You don't have any skills yet! Start tracking by saying:\n• \"drank 500ml water\"\n• \"did 20 pushups\"\n• \"walked 5000 steps\"";
  }
  
  const today = new Date().toISOString().split('T')[0];
  const lines = [];
  
  for (const skill of skills) {
    const todayStats = await sm.getTodayStats(skill.id);
    const icon = skill.icon || '📊';
    let line = `${icon} **${skill.name}** — ${todayStats.sum} ${skill.unit || ''} today`;
    
    if (skill.dailyGoal) {
      const pct = Math.round((todayStats.sum / skill.dailyGoal) * 100);
      line += ` (${pct}% of goal)`;
    }
    
    lines.push(line);
  }
  
  return `📋 **Your Skills:**\n\n${lines.join('\n')}`;
}

function generateProgressBar(percent: number): string {
  const filled = Math.round(Math.min(100, percent) / 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}

function getHelpText(): string {
  return `**🎯 Habit Tracker Help**

**Logging:**
• "drank 500ml water" or "2 glasses of water"
• "did 20 pushups" or "30 squats"
• "walked 5000 steps" or "ran 3km"
• "slept 7 hours"
• "mood: great" or "feeling good"

**Checking progress:**
• "how's my water?" or "how much water today?"
• "how many pushups did I do?"
• "show my steps"

**Commands:**
• "my skills" — list all your trackers
• "help" — show this help

**Auto-create:** Just track something new and I'll create a skill for it!`;
}

export async function GET() {
  return NextResponse.json({
    history: chatHistory.slice(-20),
    total: chatHistory.length,
  });
}

export async function DELETE() {
  chatHistory = [];
  return NextResponse.json({ success: true, message: 'Chat history cleared' });
}
