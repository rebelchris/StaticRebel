import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';

const STATIC_REBEL_DIR = path.join(os.homedir(), '.static-rebel');

let skillManagerInstance: any = null;

async function getSkillManager() {
  if (skillManagerInstance) return skillManagerInstance;
  
  const SkillManagerModule = await import('../../../../../lib/skills/skill-manager.js');
  const sm = new SkillManagerModule.SkillManager({
    skillsDir: path.join(STATIC_REBEL_DIR, 'skills'),
    dataDir: path.join(STATIC_REBEL_DIR, 'data')
  });
  await sm.init();
  skillManagerInstance = sm;
  return sm;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sm = await getSkillManager();
    
    if (!sm.skills.has(id)) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }
    
    const skill = sm.skills.get(id);
    const entries = await sm.getEntries(id);
    const stats = await sm.getStats(id);
    const todayStats = await sm.getTodayStats(id);
    
    return NextResponse.json({
      id,
      name: skill.name,
      description: skill.description,
      icon: skill.icon,
      unit: skill.unit,
      dailyGoal: skill.dailyGoal,
      triggers: skill.triggers,
      entries,
      stats,
      todayStats
    });
  } catch (error: any) {
    console.error('Skill fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();
    
    // Clear cache
    skillManagerInstance = null;
    const sm = await getSkillManager();
    
    if (!sm.skills.has(id)) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }
    
    const skill = sm.skills.get(id);
    const entry = await sm.addEntry(id, data);
    const todayStats = await sm.getTodayStats(id);
    
    let goalProgress = null;
    if (skill.dailyGoal) {
      goalProgress = {
        current: todayStats.sum,
        target: skill.dailyGoal,
        percent: Math.round((todayStats.sum / skill.dailyGoal) * 100),
        met: todayStats.sum >= skill.dailyGoal
      };
    }
    
    return NextResponse.json({ 
      success: true, 
      entry,
      todaySum: todayStats.sum,
      goalProgress
    });
  } catch (error: any) {
    console.error('Entry add error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sm = await getSkillManager();
    
    // Delete the skill file
    const fs = await import('fs/promises');
    const skillPath = path.join(STATIC_REBEL_DIR, 'skills', `${id}.md`);
    const dataPath = path.join(STATIC_REBEL_DIR, 'data', `${id}.json`);
    
    try { await fs.unlink(skillPath); } catch {}
    try { await fs.unlink(dataPath); } catch {}
    
    // Clear cache
    skillManagerInstance = null;
    
    return NextResponse.json({ success: true, deleted: id });
  } catch (error: any) {
    console.error('Skill delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
