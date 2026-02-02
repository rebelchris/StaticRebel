import { handleChat } from './lib/chatHandler.js';

const inputs = ['I had 2 glasses water', 'I also had a lunch for 400kcal'];

for (const input of inputs) {
  const result = await handleChat(input, { source: 'test' });
  console.log('Input:', input);
  console.log('  Type:', result.type);
  console.log('  Action:', result.action);
  console.log('  Content:', result.content?.substring(0, 80));
  console.log('');
}
