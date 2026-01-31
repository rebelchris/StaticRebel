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

/**
 * POST /api/skills/log
 * 
 * Natural language logging endpoint.
 * Input: { text: "drank 500ml water" }
 * Output: { success, skill, entry, message }
 */
export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }
    
    const root = await getProjectRoot();
    const skillsPath = path.join(root, 'lib', 'skills', 'index.js');
    
    // Load modules
    const mod = await import(skillsPath);
    const { parseInput } = mod;
    
    // Parse the natural language input
    const parsed = parseInput(text);
    
    if (!parsed) {
      return NextResponse.json({ 
        success: false, 
        error: 'Could not understand input. Try mentioning: water, mood, exercise',
        parsed: null 
      }, { status: 400 });
    }
    
    // Load skill manager
    const sm = new mod.SkillManager({
      skillsDir: path.join(root, 'skills'),
      dataDir: path.join(root, 'data')
    });
    await sm.init();
    
    // Check if skill exists
    if (!sm.skills.has(parsed.skill)) {
      return NextResponse.json({ 
        success: false, 
        error: `Skill "${parsed.skill}" not found. Available: ${[...sm.skills.keys()].join(', ')}`,
        parsed 
      }, { status: 404 });
    }
    
    // Log the entry
    const entry = await sm.addEntry(parsed.skill, parsed.entry);
    
    // Get goal progress
    const goals = new mod.GoalTracker(path.join(root, 'data'));
    await goals.init();
    const goal = goals.getGoal(parsed.skill);
    
    let goalProgress = null;
    if (goal?.daily) {
      const today = new Date().toISOString().split('T')[0];
      const todayEntries = (await sm.getEntries(parsed.skill)).filter((e: any) => e.date === today);
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
    const allEntries = await sm.getEntries(parsed.skill);
    const streak = goals.calculateStreak(allEntries);
    
    // Generate response message
    const skill = sm.skills.get(parsed.skill);
    let message = `✓ Logged to ${skill.name}`;
    if (parsed.entry.value) message += `: ${parsed.entry.value}`;
    if (goalProgress) {
      message += ` (${goalProgress.current}/${goalProgress.target} today)`;
      if (goalProgress.met) message += ' 🎯';
    }
    if (streak.current > 1) message += ` 🔥${streak.current}`;
    
    return NextResponse.json({ 
      success: true, 
      skill: parsed.skill,
      entry,
      parsed,
      goalProgress,
      streak,
      message
    });
    
  } catch (error: any) {
    console.error('NLP log error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
