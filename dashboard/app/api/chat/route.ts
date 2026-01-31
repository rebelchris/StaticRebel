import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';

// Skills system paths
const STATIC_REBEL_DIR = path.join(os.homedir(), '.static-rebel');

// Lazy-loaded modules
let skillManager: any = null;
let nlpParser: any = null;

async function getSkillManager() {
  if (skillManager) return skillManager;
  
  try {
    // Dynamic import from lib/skills
    const SkillManagerModule = await import('../../../../lib/skills/skill-manager.js');
    const sm = new SkillManagerModule.SkillManager({
      skillsDir: path.join(STATIC_REBEL_DIR, 'skills'),
      dataDir: path.join(STATIC_REBEL_DIR, 'data')
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
    const { message, stream = false } = await request.json();

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

    // Trim history
    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(-MAX_HISTORY);
    }

    // Try to process as skill tracking
    const skillResult = await processSkillInput(sanitizedMessage);
    
    let responseText: string;
    
    if (skillResult) {
      responseText = skillResult;
    } else {
      // Not a skill command - use fallback response
      responseText = generateResponse(sanitizedMessage);
    }

    // Add assistant response to history
    chatHistory.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      response: responseText,
      history: chatHistory.slice(-10),
      type: skillResult ? 'skill' : 'chat',
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process message', details: error.message },
      { status: 500 }
    );
  }
}

async function processSkillInput(message: string): Promise<string | null> {
  const parser = await getNlpParser();
  const sm = await getSkillManager();
  
  if (!parser || !sm) {
    console.log('Skills system not available');
    return null;
  }

  // Check if this looks like tracking intent
  if (!parser.isTrackingIntent(message)) {
    // Check for skill-related queries
    const lower = message.toLowerCase();
    
    if (lower.includes('my skills') || lower.includes('list skills') || lower.includes('show skills')) {
      const skills = sm.getAllSkills();
      if (skills.length === 0) {
        return "You don't have any skills yet. Try saying something like:\n• \"drank 500ml water\"\n• \"walked 3k steps\"\n• \"mood: great\"";
      }
      const list = skills.map((s: any) => `${s.icon} **${s.name}** - ${s.unit || 'entries'}`).join('\n');
      return `📊 **Your Skills:**\n${list}`;
    }
    
    if (lower.match(/how('?s| is) my (\w+)/)) {
      const match = lower.match(/how('?s| is) my (\w+)/);
      if (match) {
        const skillName = match[2];
        const skill = sm.skills.get(skillName) || 
          Array.from(sm.skills.values()).find((s: any) => 
            s.name.toLowerCase().includes(skillName) || s.triggers.includes(skillName)
          );
        
        if (skill) {
          const today = new Date().toISOString().split('T')[0];
          const entries = await sm.getEntries(skill.id, { date: today });
          const sum = entries.reduce((acc: number, e: any) => acc + (parseFloat(e.value) || 0), 0);
          const goal = skill.dailyGoal;
          
          let response = `${skill.icon} **${skill.name}** today:\n`;
          response += `${sum} ${skill.unit || 'entries'}`;
          
          if (goal) {
            const pct = Math.round((sum / goal) * 100);
            const bar = generateProgressBar(pct);
            response += ` / ${goal} ${skill.unit || ''} (${pct}%)\n${bar}`;
          }
          
          return response;
        }
      }
    }
    
    return null;
  }

  // Parse the input
  const parsed = parser.parseWithSuggestions(message);
  
  if (!parsed.success) {
    return parsed.message;
  }

  // Handle new skill creation
  if (parsed.createNew && parsed.suggestedSkill) {
    const existingSkill = sm.skills.get(parsed.suggestedSkill);
    
    if (!existingSkill) {
      // Auto-create the skill
      const newSkill = await sm.createSkill(parsed.suggestedSkill, {
        description: `Track ${parsed.suggestedSkill}`,
        triggers: [parsed.suggestedSkill],
        unit: 'count'
      });
      
      // Log the entry
      const entry = await sm.addEntry(newSkill.id, parsed.entry);
      
      return `✨ Created new skill **${newSkill.name}**!\n\n` +
        `${newSkill.icon} +${entry.value} logged!`;
    } else {
      // Skill exists, just log
      const entry = await sm.addEntry(existingSkill.id, parsed.entry);
      const todayStats = await sm.getTodayStats(existingSkill.id);
      
      return formatTrackingResponse(existingSkill, entry, todayStats);
    }
  }

  // Handle known skill
  if (parsed.skill) {
    let skill = sm.skills.get(parsed.skill);
    
    // If skill doesn't exist yet, create it
    if (!skill) {
      skill = await sm.createSkill(parsed.skill, {
        description: `Track ${parsed.skill}`,
        triggers: SKILL_PARSERS[parsed.skill]?.triggers || [parsed.skill],
        unit: parsed.unit || 'count',
        dailyGoal: getDefaultGoal(parsed.skill)
      });
    }
    
    // Log the entry
    const entry = await sm.addEntry(skill.id, parsed.entry);
    const todayStats = await sm.getTodayStats(skill.id);
    
    return formatTrackingResponse(skill, entry, todayStats);
  }

  return parsed.suggestions?.length 
    ? `🤔 ${parsed.suggestions.join('\n')}`
    : null;
}

// Default goals for known skills
const SKILL_PARSERS: Record<string, { triggers: string[], goal?: number }> = {
  water: { triggers: ['water', 'drank', 'drink', 'hydrat'], goal: 2000 },
  coffee: { triggers: ['coffee', 'espresso', 'cappuccino'], goal: 3 },
  steps: { triggers: ['steps', 'walked'], goal: 10000 },
  exercise: { triggers: ['exercise', 'workout', 'ran', 'run'], goal: 30 },
  mood: { triggers: ['mood', 'feeling', 'feel'], goal: undefined },
  sleep: { triggers: ['sleep', 'slept'], goal: 8 },
};

function getDefaultGoal(skillId: string): number | undefined {
  return SKILL_PARSERS[skillId]?.goal;
}

function formatTrackingResponse(skill: any, entry: any, todayStats: any): string {
  const value = entry.value || entry.distance || entry.steps || 1;
  const unit = entry.unit || skill.unit || '';
  
  let response = `${skill.icon} +${value}${unit} ${skill.name} logged!`;
  
  // Add today's total
  const todaySum = Math.round(todayStats.sum * 10) / 10;
  response += `\n\nToday: ${todaySum} ${skill.unit || ''}`;
  
  // Add goal progress if available
  if (skill.dailyGoal) {
    const pct = Math.min(100, Math.round((todaySum / skill.dailyGoal) * 100));
    response += ` / ${skill.dailyGoal} (${pct}%)`;
    response += `\n${generateProgressBar(pct)}`;
    
    if (pct >= 100) {
      response += '\n🎉 Goal reached!';
    }
  }
  
  return response;
}

function generateProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '▓'.repeat(Math.min(10, filled)) + '░'.repeat(Math.max(0, empty));
}

function generateResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.match(/^(hi|hello|hey)/)) {
    return "Hey! I'm your personal tracker. Try saying things like:\n• \"drank 500ml water\"\n• \"walked 5000 steps\"\n• \"mood: great\"\n• \"did 20 pushups\"";
  }

  if (lower.includes('help')) {
    return `**How to track:**
• \"drank 500ml water\" or \"2 glasses of water\"
• \"walked 3k steps\" or \"ran 5km\"
• \"mood: good\" or \"feeling great\"
• \"did 30 pushups\" or \"20 min workout\"
• \"slept 7 hours\"

**Commands:**
• \"my skills\" - list all your skills
• \"how's my water\" - check today's progress

I'll auto-create new skills when you track something new!`;
  }

  return "I can help you track habits! Try saying something like \"drank 500ml water\" or type \"help\" for more options.";
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
