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
    
    const parsed = parser.parseWithSuggestions(text);
    
    if (!parsed.success) {
      return NextResponse.json({ 
        success: false, 
        message: parsed.message 
      });
    }

    // Handle new skill creation
    if (parsed.createNew && parsed.suggestedSkill) {
      let skill = sm.skills.get(parsed.suggestedSkill);
      
      if (!skill) {
        skill = await sm.createSkill(parsed.suggestedSkill, {
          description: `Track ${parsed.suggestedSkill}`,
          triggers: [parsed.suggestedSkill],
          unit: 'count'
        });
      }
      
      const entry = await sm.addEntry(skill.id, parsed.entry);
      const todayStats = await sm.getTodayStats(skill.id);
      
      return NextResponse.json({
        success: true,
        created: true,
        skill: skill.id,
        entry,
        todaySum: todayStats.sum,
        message: `✨ Created skill "${skill.name}" and logged ${entry.value}!`
      });
    }

    // Handle known skill
    if (parsed.skill) {
      let skill = sm.skills.get(parsed.skill);
      
      if (!skill) {
        skill = await sm.createSkill(parsed.skill, {
          description: `Track ${parsed.skill}`,
          triggers: [parsed.skill],
          unit: parsed.unit || 'count'
        });
      }
      
      const entry = await sm.addEntry(skill.id, parsed.entry);
      const todayStats = await sm.getTodayStats(skill.id);
      
      let message = `${skill.icon || '📊'} +${entry.value} ${skill.unit || ''} logged!`;
      message += ` Today: ${todayStats.sum}`;
      
      if (skill.dailyGoal) {
        const pct = Math.round((todayStats.sum / skill.dailyGoal) * 100);
        message += ` / ${skill.dailyGoal} (${pct}%)`;
        if (pct >= 100) message += ' 🎉';
      }
      
      return NextResponse.json({
        success: true,
        skill: skill.id,
        entry,
        todaySum: todayStats.sum,
        goal: skill.dailyGoal,
        message
      });
    }

    return NextResponse.json({
      success: false,
      message: parsed.suggestions?.join('\n') || 'Could not parse input'
    });

  } catch (error: any) {
    console.error('Skills log error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
