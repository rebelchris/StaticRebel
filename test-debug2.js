import { extractNumbers } from './lib/skills/nlp-parser.js';

const tests = [
  "My mood is 6 today",
  "Spent $50 on groceries",
  "Feeling happy today"
];

for (const input of tests) {
  console.log(`\n--- "${input}" ---`);
  const numbers = extractNumbers(input);
  console.log('Numbers:', numbers);
}
