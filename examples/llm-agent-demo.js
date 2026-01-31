#!/usr/bin/env node
/**
 * LLM Agent Demo - shows LLM-driven skill interactions
 * 
 * Run: node examples/llm-agent-demo.js
 * 
 * For real LLM: Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_HOST
 * Without API key: Uses mock provider for demo
 */

import { 
  getSkillManager, 
  GoalTracker, 
  InsightsEngine,
  NudgeEngine,
  SkillAgent,
  llmProviders 
} from '../lib/skills/index.js';

async function demo() {
  console.log('🤖 StaticRebel LLM Agent Demo\n');
  console.log('═'.repeat(50));

  // Initialize components
  const sm = await getSkillManager();
  const goals = new GoalTracker(sm.dataDir);
  await goals.init();
  const insights = new InsightsEngine(sm);
  const nudges = new NudgeEngine(sm, goals, sm.dataDir);
  await nudges.init();

  // Create some initial skills for demo
  if (!sm.skills.has('water')) {
    await sm.createSkill('Water', {
      description: 'Track water intake',
      triggers: ['water', 'drank', 'hydrate'],
      dataSchema: { type: 'numeric', unit: 'ml' }
    });
    await goals.setGoal('water', { daily: 2000, unit: 'ml' });
  }
  
  if (!sm.skills.has('mood')) {
    await sm.createSkill('Mood', {
      description: 'Track daily mood',
      triggers: ['mood', 'feeling', 'feel'],
      dataSchema: { type: 'scale', range: [1, 10] }
    });
  }

  // Create LLM provider (auto-detects based on env vars)
  const llmProvider = llmProviders.createAutoProvider();

  // Create the agent
  const agent = new SkillAgent({
    skillManager: sm,
    goalTracker: goals,
    insightsEngine: insights,
    nudgeEngine: nudges,
    llmProvider
  });

  const chatId = 'demo-user';

  // Helper to simulate chat
  async function chat(message) {
    console.log(`\n👤 User: "${message}"`);
    
    try {
      const result = await agent.processMessage(chatId, message);
      
      if (result.toolCalls?.length) {
        console.log('🔧 Tools called:');
        for (const tc of result.toolCalls) {
          console.log(`   ${tc.tool}: ${JSON.stringify(tc.result).slice(0, 100)}...`);
        }
      }
      
      console.log(`🤖 Bot: ${result.response}`);
      return result;
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      return null;
    }
  }

  // ============== DEMO CONVERSATIONS ==============

  console.log('\n📝 LOGGING ENTRIES\n');
  console.log('─'.repeat(50));

  await chat('drank 500ml water');
  await chat('had a glass of water');
  await chat('feeling pretty good today, maybe 7 out of 10');

  console.log('\n\n📊 CHECKING PROGRESS\n');
  console.log('─'.repeat(50));

  await chat('how much water have I had today?');
  await chat('what\'s my mood been like?');

  console.log('\n\n✨ CREATING NEW SKILL\n');
  console.log('─'.repeat(50));

  await chat('I want to track my coffee intake');

  console.log('\n\n📋 LISTING SKILLS\n');
  console.log('─'.repeat(50));

  await chat('what can I track?');

  // ============== SHOW FINAL STATE ==============

  console.log('\n\n═'.repeat(50));
  console.log('\n📚 FINAL STATE\n');

  console.log('Skills:');
  for (const [id, skill] of sm.skills) {
    const entries = await sm.getEntries(id);
    console.log(`  ${skill.name}: ${entries.length} entries`);
  }

  console.log('\nGoals:');
  for (const [id] of sm.skills) {
    const goal = goals.getGoal(id);
    if (goal) {
      console.log(`  ${id}: ${goal.daily}${goal.unit}/day`);
    }
  }

  console.log('\n═'.repeat(50));
  console.log('\n✅ Demo complete!');
  console.log('\nTo use with real LLM, set one of:');
  console.log('  OPENAI_API_KEY=sk-...');
  console.log('  ANTHROPIC_API_KEY=sk-ant-...');
  console.log('  OLLAMA_HOST=http://localhost:11434');
}

demo().catch(console.error);
