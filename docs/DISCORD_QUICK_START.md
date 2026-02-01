# Discord Integration - Quick Start Guide

Get your StaticRebel Discord bot up and running in 5 minutes!

## 🚀 Quick Setup

### 1. Create Discord Bot (2 minutes)

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** → Name it "StaticRebel"
3. Go to **"Bot"** → Click **"Add Bot"**
4. Copy the **Bot Token** 🔑
5. Go back to **"General Information"** → Copy **Application ID**

### 2. Configure Environment (1 minute)

Add to your `.env` file:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
```

### 3. Invite Bot to Your Server (1 minute)

Use this URL (replace `YOUR_CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=2048
```

### 4. Test the Integration (1 minute)

```javascript
// In your StaticRebel application
import { createDiscordIntegration } from './lib/integrations/discord.js';

const discord = createDiscordIntegration();
await discord.start();

console.log('✅ Discord bot is ready!');
```

## ✨ Try These Commands

In Discord, try:

- `/log entry:"Completed morning workout" category:"exercise"`
- `/stats period:"week"`
- `/streak`
- `sr!ping`

## 🔧 Optional Enhancements

### Enable Message Content Intent

For auto-logging and prefix commands:

1. Discord Developer Portal → Your App → Bot
2. Enable **"Message Content Intent"**

### Set Default Channel

Add to `.env`:

```env
DISCORD_DEFAULT_CHANNEL=your_channel_id
```

Get channel ID: Right-click channel → Copy Link → Extract ID from URL

### Add Webhook (Optional)

1. Discord Server → Settings → Integrations → Webhooks
2. Create webhook → Copy URL
3. Add to `.env`:

```env
DISCORD_WEBHOOK_URL=your_webhook_url
```

## 🎯 Next Steps

1. Read full [Discord Integration Guide](./DISCORD_INTEGRATION.md)
2. Set up challenges and streaks
3. Configure nudge notifications
4. Customize for your workflow

## 🚨 Troubleshooting

**Bot not responding?**
- Check bot token in `.env`
- Ensure bot has permissions in your server
- Look for errors in console

**Commands not showing?**
- Wait 5 minutes for Discord to sync
- Try reinviting the bot
- Check bot permissions include `applications.commands`

**Need help?**
- Check the full documentation
- Verify Discord Developer Portal settings
- Test with `sr!ping` first

---

That's it! Your Discord integration is ready. Start logging your activities with `/log` and tracking your progress! 🎉