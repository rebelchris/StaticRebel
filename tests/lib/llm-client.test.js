/**
 * Optimized LLM Client Tests
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('🧪 Optimized LLM Client Tests\n');
  console.log('='.repeat(60));

  const { OptimizedLLMClient } = await import('../../lib/llm/client.js');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = [];

  const tests = [
    { name: 'Say hello', model: 'ollama/llama3.2', message: 'Say hello' },
    { name: 'What is 2+2', model: 'ollama/llama3.2', message: 'What is 2+2?' },
  ];

  for (const test of tests) {
    totalTests++;
    try {
      const client = new OptimizedLLMClient({ useCache: false, useRetry: false });
      const result = await client.chatCompletion(test.model, [{ role: 'user', content: test.message }]);
      
      if (result && result.message) {
        passedTests++;
        console.log(`  ✅ ${test.name.padEnd(30)} → "${result.message.substring(0, 25)}..."`);
      } else {
        failedTests.push({ test, error: 'No message' });
        console.log(`  ❌ ${test.name} → No message`);
      }
    } catch (error) {
      failedTests.push({ test, error: error.message });
      console.log(`  💥 ${test.name} → ERROR: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passedTests}/${totalTests} passed`);

  if (failedTests.length > 0) {
    console.log(`\n❌ ${failedTests.length} failed`);
  } else {
    console.log('\n✅ All tests passed!');
  }

  const client = new OptimizedLLMClient();
  console.log('\n📈 Client Stats:', JSON.stringify(client.getStats(), null, 2));

  process.exit(failedTests.length > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
