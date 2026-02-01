#!/usr/bin/env node

/**
 * Test TTS Integration
 * Quick test of TTS functionality and LLM integration
 */

import { handleChat, initChatHandler } from './lib/chatHandler.js';
import chalk from 'chalk';

async function testTTSIntegration() {
  console.log(chalk.blue('🎤 Testing TTS Integration...\n'));
  
  try {
    // Initialize chat handler
    await initChatHandler();
    console.log('✅ Chat handler initialized\n');
    
    // Test cases
    const testCases = [
      {
        name: 'Basic speak command',
        input: 'speak Hello world!',
        expected: 'TTS functionality'
      },
      {
        name: 'Read aloud command',
        input: 'read this aloud: This is a test message',
        expected: 'TTS functionality'
      },
      {
        name: 'Daily summary command',
        input: 'speak the daily summary',
        expected: 'Daily summary or no summary message'
      },
      {
        name: 'Spoken reminder setup',
        input: 'spoken reminder: drink water',
        expected: 'Reminder creation'
      },
      {
        name: 'Voice reminder for breaks',
        input: 'voice reminder: take a break',
        expected: 'Break reminder creation'
      }
    ];
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(chalk.yellow(`Test ${i + 1}: ${testCase.name}`));
      console.log(chalk.gray(`Input: "${testCase.input}"`));
      
      try {
        const result = await handleChat(testCase.input, { 
          source: 'test',
          user: { id: 'test-user' }
        });
        
        console.log(chalk.green(`✅ Success!`));
        console.log(chalk.gray(`Response: ${result.content?.substring(0, 100)}...`));
        
      } catch (error) {
        console.log(chalk.red(`❌ Failed: ${error.message}`));
      }
      
      console.log();
    }
    
    console.log(chalk.green('🎉 TTS integration test completed!'));
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testTTSIntegration().catch(console.error);