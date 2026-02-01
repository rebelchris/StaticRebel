# Discord Integration for StaticRebel

This document provides comprehensive setup and usage instructions for the Discord integration in StaticRebel.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Bot Setup](#bot-setup)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Features](#features)
7. [Commands](#commands)
8. [Webhooks](#webhooks)
9. [Troubleshooting](#troubleshooting)
10. [Development](#development)

## Overview

The Discord integration provides:

- **Bot Commands**: Slash commands and prefix commands for logging and stats
- **Activity Tracking**: Log entries directly from Discord
- **Nudge Notifications**: Scheduled reminders via DM or channel
- **Challenge System**: Leaderboards and challenge management
- **Streak Tracking**: Automatic streak announcements
- **Webhook Support**: External notifications and integrations

## Prerequisites

- Node.js 16+ with ES modules support
- Discord account and server (guild) with admin permissions
- StaticRebel installed and configured

## Bot Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Give it a name (e.g., "StaticRebel Assistant")
4. Navigate to **"Bot"** section
5. Click **"Add Bot"**
6. Copy the **Bot Token** (keep this secret!)
7. Enable these **Privileged Gateway Intents**:
   - Server Members Intent
   - Message Content Intent

### 2. Get Application ID

1. In the same application, go to **"General Information"**
2. Copy the **Application ID** (this is your Client ID)

### 3. Invite Bot to Server

1. Go to **"OAuth2"** → **"URL Generator"**
2. Select these **Scopes**:
   - `bot`
   - `applications.commands`
3. Select these **Bot Permissions**:
   - Send Messages
   - Use Slash Commands
   - Read Message History
   - Embed Links
   - Attach Files
   - Manage Messages (optional, for moderation)
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

## Installation

### 1. Install Dependencies

The Discord.js dependency should already be installed. If not:

```bash
npm install discord.js
```

### 2. Environment Variables

Add these to your `.env` file:

```env
# Required
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here

# Optional
DISCORD_GUILD_ID=your_guild_id_for_development
DISCORD_WEBHOOK_URL=your_webhook_url
DISCORD_PREFIX=sr!
DISCORD_DEFAULT_CHANNEL=default_channel_id
```

### 3. Create Configuration File

Copy the example configuration:

```bash
cp config/discord.example.json config/discord.json
```

Edit `config/discord.json` with your specific settings.

## Configuration

### Basic Configuration

```json
{
  "bot": {
    "token": "YOUR_BOT_TOKEN",
    "clientId": "YOUR_CLIENT_ID",
    "prefix": "sr!"
  },
  "channels": {
    "default": "CHANNEL_ID_FOR_NOTIFICATIONS",
    "logs": "CHANNEL_ID_FOR_LOG_ENTRIES"
  }
}
```

### Advanced Configuration

```json
{
  "features": {
    "autoLogging": {
      "enabled": false,
      "keywords": ["completed", "finished", "done"]
    },
    "streakAnnouncements": {
      "enabled": true,
      "milestones": [7, 14, 30, 60, 90, 180, 365]
    }
  },
  "permissions": {
    "adminRoles": ["ADMIN_ROLE_ID"],
    "allowedChannels": ["ALLOWED_CHANNEL_IDS"]
  }
}
```

## Features

### 1. Activity Logging

Log your activities directly in Discord:

```
/log entry:"Completed morning workout" category:"exercise"
```

Or use quick prefix command:

```
sr!quick-log Finished reading chapter 5 --learning
```

### 2. Statistics Tracking

View your progress and statistics:

```
/stats period:"week"
```

Shows:
- Total entries for period
- Current streak
- Longest streak  
- Category breakdown
- Weekly progress visualization

### 3. Challenge System

#### Create Challenges
```
/challenge create name:"30-Day Exercise" description:"Exercise every day for 30 days" duration:30
```

#### Join Challenges
```
/challenge join challenge:"30-Day Exercise"
```

#### View Leaderboard
```
/challenge leaderboard type:"monthly"
```

### 4. Streak Tracking

Check your streaks:

```
/streak type:"exercise"
```

Automatic announcements for milestones (7, 14, 30+ days).

### 5. Nudge Notifications

Schedule reminders:

```
/nudge schedule message:"Time for your daily review!" time:"18:00"
```

Manage nudges:
```
/nudge list
/nudge cancel id:1
```

### 6. Webhook Integration

Send notifications via webhook:

```javascript
await discordIntegration.sendWebhookNotification(
  'Daily goal completed! 🎉',
  {
    username: 'StaticRebel Goals',
    embeds: [goalCompletionEmbed]
  }
);
```

## Commands

### Slash Commands

| Command | Description | Options |
|---------|-------------|---------|
| `/log` | Log an activity | `entry` (required), `category` (optional) |
| `/stats` | View statistics | `period`: today/week/month/all |
| `/challenge` | Challenge management | Subcommands: `leaderboard`, `join`, `create` |
| `/streak` | View streak info | `type` (optional) |
| `/nudge` | Manage nudges | Subcommands: `schedule`, `list`, `cancel` |

### Prefix Commands

| Command | Description | Example |
|---------|-------------|---------|
| `sr!ping` | Test connection | `sr!ping` |
| `sr!help` | Show help | `sr!help` |
| `sr!quick-log` | Quick log entry | `sr!quick-log Completed task --work` |

### Categories

Supported log categories:
- `work` - Work-related activities
- `exercise` - Physical activities and workouts
- `learning` - Educational activities
- `personal` - Personal development
- `health` - Health and wellness activities

## Webhooks

### Setup Webhook

1. In Discord, go to Server Settings → Integrations → Webhooks
2. Create a new webhook
3. Copy the webhook URL
4. Add to your environment variables:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Using Webhooks

```javascript
import { createDiscordIntegration } from './lib/integrations/discord.js';

const discord = createDiscordIntegration();
await discord.start();

// Send webhook notification
await discord.sendWebhookNotification(
  'Your daily streak has reached 30 days! 🔥',
  {
    username: 'Streak Tracker',
    embeds: [{
      title: '🔥 Streak Milestone!',
      description: 'Congratulations on 30 days!',
      color: 0xFF6B35
    }]
  }
);
```

## Integration with StaticRebel

### 1. In your main StaticRebel application

```javascript
import { createDiscordIntegration } from './lib/integrations/discord.js';

// Initialize Discord integration
const discordIntegration = createDiscordIntegration({
  // Optional custom configuration
});

await discordIntegration.start();

// Use in your application
export { discordIntegration };
```

### 2. Sending notifications from StaticRebel

```javascript
// When a goal is completed
await discordIntegration.sendStreakAnnouncement({
  userId: 'DISCORD_USER_ID',
  streak: 15,
  category: 'exercise',
  milestone: { message: 'Two weeks strong!' }
});

// Send a nudge
await discordIntegration.sendNudge({
  userId: 'DISCORD_USER_ID',
  message: 'Remember to log your daily reflection!',
  type: 'daily_reminder'
});
```

### 3. Handling log entries

The integration automatically saves log entries to `data/discord/entries.jsonl`. You can process these in StaticRebel:

```javascript
// Read and process Discord log entries
import fs from 'fs';
import readline from 'readline';

const fileStream = fs.createReadStream('data/discord/entries.jsonl');
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity
});

for await (const line of rl) {
  const entry = JSON.parse(line);
  // Process entry in StaticRebel
  await processLogEntry(entry);
}
```

## Troubleshooting

### Bot Not Responding

1. **Check Bot Token**: Ensure `DISCORD_BOT_TOKEN` is correct
2. **Check Permissions**: Bot needs proper permissions in the server
3. **Check Intents**: Enable required Gateway Intents in Developer Portal
4. **Check Console**: Look for error messages in the application logs

### Slash Commands Not Showing

1. **Wait for Registration**: Global commands can take up to 1 hour
2. **Use Guild Commands**: Set `DISCORD_GUILD_ID` for faster development
3. **Check Permissions**: Bot needs `applications.commands` scope
4. **Reinvite Bot**: Generate new invite URL with updated permissions

### Common Errors

#### "Missing Permissions"
```
Error: Missing permissions to send messages
```
**Solution**: Grant bot "Send Messages" permission in channel/server

#### "Unknown Interaction"
```
DiscordAPIError: Unknown interaction
```
**Solution**: Response took too long (>3 seconds). Use `deferReply()` for longer operations

#### "Invalid Form Body"
```
DiscordAPIError: Invalid Form Body
```
**Solution**: Check command option types and required fields

### Debug Mode

Enable debug logging:

```env
DEBUG_DISCORD=true
```

This will log all Discord API interactions and internal operations.

## Development

### Running in Development

For faster command registration during development:

1. Set `DISCORD_GUILD_ID` to your test server ID
2. Commands will update immediately instead of taking up to 1 hour

### Testing Commands

```javascript
// Test slash command registration
import { validateDiscordConfig } from './lib/integrations/discord.js';

try {
  validateDiscordConfig();
  console.log('✅ Discord configuration is valid');
} catch (error) {
  console.error('❌ Discord configuration error:', error.message);
}
```

### Adding Custom Commands

1. Edit the `registerCommands()` method in `discord.js`
2. Add new command definitions
3. Add corresponding handlers in `handleSlashCommand()`
4. Test in development server first

### Database Integration

To integrate with your database:

1. Modify `saveLogEntry()` to save to your database
2. Update `getUserStats()` to query real data
3. Implement `getChallengeLeaderboard()` with actual data
4. Update streak methods to use persistent storage

### Example Database Integration

```javascript
// In discord.js
async saveLogEntry(logEntry) {
  // Save to StaticRebel database
  await db.logEntry.create({
    userId: logEntry.userId,
    content: logEntry.entry,
    category: logEntry.category,
    timestamp: new Date(logEntry.timestamp),
    source: 'discord'
  });
}

async getUserStats(userId, period) {
  // Query real statistics
  const entries = await db.logEntry.findMany({
    where: {
      userId,
      timestamp: {
        gte: this.getPeriodStart(period)
      }
    }
  });
  
  // Calculate and return stats
  return this.calculateStats(entries);
}
```

## Support

For issues and support:

1. Check this documentation first
2. Review console logs for error messages
3. Verify Discord Developer Portal settings
4. Test with minimal configuration
5. Check Discord API status at https://discordstatus.com

## API Reference

### DiscordIntegration Class

Main class for Discord bot functionality.

#### Constructor
```javascript
new DiscordIntegration(options)
```

#### Methods

- `start()` - Initialize and start the bot
- `stop()` - Stop the bot
- `sendMessage(content, options)` - Send message to channel/user
- `sendNudge(nudgeConfig)` - Send nudge notification
- `sendStreakAnnouncement(streakData)` - Send streak milestone
- `sendWebhookNotification(content, options)` - Send via webhook

#### Events

The integration emits events you can listen to:

```javascript
discordIntegration.on('logEntry', (entry) => {
  console.log('New log entry:', entry);
});

discordIntegration.on('challengeJoined', (data) => {
  console.log('User joined challenge:', data);
});
```

## Security Considerations

1. **Keep Bot Token Secret**: Never commit tokens to version control
2. **Use Environment Variables**: Store sensitive config in `.env`
3. **Limit Permissions**: Only grant necessary bot permissions
4. **Validate Input**: Always validate user input in commands
5. **Rate Limiting**: Discord API has rate limits - respect them
6. **Channel Restrictions**: Limit bot to specific channels if needed

## License

This Discord integration is part of StaticRebel and follows the same license terms.