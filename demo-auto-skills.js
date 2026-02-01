#!/usr/bin/env node

/**
 * Auto-Skill Creation Demo
 * 
 * This script demonstrates the intelligent auto-skill creation feature
 * by simulating various user tracking inputs and showing the responses.
 */

import { handleChat, setAutoCreateSkills, getAutoSkillStatus } from './lib/chatHandler.js';

const DEMO_INPUTS = [
  {
    category: "💧 Hydration Tracking",
    inputs: [
      "I drank 2 glasses of water",
      "Had 500ml water",
      "Drank a bottle of water"
    ]
  },
  {
    category: "💪 Fitness Tracking", 
    inputs: [
      "Did 30 pushups",
      "Walked 8000 steps today",
      "Ran 5k this morning",
      "Did 3 sets of 10 squats"
    ]
  },
  {
    category: "😴 Wellness Tracking",
    inputs: [
      "Slept 7.5 hours last night",
      "Feeling happy today",
      "Meditated for 15 minutes",
      "My mood is 8 today"
    ]
  },
  {
    category: "📚 Learning & Activities",
    inputs: [
      "Read 25 pages of my book",
      "Spent $35 on lunch",
      "Studied for 2 hours"
    ]
  },
  {
    category: "🚫 Non-Tracking (Should be ignored)",
    inputs: [
      "How's the weather today?",
      "What's 2 + 2?", 
      "I love pizza",
      "Tell me a joke"
    ]
  }
];

/**
 * Simulate a conversation with the assistant
 */
async function simulateInput(input, chatId) {
  console.log(`\n👤 User: "${input}"`);
  
  try {
    const result = await handleChat(input, {
      source: 'demo',
      context: { chatId }
    });
    
    if (result.success !== false && result.response) {
      console.log(`🤖 Assistant: ${result.response}`);
      
      // Additional details for demos
      if (result.type && result.type.includes('auto')) {
        console.log(`   📊 Type: ${result.type}`);
      }
      if (result.confidence) {
        console.log(`   🎯 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      }
    } else {
      console.log(`🤖 Assistant: ${result.response || result.error || 'No response'}`);
    }
    
    return result;
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Run the demo with auto-creation enabled
 */
async function runAutoCreateDemo() {
  console.log('\n🤖 DEMO: Auto-Creation Enabled');
  console.log('================================');
  console.log('Skills will be created automatically without confirmation.');
  
  await setAutoCreateSkills(true);
  const status = getAutoSkillStatus();
  console.log(`Status: ${status.description}`);
  
  const chatId = 'auto-demo-' + Date.now();
  
  for (const category of DEMO_INPUTS.slice(0, 3)) { // Skip non-tracking for auto demo
    console.log(`\n${category.category}`);
    console.log('='.repeat(category.category.length));
    
    for (const input of category.inputs.slice(0, 2)) { // 2 inputs per category
      await simulateInput(input, chatId);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for readability
    }
  }
}

/**
 * Run the demo with confirmation mode
 */
async function runConfirmationDemo() {
  console.log('\n🤖 DEMO: Confirmation Mode');
  console.log('===========================');
  console.log('Assistant will ask before creating new skills.');
  
  await setAutoCreateSkills(false);
  const status = getAutoSkillStatus();
  console.log(`Status: ${status.description}`);
  
  const chatId = 'confirm-demo-' + Date.now();
  
  console.log(`\n💧 Hydration Tracking Example`);
  console.log('==============================');
  
  // Show confirmation flow
  let result = await simulateInput("I drank 3 glasses of water", chatId);
  
  if (result.response && result.response.includes('Want me to create')) {
    console.log(`\n👤 User: "yes"`);
    
    // Simulate user saying "yes"
    const confirmResult = await handleChat("yes", {
      source: 'demo',
      context: { chatId }
    });
    
    console.log(`🤖 Assistant: ${confirmResult.response}`);
  }
}

/**
 * Demo the edge case handling
 */
async function runEdgeCaseDemo() {
  console.log('\n🤖 DEMO: Edge Case Handling');
  console.log('============================');
  console.log('These inputs should NOT trigger skill creation:');
  
  const chatId = 'edge-demo-' + Date.now();
  
  const edgeCases = DEMO_INPUTS.find(c => c.category.includes('Non-Tracking'));
  
  for (const input of edgeCases.inputs) {
    await simulateInput(input, chatId);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

/**
 * Show similar skill detection
 */
async function runSimilarSkillDemo() {
  console.log('\n🤖 DEMO: Similar Skill Detection');
  console.log('==================================');
  console.log('Creating water skill first, then testing similar inputs:');
  
  await setAutoCreateSkills(true);
  const chatId = 'similar-demo-' + Date.now();
  
  // First, create a water skill
  await simulateInput("I drank 500ml water", chatId);
  
  console.log('\nNow testing similar inputs (should use existing skill):');
  
  const similarInputs = [
    "I had 2 glasses of water",      // Should use existing water skill
    "Drank some water",              // Should use existing water skill
    "I need to hydrate",             // Should use existing water skill  
  ];
  
  for (const input of similarInputs) {
    await simulateInput(input, chatId);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

/**
 * Main demo runner
 */
async function runDemo() {
  console.log('🚀 Auto-Skill Creation Demo');
  console.log('============================');
  console.log('This demo shows how StaticRebel intelligently creates skills');
  console.log('when you try to track something that doesn\'t exist yet.\n');
  
  try {
    // Demo 1: Auto-creation enabled
    await runAutoCreateDemo();
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Demo 2: Confirmation mode
    await runConfirmationDemo();
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Demo 3: Edge cases
    await runEdgeCaseDemo();
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Demo 4: Similar skill detection
    await runSimilarSkillDemo();
    
    console.log('\n✨ Demo Complete!');
    console.log('================');
    console.log('\n🎯 Key Features Demonstrated:');
    console.log('• Automatic skill creation with intelligent inference');
    console.log('• Smart value extraction and unit conversion');
    console.log('• Confirmation mode for user control');
    console.log('• Edge case prevention (ignores non-tracking inputs)');
    console.log('• Duplicate skill detection');
    console.log('• Immediate logging after skill creation');
    console.log('\n📖 For more info, see: docs/AUTO_SKILL_CREATION.md');
    
  } catch (error) {
    console.error('💥 Demo failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Interactive mode for testing custom inputs
 */
async function runInteractive() {
  console.log('\n🎮 Interactive Mode');
  console.log('===================');
  console.log('Enter tracking statements to test auto-skill creation.');
  console.log('Type "auto on" or "auto off" to toggle auto-creation.');
  console.log('Type "status" to see current configuration.');
  console.log('Type "quit" to exit.\n');
  
  const readline = (await import('readline')).createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const chatId = 'interactive-' + Date.now();
  
  const askQuestion = () => {
    readline.question('👤 You: ', async (input) => {
      const trimmed = input.trim();
      
      if (trimmed === 'quit' || trimmed === 'exit') {
        readline.close();
        console.log('\n👋 Goodbye!');
        return;
      }
      
      if (trimmed === 'auto on') {
        await setAutoCreateSkills(true);
        const status = getAutoSkillStatus();
        console.log(`⚙️ ${status.description}`);
        askQuestion();
        return;
      }
      
      if (trimmed === 'auto off') {
        await setAutoCreateSkills(false);
        const status = getAutoSkillStatus();
        console.log(`⚙️ ${status.description}`);
        askQuestion();
        return;
      }
      
      if (trimmed === 'status') {
        const status = getAutoSkillStatus();
        console.log(`⚙️ Current: ${status.description}`);
        askQuestion();
        return;
      }
      
      if (trimmed) {
        await simulateInput(trimmed, chatId);
      }
      
      askQuestion();
    });
  };
  
  askQuestion();
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--interactive') || args.includes('-i')) {
  runInteractive().catch(error => {
    console.error('Interactive mode failed:', error);
    process.exit(1);
  });
} else {
  runDemo().catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
}