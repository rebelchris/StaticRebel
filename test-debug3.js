import { parseInput } from './lib/skills/nlp-parser.js';

const tests = [
  "My mood is 6 today",
  "Spent $50 on groceries",
  "Feeling happy today"
];

for (const input of tests) {
  console.log(`\n--- "${input}" ---`);
  const parsed = parseInput(input);
  console.log('Intent:', parsed.intent);
  console.log('Parsed data:', JSON.stringify(parsed, null, 2));
}
