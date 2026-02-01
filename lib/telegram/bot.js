/**
 * Telegram Bot Core
 * Main bot initialization and connection handling
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { loadConfig } from '../configManager.js';
import { registerMessageHandlers } from './handlers.js';

let telegramBot = null;
let lastActivity = Date.now();
let isCliActive = true;
let currentTelegramToken = null;

/**
 * Helper function to download files from Telegram
 */
async function downloadTelegramFile(bot, fileId) {
  try {
    const file = await bot.getFile(fileId);
    const tokenToUse = currentTelegramToken || process.env.TELEGRAM_TOKEN;
    const downloadUrl = `https://api.telegram.org/file/bot${tokenToUse}/${file.file_path}`;
    const tempPath = path.join(
      os.tmpdir(),
      `telegram_img_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
    );

    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(tempPath);
      https
        .get(downloadUrl, (res) => {
          if (res.statusCode !== 200) {
            fs.unlink(tempPath, () => {});
            return resolve(null);
          }
          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve(tempPath);
          });
        })
        .on('error', (err) => {
          fs.unlink(tempPath, () => {});
          resolve(null);
        });
    });
  } catch (e) {
    console.error(`Download error: ${e.message}`);
    return null;
  }
}

/**
 * Start Telegram bot with configuration
 */
async function startTelegramBot() {
  // Get token from config or environment variable
  const config = loadConfig();
  const tokenFromConfig = config.telegram?.botToken;
  const tokenToUse = tokenFromConfig || process.env.TELEGRAM_TOKEN;
  const isEnabled = config.telegram?.enabled !== false; // Default to true if not explicitly disabled

  if (!tokenToUse) {
    if (process.env.VERBOSE)
      console.log(
        '\x1b[90m  [Telegram: TELEGRAM_TOKEN not set, skipping]\x1b[0m\n',
      );
    return null;
  }

  // Check for placeholder tokens
  if (
    tokenToUse.includes('YOUR_') ||
    tokenToUse.includes('_HERE') ||
    tokenToUse.length < 30
  ) {
    console.log(
      '\x1b[33m  [Telegram: token appears to be a placeholder, skipping]\x1b[0m\n',
    );
    console.log(
      '\x1b[90m  To enable Telegram, get a token from @BotFather and update:\x1b[0m\n',
    );
    console.log(
      '\x1b[90m  ~/.static-rebel/config/config.json -> telegram.botToken\x1b[0m\n',
    );
    return null;
  }

  if (!isEnabled) {
    if (process.env.VERBOSE)
      console.log(
        '\x1b[90m  [Telegram: disabled in config, skipping]\x1b[0m\n',
      );
    return null;
  }

  // If bot is already running with the same token, don't restart
  if (telegramBot && currentTelegramToken === tokenToUse) {
    return telegramBot;
  }

  // Stop existing bot if token changed
  if (telegramBot && currentTelegramToken !== tokenToUse) {
    console.log(
      '\x1b[33m  [Telegram: token changed, restarting bot...]\x1b[0m\n',
    );
    try {
      telegramBot.stopPolling();
      telegramBot = null;
    } catch (e) {
      console.log(
        `\x1b[90m  [Telegram: error stopping old bot: ${e.message}]\x1b[0m\n`,
      );
    }
  }

  // Show masked token for debugging
  const maskedToken = tokenToUse.slice(0, 8) + '...' + tokenToUse.slice(-5);
  console.log(
    `\x1b[33m  [Telegram: connecting with token ${maskedToken}...]\x1b[0m\n`,
  );

  try {
    const TelegramBot = (await import('node-telegram-bot-api')).default;

    telegramBot = new TelegramBot(tokenToUse, { polling: true });
    currentTelegramToken = tokenToUse;

    // Verify connection
    const me = await telegramBot.getMe();
    console.log(`\x1b[32m  [Telegram: connected as @${me.username}]\x1b[0m\n`);
    console.log(`  Bot info: id=${me.id}, first_name=${me.first_name}\n`);

    // Register slash commands for autocomplete
    try {
      await telegramBot.setMyCommands([
        { command: 'start', description: 'Start the bot' },
        { command: 'help', description: 'Show help and commands' },
        { command: 'track', description: 'Tracker management' },
        { command: 'search', description: 'Web search' },
        { command: 'workspace', description: 'Workspace management' },
        { command: 'profile', description: 'View your profile' },
        { command: 'memories', description: 'View stored memories' },
        { command: 'claude', description: 'Run Claude Code CLI' },
        { command: 'git', description: 'Git workflow' },
      ]);
      console.log(`\x1b[90m  [Telegram: commands registered]\x1b[0m\n`);
    } catch (e) {
      console.log(
        `\x1b[90m  [Telegram: failed to register commands: ${e.message}]\x1b[0m\n`,
      );
    }

    // Register message handlers
    registerMessageHandlers(telegramBot);

    return telegramBot;
  } catch (e) {
    console.error(`\x1b[31m  [Telegram: connection failed: ${e.message}]\x1b[0m\n`);
    return null;
  }
}

/**
 * Stop Telegram bot
 */
function stopTelegramBot() {
  if (telegramBot) {
    try {
      telegramBot.stopPolling();
      telegramBot = null;
      currentTelegramToken = null;
      console.log('\x1b[90m  [Telegram: bot stopped]\x1b[0m\n');
    } catch (e) {
      console.error(`\x1b[31m  [Telegram: error stopping bot: ${e.message}]\x1b[0m\n`);
    }
  }
}

/**
 * Get current bot instance
 */
function getTelegramBot() {
  return telegramBot;
}

/**
 * Update activity timestamp
 */
function updateLastActivity() {
  lastActivity = Date.now();
}

/**
 * Set CLI active status
 */
function setCliActive(active) {
  isCliActive = active;
}

export {
  startTelegramBot,
  stopTelegramBot,
  getTelegramBot,
  downloadTelegramFile,
  updateLastActivity,
  setCliActive,
};