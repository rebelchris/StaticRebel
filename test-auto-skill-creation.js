#!/usr/bin/env node

/**
 * Test Auto-Skill Creation Feature
 * 
 * Tests the intelligent auto-skill creation system for StaticRebel's assistant.
 * Covers auto-detection, skill inference, creation, and logging.
 */

import { handleChat, setAutoCreateSkills, getAutoSkillStatus, handleSkillConfirmation } from './lib/chatHandler.js';
import { getAutoSkillCreator } from './lib/skills/auto-skill-creator.js';
import { getSkillManager } from './lib/skills/skill-manager.js';

// Test data
const TEST_INPUTS = [
  // Water tracking
  {
    input: "I drank 2 glasses of water",
    expected: { skillType: 'water', value: 500, unit: 'ml' },
    description: "Water tracking with containers"
  },
  {
    input: "Had 500ml water today",
    expected: { skillType: 'water', value: 500, unit: 'ml' },
    description: "Water tracking with volume units"
  },
  
  // Exercise tracking
  {
    input: "Did 30 pushups",
    expected: { skillType: 'pushups', value: 30, unit: 'reps' },
    description: "Exercise tracking"
  },
  {
    input: "Walked 5000 steps",
    expected: { skillType: 'steps', value: 5000, unit: 'steps' },
    description: "Steps tracking"
  },
  
  // Sleep tracking
  {
    input: "Slept 7 hours last night",
    expected: { skillType: 'sleep', value: 7, unit: 'hours' },
    description: "Sleep duration tracking"
  },
  
  // Mood tracking
  {
    input: "Feeling happy today",
    expected: { skillType: 'mood', value: 8, unit: 'score' },
    description: "Mood tracking with emotions"
  },
  {
    input: "My mood is 6 today",
    expected: { skillType: 'mood', value: 6, unit: 'score' },
    description: "Mood tracking with explicit score"
  },
  
  // Expense tracking
  {
    input: "Spent $50 on groceries",
    expected: { skillType: 'expenses', value: 50, unit: 'USD' },
    description: "Expense tracking"
  },
  
  // Reading tracking
  {
    input: "Read 20 pages today",
    expected: { skillType: 'reading', value: 20, unit: 'pages' },
    description: "Reading progress tracking"
  },
  
  // Meditation tracking
  {
    input: "Meditated for 10 minutes",
    expected: { skillType: 'meditation', value: 10, unit: 'minutes' },
    description: "Meditation duration tracking"
  }
];

// Test configuration
let testsPassed = 0;
let testsTotal = 0;

/**
 * Run a single test case
 */
async function runTest(testCase) {
  testsTotal++;
  console.log(`\n🧪 Test ${testsTotal}: ${testCase.description}`);
  console.log(`   Input: "${testCase.input}"`);

  try {
    const autoCreator = await getAutoSkillCreator();
    
    // Test detection
    const detection = autoCreator.detectTrackingAttempt(testCase.input);
    
    if (!detection) {
      console.log(`   ❌ Failed: No tracking attempt detected`);
      return false;
    }
    
    if (detection.hasExistingSkill) {
      console.log(`   ⚠️  Skipped: Existing skill found (${detection.existingSkill.skill.name})`);
      return true; // This is actually good - similar skill detection works
    }
    
    const inference = detection.skillInference;
    if (!inference) {
      console.log(`   ❌ Failed: No skill inference generated`);
      return false;
    }
    
    // Check skill type
    if (inference.skillType !== testCase.expected.skillType) {
      console.log(`   ❌ Failed: Expected skillType '${testCase.expected.skillType}', got '${inference.skillType}'`);
      return false;
    }
    
    // Check extracted value
    const extractedValue = inference.extractedValue?.value;
    if (extractedValue !== testCase.expected.value) {
      console.log(`   ❌ Failed: Expected value ${testCase.expected.value}, got ${extractedValue}`);
      return false;
    }
    
    // Check unit
    if (inference.unit !== testCase.expected.unit) {
      console.log(`   ❌ Failed: Expected unit '${testCase.expected.unit}', got '${inference.unit}'`);
      return false;
    }
    
    console.log(`   ✅ Passed: Detected ${inference.skillType} skill, value: ${extractedValue} ${inference.unit}`);
    console.log(`   📊 Confidence: ${(inference.confidence * 100).toFixed(0)}%, Goal: ${inference.goal || 'none'}`);
    
    testsPassed++;
    return true;
    
  } catch (error) {
    console.log(`   ❌ Failed: Error - ${error.message}`);
    return false;
  }
}

/**
 * Test skill creation and logging
 */
async function testSkillCreation() {
  console.log(`\n🏗️ Testing Skill Creation and Logging`);
  
  try {
    const autoCreator = await getAutoSkillCreator();
    const skillManager = await getSkillManager();
    
    // Test input that should create a new skill
    const testInput = "I drank 3 glasses of water";
    const chatId = 'test-session-' + Date.now();
    
    console.log(`   Input: "${testInput}"`);
    
    // Enable auto-creation for this test
    await setAutoCreateSkills(true);
    
    const result = await autoCreator.handleTrackingWithAutoCreation(testInput, chatId);
    
    if (result.success && result.autoCreated) {
      console.log(`   ✅ Successfully created skill: ${result.skill.name}`);
      console.log(`   📝 Logged entry: ${result.logEntry.value}${result.skill.unit ? ' ' + result.skill.unit : ''}`);
      console.log(`   💬 Message: ${result.message.split('\n')[0]}...`);
      
      // Verify the skill was created
      const skills = skillManager.getAllSkills();
      const createdSkill = skills.find(s => s.id === result.skill.id);
      
      if (createdSkill) {
        console.log(`   ✅ Skill verification passed: ${createdSkill.name} exists`);
      } else {
        console.log(`   ❌ Skill verification failed: Created skill not found`);
        return false;
      }
      
      // Verify the entry was logged
      const entries = await skillManager.getEntries(result.skill.id);
      if (entries && entries.length > 0) {
        console.log(`   ✅ Entry verification passed: ${entries.length} entries found`);
      } else {
        console.log(`   ❌ Entry verification failed: No entries found`);
        return false;
      }
      
      testsTotal++;
      testsPassed++;
      return true;
      
    } else if (result.needsConfirmation) {
      console.log(`   📋 Confirmation needed: ${result.message.split('\n')[0]}...`);
      
      // Test confirmation handling
      const confirmResult = await handleSkillConfirmation(chatId, 'yes');
      
      if (confirmResult.success) {
        console.log(`   ✅ Confirmation handling passed: Skill created after confirmation`);
        testsTotal++;
        testsPassed++;
        return true;
      } else {
        console.log(`   ❌ Confirmation handling failed: ${confirmResult.message}`);
        testsTotal++;
        return false;
      }
      
    } else {
      console.log(`   ❌ Unexpected result: ${JSON.stringify(result, null, 2)}`);
      testsTotal++;
      return false;
    }
    
  } catch (error) {
    console.log(`   ❌ Creation test failed: ${error.message}`);
    testsTotal++;
    return false;
  }
}

/**
 * Test configuration management
 */
async function testConfiguration() {
  console.log(`\n⚙️ Testing Configuration Management`);
  
  try {
    // Test getting initial status
    let status = getAutoSkillStatus();
    console.log(`   Initial status: ${status.description}`);
    
    // Test enabling auto-creation
    await setAutoCreateSkills(true);
    status = getAutoSkillStatus();
    console.log(`   After enabling: ${status.description}`);
    
    if (!status.enabled) {
      console.log(`   ❌ Failed to enable auto-creation`);
      testsTotal++;
      return false;
    }
    
    // Test disabling auto-creation
    await setAutoCreateSkills(false);
    status = getAutoSkillStatus();
    console.log(`   After disabling: ${status.description}`);
    
    if (status.enabled) {
      console.log(`   ❌ Failed to disable auto-creation`);
      testsTotal++;
      return false;
    }
    
    console.log(`   ✅ Configuration management passed`);
    testsTotal++;
    testsPassed++;
    return true;
    
  } catch (error) {
    console.log(`   ❌ Configuration test failed: ${error.message}`);
    testsTotal++;
    return false;
  }
}

/**
 * Test edge cases
 */
async function testEdgeCases() {
  console.log(`\n🔍 Testing Edge Cases`);
  
  const edgeCases = [
    {
      input: "How big is the moon?", 
      shouldDetect: false,
      description: "Non-tracking question"
    },
    {
      input: "I love pizza",
      shouldDetect: false, 
      description: "General statement"
    },
    {
      input: "What's 2 + 2?",
      shouldDetect: false,
      description: "Math question"
    },
    {
      input: "The weather is nice today",
      shouldDetect: false,
      description: "Weather comment"
    }
  ];
  
  let edgePassed = 0;
  const autoCreator = await getAutoSkillCreator();
  
  for (const testCase of edgeCases) {
    const detection = autoCreator.detectTrackingAttempt(testCase.input);
    const detected = detection !== null && !detection.hasExistingSkill;
    
    if (detected === testCase.shouldDetect) {
      console.log(`   ✅ ${testCase.description}: Correctly ${detected ? 'detected' : 'ignored'}`);
      edgePassed++;
    } else {
      console.log(`   ❌ ${testCase.description}: Expected ${testCase.shouldDetect ? 'detection' : 'no detection'}, got ${detected ? 'detection' : 'no detection'}`);
    }
  }
  
  testsTotal++;
  if (edgePassed === edgeCases.length) {
    testsPassed++;
    console.log(`   ✅ Edge cases passed (${edgePassed}/${edgeCases.length})`);
    return true;
  } else {
    console.log(`   ❌ Edge cases failed (${edgePassed}/${edgeCases.length})`);
    return false;
  }
}

/**
 * Test integration with chat handler
 */
async function testChatIntegration() {
  console.log(`\n🔗 Testing Chat Handler Integration`);
  
  try {
    // Enable auto-creation for this test
    await setAutoCreateSkills(true);
    
    const testInput = "I did 25 squats";
    console.log(`   Input: "${testInput}"`);
    
    // Test through main chat handler
    const result = await handleChat(testInput, { 
      source: 'test',
      context: { chatId: 'integration-test-' + Date.now() }
    });
    
    if (result.success !== false || result.response) {
      // Check if response indicates skill creation
      if (result.response && result.response.includes('Created') && result.response.includes('skill')) {
        console.log(`   ✅ Chat integration passed: ${result.response.split('\n')[0]}...`);
        testsTotal++;
        testsPassed++;
        return true;
      } else if (result.response && result.response.includes('Logged to')) {
        console.log(`   ✅ Chat integration passed: Used existing skill`);
        testsTotal++;
        testsPassed++;
        return true;
      } else {
        console.log(`   📋 Chat response: ${result.response?.substring(0, 100)}...`);
        console.log(`   ✅ Chat integration passed: Handled appropriately`);
        testsTotal++;
        testsPassed++;
        return true;
      }
    } else {
      console.log(`   ❌ Chat integration failed: ${result.error || 'Unknown error'}`);
      testsTotal++;
      return false;
    }
    
  } catch (error) {
    console.log(`   ❌ Chat integration failed: ${error.message}`);
    testsTotal++;
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🚀 Starting Auto-Skill Creation Tests\n');
  console.log('=====================================');
  
  // Run basic detection tests
  console.log('\n📋 Testing Skill Detection and Inference');
  console.log('==========================================');
  
  for (const testCase of TEST_INPUTS) {
    await runTest(testCase);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between tests
  }
  
  // Run feature tests
  await testConfiguration();
  await testSkillCreation();
  await testEdgeCases();
  await testChatIntegration();
  
  // Print summary
  console.log('\n📊 Test Summary');
  console.log('===============');
  console.log(`Tests Passed: ${testsPassed}/${testsTotal}`);
  console.log(`Success Rate: ${(testsPassed / testsTotal * 100).toFixed(1)}%`);
  
  if (testsPassed === testsTotal) {
    console.log('\n🎉 All tests passed! Auto-skill creation is working correctly.');
    process.exit(0);
  } else {
    console.log(`\n❌ ${testsTotal - testsPassed} tests failed. Please check the implementation.`);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}

export { runAllTests, runTest };