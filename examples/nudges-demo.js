#!/usr/bin/env node
/**
 * Nudges Demo - shows proactive reminder generation
 * 
 * Run: node examples/nudges-demo.js
 */

import { getSkillManager, GoalTracker, NudgeEngine } from '../lib/skills/index.js';

async function demo() {
  console.log('🔔 StaticRebel Nudges Demo\n');
  console.log('═'.repeat(50));

  const sm = await getSkillManager();
  const goals = new GoalTracker(sm.dataDir);
  await goals.init();
  
  const nudges = new NudgeEngine(sm, goals, sm.dataDir);
  await nudges.init();

  // Set up some goals
  await goals.setGoal('water', { daily: 2000, unit: 'ml' });
  await goals.setGoal('mood', { daily: 1, unit: 'entries' });

  // Generate sample data with patterns
  console.log('\n📊 Generating sample data...\n');
  
  const today = new Date();
  const currentHour = today.getHours();
  
  // Build a streak (past 5 days)
  for (let i = 1; i <= 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Water entries at specific hours (to learn patterns)
    for (const hour of [9, 12, 15, 18]) {
      const timestamp = new Date(date);
      timestamp.setHours(hour, 0, 0, 0);
      await sm.addEntry('water', { 
        value: 250 + Math.random() * 100,
        timestamp: timestamp.getTime(),
        date: dateStr
      });
    }
    
    // Mood entries in evening
    const moodTime = new Date(date);
    moodTime.setHours(20, 0, 0, 0);
    await sm.addEntry('mood', {
      score: 6 + Math.floor(Math.random() * 3),
      timestamp: moodTime.getTime(),
      date: dateStr
    });
  }

  // Learn patterns
  console.log('📈 Learning patterns...\n');
  const waterPatterns = await nudges.learnPatterns('water');
  const moodPatterns = await nudges.learnPatterns('mood');

  console.log('Water patterns:');
  console.log(`  Peak hours: ${waterPatterns.peakHours.map(h => `${h}:00`).join(', ')}`);
  console.log(`  Avg per day: ${waterPatterns.avgPerDay} entries`);
  
  if (moodPatterns) {
    console.log('\nMood patterns:');
    console.log(`  Peak hours: ${moodPatterns.peakHours.map(h => `${h}:00`).join(', ')}`);
  } else {
    console.log('\nMood patterns: Not enough data yet');
  }

  // ============== NUDGE SCENARIOS ==============
  
  console.log('\n═'.repeat(50));
  console.log('\n🔔 NUDGE SCENARIOS\n');

  // Scenario 1: No entries today (streak at risk!)
  console.log('Scenario: No entries logged today (5-day streak at risk)');
  console.log('Current time:', today.toLocaleTimeString());
  console.log();

  const allNudges = await nudges.generateNudges();
  
  if (allNudges.length > 0) {
    console.log('Generated nudges:');
    for (const nudge of allNudges) {
      const priorityIcon = { high: '🔴', medium: '🟡', low: '🟢' }[nudge.priority];
      console.log(`  ${priorityIcon} [${nudge.type}] ${nudge.message}`);
    }
  } else {
    console.log('  No nudges needed right now');
  }

  // Scenario 2: Partial progress toward goal
  console.log('\n--- Adding some water entries today ---\n');
  
  await sm.addEntry('water', { value: 500 });
  await sm.addEntry('water', { value: 700 });
  await sm.addEntry('water', { value: 500 });
  // Total: 1700ml (85% of 2000ml goal)

  const updatedNudges = await nudges.generateNudges();
  console.log('Updated nudges after logging 1700ml:');
  for (const nudge of updatedNudges) {
    const priorityIcon = { high: '🔴', medium: '🟡', low: '🟢' }[nudge.priority];
    console.log(`  ${priorityIcon} [${nudge.type}] ${nudge.message}`);
  }

  // ============== SMART SUGGESTIONS ==============
  
  console.log('\n═'.repeat(50));
  console.log('\n💡 SMART SUGGESTIONS\n');

  const suggestion = await nudges.suggestSkillToLog();
  if (suggestion) {
    console.log(`Suggested skill to log: ${suggestion.name}`);
    console.log(`  Score: ${suggestion.score}`);
    console.log(`  Reasons: ${suggestion.reasons.join(', ')}`);
  }

  // ============== TIMING CHECK ==============
  
  console.log('\n═'.repeat(50));
  console.log('\n⏰ TIMING ANALYSIS\n');

  for (const skillId of ['water', 'mood']) {
    const timing = nudges.isGoodTimeToNudge(skillId);
    console.log(`${skillId}: ${timing.good ? '✓ Good time' : '✗ Not ideal'} (${timing.reason})`);
  }

  // ============== CONTEXTUAL NUDGE ==============
  
  console.log('\n═'.repeat(50));
  console.log('\n🎯 CONTEXTUAL NUDGE (for chat)\n');

  const contextNudge = await nudges.getContextualNudge();
  if (contextNudge) {
    console.log(`"${contextNudge.message}"`);
  } else {
    console.log('All good! No nudge needed.');
  }

  console.log('\n═'.repeat(50));
  console.log('\n✅ Demo complete!');
}

demo().catch(console.error);
