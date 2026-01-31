import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';

const STATIC_REBEL_DIR = path.join(os.homedir(), '.static-rebel');

let skillManager: any = null;
let nlpParser: any = null;

async function getSkillManager() {
  if (skillManager) return skillManager;
  
  const SkillManagerModule = await import('../../../../../lib/skills/skill-manager.js');
  const sm = new SkillManagerModule.SkillManager({
    skillsDir: path.join(STATIC_REBEL_DIR, 'skills'),
    dataDir: path.join(STATIC_REBEL_DIR, 'data')
  });
  await sm.init();
  skillManager = sm;
  return sm;
}

async function getNlpParser() {
  if (nlpParser) return nlpParser;
  nlpParser = await import('../../../../../lib/skills/nlp-parser.js');
  return nlpParser;
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const parser = await getNlpParser();
    const sm = await getSkillManager();
    
    const parsed = parser.parseInput(text);
    
    // Handle queries
    if (parsed.intent === 'query') {
      if (!parsed.skillId) {
        return NextResponse.json({
          success: true,
          type: 'query',
          message: 'What skill would you like to check?'
        });
      }
      
      let skill = sm.skills.get(parsed.skillId);
      if (!skill) {
        return NextResponse.json({
          success: false,
          message: `No tracker found for "${parsed.skillId}". Start tracking first!`
        });
      }
      
      const todayStats = await sm.getTodayStats(skill.id);
      let message = `${skill.icon || '📊'} **${skill.name}** today: ${todayStats.sum} ${skill.unit || ''}`;
      
      if (skill.dailyGoal) {
        const pct = Math.round((todayStats.sum / skill.dailyGoal) * 100);
        message += ` / ${skill.dailyGoal} (${pct}%)`;
      }
      
      return NextResponse.json({
        success: true,
        type: 'query',
        skill: skill.id,
        todaySum: todayStats.sum,
        goal: skill.dailyGoal,
        message
      });
    }

    // Handle logging
    if (parsed.intent === 'log' && parsed.skillId) {
      let skill = sm.skills.get(parsed.skillId);
      
      // Auto-create skill if needed
      if (!skill) {
        const defaults = parsed.skillDefaults || { unit: 'count', goal: null, icon: '📊' };
        skill = await sm.createSkill(parsed.skillId, {
          description: `Track ${parsed.skillId}`,
          triggers: [parsed.skillId],
          unit: defaults.unit,
          dailyGoal: defaults.goal,
          icon: defaults.icon
        });
      }
      
      const entry = await sm.addEntry(skill.id, parsed.entry);
      const todayStats = await sm.getTodayStats(skill.id);
      
      const value = parsed.entry.value || 1;
      const unit = parsed.entry.unit || skill.unit || '';
      
      let message = `${skill.icon || '📊'} +${value}${unit ? ' ' + unit : ''} logged!`;
      message += ` Today: ${todayStats.sum}`;
      
      if (skill.dailyGoal) {
        const pct = Math.round((todayStats.sum / skill.dailyGoal) * 100);
        message += ` / ${skill.dailyGoal} (${pct}%)`;
        if (pct >= 100) message += ' 🎉';
      }
      
      return NextResponse.json({
        success: true,
        type: 'log',
        skill: skill.id,
        entry,
        todaySum: todayStats.sum,
        goal: skill.dailyGoal,
        message
      });
    }

    return NextResponse.json({
      success: false,
      message: 'Could not understand that. Try "drank 500ml water" or "how\'s my water?"'
    });

  } catch (error: any) {
    console.error('Skills log error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

// Force reload skill manager
export async function DELETE() {
  skillManager = null;
  nlpParser = null;
  return NextResponse.json({ success: true, message: 'Cache cleared' });
}
