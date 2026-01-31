#!/usr/bin/env node
/**
 * Insights Demo - shows pattern detection and correlations
 * 
 * Run: node examples/insights-demo.js
 */

import { getSkillManager, InsightsEngine } from '../lib/skills/index.js';

async function demo() {
  console.log('🔍 StaticRebel Insights Demo\n');
  console.log('═'.repeat(50));

  const sm = await getSkillManager();
  const insights = new InsightsEngine(sm);

  // Generate some sample data with patterns
  console.log('\n📊 Generating sample data with patterns...\n');
  
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Water: lower on weekends
    const waterAmount = isWeekend 
      ? 1200 + Math.random() * 400  // 1200-1600 on weekends
      : 1800 + Math.random() * 400; // 1800-2200 on weekdays
    await sm.addEntry('water', { value: waterAmount, date: dateStr });
    
    // Exercise: ~4 days per week
    const exerciseChance = isWeekend ? 0.3 : 0.6;
    if (Math.random() < exerciseChance) {
      await sm.addEntry('exercise', { 
        type: 'run', 
        duration: 30 + Math.random() * 30,
        date: dateStr 
      });
    }
    
    // Mood: higher on exercise days (we'll correlate this)
    const exercisedToday = (await sm.getEntries('exercise', { date: dateStr })).length > 0;
    const moodBase = exercisedToday ? 7 : 5.5;
    const moodScore = Math.min(10, Math.max(1, moodBase + (Math.random() - 0.5) * 3));
    await sm.addEntry('mood', { score: Math.round(moodScore), date: dateStr });
  }

  // ============== DAY OF WEEK PATTERNS ==============
  console.log('═'.repeat(50));
  console.log('\n📅 DAY OF WEEK PATTERNS\n');

  const waterPatterns = await insights.dayOfWeekPattern('water', 'value');
  console.log('Water intake patterns:');
  if (waterPatterns.patterns.length > 0) {
    for (const p of waterPatterns.patterns) {
      if (p.type === 'weekend') {
        console.log(`  🗓️ ${p.percent}% ${p.direction} on weekends`);
      } else {
        console.log(`  ${p.type === 'high' ? '📈' : '📉'} ${p.day}: ${p.percent}% ${p.type === 'high' ? 'above' : 'below'} average`);
      }
    }
  }

  // ============== CROSS-SKILL CORRELATION ==============
  console.log('\n═'.repeat(50));
  console.log('\n🔗 CROSS-SKILL CORRELATIONS\n');

  // Mood vs Exercise
  const moodExercise = await insights.compareWithActivity('mood', 'score', 'exercise');
  console.log('Mood on exercise days vs rest days:');
  console.log(`  With exercise: avg ${moodExercise.withActivity?.avg} (${moodExercise.withActivity?.count} days)`);
  console.log(`  Without exercise: avg ${moodExercise.withoutActivity?.avg} (${moodExercise.withoutActivity?.count} days)`);
  console.log(`  💡 ${moodExercise.insight}`);

  // Statistical correlation
  const correlation = await insights.correlateSkills('mood', 'score', 'exercise', 'duration');
  console.log(`\nStatistical correlation: ${correlation.correlation || 'N/A'}`);
  console.log(`  ${correlation.interpretation} (n=${correlation.sampleSize})`);

  // ============== CONSISTENCY ==============
  console.log('\n═'.repeat(50));
  console.log('\n⭐ CONSISTENCY SCORES\n');

  for (const skill of ['water', 'mood', 'exercise']) {
    const consistency = await insights.consistencyScore(skill);
    const bar = '█'.repeat(Math.floor(consistency.score / 10)) + '░'.repeat(10 - Math.floor(consistency.score / 10));
    console.log(`${skill.padEnd(10)} ${bar} ${consistency.score}% (${consistency.grade})`);
  }

  // ============== ANOMALIES ==============
  console.log('\n═'.repeat(50));
  console.log('\n⚠️ ANOMALY DETECTION\n');

  const waterAnomalies = await insights.detectAnomalies('water', 'value');
  console.log(`Water: mean=${waterAnomalies.mean}ml, stdDev=${waterAnomalies.stdDev}`);
  if (waterAnomalies.anomalies.length > 0) {
    console.log('Unusual days:');
    for (const a of waterAnomalies.anomalies.slice(0, 3)) {
      console.log(`  ${a.date}: ${a.value}ml (${a.direction})`);
    }
  } else {
    console.log('  No anomalies detected');
  }

  // ============== NATURAL LANGUAGE INSIGHTS ==============
  console.log('\n═'.repeat(50));
  console.log('\n💬 INSIGHT MESSAGES\n');

  const messages = await insights.getInsightMessages('water', 'value');
  for (const msg of messages) {
    console.log(msg);
  }

  const crossInsights = await insights.getCrossSkillInsights();
  for (const insight of crossInsights) {
    console.log(`🔗 ${insight}`);
  }

  console.log('\n═'.repeat(50));
  console.log('\n✅ Demo complete!');
}

demo().catch(console.error);
