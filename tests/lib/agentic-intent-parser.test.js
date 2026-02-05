/**
 * Agentic Intent Parser Tests
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_CASES = [
  {
    category: 'TRACKING - Intent + Basic Entities',
    tests: [
      { input: 'I drank 2 glasses of water', expectedAction: 'TRACK', expectValue: 2 },
      { input: 'walked 8000 steps', expectedAction: 'TRACK', expectValue: 8000 },
      { input: 'slept 7 hours', expectedAction: 'TRACK', expectValue: 7 },
      { input: 'had 3 coffees today', expectedAction: 'TRACK', expectValue: 3 },
    ]
  },
  {
    category: 'CREATE_PROJECT',
    tests: [
      { input: 'make a todo list in react', expectedAction: 'CREATE_PROJECT' },
      { input: 'build a discord bot with node', expectedAction: 'CREATE_PROJECT' },
      { input: 'create a weather app', expectedAction: 'CREATE_PROJECT' },
      { input: 'make a rest api with express', expectedAction: 'CREATE_PROJECT' },
    ]
  },
  {
    category: 'WEB_SEARCH',
    tests: [
      { input: "What's trending on Twitter", expectedAction: 'WEB_SEARCH' },
      { input: 'weather in NYC', expectedAction: 'WEB_SEARCH' },
      { input: 'latest tech news', expectedAction: 'WEB_SEARCH' },
    ]
  },
  {
    category: 'COMMAND',
    tests: [
      { input: 'list my skills', expectedAction: 'COMMAND' },
      { input: 'show me my stats', expectedAction: 'COMMAND' },
      { input: 'help me', expectedAction: 'COMMAND' },
    ]
  },
  {
    category: 'CHAT',
    tests: [
      { input: 'hi there', expectedAction: 'CHAT' },
      { input: 'thanks', expectedAction: 'CHAT' },
      { input: 'how are you', expectedAction: 'CHAT' },
    ]
  },
  {
    category: 'TYPOS & BROKEN ENGLISH',
    tests: [
      { input: 'i drank 2 glasess of water', expectedAction: 'TRACK' },
      { input: 'wat is trending on twitter', expectedAction: 'WEB_SEARCH' },
      { input: 'I walkd 5000 steps todays', expectedAction: 'TRACK', expectValue: 5000 },
    ]
  }
];

async function runTests() {
  console.log('🧪 Agentic Intent Parser Tests\n');
  console.log('='.repeat(60));

  const { AgenticIntentParser } = await import('../../lib/intent/parser.js');
  const parser = new AgenticIntentParser();

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = [];

  for (const category of TEST_CASES) {
    console.log(`\n📂 ${category.category}`);
    console.log('-'.repeat(40));

    for (const test of category.tests) {
      totalTests++;
      try {
        const result = await parser.parse(test.input);
        const success = result.action === test.expectedAction;
        
        if (success && test.expectValue && result.entities.value !== test.expectValue) {
          console.log(`  ❌ ${test.input.substring(0, 40).padEnd(40)} value=${result.entities.value} (expected ${test.expectValue})`);
          failedTests.push({ test, result });
          continue;
        }

        if (success) {
          passedTests++;
          const valInfo = test.expectValue ? ` value=${result.entities.value}` : '';
          console.log(`  ✅ ${test.input.substring(0, 35).padEnd(35)} → ${result.action}${valInfo}`);
        } else {
          failedTests.push({ test, result });
          console.log(`  ❌ ${test.input.substring(0, 35).padEnd(35)} → ${result.action} (expected ${test.expectedAction})`);
        }
      } catch (error) {
        failedTests.push({ test, error: error.message });
        console.log(`  💥 ERROR: ${error.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passedTests}/${totalTests} passed (${Math.round(passedTests/totalTests*100)}%)`);

  if (failedTests.length > 0) {
    console.log(`\n❌ ${failedTests.length} failed`);
  } else {
    console.log('\n✅ All tests passed!');
  }

  process.exit(failedTests.length > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
