/**
 * Telegram Bot Commands
 * Command handlers for various bot functions
 */

import { log as logToFile } from '../logManager.js';
import { webSearch } from '../web/search.js';
import { loadProfile } from '../profiles/profile-manager.js';

/**
 * Handle bot commands
 */
async function handleCommands(bot, msg) {
  const chatId = msg.chat.id;
  const parts = msg.text.split(' ');
  const command = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  console.log(`\x1b[34m[Telegram Command] ${command} ${arg ? `"${arg}"` : ''}\x1b[0m`);

  switch (command) {
    case '/start':
      await handleStartCommand(bot, msg);
      break;
    case '/help':
      await handleHelpCommand(bot, msg);
      break;
    case '/track':
      await handleTrackCommand(bot, msg, arg);
      break;
    case '/search':
      await handleSearchCommand(bot, msg, arg);
      break;
    case '/workspace':
      await handleWorkspaceCommand(bot, msg, arg);
      break;
    case '/profile':
      await handleProfileCommand(bot, msg);
      break;
    case '/memories':
      await handleMemoriesCommand(bot, msg);
      break;
    case '/claude':
      await handleClaudeCommand(bot, msg, arg);
      break;
    case '/git':
      await handleGitCommand(bot, msg, arg);
      break;
    case '/browser':
      await handleBrowserCommand(bot, msg, arg);
      break;
    case '/self':
      await handleSelfCommand(bot, msg, arg);
      break;
    default:
      await handleUnknownCommand(bot, msg, command);
  }
}

/**
 * /start command
 */
async function handleStartCommand(bot, msg) {
  const chatId = msg.chat.id;
  const startMsg =
    "Hi! I'm Charlize. Send me a message and I'll help you out. Use /help for commands.";
  
  await bot.sendMessage(chatId, startMsg, {
    reply_to_message_id: msg.message_id,
  });
  
  logToFile('telegram-out', 'info', startMsg, {
    chatId,
    command: '/start',
  });
  
  console.log(`\x1b[32m  -> /start sent\x1b[0m\n`);
}

/**
 * /help command
 */
async function handleHelpCommand(bot, msg) {
  const chatId = msg.chat.id;
  const helpMsg = `*Charlize AI Assistant Commands*

• /track - Manage trackers (workouts, food, habits)
• /search <query> - Web search
• /workspace - Workspace management
• /claude <path> <task> - Run Claude Code CLI
• /git - Git workflow
• /browser - Browser automation
• /self - Self-improvement
• /profile - View your profile
• /memories - View stored memories

*Quick Actions:*
• @trackerName - Query a tracker
• Just chat naturally!`;

  await bot.sendMessage(chatId, helpMsg, {
    reply_to_message_id: msg.message_id,
    parse_mode: 'Markdown',
  });
  
  logToFile('telegram-out', 'info', '/help response', {
    chatId,
    command: '/help',
  });
  
  console.log(`\x1b[32m  -> /help sent\x1b[0m\n`);
}

/**
 * /track command
 */
async function handleTrackCommand(bot, msg, arg) {
  const chatId = msg.chat.id;
  
  if (!arg) {
    const helpMsg = `*Tracker Commands*

• /track list - List all trackers
• /track create - Create a new tracker
• /track <name> add "entry" - Add an entry
• /track <name> stats - View statistics
• /track <name> history - View history
• @trackerName - Query tracker naturally

*Examples:*
• /track list
• /track workout add "Bench press 3x8 at 185"
• @matt what was my last workout?`;

    await bot.sendMessage(chatId, helpMsg, {
      reply_to_message_id: msg.message_id,
      parse_mode: 'Markdown',
    });
  } else {
    // TODO: Implement tracker command handling
    await bot.sendMessage(chatId, `Tracker command: ${arg} (not yet implemented)`, {
      reply_to_message_id: msg.message_id,
    });
  }
  
  console.log(`\x1b[32m  -> /track help sent\x1b[0m\n`);
}

/**
 * /search command
 */
async function handleSearchCommand(bot, msg, query) {
  const chatId = msg.chat.id;
  
  if (!query) {
    await bot.sendMessage(
      chatId,
      'Usage: /search <query>\n\nExample: /search latest React features',
      {
        reply_to_message_id: msg.message_id,
      },
    );
    return;
  }

  console.log(`\x1b[36m  -> Searching: ${query}\x1b[0m\n`);
  
  try {
    const results = await webSearch(query, 5);
    
    if (results.length === 0) {
      await bot.sendMessage(chatId, 'No results found.', {
        reply_to_message_id: msg.message_id,
      });
      
      logToFile('telegram-out', 'info', 'No results found', {
        chatId,
        command: '/search',
        query,
      });
    } else {
      const response = results
        .map((r, i) => `${i + 1}. [${r.title}](${r.url})`)
        .join('\n');
      
      await bot.sendMessage(
        chatId,
        `*Search Results for "${query}"*\n\n${response}`,
        {
          reply_to_message_id: msg.message_id,
          parse_mode: 'Markdown',
        },
      );
      
      logToFile('telegram-out', 'info', `Search results for: ${query}`, {
        chatId,
        command: '/search',
        query,
        resultCount: results.length,
      });
    }
  } catch (error) {
    console.error(`Search error: ${error.message}`);
    await bot.sendMessage(chatId, 'Search failed. Please try again.', {
      reply_to_message_id: msg.message_id,
    });
  }
}

/**
 * /profile command
 */
async function handleProfileCommand(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    const profile = loadProfile();
    
    if (profile) {
      await bot.sendMessage(chatId, `Your Profile:\n\n${profile}`, {
        reply_to_message_id: msg.message_id,
      });
    } else {
      await bot.sendMessage(chatId, 'No profile found. Please set up your profile first.', {
        reply_to_message_id: msg.message_id,
      });
    }
  } catch (error) {
    await bot.sendMessage(chatId, 'Error loading profile.', {
      reply_to_message_id: msg.message_id,
    });
  }
}

/**
 * Placeholder implementations for other commands
 */
async function handleWorkspaceCommand(bot, msg, arg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Workspace command not yet implemented.', {
    reply_to_message_id: msg.message_id,
  });
}

async function handleMemoriesCommand(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Memories command not yet implemented.', {
    reply_to_message_id: msg.message_id,
  });
}

async function handleClaudeCommand(bot, msg, arg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Claude command not yet implemented.', {
    reply_to_message_id: msg.message_id,
  });
}

async function handleGitCommand(bot, msg, arg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Git command not yet implemented.', {
    reply_to_message_id: msg.message_id,
  });
}

async function handleBrowserCommand(bot, msg, arg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Browser command not yet implemented.', {
    reply_to_message_id: msg.message_id,
  });
}

async function handleSelfCommand(bot, msg, arg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Self-improvement command not yet implemented.', {
    reply_to_message_id: msg.message_id,
  });
}

/**
 * Handle unknown commands
 */
async function handleUnknownCommand(bot, msg, command) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, `Unknown command: ${command}. Use /help for available commands.`, {
    reply_to_message_id: msg.message_id,
  });
}

export {
  handleCommands,
};