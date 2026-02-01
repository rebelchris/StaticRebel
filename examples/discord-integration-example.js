/**
 * Discord Integration Example for StaticRebel
 * 
 * This example demonstrates how to integrate the Discord bot
 * with your StaticRebel application.
 */

import { createDiscordIntegration } from '../lib/integrations/discord.js';
import { EventEmitter } from 'events';

// Example: Basic Discord Integration Setup
async function basicSetup() {
  console.log('🚀 Starting Discord integration...');
  
  try {
    // Create and start Discord integration
    const discord = createDiscordIntegration({
      // Optional: Override default configuration
      prefix: 'rebel!',
      // Other options from config/discord.json will be used
    });

    await discord.start();
    console.log('✅ Discord bot is ready!');
    
    return discord;
  } catch (error) {
    console.error('❌ Failed to start Discord integration:', error.message);
    throw error;
  }
}

// Example: Sending Notifications
async function sendNotificationExamples(discord) {
  console.log('📢 Testing notifications...');
  
  // Send a simple message to default channel
  await discord.sendMessage('StaticRebel Discord integration is online! 🎉');
  
  // Send message to specific channel
  await discord.sendMessage('Integration test successful!', {
    channelId: 'YOUR_CHANNEL_ID'
  });
  
  // Send DM to user
  await discord.sendMessage('Welcome to StaticRebel Discord integration!', {
    userId: 'YOUR_USER_ID'
  });
  
  // Send rich embed message
  const embed = {
    title: '🎯 Goal Achievement',
    description: 'You\'ve completed your daily exercise goal!',
    color: 0x00FF00,
    fields: [
      { name: 'Streak', value: '7 days', inline: true },
      { name: 'Category', value: 'Exercise', inline: true }
    ],
    timestamp: new Date().toISOString()
  };
  
  await discord.sendMessage(null, {
    channelId: 'YOUR_CHANNEL_ID',
    embed
  });
}

// Example: Streak Announcements
async function streakAnnouncementExample(discord) {
  console.log('🔥 Testing streak announcements...');
  
  // Send streak milestone announcement
  await discord.sendStreakAnnouncement({
    userId: 'YOUR_USER_ID',
    streak: 30,
    category: 'exercise',
    milestone: {
      message: 'Incredible! You\'ve reached the 30-day milestone! 🏆'
    }
  });
  
  // Send regular streak update
  await discord.sendStreakAnnouncement({
    userId: 'YOUR_USER_ID',
    streak: 15,
    category: 'learning'
  });
}

// Example: Nudge Notifications
async function nudgeExample(discord) {
  console.log('🔔 Testing nudges...');
  
  // Send reminder nudge
  await discord.sendNudge({
    userId: 'YOUR_USER_ID',
    message: 'Time for your daily reflection! Have you logged your activities today?',
    type: 'daily_reminder'
  });
  
  // Send motivational nudge
  await discord.sendNudge({
    channelId: 'YOUR_CHANNEL_ID',
    message: 'Great job everyone! Keep up the momentum! 💪',
    type: 'motivation'
  });
}

// Example: Webhook Notifications
async function webhookExample(discord) {
  console.log('🪝 Testing webhooks...');
  
  // Send simple webhook notification
  await discord.sendWebhookNotification(
    'Daily challenge completed! 🎯',
    {
      username: 'Challenge Bot',
      avatarURL: 'https://example.com/avatar.png'
    }
  );
  
  // Send webhook with embed
  await discord.sendWebhookNotification(
    null,
    {
      username: 'StaticRebel Stats',
      embeds: [{
        title: '📊 Weekly Summary',
        description: 'Your weekly progress report',
        fields: [
          { name: 'Total Entries', value: '42', inline: true },
          { name: 'Streak', value: '7 days', inline: true },
          { name: 'Top Category', value: 'Exercise', inline: true }
        ],
        color: 0x0099FF
      }]
    }
  );
}

// Example: Integration with StaticRebel Event System
class StaticRebelDiscordBridge extends EventEmitter {
  constructor(discord) {
    super();
    this.discord = discord;
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Listen for StaticRebel events and send Discord notifications
    
    this.on('goalCompleted', async (data) => {
      await this.discord.sendStreakAnnouncement({
        userId: data.discordUserId,
        streak: data.currentStreak,
        category: data.category,
        milestone: data.milestone
      });
    });
    
    this.on('dailyReminder', async (data) => {
      await this.discord.sendNudge({
        userId: data.discordUserId,
        message: `Don't forget to log your ${data.category} activity today!`,
        type: 'daily_reminder'
      });
    });
    
    this.on('challengeUpdate', async (data) => {
      const leaderboard = await this.generateLeaderboard(data.challenge);
      await this.discord.sendMessage(null, {
        channelId: data.channelId,
        embed: leaderboard
      });
    });
    
    this.on('weeklyReport', async (data) => {
      const reportEmbed = {
        title: '📊 Weekly Progress Report',
        description: `Week of ${data.weekStart}`,
        fields: data.stats.map(stat => ({
          name: stat.category,
          value: `${stat.count} entries`,
          inline: true
        })),
        color: 0x0099FF
      };
      
      await this.discord.sendWebhookNotification(null, {
        username: 'StaticRebel Weekly Report',
        embeds: [reportEmbed]
      });
    });
  }
  
  async generateLeaderboard(challenge) {
    // Mock leaderboard generation
    const participants = [
      { name: 'Alice', score: 150 },
      { name: 'Bob', score: 120 },
      { name: 'Charlie', score: 90 }
    ];
    
    const leaderboardText = participants
      .map((p, i) => `${i + 1}. **${p.name}** - ${p.score} points`)
      .join('\n');
    
    return {
      title: `🏆 ${challenge.name} Leaderboard`,
      description: leaderboardText,
      color: 0xFFD700
    };
  }
  
  // Trigger events (these would be called from your StaticRebel application)
  async triggerGoalCompletion(userId, category, streak, milestone = null) {
    this.emit('goalCompleted', {
      discordUserId: userId,
      category,
      currentStreak: streak,
      milestone
    });
  }
  
  async triggerDailyReminder(userId, category) {
    this.emit('dailyReminder', {
      discordUserId: userId,
      category
    });
  }
  
  async triggerChallengeUpdate(challenge, channelId) {
    this.emit('challengeUpdate', {
      challenge,
      channelId
    });
  }
  
  async triggerWeeklyReport(stats) {
    this.emit('weeklyReport', {
      weekStart: new Date().toLocaleDateString(),
      stats
    });
  }
}

// Example: Scheduled Tasks Integration
function setupScheduledTasks(bridge) {
  console.log('⏰ Setting up scheduled tasks...');
  
  // Daily reminders at 6 PM
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 18 && now.getMinutes() === 0) {
      // Send daily reminders to active users
      const activeUsers = ['USER_ID_1', 'USER_ID_2']; // Get from your database
      
      activeUsers.forEach(userId => {
        bridge.triggerDailyReminder(userId, 'general');
      });
    }
  }, 60000); // Check every minute
  
  // Weekly reports on Sunday
  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 0 && now.getHours() === 9 && now.getMinutes() === 0) {
      // Generate and send weekly reports
      const mockStats = [
        { category: 'exercise', count: 5 },
        { category: 'learning', count: 3 },
        { category: 'work', count: 7 }
      ];
      
      bridge.triggerWeeklyReport(mockStats);
    }
  }, 60000);
}

// Example: Main Application Integration
async function main() {
  try {
    // 1. Initialize Discord integration
    const discord = await basicSetup();
    
    // 2. Set up bridge between StaticRebel and Discord
    const bridge = new StaticRebelDiscordBridge(discord);
    
    // 3. Test various features
    console.log('🧪 Running feature tests...');
    
    // Wait a moment for bot to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test notifications (uncomment to test)
    // await sendNotificationExamples(discord);
    // await streakAnnouncementExample(discord);
    // await nudgeExample(discord);
    // await webhookExample(discord);
    
    // 4. Set up scheduled tasks
    setupScheduledTasks(bridge);
    
    // 5. Simulate some events
    console.log('🎭 Simulating StaticRebel events...');
    
    // Simulate goal completion
    await bridge.triggerGoalCompletion('YOUR_USER_ID', 'exercise', 7, {
      message: 'One week strong! 💪'
    });
    
    // Simulate daily reminder
    setTimeout(async () => {
      await bridge.triggerDailyReminder('YOUR_USER_ID', 'learning');
    }, 3000);
    
    // Keep the application running
    console.log('✅ Discord integration is running! Press Ctrl+C to stop.');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down Discord integration...');
      await discord.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('💥 Application error:', error);
    process.exit(1);
  }
}

// Example: Configuration Validation
function validateSetup() {
  console.log('🔍 Validating Discord configuration...');
  
  const required = [
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_ID'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease check your .env file and Discord setup.');
    return false;
  }
  
  console.log('✅ Configuration is valid!');
  return true;
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🎯 StaticRebel Discord Integration Example');
  console.log('==========================================\n');
  
  if (validateSetup()) {
    main().catch(console.error);
  }
}

// Export for use in other modules
export {
  basicSetup,
  sendNotificationExamples,
  streakAnnouncementExample,
  nudgeExample,
  webhookExample,
  StaticRebelDiscordBridge,
  setupScheduledTasks,
  validateSetup
};