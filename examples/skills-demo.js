#!/usr/bin/env node
/**
 * Skills Demo - shows how the dynamic skills system works
 * 
 * Run: node examples/skills-demo.js
 */

import { getSkillManager } from '../lib/skills/index.js';

async function demo() {
  console.log('🦞 StaticRebel Skills Demo\n');

  // Initialize the skill manager
  const sm = await getSkillManager();

  // Show loaded skills
  console.log('📚 Loaded Skills:');
  for (const [id, skill] of sm.skills) {
    console.log(`  - ${skill.name} (${id})`);
    console.log(`    Triggers: ${skill.triggers.slice(0, 3).join(', ')}...`);
  }

  console.log('\n---\n');

  // Demo: Log some water
  console.log('💧 Logging water intake...');
  const entry1 = await sm.addEntry('water', { value: 250, note: 'morning glass' });
  console.log(`  Added: ${JSON.stringify(entry1)}`);

  const entry2 = await sm.addEntry('water', { value: 500, note: 'with lunch' });
  console.log(`  Added: ${JSON.stringify(entry2)}`);

  // Demo: Get stats
  console.log('\n📊 Water Stats:');
  const stats = await sm.getStats('water', 'value');
  console.log(`  Total: ${stats.sum}ml`);
  console.log(`  Entries: ${stats.count}`);
  console.log(`  Average: ${stats.avg.toFixed(0)}ml per entry`);

  // Demo: Log mood
  console.log('\n😊 Logging mood...');
  await sm.addEntry('mood', { score: 7, note: 'productive day' });
  
  // Demo: Get history
  console.log('\n📜 Recent mood entries:');
  const moodHistory = await sm.getEntries('mood', { limit: 5 });
  for (const entry of moodHistory) {
    console.log(`  [${entry.date}] Score: ${entry.score} - ${entry.note || 'no note'}`);
  }

  // Demo: Create a new skill dynamically
  console.log('\n✨ Creating new skill: Coffee Tracking...');
  const coffeeSkill = await sm.createSkill('Coffee', {
    description: 'Track daily coffee consumption',
    triggers: ['coffee', 'caffeine', 'espresso', 'latte'],
    dataSchema: { type: 'numeric', unit: 'cups', dailyLimit: 4 },
    actions: ['log', 'today', 'history', 'limit-check']
  });
  console.log(`  Created skill: ${coffeeSkill.name}`);
  console.log(`  File: skills/${coffeeSkill.id}.md`);

  // Demo: Use the new skill
  await sm.addEntry('coffee', { value: 1, type: 'espresso', note: 'morning shot' });
  console.log('  Logged 1 espresso');

  // Summary
  console.log('\n📋 All Skills Summary:');
  const summary = await sm.getSummary();
  console.table(summary.map(s => ({
    Skill: s.name,
    Entries: s.entryCount,
    LastEntry: s.lastEntry ? new Date(s.lastEntry).toLocaleString() : 'never'
  })));

  console.log('\n✅ Demo complete!');
  console.log('Check the skills/ and data/ directories to see persisted files.');
}

demo().catch(console.error);
