import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

// Dynamic import of skill manager (ESM)
async function getSkillManager() {
  const skillsPath = path.join(process.cwd(), '..', 'lib', 'skills', 'index.js');
  const { getSkillManager } = await import(skillsPath);
  return getSkillManager();
}

async function getGoalTracker(dataDir: string) {
  const skillsPath = path.join(process.cwd(), '..', 'lib', 'skills', 'index.js');
  const { GoalTracker } = await import(skillsPath);
  const tracker = new GoalTracker(dataDir);
  await tracker.init();
  return tracker;
}

export async function GET() {
  try {
    const sm = await getSkillManager();
    const goals = await getGoalTracker(sm.dataDir);
    
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
  } catch (error) {
    console.error('Skills fetch error:', error);
    return NextResponse.json({ skills: [], error: String(error) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, description, triggers, dataType, dailyGoal, unit } = await request.json();
    
    if (!name) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 });
    }
    
    const sm = await getSkillManager();
    
    const schema: any = { type: dataType || 'numeric' };
    if (unit) schema.unit = unit;
    
    const skill = await sm.createSkill(name, {
      description: description || `Track ${name.toLowerCase()}`,
      triggers: triggers || [name.toLowerCase()],
      dataSchema: schema
    });
    
    if (dailyGoal) {
      const goals = await getGoalTracker(sm.dataDir);
      await goals.setGoal(skill.id, { daily: dailyGoal, unit: unit || '' });
    }
    
    return NextResponse.json({ success: true, skill });
  } catch (error) {
    console.error('Skill create error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
