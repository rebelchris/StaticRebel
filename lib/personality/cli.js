/**
 * Personality CLI Commands
 * 
 * Handles the `sr personality` command and interactive setup flow
 */

import {
  getPersonalityConfig,
  updatePersonalityConfig,
  getPersonalityOptions,
  getPersonalityDescription,
  getPersonalitySummary,
  resetPersonality,
  PERSONALITY_DIMENSIONS
} from './index.js';
import readline from 'readline';

/**
 * Handle personality CLI commands
 */
export async function handlePersonalityCommand(args) {
  const [command, dimension, value] = args;

  switch (command) {
    case 'show':
    case 'current':
    case undefined:
      return handleShow();
    case 'set':
      return handleSet(dimension, value);
    case 'setup':
    case 'config':
    case 'configure':
      return await handleInteractiveSetup();
    case 'reset':
      return handleReset();
    case 'help':
      return handleHelp();
    default:
      // Check if first arg is a dimension (shorthand)
      if (PERSONALITY_DIMENSIONS[command]) {
        return handleSet(command, dimension);
      }
      return `Unknown personality command: ${command}\nType 'sr personality help' for available commands.`;
  }
}

/**
 * Show current personality configuration
 */
function handleShow() {
  const summary = getPersonalitySummary();
  const { current, descriptions } = summary;
  
  let output = '🎭 Current AI Personality Configuration:\n\n';
  
  // Current settings
  output += '📊 Current Settings:\n';
  output += `  Tone: ${current.tone}\n`;
  output += `  Emoji: ${current.emoji}\n`;
  output += `  Verbosity: ${current.verbosity}\n`;
  output += `  Humor: ${current.humor}\n\n`;
  
  // Descriptions
  output += '📝 What this means:\n';
  
  output += `  🎯 Tone (${current.tone}): ${descriptions.tone?.description || 'N/A'}\n`;
  if (descriptions.tone?.examples?.length) {
    output += `     Examples: "${descriptions.tone.examples[0]}"\n`;
  }
  
  output += `  😊 Emoji (${current.emoji}): ${descriptions.emoji?.description || 'N/A'}\n`;
  
  output += `  💬 Verbosity (${current.verbosity}): ${descriptions.verbosity?.description || 'N/A'}\n`;
  if (descriptions.verbosity?.examples?.length) {
    output += `     Example: "${descriptions.verbosity.examples[0]}"\n`;
  }
  
  output += `  🎪 Humor (${current.humor}): ${descriptions.humor?.description || 'N/A'}\n`;
  
  output += '\n🔧 To change settings: sr personality set <dimension> <value>';
  output += '\n🛠️  For interactive setup: sr personality setup';
  
  return output;
}

/**
 * Set a specific personality dimension
 */
function handleSet(dimension, value) {
  if (!dimension || !value) {
    return 'Usage: sr personality set <dimension> <value>\n\n' + 
           'Dimensions: tone, emoji, verbosity, humor\n' +
           'Use "sr personality help" for valid values.';
  }
  
  try {
    const updated = updatePersonalityConfig(dimension, value);
    const description = getPersonalityDescription(dimension, value);
    
    let output = `✅ Updated ${dimension} to "${value}"\n\n`;
    
    if (description?.description) {
      output += `📝 ${description.description}\n`;
    }
    
    if (description?.examples?.length) {
      output += `💡 Example: "${description.examples[0]}"\n`;
    }
    
    output += '\n🔍 View all settings: sr personality show';
    
    return output;
  } catch (error) {
    const options = getPersonalityOptions();
    return `❌ Error: ${error.message}\n\n` +
           `Valid ${dimension} options: ${options[dimension]?.join(', ') || 'unknown dimension'}\n` +
           'Use "sr personality help" for more info.';
  }
}

/**
 * Reset personality to defaults
 */
function handleReset() {
  const defaults = resetPersonality();
  
  return '🔄 Personality reset to defaults:\n\n' +
         `  Tone: ${defaults.tone}\n` +
         `  Emoji: ${defaults.emoji}\n` +
         `  Verbosity: ${defaults.verbosity}\n` +
         `  Humor: ${defaults.humor}\n\n` +
         '🔧 Use "sr personality setup" to customize again.';
}

/**
 * Interactive personality setup flow
 */
async function handleInteractiveSetup() {
  console.log('\n🎭 AI Personality Setup\n');
  console.log('Let\'s customize how I communicate with you!\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const ask = (question) => new Promise(resolve => rl.question(question, resolve));
  
  try {
    const current = getPersonalityConfig();
    const options = getPersonalityOptions();
    
    // Tone setup
    console.log('1️⃣  TONE - How should I motivate you?\n');
    console.log('   encouraging - "Great job! You\'re making excellent progress!" 🎉');
    console.log('   neutral     - "Task completed. Current status updated." 📊');
    console.log('   direct      - "Done. Next: review output." ⚡\n');
    
    const tone = await ask(`Choose tone (${options.tone.join('/')}) [${current.tone}]: `);
    const finalTone = tone.trim() || current.tone;
    
    // Emoji setup
    console.log('\n2️⃣  EMOJI - How much visual flair?\n');
    console.log('   heavy    - Lots of emojis! 🚀✨💪🎉');
    console.log('   moderate - One per message 👍');
    console.log('   minimal  - Just status indicators ✅');
    console.log('   none     - Pure text only\n');
    
    const emoji = await ask(`Choose emoji level (${options.emoji.join('/')}) [${current.emoji}]: `);
    const finalEmoji = emoji.trim() || current.emoji;
    
    // Verbosity setup
    console.log('\n3️⃣  VERBOSITY - How detailed should I be?\n');
    console.log('   concise  - Brief and focused (~50 words)');
    console.log('   balanced - Complete but efficient (~150 words)');
    console.log('   detailed - Comprehensive with context (~300 words)\n');
    
    const verbosity = await ask(`Choose verbosity (${options.verbosity.join('/')}) [${current.verbosity}]: `);
    const finalVerbosity = verbosity.trim() || current.verbosity;
    
    // Humor setup
    console.log('\n4️⃣  HUMOR - Should I be playful or professional?\n');
    console.log('   playful      - Witty and fun! "Task tracking engaged! 🎯"');
    console.log('   professional - Business-appropriate and formal\n');
    
    const humor = await ask(`Choose humor style (${options.humor.join('/')}) [${current.humor}]: `);
    const finalHumor = humor.trim() || current.humor;
    
    rl.close();
    
    // Apply all changes
    const results = [];
    
    if (options.tone.includes(finalTone)) {
      updatePersonalityConfig('tone', finalTone);
      results.push(`Tone: ${finalTone}`);
    }
    
    if (options.emoji.includes(finalEmoji)) {
      updatePersonalityConfig('emoji', finalEmoji);
      results.push(`Emoji: ${finalEmoji}`);
    }
    
    if (options.verbosity.includes(finalVerbosity)) {
      updatePersonalityConfig('verbosity', finalVerbosity);
      results.push(`Verbosity: ${finalVerbosity}`);
    }
    
    if (options.humor.includes(finalHumor)) {
      updatePersonalityConfig('humor', finalHumor);
      results.push(`Humor: ${finalHumor}`);
    }
    
    console.log('\n✅ Personality configuration saved!\n');
    console.log('📊 Your new settings:');
    results.forEach(result => console.log(`   ${result}`));
    console.log('\n💡 Try chatting with me to see the new personality in action!');
    console.log('🔧 Use "sr personality show" to view detailed settings.');
    
    return 'Interactive setup completed successfully!';
    
  } catch (error) {
    rl.close();
    return `❌ Setup interrupted: ${error.message}`;
  }
}

/**
 * Show help information
 */
function handleHelp() {
  const options = getPersonalityOptions();
  
  return `🎭 AI Personality Customization\n\n` +
         `📊 Commands:\n` +
         `   sr personality [show]          - Show current settings\n` +
         `   sr personality set <dim> <val> - Set specific dimension\n` +
         `   sr personality setup           - Interactive configuration\n` +
         `   sr personality reset           - Reset to defaults\n` +
         `   sr personality help            - Show this help\n\n` +
         
         `🎯 Dimensions & Values:\n\n` +
         
         `   tone: ${options.tone.join(', ')}\n` +
         `     encouraging - Motivational coach style\n` +
         `     neutral     - Objective tracker\n` +
         `     direct      - Concise and actionable\n\n` +
         
         `   emoji: ${options.emoji.join(', ')}\n` +
         `     heavy    - Multiple emojis per message\n` +
         `     moderate - One emoji when appropriate\n` +
         `     minimal  - Only essential status emojis\n` +
         `     none     - No emojis at all\n\n` +
         
         `   verbosity: ${options.verbosity.join(', ')}\n` +
         `     concise  - Brief responses (~50 words)\n` +
         `     balanced - Efficient but complete (~150 words)\n` +
         `     detailed - Comprehensive explanations (~300 words)\n\n` +
         
         `   humor: ${options.humor.join(', ')}\n` +
         `     playful      - Witty and engaging\n` +
         `     professional - Business-appropriate\n\n` +
         
         `💡 Examples:\n` +
         `   sr personality set tone encouraging\n` +
         `   sr personality set emoji minimal\n` +
         `   sr personality setup\n`;
}

// Export as default for compatibility
export default handlePersonalityCommand;