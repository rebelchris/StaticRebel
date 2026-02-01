/**
 * Example: Using Conversation Checkpoints
 * 
 * This example demonstrates how to use conversation checkpoints
 * to safely experiment with different conversation approaches.
 */

import conversationalEngine from '../lib/conversationalEngine.js';
import { getSessionMemory } from '../lib/sessionMemory.js';

async function demonstrateCheckpoints() {
  console.log('🎯 Conversation Checkpoints Demo\n');

  // Simulate some conversation history
  const sessionMemory = getSessionMemory();
  
  // Add some initial conversation
  sessionMemory.addInteraction(
    'Hi, can you help me with my project?', 
    'Of course! What kind of project are you working on?',
    { intent: 'greeting' }
  );
  
  sessionMemory.addInteraction(
    'I need to restructure a large codebase',
    'That sounds like a significant task. Let me help you plan this carefully.',
    { intent: 'project_help' }
  );

  sessionMemory.addInteraction(
    'What should I do first?',
    'First, let\'s analyze your current structure and identify the main areas that need refactoring.',
    { intent: 'planning' }
  );

  console.log(`📝 Created conversation with ${sessionMemory.interactions.length} interactions\n`);

  // Save a checkpoint before trying different approaches
  console.log('💾 Saving checkpoint before exploring different approaches...');
  const checkpoint = await conversationalEngine.saveConversationCheckpoint(
    'before-exploration',
    'Before trying different refactoring strategies'
  );
  console.log(`✅ Saved checkpoint: ${checkpoint.checkpointId}\n`);

  // Simulate trying approach #1 (aggressive refactoring)
  sessionMemory.addInteraction(
    'Should I rewrite everything from scratch?',
    'That would be very risky. Let me suggest a more incremental approach.',
    { intent: 'advice_request' }
  );

  sessionMemory.addInteraction(
    'Actually, let\'s completely restructure the database too',
    'Wait, that would be extremely disruptive. Let me suggest starting smaller.',
    { intent: 'warning' }
  );

  console.log(`📈 Tried aggressive approach - conversation now has ${sessionMemory.interactions.length} interactions`);
  console.log('🤔 This approach seems too risky...\n');

  // Create auto-checkpoint before potentially dangerous operation
  console.log('🤖 Creating auto-checkpoint before database operation...');
  const autoCheckpoint = await conversationalEngine.createAutoCheckpoint('db_drop');
  console.log(`✅ Auto-checkpoint: ${autoCheckpoint.checkpointId}\n`);

  // List all checkpoints
  console.log('📋 Available checkpoints:');
  const checkpointList = await conversationalEngine.listConversationCheckpoints();
  checkpointList.checkpoints.forEach(cp => {
    console.log(`  - ${cp.name} (${cp.messageCount} messages, ${cp.isAuto ? 'auto' : 'manual'})`);
    console.log(`    ${cp.timestamp} - ${cp.description}`);
  });
  console.log();

  // Restore to the original checkpoint to try a different approach
  console.log('🔄 Restoring to original checkpoint to try conservative approach...');
  const restoreResult = await conversationalEngine.restoreConversationCheckpoint(checkpoint.checkpointId);
  console.log(`✅ ${restoreResult.message}`);
  console.log(`📝 Conversation restored to ${restoreResult.restoredState.messageCount} interactions\n`);

  // Try approach #2 (conservative, incremental)
  sessionMemory.addInteraction(
    'What\'s the safest way to start refactoring?',
    'Let\'s start by identifying the most critical pain points and address them one by one.',
    { intent: 'safe_planning' }
  );

  sessionMemory.addInteraction(
    'Could we begin with just the user interface layer?',
    'Excellent idea! Starting with the UI is much safer and will give you immediate visible improvements.',
    { intent: 'approval' }
  );

  console.log(`📊 Conservative approach - conversation now has ${sessionMemory.interactions.length} interactions`);
  console.log('✨ This approach feels much more manageable!\n');

  // Save final checkpoint
  console.log('💾 Saving final checkpoint with chosen approach...');
  const finalCheckpoint = await conversationalEngine.saveConversationCheckpoint(
    'conservative-approach',
    'Decided on incremental refactoring starting with UI'
  );
  console.log(`✅ Final checkpoint: ${finalCheckpoint.checkpointId}\n`);

  // Show conversation history
  console.log('📖 Final conversation history:');
  const history = conversationalEngine.getConversationHistory();
  history.forEach((interaction, i) => {
    console.log(`${i + 1}. User: "${interaction.user}"`);
    console.log(`   Assistant: "${interaction.assistant.substring(0, 80)}..."`);
  });

  console.log('\n🎉 Checkpoint demonstration completed successfully!');
  console.log('\n💡 Key benefits:');
  console.log('   ✅ Can safely explore different conversation directions');
  console.log('   ✅ Easy to backtrack when approaches don\'t work');
  console.log('   ✅ Maintains conversation context and continuity');
  console.log('   ✅ Auto-checkpoints provide safety net for risky operations');
}

// Example of using checkpoints in a real scenario
async function realWorldExample() {
  console.log('\n🌍 Real-world scenario: Code review with rollback capability\n');

  const sessionMemory = getSessionMemory();
  
  // Clear previous demo data
  sessionMemory.clear();

  // Simulate code review conversation
  sessionMemory.addInteraction(
    'Please review this pull request',
    'I\'ll review your pull request thoroughly. Let me examine the changes.',
    { intent: 'code_review' }
  );

  // Checkpoint before potentially suggesting major changes
  console.log('💾 Creating checkpoint before code review suggestions...');
  const reviewCheckpoint = await conversationalEngine.saveConversationCheckpoint(
    'before-review-feedback',
    'Before providing potentially controversial feedback'
  );

  // Simulate negative feedback that might derail the conversation
  sessionMemory.addInteraction(
    'What do you think of the architecture?',
    'This architecture has serious flaws and needs to be completely redesigned.',
    { intent: 'harsh_feedback' }
  );

  console.log('😬 Oops, that feedback was too harsh and might be discouraging...\n');

  // Restore and try a more constructive approach
  console.log('🔄 Restoring to try more constructive feedback...');
  await conversationalEngine.restoreConversationCheckpoint(reviewCheckpoint.checkpointId);

  sessionMemory.addInteraction(
    'What do you think of the architecture?',
    'The architecture shows good understanding of the requirements. I have a few suggestions that could make it even more robust.',
    { intent: 'constructive_feedback' }
  );

  console.log('✅ Much better! Constructive feedback that encourages improvement.\n');
  console.log('📖 Final conversation:');
  
  const finalHistory = conversationalEngine.getConversationHistory();
  finalHistory.forEach((interaction, i) => {
    console.log(`${i + 1}. "${interaction.user}" -> "${interaction.assistant.substring(0, 60)}..."`);
  });
}

// Run both examples
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateCheckpoints()
    .then(() => realWorldExample())
    .catch(console.error);
}