#!/usr/bin/env node
/**
 * Templates Demo - shows skill pack installation
 * 
 * Run: node examples/templates-demo.js
 */

import { getSkillManager, GoalTracker, TemplateManager, TEMPLATE_PACKS } from '../lib/skills/index.js';

async function demo() {
  console.log('📦 StaticRebel Templates Demo\n');
  console.log('═'.repeat(50));

  const sm = await getSkillManager();
  const goals = new GoalTracker(sm.dataDir);
  await goals.init();
  
  const templates = new TemplateManager(sm, goals, null, sm.skillsDir);

  // List available packs
  console.log('\n📋 AVAILABLE TEMPLATE PACKS\n');
  
  const packs = templates.listPacks();
  for (const pack of packs) {
    console.log(`${pack.name}`);
    console.log(`  ${pack.description}`);
    console.log(`  Skills: ${pack.skillCount}`);
    console.log();
  }

  // Preview a pack
  console.log('═'.repeat(50));
  console.log('\n🔍 PREVIEW: Wellness Pack\n');
  
  const preview = templates.previewPack('wellness');
  console.log(`Name: ${preview.name}`);
  console.log(`Description: ${preview.description}`);
  console.log('\nWill install:');
  console.log('  Skills:');
  for (const s of preview.willInstall.skills) {
    console.log(`    - ${s.name} (${s.id})`);
  }
  console.log('  Goals:', preview.willInstall.goals.length);
  console.log('  Chains:', preview.willInstall.chains);

  // Install a pack
  console.log('\n═'.repeat(50));
  console.log('\n✨ INSTALLING: Wellness Pack\n');
  
  const result = await templates.installPack('wellness');
  console.log(`Installed: ${result.pack}`);
  console.log(`  Skills: ${result.installed.skills.join(', ')}`);
  console.log(`  Goals: ${result.installed.goals.join(', ')}`);

  // Show loaded skills
  console.log('\n═'.repeat(50));
  console.log('\n📚 LOADED SKILLS\n');
  
  for (const [id, skill] of sm.skills) {
    console.log(`  ${skill.name} (${id})`);
  }

  // Install another pack
  console.log('\n═'.repeat(50));
  console.log('\n✨ INSTALLING: Hydration Pack\n');
  
  const hydrationResult = await templates.installPack('hydration', { skipExisting: true });
  console.log(`Installed: ${hydrationResult.pack}`);
  console.log(`  New skills: ${hydrationResult.installed.skills.join(', ') || 'none (already existed)'}`);

  // Check what's installed
  console.log('\n═'.repeat(50));
  console.log('\n📊 INSTALLED PACKS STATUS\n');
  
  const installed = templates.getInstalledPacks();
  for (const pack of installed) {
    const status = pack.complete ? '✅' : '⚠️';
    console.log(`${status} ${pack.name}: ${pack.skillsInstalled}/${pack.totalSkills} skills`);
  }

  console.log('\n═'.repeat(50));
  console.log('\n✅ Demo complete!');
  console.log('Check the skills/ directory to see installed skill files.');
}

demo().catch(console.error);
