import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

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
    
    const goals = await getGoalTracker(sm.dataDir);
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
  } catch (error) {
    console.error('Skill fetch error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST - Add entry to skill
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const data = await request.json();
    
    const sm = await getSkillManager();
    
    if (!sm.skills.has(id)) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }
    
    const entry = await sm.addEntry(id, data);
    
    // Check goal progress
    const goals = await getGoalTracker(sm.dataDir);
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
    
    // Get streak
    const allEntries = await sm.getEntries(id);
    const streak = goals.calculateStreak(allEntries);
    
    return NextResponse.json({ 
      success: true, 
      entry,
      goalProgress,
      streak
    });
  } catch (error) {
    console.error('Entry add error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE - Delete a skill
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const sm = await getSkillManager();
    
    // For now, just return not implemented
    // Would need to add deleteSkill method to SkillManager
    return NextResponse.json({ error: 'Delete not implemented' }, { status: 501 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
