#!/usr/bin/env node
/**
 * Dashboard Demo - starts the web dashboard
 * 
 * Run: node examples/dashboard-demo.js
 * Then open: http://localhost:3456
 */

import { 
  getSkillManager, 
  GoalTracker, 
  createDashboardServer 
} from '../lib/skills/index.js';

async function main() {
  console.log('🦞 StaticRebel Dashboard Demo\n');

  // Initialize components
  const sm = await getSkillManager();
  const goals = new GoalTracker(sm.dataDir);
  await goals.init();

  // Create some demo data if empty
  if (sm.skills.size === 0) {
    console.log('Creating demo skills and data...\n');
    
    // Create skills
    await sm.createSkill('Water', {
      description: 'Track water intake',
      triggers: ['water', 'drank', 'hydrate'],
      dataSchema: { type: 'numeric', unit: 'ml' }
    });
    
    await sm.createSkill('Mood', {
      description: 'Track daily mood',
      triggers: ['mood', 'feeling'],
      dataSchema: { type: 'scale', range: [1, 10] }
    });
    
    await sm.createSkill('Exercise', {
      description: 'Track workouts',
      triggers: ['exercise', 'workout', 'ran'],
      dataSchema: { type: 'activity' }
    });

    // Set goals
    await goals.setGoal('water', { daily: 2000, unit: 'ml' });
    await goals.setGoal('mood', { daily: 1, unit: 'check-in' });

    // Add demo entries (last 7 days)
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Water entries
      const waterAmount = 1500 + Math.random() * 700;
      for (let j = 0; j < 3 + Math.floor(Math.random() * 3); j++) {
        await sm.addEntry('water', {
          value: Math.round(waterAmount / 4),
          note: ['morning', 'with lunch', 'afternoon', 'evening'][j] || '',
          date: dateStr,
          timestamp: date.getTime() + j * 3600000
        });
      }

      // Mood entries
      const moodScore = 5 + Math.floor(Math.random() * 4);
      await sm.addEntry('mood', {
        score: moodScore,
        note: moodScore >= 7 ? 'good day' : moodScore >= 5 ? 'okay' : 'rough',
        date: dateStr,
        timestamp: date.getTime() + 20 * 3600000
      });

      // Exercise (some days)
      if (Math.random() > 0.4) {
        await sm.addEntry('exercise', {
          type: ['run', 'walk', 'gym'][Math.floor(Math.random() * 3)],
          duration: 20 + Math.floor(Math.random() * 40),
          date: dateStr,
          timestamp: date.getTime() + 8 * 3600000
        });
      }
    }

    console.log('Demo data created!\n');
  }

  // Start the dashboard server
  const dashboard = createDashboardServer(sm, goals, { port: 3456 });
  await dashboard.start();

  console.log('\n📊 Dashboard is running!');
  console.log('   Open: http://localhost:3456\n');
  console.log('Press Ctrl+C to stop.\n');

  // Keep running
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await dashboard.stop();
    process.exit(0);
  });
}

main().catch(console.error);
