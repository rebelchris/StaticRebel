# Slack Integration Setup Guide

This guide will help you set up Slack integration for StaticRebel, enabling you to log entries, get stats, set reminders, and receive nudges directly in Slack.

## Features

- **Slash Commands**: `/log`, `/stats`, `/remind`
- **Natural Language Logging**: Send messages like "drank 500ml water" and they'll be automatically logged
- **Nudges & Reminders**: Receive motivational messages and reminders in Slack
- **Daily Summaries**: Get daily progress summaries posted to a channel
- **Webhooks**: Send notifications to Slack channels
- **Real-time Events**: Socket mode for instant responses

## Prerequisites

- A Slack workspace where you have admin permissions
- StaticRebel installed and running

## Step 1: Create a Slack App

1. Go to https://api.slack.com/apps
2. Click **"Create New App"**
3. Choose **"From scratch"**
4. Enter your app name (e.g., "StaticRebel Assistant")
5. Select your workspace
6. Click **"Create App"**

## Step 2: Configure OAuth & Permissions

1. In your app dashboard, go to **"OAuth & Permissions"**
2. Add the following Bot Token Scopes:
   - `chat:write` - Send messages
   - `chat:write.public` - Send messages to channels the app isn't in
   - `reactions:write` - Add reactions to messages
   - `channels:read` - View basic information about public channels
   - `groups:read` - View basic information about private channels
   - `users:read` - View people in a workspace
   - `commands` - Add slash commands
   - `incoming-webhook` - Post messages to specific channels

3. Click **"Install to Workspace"**
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

## Step 3: Enable Socket Mode

1. Go to **"Socket Mode"** in the sidebar
2. Enable Socket Mode
3. Generate an App-Level Token with `connections:write` scope
4. Copy the **App-Level Token** (starts with `xapp-`)

## Step 4: Create Slash Commands

1. Go to **"Slash Commands"** in the sidebar
2. Create the following commands:

### /log Command
- **Command**: `/log`
- **Request URL**: Leave blank (using Socket Mode)
- **Short Description**: "Log a health/habit entry"
- **Usage Hint**: "drank 500ml water"

### /stats Command  
- **Command**: `/stats`
- **Request URL**: Leave blank (using Socket Mode)
- **Short Description**: "View your statistics"

### /remind Command
- **Command**: `/remind`
- **Request URL**: Leave blank (using Socket Mode)
- **Short Description**: "Set a reminder"
- **Usage Hint**: "drink water in 30 minutes"

## Step 5: Set Up Incoming Webhooks (Optional)

1. Go to **"Incoming Webhooks"**
2. Toggle **"Activate Incoming Webhooks"** to On
3. Click **"Add New Webhook to Workspace"**
4. Select the channel for notifications
5. Copy the **Webhook URL**

## Step 6: Configure Environment Variables

Create a `.env` file in your StaticRebel directory or set environment variables:

```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-level-token-here
SLACK_SIGNING_SECRET=your-signing-secret-from-basic-info
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Optional: Default channels
SLACK_DEFAULT_CHANNEL=general
SLACK_REMINDER_CHANNEL=reminders
```

To find your Signing Secret:
1. Go to **"Basic Information"** in your app dashboard
2. Copy the **Signing Secret** from the App Credentials section

## Step 7: Test the Integration

Run the test command to verify your setup:

```bash
node enhanced.js slack test
```

You should see a success message if everything is configured correctly.

## Step 8: Start Using Slack Integration

### Initialize in your code:
```javascript
import SlackIntegration from './lib/integrations/slack.js';

const slack = new SlackIntegration({
  botToken: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  defaultChannel: 'general'
});

await slack.init();
```

### Send a nudge:
```bash
node enhanced.js slack nudge "Time to drink some water! 💧"
```

## Usage Examples

### Slash Commands in Slack

**Log entries:**
- `/log drank 500ml water`
- `/log exercised 30 minutes`
- `/log slept 8 hours`
- `/log mood good`

**View stats:**
- `/stats` - Shows your overall statistics

**Set reminders:**
- `/remind drink water in 30 minutes`
- `/remind workout at 6pm`

### Natural Language Logging

You can also just send messages to the bot or mention it:
- "I drank 2 cups of water"
- "Worked out for 45 minutes today"
- "Slept 7.5 hours last night"

The bot will automatically detect and log these entries.

## Configuration

Create a `config/slack.json` file based on `config/slack.example.json`:

```json
{
  "defaultChannel": "general",
  "reminderChannel": "reminders", 
  "autoLogDetection": true,
  "dailySummaryTime": "09:00",
  "dailySummaryChannel": "daily-summaries",
  "features": {
    "slashCommands": true,
    "messageLogging": true,
    "dailySummaries": true,
    "webhooks": true,
    "reminders": true
  }
}
```

## Integration with StaticRebel

To integrate with your existing StaticRebel logging system:

```javascript
const slack = new SlackIntegration({
  onLogEntry: async (entry) => {
    // Handle log entry in your system
    await yourLoggingSystem.log(entry);
  },
  onStatsRequest: async (userId) => {
    // Return user stats
    return await yourStatsSystem.getStats(userId);
  },
  onReminderRequest: async (text, userId) => {
    // Set up reminder in your system
    await yourReminderSystem.setReminder(text, userId);
  }
});
```

## Troubleshooting

### Common Issues

**"missing_scope" error:**
- Make sure you've added all required OAuth scopes
- Reinstall the app to workspace after adding scopes

**Socket mode connection fails:**
- Verify your App-Level Token is correct and has `connections:write` scope
- Check that Socket Mode is enabled in your app settings

**Slash commands don't work:**
- Ensure Socket Mode is enabled (not using request URLs)
- Verify commands are created in your app dashboard
- Check that your app is installed in the workspace

**Bot doesn't respond to messages:**
- Make sure the bot is invited to the channel
- Verify `chat:write` permission is granted
- Check that event subscriptions are not conflicting

### Debug Mode

Enable debug logging by setting:
```bash
SLACK_LOG_LEVEL=debug
```

### Support

For additional help:
1. Check the Slack API documentation: https://api.slack.com/
2. Review your app's event logs in the Slack app dashboard
3. Use the StaticRebel logs to debug integration issues

## Security Notes

- Never commit your tokens to version control
- Use environment variables for all sensitive configuration
- Regularly rotate your app tokens
- Only grant necessary OAuth scopes
- Monitor your app's usage in the Slack dashboard

## Advanced Features

### Custom Message Formatting

You can customize how messages appear in Slack using Slack's Block Kit:

```javascript
await slack.sendNudge('Time for water!', 'general', {
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '💧 *Time to hydrate!* 💧'
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Log Water'
        },
        action_id: 'log_water'
      }
    }
  ]
});
```

### Scheduled Daily Summaries

The integration can automatically post daily summaries at a specified time. Configure this in your `slack.json` config file.

### Multi-workspace Support

To support multiple Slack workspaces, create separate configuration files and initialize multiple SlackIntegration instances.