import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

// Detect project root
async function getProjectRoot() {
  const cwd = process.cwd();
  
  if (cwd.endsWith('/dashboard') || cwd.endsWith('\\dashboard')) {
    return path.resolve(cwd, '..');
  }
  
  try {
    await fs.access(path.join(cwd, 'lib', 'skills', 'index.js'));
    return cwd;
  } catch {
    try {
      await fs.access(path.join(cwd, '..', 'lib', 'skills', 'index.js'));
      return path.resolve(cwd, '..');
    } catch {
      throw new Error(`Cannot find skills lib. cwd=${cwd}`);
    }
  }
}

let skillManagerInstance: any = null;
let goalTrackerInstance: any = null;
let projectRoot: string | null = null;

async function getRoot() {
  if (!projectRoot) {
    projectRoot = await getProjectRoot();
  }
  return projectRoot;
}

async function getSkillManager() {
  if (skillManagerInstance) return skillManagerInstance;
  
  const root = await getRoot();
  const skillsPath = path.join(root, 'lib', 'skills', 'index.js');
  
  const mod = await import(skillsPath);
  const sm = new mod.SkillManager({
    skillsDir: path.join(root, 'skills'),
    dataDir: path.join(root, 'data')
  });
  await sm.init();
  skillManagerInstance = sm;
  return sm;
}

async function getGoalTracker() {
  if (goalTrackerInstance) return goalTrackerInstance;
  
  const root = await getRoot();
  const skillsPath = path.join(root, 'lib', 'skills', 'index.js');
  
  const mod = await import(skillsPath);
  const tracker = new mod.GoalTracker(path.join(root, 'data'));
  await tracker.init();
  goalTrackerInstance = tracker;
  return tracker;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const sm = await getSkillManager();
    
    if (!sm.skills.has(id)) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }
    
    const skill = sm.skills.get(id);
    const entries = await sm.getEntries(id);
    const stats = await sm.getStats(id);
    
    const goals = await getGoalTracker();
    const goal = goals.getGoal(id);
    const streak = goals.calculateStreak(entries);
    
    return NextResponse.json({
      id,
      name: skill.name,
      description: skill.description,
      triggers: skill.triggers,
      entries,
      stats,
      goal,
      streak
    });
  } catch (error: any) {
    console.error('Skill fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const data = await request.json();
    
    // Clear cache to get fresh data
    skillManagerInstance = null;
    goalTrackerInstance = null;
    
    const sm = await getSkillManager();
    
    if (!sm.skills.has(id)) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }
    
    const entry = await sm.addEntry(id, data);
    
    const goals = await getGoalTracker();
    const goal = goals.getGoal(id);
    let goalProgress = null;
    
    if (goal?.daily) {
      const today = new Date().toISOString().split('T')[0];
      const todayEntries = (await sm.getEntries(id)).filter((e: any) => e.date === today);
      const total = todayEntries.reduce((sum: number, e: any) => 
        sum + (parseFloat(e.value) || parseFloat(e.score) || 1), 0);
      
      goalProgress = {
        current: total,
        target: goal.daily,
        percent: Math.round((total / goal.daily) * 100),
        met: total >= goal.daily
      };
    }
    
    const allEntries = await sm.getEntries(id);
    const streak = goals.calculateStreak(allEntries);
    
    return NextResponse.json({ 
      success: true, 
      entry,
      goalProgress,
      streak
    });
  } catch (error: any) {
    console.error('Entry add error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ error: 'Delete not implemented' }, { status: 501 });
}
