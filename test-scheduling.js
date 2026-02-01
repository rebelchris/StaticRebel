#!/usr/bin/env node

/**
 * Test script for Natural Language Scheduling
 */

import { testParser } from './lib/scheduling/natural-language.js';
import { testScheduling } from './lib/scheduling/index.js';
import { 
  detectSchedulingIntent,
  processSchedulingRequest,
  getSchedulingHelp 
} from './lib/scheduling/conversation-handler.js';

console.log('🧪 Testing Natural Language Scheduling\n');

console.log('1. Testing Natural Language Parser');
console.log('=' .repeat(40));
const parserResults = testParser();
parserResults.forEach(result => {
  const status = result.success ? '✅' : '❌';
  console.log(`${status} "${result.input}"`);
  if (result.success) {
    console.log(`   → ${result.output.description} (${result.output.type})`);
    if (result.output.expr) {
      console.log(`   → Cron: ${result.output.expr}`);
    }
    if (result.output.interval) {
      console.log(`   → Interval: ${result.output.interval}ms`);
    }
  } else {
    console.log(`   → Error: ${result.error}`);
  }
  console.log();
});

console.log('2. Testing Scheduling Coordinator');
console.log('=' .repeat(40));
const schedulingResults = testScheduling();
schedulingResults.forEach(result => {
  console.log(`📝 "${result.input}" + "${result.task.message}"`);
  console.log(`   → ${result.result}`);
  console.log();
});

console.log('3. Testing Conversation Handler');
console.log('=' .repeat(40));

const testMessages = [
  'Remind me to drink water every 2 hours',
  'Set a reminder to log my mood at 9pm daily',
  'Can you remind me to take a break every Monday at 10am?',
  'Schedule me to check emails tomorrow at noon',
  'List my reminders',
  'Cancel reminder water',
  'I need to schedule something at 3pm',
  'How do I create a reminder?'
];

testMessages.forEach(message => {
  console.log(`💬 User: "${message}"`);
  
  const intent = detectSchedulingIntent(message);
  console.log(`   Intent: ${intent.type} (confidence: ${intent.confidence})`);
  
  const response = processSchedulingRequest(message);
  console.log(`   Response: ${response.success ? '✅' : '❌'} ${response.reply || 'No reply'}`);
  console.log();
});

console.log('4. Help Documentation');
console.log('=' .repeat(40));
console.log(getSchedulingHelp());

console.log('\n🎉 Testing Complete!');