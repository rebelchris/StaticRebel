#!/usr/bin/env node
/**
 * NLP & Goals Demo - shows the intelligent skills system
 * 
 * Run: node examples/nlp-demo.js
 */

import { getSkillManager, parseInput, parseWithSuggestions, GoalTracker, visualize } from '../lib/skills/index.js';

async function demo() {
  console.log('🧠 StaticRebel NLP & Goals Demo\n');
  console.log('═'.repeat(50));

  // Initialize
  const sm = await getSkillManager();
  const goals = new GoalTracker(sm.dataDir);
  await goals.init();

  // ============== NLP PARSING ==============
  console.log('\n📝 NATURAL LANGUAGE PARSING\n');
  
  const testInputs = [
    "drank 2 glasses of water",
    "ran 5k in 28 minutes this morning",
    "feeling pretty good today, maybe 7 out of 10",
    "mood 8 - great meeting with the team",
    "walked 3000 steps",
    "note: call dentist tomorrow",
    "gym workout for 45 minutes",
    "had 500ml water with lunch"
  ];

  for (const input of testInputs) {
    const result = parseInput(input);
    if (result) {
      console.log(`"${input}"`);
      console.log(`  → Skill: ${result.skill}`);
      console.log(`  → Entry: ${JSON.stringify(result.entry)}`);
      console.log();
    }
  }

  // ============== LOGGING WITH NLP ==============
  console.log('═'.repeat(50));
  console.log('\n💾 LOGGING ENTRIES VIA NLP\n');

  // Parse and log
  const inputs = [
    "drank 500ml water",
    "had a glass of water", 
    "drank 2L water", // big bottle
    "mood 7 - productive afternoon",
    "ran 5k"
  ];

  for (const input of inputs) {
    const parsed = parseInput(input);
    if (parsed) {
      const entry = await sm.addEntry(parsed.skill, parsed.entry);
      console.log(`✓ "${input}" → ${parsed.skill}: ${JSON.stringify(parsed.entry)}`);
    }
  }

  // ============== GOALS ==============
  console.log('\n═'.repeat(50));
  console.log('\n🎯 GOAL TRACKING\n');

  // Set goals
  await goals.setGoal('water', { daily: 2000, weekly: 14000, unit: 'ml' });
  await goals.setGoal('exercise', { weekly: 3, unit: 'sessions' });
  console.log('Goals set: water (2000ml/day), exercise (3x/week)\n');

  // Check progress
  const waterEntries = await sm.getEntries('water');
  const waterProgress = await goals.getSkillProgress('water', waterEntries, 'value');
  
  console.log('Water progress:');
  if (waterProgress.goal?.daily) {
    console.log(visualize.goalProgress('  Today', 
      waterProgress.goal.daily.current, 
      waterProgress.goal.daily.target, 
      'ml'
    ));
  }

  // ============== STREAKS ==============
  console.log('\n═'.repeat(50));
  console.log('\n🔥 STREAKS & ACHIEVEMENTS\n');

  // Simulate some historical data for streak demo
  const today = new Date();
  for (let i = 1; i <= 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    await sm.addEntry('water', { 
      value: 1500 + Math.random() * 500,
      date: date.toISOString().split('T')[0]
    });
  }

  // Recalculate with historical data
  const allWater = await sm.getEntries('water');
  const finalProgress = await goals.getSkillProgress('water', allWater, 'value');
  
  console.log(visualize.streakDisplay(
    finalProgress.streak.current,
    finalProgress.streak.longest
  ));

  if (finalProgress.achievements.length) {
    console.log('\nAchievements:');
    console.log(visualize.achievementsList(finalProgress.achievements));
  }

  // ============== VISUALIZATIONS ==============
  console.log('\n═'.repeat(50));
  console.log('\n📊 VISUALIZATIONS\n');

  // Weekly chart
  const aggregations = await sm.getAggregations('water', 'value', 'day');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const chartData = aggregations.slice(-7).map(a => ({
    day: days[new Date(a.period).getDay()],
    value: Math.round(a.sum)
  }));

  if (chartData.length) {
    console.log('Water intake (last 7 days):');
    console.log(visualize.weeklyChart(chartData, 2500, 'ml'));
  }

  // Sparkline
  const values = aggregations.map(a => a.sum);
  if (values.length >= 3) {
    console.log('\nTrend: ' + visualize.sparkline(values));
  }

  // ============== FULL SUMMARY ==============
  console.log('\n═'.repeat(50));
  console.log('\n📋 FULL SKILL SUMMARY\n');

  const stats = await sm.getStats('water', 'value');
  console.log(visualize.skillSummary(
    { name: 'Water Tracking' },
    stats,
    finalProgress
  ));

  // ============== MINI STATUS ==============
  console.log('\n═'.repeat(50));
  console.log('\n⚡ QUICK STATUS FEEDBACK\n');

  // Simulate what happens when user logs something
  const newEntry = await sm.addEntry('water', { value: 250 });
  const latestEntries = await sm.getEntries('water');
  const latestProgress = await goals.getSkillProgress('water', latestEntries, 'value');
  
  console.log('After logging "drank water":');
  console.log(visualize.miniStatus('logged', 'water', newEntry, latestProgress));

  console.log('\n═'.repeat(50));
  console.log('\n✅ Demo complete!');
}

demo().catch(console.error);
