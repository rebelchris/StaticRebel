#!/usr/bin/env node
/**
 * Teaching Demo - simulates conversational skill creation
 * 
 * Run: node examples/teaching-demo.js
 */

import { getSkillManager, GoalTracker, SkillTeacher } from '../lib/skills/index.js';

async function demo() {
  console.log('🎓 StaticRebel Skill Teaching Demo\n');
  console.log('═'.repeat(50));

  const sm = await getSkillManager();
  const goals = new GoalTracker(sm.dataDir);
  await goals.init();
  
  const teacher = new SkillTeacher(sm, goals);
  const chatId = 'demo-user';

  // Simulate a conversation
  async function chat(userMessage) {
    console.log(`\n👤 User: "${userMessage}"`);
    const result = await teacher.processMessage(chatId, userMessage);
    console.log(`🤖 Bot: ${result.response}`);
    return result;
  }

  // ============== CONVERSATION 1: Full flow ==============
  console.log('\n📝 CONVERSATION 1: Creating "Coffee" skill\n');
  console.log('─'.repeat(50));

  await chat('teach you to track my coffee');
  await chat('yes');  // Accept the hint
  await chat('counter');  // Pick counter type
  await chat('coffee, caffeine, espresso, latte');  // Triggers
  await chat('4 cups');  // Daily goal
  await chat('yes');  // Confirm

  // ============== CONVERSATION 2: Different path ==============
  console.log('\n\n📝 CONVERSATION 2: Creating "Reading" skill\n');
  console.log('─'.repeat(50));

  await chat('I want to track my reading');
  await chat('Reading Time');  // Custom name
  await chat('duration');  // Duration type
  await chat('read, reading, book, pages');
  await chat('30 minutes');  // Goal
  await chat('yes');

  // ============== CONVERSATION 3: Text skill, no goal ==============
  console.log('\n\n📝 CONVERSATION 3: Creating "Gratitude" skill\n');
  console.log('─'.repeat(50));

  await chat('new skill for gratitude journaling');
  await chat('Gratitude');
  await chat('text');
  await chat('grateful, thankful, appreciate');
  // No goal prompt for text type - goes straight to confirm
  await chat('yes');

  // ============== CONVERSATION 4: Cancel flow ==============
  console.log('\n\n📝 CONVERSATION 4: Cancelled skill\n');
  console.log('─'.repeat(50));

  await chat('track my sleep');
  await chat('Sleep Log');
  await chat('cancel');  // User cancels

  // ============== Show created skills ==============
  console.log('\n\n═'.repeat(50));
  console.log('\n📚 SKILLS CREATED\n');

  for (const [id, skill] of sm.skills) {
    console.log(`  ✓ ${skill.name} (${id})`);
    console.log(`    Triggers: ${skill.triggers.slice(0, 4).join(', ')}`);
  }

  // Show goals
  console.log('\n🎯 GOALS SET\n');
  const coffeeGoal = goals.getGoal('coffee');
  const readingGoal = goals.getGoal('reading-time');
  
  if (coffeeGoal) console.log(`  Coffee: ${coffeeGoal.daily} ${coffeeGoal.unit}/day`);
  if (readingGoal) console.log(`  Reading: ${readingGoal.daily} ${readingGoal.unit}/day`);

  console.log('\n═'.repeat(50));
  console.log('\n✅ Demo complete!');
}

demo().catch(console.error);
