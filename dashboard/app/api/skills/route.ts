import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

// Detect project root - handles both:
// 1. Running from dashboard/ (npm run dev from dashboard)
// 2. Running from project root (npm run dev from root)
async function getProjectRoot() {
  const cwd = process.cwd();
  
  // Check if we're in the dashboard directory
  if (cwd.endsWith('/dashboard') || cwd.endsWith('\\dashboard')) {
    return path.resolve(cwd, '..');
  }
  
  // Check if lib/skills exists in cwd (we're at project root)
  try {
    await fs.access(path.join(cwd, 'lib', 'skills', 'index.js'));
    return cwd;
  } catch {
    // Try parent
    try {
      await fs.access(path.join(cwd, '..', 'lib', 'skills', 'index.js'));
      return path.resolve(cwd, '..');
    } catch {
      throw new Error(`Cannot find skills lib. cwd=${cwd}`);
    }
  }
}

// Lazy-loaded skill manager singleton
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
  
  try {
    const mod = await import(skillsPath);
    const sm = new mod.SkillManager({
      skillsDir: path.join(root, 'skills'),
      dataDir: path.join(root, 'data')
    });
    await sm.init();
    skillManagerInstance = sm;
    return sm;
  } catch (error: any) {
    console.error('Failed to load skills module from:', skillsPath);
    throw new Error(`Cannot load skills: ${error.message}`);
  }
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

export async function GET() {
  try {
    const sm = await getSkillManager();
    const goals = await getGoalTracker();
    
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const skills = [];
    
    for (const [id, skill] of sm.skills) {
      const allEntries = await sm.getEntries(id);
      const todayEntries = allEntries.filter((e: any) => e.date === today);
      const weekEntries = allEntries.filter((e: any) => e.date >= weekAgo);
      
      const getValue = (e: any) => parseFloat(e.value) || parseFloat(e.score) || parseFloat(e.duration) || 1;
      const todaySum = todayEntries.reduce((sum: number, e: any) => sum + getValue(e), 0);
      const weekSum = weekEntries.reduce((sum: number, e: any) => sum + getValue(e), 0);
      
      const goal = goals.getGoal(id);
      const streak = goals.calculateStreak(allEntries);
      
      // Weekly chart data
      const weeklyData = [];
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayEntries = allEntries.filter((e: any) => e.date === dateStr);
        const daySum = dayEntries.reduce((sum: number, e: any) => sum + getValue(e), 0);
        weeklyData.push({
          day: days[d.getDay()],
          date: dateStr,
          value: Math.round(daySum * 10) / 10
        });
      }
      
      skills.push({
        id,
        name: skill.name,
        description: skill.description,
        triggers: skill.triggers,
        stats: {
          totalEntries: allEntries.length,
          todayCount: todayEntries.length,
          todaySum: Math.round(todaySum * 10) / 10,
          weekSum: Math.round(weekSum * 10) / 10
        },
        goal,
        streak,
        weeklyData,
        recentEntries: allEntries.slice(0, 5)
      });
    }
    
    return NextResponse.json({ skills, generatedAt: Date.now() });
  } catch (error: any) {
    console.error('Skills fetch error:', error);
    return NextResponse.json({ skills: [], error: error.message });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, description, triggers, dataType, dailyGoal, unit } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 });
    }
    
    // Clear cache to get fresh data
    skillManagerInstance = null;
    const sm = await getSkillManager();
    
    const schema: any = { type: dataType || 'numeric' };
    if (unit) schema.unit = unit;
    
    const skill = await sm.createSkill(name, {
      description: description || `Track ${name.toLowerCase()}`,
      triggers: triggers || [name.toLowerCase()],
      dataSchema: schema
    });
    
    if (dailyGoal) {
      goalTrackerInstance = null;
      const goals = await getGoalTracker();
      await goals.setGoal(skill.id, { daily: dailyGoal, unit: unit || '' });
    }
    
    return NextResponse.json({ success: true, skill });
  } catch (error: any) {
    console.error('Skill create error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
