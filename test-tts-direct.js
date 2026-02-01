#!/usr/bin/env node

/**
 * Direct TTS Test
 * Test TTS functionality without full LLM integration
 */

import chalk from 'chalk';
import tts from './lib/tts/index.js';

async function testDirectTTS() {
  console.log(chalk.blue('🎤 Testing Direct TTS Functionality...\n'));
  
  try {
    // Test 1: Basic TTS
    console.log(chalk.yellow('Test 1: Basic TTS'));
    const result1 = await tts.speak('Hello, this is a test of StaticRebel TTS!', {
      voice: 'aria',
      play: false
    });
    console.log(chalk.green('✅ Basic TTS Success!'));
    console.log(chalk.gray(`  Provider: ${result1.provider}, Voice: ${result1.voice}, Size: ${(result1.size / 1024).toFixed(1)} KB`));
    console.log();
    
    // Test 2: Different voice
    console.log(chalk.yellow('Test 2: Different Voice'));
    const result2 = await tts.speak('This is a test with a different voice!', {
      voice: 'guy',
      play: false
    });
    console.log(chalk.green('✅ Voice selection works!'));
    console.log(chalk.gray(`  Provider: ${result2.provider}, Voice: ${result2.voice}`));
    console.log();
    
    // Test 3: LLM Integration functions
    console.log(chalk.yellow('Test 3: LLM Integration Functions'));
    const result3 = await tts.readAloud('This is the read aloud function test!', {
      play: false
    });
    console.log(chalk.green('✅ readAloud function works!'));
    console.log(chalk.gray(`  Provider: ${result3.provider}, Voice: ${result3.voice}`));
    console.log();
    
    // Test 4: Daily summary (with mock data)
    console.log(chalk.yellow('Test 4: Daily Summary'));
    const result4 = await tts.speakDailySummary('Today you completed 3 tasks, had 2 meetings, and logged 5 activities.', {
      play: false
    });
    console.log(chalk.green('✅ Daily summary TTS works!'));
    console.log(chalk.gray(`  Provider: ${result4.provider}, Voice: ${result4.voice}`));
    console.log();
    
    // Test 5: Nudges
    console.log(chalk.yellow('Test 5: Nudges Integration'));
    const { nudges } = tts;
    const result5 = await nudges.speakReminder('Time to drink water!', {
      play: false
    });
    console.log(chalk.green('✅ Nudges reminder works!'));
    console.log(chalk.gray(`  Type: ${result5.type}, Voice: ${result5.voice}`));
    console.log();
    
    // Test 6: Habit reminder
    console.log(chalk.yellow('Test 6: Habit Reminder'));
    const result6 = await nudges.speakHabitReminder('meditation', null, {
      play: false
    });
    console.log(chalk.green('✅ Habit reminder works!'));
    console.log(chalk.gray(`  Habit: ${result6.habitName}, Type: ${result6.type}`));
    console.log();
    
    // Test 7: Break reminder
    console.log(chalk.yellow('Test 7: Break Reminder'));
    const result7 = await nudges.speakBreakReminder('water', {
      play: false
    });
    console.log(chalk.green('✅ Break reminder works!'));
    console.log(chalk.gray(`  Break type: ${result7.breakType}, Type: ${result7.type}`));
    console.log();
    
    // Test 8: Voices and configuration
    console.log(chalk.yellow('Test 8: Configuration'));
    const voices = tts.getVoices();
    const config = tts.getConfig();
    const availability = await tts.checkAvailability();
    
    console.log(chalk.green('✅ Configuration access works!'));
    console.log(chalk.gray(`  Edge voices: ${Object.keys(voices.edge || {}).length}`));
    console.log(chalk.gray(`  Default provider: ${config.provider}`));
    console.log(chalk.gray(`  Available providers: ${Object.entries(availability).filter(([k,v]) => k !== 'available' && k !== 'errors' && v).map(([k]) => k).join(', ')}`));
    console.log();
    
    console.log(chalk.green('🎉 All TTS tests completed successfully!'));
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDirectTTS().catch(console.error);