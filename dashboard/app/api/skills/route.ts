import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';

// Skills system paths - always use home directory
const STATIC_REBEL_DIR = path.join(os.homedir(), '.static-rebel');
const SKILLS_DIR = path.join(STATIC_REBEL_DIR, 'skills');
const DATA_DIR = path.join(STATIC_REBEL_DIR, 'data');

// Lazy-loaded skill manager singleton
let skillManagerInstance: any = null;

async function getSkillManager() {
  if (skillManagerInstance) return skillManagerInstance;
  
  try {
    const SkillManagerModule = await import('../../../../lib/skills/skill-manager.js');
    const sm = new SkillManagerModule.SkillManager({
      skillsDir: SKILLS_DIR,
      dataDir: DATA_DIR
    });
    await sm.init();
    skillManagerInstance = sm;
    return sm;
  } catch (error: any) {
    console.error('Failed to load skills module:', error.message);
    throw new Error(`Cannot load skills: ${error.message}`);
  }
}

export async function GET() {
  try {
    const sm = await getSkillManager();
    
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const skills = [];
    
    for (const [id, skill] of sm.skills) {
      const allEntries = await sm.getEntries(id);
      const todayEntries = allEntries.filter((e: any) => e.date === today);
      const weekEntries = allEntries.filter((e: any) => e.date >= weekAgo);
      
      const getValue = (e: any) => parseFloat(e.value) || parseFloat(e.score) || parseFloat(e.duration) || parseFloat(e.distance) || 1;
      const todaySum = todayEntries.reduce((sum: number, e: any) => sum + getValue(e), 0);
      const weekSum = weekEntries.reduce((sum: number, e: any) => sum + getValue(e), 0);
      
      // Calculate streak
      const streak = calculateStreak(allEntries);
      
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
        icon: skill.icon || '📊',
        unit: skill.unit || '',
        triggers: skill.triggers,
        dailyGoal: skill.dailyGoal,
        stats: {
          totalEntries: allEntries.length,
          todayCount: todayEntries.length,
          todaySum: Math.round(todaySum * 10) / 10,
          weekSum: Math.round(weekSum * 10) / 10
        },
        streak,
        weeklyData,
        recentEntries: allEntries.slice(0, 5)
      });
    }
    
    return NextResponse.json({ 
      skills, 
      generatedAt: Date.now(),
      paths: { skills: SKILLS_DIR, data: DATA_DIR }
    });
  } catch (error: any) {
    console.error('Skills fetch error:', error);
    return NextResponse.json({ 
      skills: [], 
      error: error.message,
      paths: { skills: SKILLS_DIR, data: DATA_DIR }
    });
  }
}

function calculateStreak(entries: any[]): number {
  if (entries.length === 0) return 0;
  
  const dates = [...new Set(entries.map(e => e.date))].sort().reverse();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  // Must have entry today or yesterday to have a streak
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

export async function POST(request: NextRequest) {
  try {
    const { name, description, triggers, unit, dailyGoal, icon } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 });
    }
    
    // Clear cache to get fresh data
    skillManagerInstance = null;
    const sm = await getSkillManager();
    
    const skill = await sm.createSkill(name, {
      description: description || `Track ${name.toLowerCase()}`,
      triggers: triggers || [name.toLowerCase()],
      unit: unit || '',
      dailyGoal: dailyGoal || null,
      icon: icon || '📊'
    });
    
    return NextResponse.json({ success: true, skill });
  } catch (error: any) {
    console.error('Skill create error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Force reload skills (useful after external changes)
export async function PUT() {
  skillManagerInstance = null;
  const sm = await getSkillManager();
  return NextResponse.json({ 
    success: true, 
    skillCount: sm.skills.size,
    message: 'Skills reloaded'
  });
}
