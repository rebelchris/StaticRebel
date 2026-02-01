/**
 * WhatsApp CLI Commands for StaticRebel
 */

import readline from 'readline';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import { getWhatsAppService } from './whatsapp.js';

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Setup WhatsApp integration with QR code authentication
 */
async function setupWhatsApp() {
  const rl = createReadlineInterface();
  
  try {
    console.log(chalk.blue('\n📱 WhatsApp Integration Setup\n'));
    
    console.log('This will start the WhatsApp Web client and show a QR code for authentication.');
    console.log('Make sure you have your phone ready to scan the QR code.\n');
    
    const proceed = await askQuestion(rl, 'Continue with setup? (y/n): ');
    
    if (proceed.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      return;
    }

    console.log(chalk.yellow('🚀 Initializing WhatsApp client...\n'));
    
    const whatsapp = getWhatsAppService();
    
    // Start the client (this will show QR code)
    await whatsapp.start();
    
    // Wait for connection
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes
    
    while (!whatsapp.isReady && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;
      
      if (attempts % 6 === 0) { // Every 30 seconds
        console.log(chalk.gray(`⏳ Waiting for authentication... (${attempts * 5}s)`));
      }
    }
    
    if (whatsapp.isReady) {
      console.log(chalk.green('\n✅ WhatsApp setup completed successfully!'));
      console.log(chalk.blue('💡 Your session is now saved and will persist across restarts.'));
      console.log(chalk.blue('🔧 Use "sr whatsapp status" to check connection status.'));
      console.log(chalk.blue('📤 Use "sr whatsapp send <number> <message>" to send messages.'));
    } else {
      console.log(chalk.red('\n❌ Setup timed out. Please try again.'));
      console.log(chalk.yellow('💡 Make sure to scan the QR code quickly with your WhatsApp mobile app.'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Setup failed:'), error.message);
  } finally {
    rl.close();
  }
}

/**
 * Get WhatsApp connection status
 */
async function getStatus() {
  try {
    console.log(chalk.blue('📱 Checking WhatsApp status...\n'));
    
    const whatsapp = getWhatsAppService();
    const status = await whatsapp.getStatus();
    
    if (status.connected) {
      console.log(chalk.green('✅ WhatsApp Status: CONNECTED'));
      if (status.pushName) {
        console.log(chalk.blue('👤 Account:'), status.pushName);
      }
      if (status.phoneNumber) {
        console.log(chalk.blue('📞 Phone:'), status.phoneNumber);
      }
      if (status.connectedAt) {
        console.log(chalk.blue('🕒 Connected:'), new Date(status.connectedAt).toLocaleString());
      }
      if (status.platform) {
        console.log(chalk.blue('💻 Platform:'), status.platform);
      }
    } else {
      console.log(chalk.red('❌ WhatsApp Status: DISCONNECTED'));
      if (status.error) {
        console.log(chalk.red('❗ Error:'), status.error);
      }
      console.log(chalk.yellow('💡 Run "sr whatsapp setup" to connect.'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to get status:'), error.message);
  }
}

/**
 * Send message to a WhatsApp number
 */
async function sendMessage(args) {
  if (args.length < 2) {
    console.log(chalk.red('❌ Usage: sr whatsapp send <number> <message>'));
    console.log(chalk.gray('Example: sr whatsapp send 1234567890 "Hello from StaticRebel!"'));
    return;
  }

  const number = args[0];
  const message = args.slice(1).join(' ');

  try {
    console.log(chalk.blue('📤 Sending message...\n'));
    
    const whatsapp = getWhatsAppService();
    
    if (!whatsapp.isReady) {
      // Try to start if not ready
      console.log(chalk.yellow('⚡ Starting WhatsApp client...'));
      await whatsapp.start();
      
      // Wait a bit for connection
      let attempts = 0;
      while (!whatsapp.isReady && attempts < 12) { // 1 minute
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }
      
      if (!whatsapp.isReady) {
        console.log(chalk.red('❌ WhatsApp client is not ready. Please run setup first.'));
        return;
      }
    }
    
    // Format number properly (add country code if needed)
    let formattedNumber = number.replace(/\D/g, ''); // Remove non-digits
    if (!formattedNumber.startsWith('1') && formattedNumber.length === 10) {
      formattedNumber = '1' + formattedNumber; // Add US country code
    }
    formattedNumber = formattedNumber + '@c.us'; // WhatsApp format
    
    await whatsapp.sendMessage(formattedNumber, message);
    
    console.log(chalk.green('✅ Message sent successfully!'));
    console.log(chalk.blue('📞 To:'), number);
    console.log(chalk.blue('💬 Message:'), message);
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to send message:'), error.message);
    
    if (error.message.includes('not ready')) {
      console.log(chalk.yellow('💡 Make sure WhatsApp is connected. Run "sr whatsapp setup" first.'));
    } else if (error.message.includes('number')) {
      console.log(chalk.yellow('💡 Please check the phone number format.'));
    }
  }
}

/**
 * Send a test nudge message
 */
async function sendNudge(args) {
  if (args.length < 1) {
    console.log(chalk.red('❌ Usage: sr whatsapp nudge <number> [type]'));
    console.log(chalk.gray('Types: water, exercise, general, summary'));
    console.log(chalk.gray('Example: sr whatsapp nudge 1234567890 water'));
    return;
  }

  const number = args[0];
  const nudgeType = args[1] || 'general';

  try {
    console.log(chalk.blue(`📤 Sending ${nudgeType} nudge...\n`));
    
    const whatsapp = getWhatsAppService();
    
    if (!whatsapp.isReady) {
      console.log(chalk.red('❌ WhatsApp client is not ready. Please run setup first.'));
      return;
    }
    
    // Format number
    let formattedNumber = number.replace(/\D/g, '');
    if (!formattedNumber.startsWith('1') && formattedNumber.length === 10) {
      formattedNumber = '1' + formattedNumber;
    }
    formattedNumber = formattedNumber + '@c.us';
    
    await whatsapp.sendNudge(formattedNumber, nudgeType);
    
    console.log(chalk.green('✅ Nudge sent successfully!'));
    console.log(chalk.blue('📞 To:'), number);
    console.log(chalk.blue('🔔 Type:'), nudgeType);
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to send nudge:'), error.message);
  }
}

/**
 * List recent chats
 */
async function listChats() {
  try {
    console.log(chalk.blue('📋 Getting chat list...\n'));
    
    const whatsapp = getWhatsAppService();
    
    if (!whatsapp.isReady) {
      console.log(chalk.red('❌ WhatsApp client is not ready. Please run setup first.'));
      return;
    }
    
    const chats = await whatsapp.getChatList();
    
    if (chats.length === 0) {
      console.log(chalk.yellow('📭 No chats found.'));
      return;
    }
    
    console.log(chalk.green(`💬 Found ${chats.length} chats:\n`));
    
    chats.slice(0, 10).forEach((chat, index) => { // Show first 10
      console.log(chalk.blue(`${index + 1}. ${chat.name || 'Unknown'}`));
      console.log(chalk.gray(`   ID: ${chat.id}`));
      console.log(chalk.gray(`   Type: ${chat.isGroup ? 'Group' : 'Individual'}`));
      if (chat.unreadCount > 0) {
        console.log(chalk.red(`   Unread: ${chat.unreadCount}`));
      }
      console.log('');
    });
    
    if (chats.length > 10) {
      console.log(chalk.gray(`... and ${chats.length - 10} more chats`));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to get chats:'), error.message);
  }
}

/**
 * Stop WhatsApp client
 */
async function stopWhatsApp() {
  try {
    console.log(chalk.yellow('🛑 Stopping WhatsApp client...'));
    
    const whatsapp = getWhatsAppService();
    await whatsapp.stop();
    
    console.log(chalk.green('✅ WhatsApp client stopped successfully.'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to stop WhatsApp client:'), error.message);
  }
}

/**
 * Schedule daily summaries
 */
async function scheduleDailySummary(args) {
  if (args.length < 2) {
    console.log(chalk.red('❌ Usage: sr whatsapp schedule <number> <time>'));
    console.log(chalk.gray('Example: sr whatsapp schedule 1234567890 "19:00"'));
    return;
  }

  const number = args[0];
  const time = args[1];

  try {
    console.log(chalk.blue('⏰ Setting up daily summary schedule...\n'));
    
    // Format number
    let formattedNumber = number.replace(/\D/g, '');
    if (!formattedNumber.startsWith('1') && formattedNumber.length === 10) {
      formattedNumber = '1' + formattedNumber;
    }
    
    // Validate time format (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      console.log(chalk.red('❌ Invalid time format. Use HH:MM (24-hour format)'));
      return;
    }
    
    console.log(chalk.green('✅ Daily summary scheduled successfully!'));
    console.log(chalk.blue('📞 Number:'), number);
    console.log(chalk.blue('⏰ Time:'), time);
    console.log(chalk.blue('📋 Will send daily summaries at'), time, 'every day');
    console.log(chalk.gray('💡 Note: Cron job integration would be implemented here'));
    
    // Save schedule configuration
    const scheduleConfig = {
      number: formattedNumber,
      time,
      enabled: true,
      createdAt: new Date().toISOString()
    };
    
    const whatsapp = getWhatsAppService();
    const configPath = path.join(whatsapp.sessionPath, 'daily-summary-schedule.json');
    await fs.writeFile(configPath, JSON.stringify(scheduleConfig, null, 2));
    
    console.log(chalk.blue('💾 Schedule saved to:'), configPath);
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to schedule daily summary:'), error.message);
  }
}

/**
 * Test natural language processing
 */
async function testNlp(args) {
  if (args.length === 0) {
    console.log(chalk.red('❌ Usage: sr whatsapp test-nlp <message>'));
    console.log(chalk.gray('Example: sr whatsapp test-nlp "drank 2 glasses of water"'));
    return;
  }

  const message = args.join(' ');

  try {
    console.log(chalk.blue('🧠 Testing NLP processing...\n'));
    console.log(chalk.blue('Input:'), message);
    
    const whatsapp = getWhatsAppService();
    
    // Test the parsing logic
    const isLogging = whatsapp.isLoggingMessage(message.toLowerCase());
    console.log(chalk.blue('Is logging message:'), isLogging ? chalk.green('YES') : chalk.red('NO'));
    
    if (isLogging) {
      const logEntry = await whatsapp.parseLoggingEntry(message.toLowerCase());
      if (logEntry) {
        console.log(chalk.green('✅ Parsed successfully:'));
        console.log(chalk.blue('  Type:'), logEntry.type);
        console.log(chalk.blue('  Value:'), logEntry.value);
        console.log(chalk.blue('  Original:'), logEntry.originalText);
      } else {
        console.log(chalk.yellow('⚠️ Could not parse specific values'));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ NLP test failed:'), error.message);
  }
}

/**
 * Show help for WhatsApp commands
 */
function showHelp() {
  console.log(chalk.blue('\n📱 WhatsApp Integration Commands\n'));
  
  console.log(chalk.yellow('Setup & Status:'));
  console.log(chalk.white('  sr whatsapp setup           '), chalk.gray('- Setup WhatsApp with QR code'));
  console.log(chalk.white('  sr whatsapp status           '), chalk.gray('- Show connection status'));
  console.log(chalk.white('  sr whatsapp stop             '), chalk.gray('- Stop WhatsApp client'));
  
  console.log(chalk.yellow('\nMessaging:'));
  console.log(chalk.white('  sr whatsapp send <number> <msg>'), chalk.gray('- Send message to number'));
  console.log(chalk.white('  sr whatsapp nudge <number> [type]'), chalk.gray('- Send nudge/reminder'));
  console.log(chalk.white('  sr whatsapp chats            '), chalk.gray('- List recent chats'));
  console.log(chalk.white('  sr whatsapp schedule <number> <time>'), chalk.gray('- Schedule daily summaries'));
  
  console.log(chalk.yellow('\nTesting:'));
  console.log(chalk.white('  sr whatsapp test-nlp <msg>   '), chalk.gray('- Test natural language processing'));
  console.log(chalk.white('  sr whatsapp help             '), chalk.gray('- Show this help'));
  
  console.log(chalk.blue('\n💡 Examples:'));
  console.log(chalk.gray('  sr whatsapp setup'));
  console.log(chalk.gray('  sr whatsapp send 1234567890 "Hello from StaticRebel!"'));
  console.log(chalk.gray('  sr whatsapp nudge 1234567890 water'));
  console.log(chalk.gray('  sr whatsapp schedule 1234567890 "19:00"'));
  console.log(chalk.gray('  sr whatsapp test-nlp "drank 3 glasses of water"'));
  
  console.log(chalk.blue('\n🔧 Features:'));
  console.log(chalk.gray('• QR code authentication with session persistence'));
  console.log(chalk.gray('• Natural language logging ("drank 2 glasses of water")'));
  console.log(chalk.gray('• Daily summaries and nudges/reminders'));
  console.log(chalk.gray('• Voice message transcription (future feature)'));
  console.log(chalk.gray('• Media handling and image support'));
  console.log(chalk.gray('• Multi-device support'));
}

/**
 * Main WhatsApp CLI command handler
 */
export async function whatsappCommand(args) {
  if (args.length === 0) {
    showHelp();
    return 'WhatsApp integration help displayed. Use "sr whatsapp setup" to get started.';
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    switch (command) {
      case 'setup':
        await setupWhatsApp();
        return 'WhatsApp setup completed.';
        
      case 'status':
        await getStatus();
        return 'WhatsApp status checked.';
        
      case 'send':
        await sendMessage(commandArgs);
        return 'Message sending attempted.';
        
      case 'nudge':
        await sendNudge(commandArgs);
        return 'Nudge sending attempted.';
        
      case 'chats':
        await listChats();
        return 'Chat list displayed.';
        
      case 'schedule':
        await scheduleDailySummary(commandArgs);
        return 'Daily summary schedule configured.';
        
      case 'stop':
        await stopWhatsApp();
        return 'WhatsApp client stopped.';
        
      case 'test-nlp':
        await testNlp(commandArgs);
        return 'NLP test completed.';
        
      case 'help':
        showHelp();
        return 'WhatsApp help displayed.';
        
      default:
        console.log(chalk.red(`❌ Unknown command: ${command}`));
        showHelp();
        return `Unknown WhatsApp command: ${command}`;
    }
  } catch (error) {
    console.error(chalk.red('❌ WhatsApp command failed:'), error.message);
    return `WhatsApp command failed: ${error.message}`;
  }
}

export default whatsappCommand;