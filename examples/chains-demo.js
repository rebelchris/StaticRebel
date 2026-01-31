#!/usr/bin/env node
/**
 * Chains Demo - shows skill chaining and follow-up actions
 * 
 * Run: node examples/chains-demo.js
 */

import { getSkillManager, GoalTracker, ChainEngine } from '../lib/skills/index.js';

async function demo() {
  console.log('🔗 StaticRebel Skill Chaining Demo\n');
  console.log('═'.repeat(50));

  const sm = await getSkillManager();
  const goals = new GoalTracker(sm.dataDir);
  await goals.init();
  
  const chains = new ChainEngine(sm, goals, sm.dataDir);
  await chains.init();

  // Set up a water goal
  await goals.setGoal('water', { daily: 2000, unit: 'ml' });

  // Show configured chains
  console.log('\n📋 CONFIGURED CHAINS\n');
  for (const chain of chains.listChains()) {
    console.log(`  ${chain.id}`);
    console.log(`    Trigger: ${chain.trigger}`);
    console.log(`    Action: ${chain.action} - "${chain.message}..."`);
    console.log();
  }

  // ============== SCENARIO 1: Exercise triggers mood check ==============
  console.log('═'.repeat(50));
  console.log('\n🏃 SCENARIO 1: Exercise logged\n');
  
  const exerciseEntry = { type: 'run', duration: 30, distance: 5 };
  console.log('Logging: 30 min run, 5k');
  
  const exerciseActions = await chains.onEntryLogged('exercise', exerciseEntry);
  console.log('\nTriggered actions:');
  for (const action of exerciseActions) {
    console.log(`  [${action.type}] ${action.message}`);
  }

  const suggestions = chains.getSuggestions(exerciseActions);
  if (suggestions.length) {
    console.log('\nSuggested follow-ups:');
    for (const s of suggestions) {
      console.log(`  → Log ${s.skill}: "${s.prompt || 'no prompt'}"`);
    }
  }

  // ============== SCENARIO 2: Low mood triggers suggestions ==============
  console.log('\n═'.repeat(50));
  console.log('\n😔 SCENARIO 2: Low mood logged\n');
  
  const lowMoodEntry = { score: 3, note: 'rough day' };
  console.log('Logging: mood score 3');
  
  const moodActions = await chains.onEntryLogged('mood', lowMoodEntry);
  console.log('\nTriggered actions:');
  for (const action of moodActions) {
    console.log(`  [${action.type}] ${action.message}`);
    if (action.suggestedSkills) {
      console.log(`    Suggests: ${action.suggestedSkills.join(', ')}`);
    }
  }

  // ============== SCENARIO 3: High mood gets celebration ==============
  console.log('\n═'.repeat(50));
  console.log('\n🎉 SCENARIO 3: High mood logged\n');
  
  const highMoodEntry = { score: 9, note: 'amazing day!' };
  console.log('Logging: mood score 9');
  
  const celebrateActions = await chains.onEntryLogged('mood', highMoodEntry);
  console.log('\nTriggered actions:');
  for (const action of celebrateActions) {
    console.log(`  [${action.type}] ${action.message}`);
  }

  // ============== SCENARIO 4: Goal completion ==============
  console.log('\n═'.repeat(50));
  console.log('\n🎯 SCENARIO 4: Water goal reached\n');
  
  // Log water to reach goal
  await sm.addEntry('water', { value: 1500 });
  console.log('Previously logged: 1500ml');
  
  const finalWater = { value: 600 };
  console.log('Now logging: 600ml (total: 2100ml, goal: 2000ml)');
  
  const goalActions = await chains.onEntryLogged('water', finalWater);
  console.log('\nTriggered actions:');
  for (const action of goalActions) {
    console.log(`  [${action.type}] ${action.message}`);
  }

  // ============== SCENARIO 5: Delayed reminder ==============
  console.log('\n═'.repeat(50));
  console.log('\n⏰ SCENARIO 5: Delayed reminders\n');
  
  // Check for the hydration reminder from exercise
  console.log('Pending reminders:');
  for (const r of chains.pendingReminders) {
    const inMinutes = Math.round((r.triggerAt - Date.now()) / 60000);
    console.log(`  "${r.message}" (in ${inMinutes} min)`);
  }

  // ============== CUSTOM CHAIN ==============
  console.log('\n═'.repeat(50));
  console.log('\n✨ ADDING CUSTOM CHAIN\n');

  const customChain = await chains.addChain({
    id: 'notes-to-mood',
    trigger: { skill: 'notes', event: 'logged' },
    action: { 
      type: 'prompt', 
      skill: 'mood', 
      message: '📝 Note saved! How are you feeling right now?' 
    }
  });
  console.log(`Added: ${customChain.id}`);

  // Test it
  const noteActions = await chains.onEntryLogged('notes', { content: 'remember to call mom' });
  console.log('After logging a note:');
  for (const action of noteActions) {
    console.log(`  [${action.type}] ${action.message}`);
  }

  // ============== MESSAGES HELPER ==============
  console.log('\n═'.repeat(50));
  console.log('\n💬 GETTING MESSAGES FOR CHAT\n');

  const allActions = [...exerciseActions, ...goalActions];
  const messages = chains.getMessages(allActions);
  console.log('Messages to show user:');
  for (const msg of messages) {
    console.log(`  "${msg}"`);
  }

  console.log('\n═'.repeat(50));
  console.log('\n✅ Demo complete!');
}

demo().catch(console.error);
