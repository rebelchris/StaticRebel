/**
 * Telegram Message Handlers
 * Process different types of messages and commands
 */

import { log as logToFile } from '../logManager.js';
import { handleCommands } from './commands.js';
import { downloadTelegramFile } from './bot.js';

/**
 * Register all message handlers for the bot
 */
function registerMessageHandlers(telegramBot) {
  // Main message handler
  telegramBot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Verbose logging of ALL messages
    console.log(
      `\x1b[35m[Telegram IN] chat=${chatId} user=${msg.chat.first_name || 'unknown'}: ${msg.text || '(non-text)'}\x1b[0m`,
    );

    // Log incoming message
    logToFile('telegram-in', 'info', msg.text || '(non-text)', {
      chatId,
      user: msg.chat.first_name || 'unknown',
      hasPhoto: !!msg.photo,
    });

    try {
      // Handle different message types
      if (msg.photo) {
        await handlePhotoMessage(telegramBot, msg);
      } else if (msg.text) {
        await handleTextMessage(telegramBot, msg);
      } else if (msg.document) {
        await handleDocumentMessage(telegramBot, msg);
      }
    } catch (error) {
      console.error(`\x1b[31m[Telegram Error] ${error.message}\x1b[0m`);
      await telegramBot.sendMessage(chatId, 'Sorry, something went wrong processing your message.');
    }
  });

  // Error handling
  telegramBot.on('error', (error) => {
    console.error(`\x1b[31m[Telegram Bot Error] ${error.message}\x1b[0m`);
  });

  // Polling error handling
  telegramBot.on('polling_error', (error) => {
    console.error(`\x1b[31m[Telegram Polling Error] ${error.message}\x1b[0m`);
  });
}

/**
 * Handle photo messages (image analysis)
 */
async function handlePhotoMessage(bot, msg) {
  const chatId = msg.chat.id;
  console.log(`\x1b[36m  -> Image received, analyzing...\x1b[0m\n`);

  try {
    // Get the largest photo (last in array has highest resolution)
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    const caption = msg.caption || '';
    const replyToMsgId = msg.message_id;

    // Send immediate acknowledgment
    await bot.sendMessage(chatId, 'Analyzing image...', {
      reply_to_message_id: replyToMsgId,
    });

    // Download and analyze image
    const imagePath = await downloadTelegramFile(bot, fileId);
    if (!imagePath) {
      await bot.sendMessage(chatId, 'Failed to download the image.');
      return;
    }

    // Basic image analysis (placeholder for now)
    // TODO: Integrate with vision analyzer
    let response = 'Image received and downloaded. ';
    if (caption) {
      response += `Caption: "${caption}"`;
    }

    await bot.sendMessage(chatId, response, {
      reply_to_message_id: replyToMsgId,
    });

  } catch (error) {
    console.error(`Photo handling error: ${error.message}`);
    await bot.sendMessage(chatId, 'Error processing the image.');
  }
}

/**
 * Handle text messages and commands
 */
async function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Handle commands (starting with /)
  if (text.startsWith('/')) {
    await handleCommands(bot, msg);
    return;
  }

  // Regular conversation handling
  // TODO: Integrate with main chat handler
  console.log(`\x1b[36m  -> Processing text message: ${text}\x1b[0m`);
  
  // For now, echo back a simple response
  await bot.sendMessage(chatId, `Received: ${text}`);
}

/**
 * Handle document messages
 */
async function handleDocumentMessage(bot, msg) {
  const chatId = msg.chat.id;
  const document = msg.document;
  
  console.log(`\x1b[36m  -> Document received: ${document.file_name}\x1b[0m`);
  
  await bot.sendMessage(chatId, `Document "${document.file_name}" received.`);
}

export {
  registerMessageHandlers,
  handlePhotoMessage,
  handleTextMessage,
  handleDocumentMessage,
};