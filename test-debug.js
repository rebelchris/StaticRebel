import { getAutoSkillCreator } from './lib/skills/auto-skill-creator.js';

async function debugTest() {
  const creator = await getAutoSkillCreator();
  
  const tests = [
    "Feeling happy today",
    "My mood is 6 today", 
    "Spent $50 on groceries"
  ];
  
  for (const input of tests) {
    console.log(`\n--- Testing: "${input}" ---`);
    const detection = creator.detectTrackingAttempt(input);
    console.log('Detection result:', detection ? 'Found' : 'None');
    if (detection) {
      console.log('Skill type:', detection.skillInference?.skillType);
      console.log('Value:', detection.skillInference?.extractedValue?.value);
      console.log('Unit:', detection.skillInference?.unit);
      console.log('Confidence:', detection.confidence);
    }
  }
}

debugTest().catch(console.error);
