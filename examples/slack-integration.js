#!/usr/bin/env node

/**
 * Slack Integration Example for StaticRebel
 * 
 * This example shows how to integrate Slack with your StaticRebel assistant
 * for logging, reminders, and daily summaries.
 */

import 'dotenv/config';
import SlackIntegration from '../lib/integrations/slack.js';
import { TrackerStore, parseRecordFromText } from '../tracker.js';

// Initialize tracker store
const tracker = new TrackerStore('./data');

// Create Slack integration with custom handlers
const slack = new SlackIntegration({
  defaultChannel: 'general',
  reminderChannel: 'reminders',
  
  // Handle log entries from Slack
  onLogEntry: async (entry) => {
    console.log('📝 Received log entry:', entry);
    
    // Convert to StaticRebel tracker format
    const record = parseRecordFromText(entry.text);
    if (record) {
      try {
        await tracker.addRecord(record);
        console.log('✅ Saved to tracker:', record);
      } catch (error) {
        console.error('❌ Failed to save record:', error.message);
      }
    }
  },
  
  // Handle stats requests
  onStatsRequest: async (userId) => {
    console.log('📊 Stats requested for user:', userId);
    
    // Get recent records from tracker
    const recentRecords = await tracker.getRecords({
      limit: 100,
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    });
    
    // Generate stats summary
    const stats = generateStatsFromRecords(recentRecords);
    return stats;
  },
  
  // Handle reminder requests
  onReminderRequest: async (text, userId) => {
    console.log('⏰ Reminder requested:', text, 'for user:', userId);
    
    // Parse reminder and schedule it
    // This could integrate with your existing reminder system
    const reminder = parseReminder(text);
    if (reminder) {
      // Schedule reminder (integrate with cronScheduler)
      console.log('Reminder scheduled:', reminder);
    }
  }
});

/**
 * Generate stats from tracker records
 */
function generateStatsFromRecords(records) {
  const stats = {
    totalEntries: records.length,
    todayEntries: 0,
    categories: {}
  };
  
  const today = new Date().toDateString();
  
  for (const record of records) {
    // Count today's entries
    if (new Date(record.timestamp).toDateString() === today) {
      stats.todayEntries++;
    }
    
    // Group by category
    const category = record.category || 'general';
    if (!stats.categories[category]) {
      stats.categories[category] = [];
    }
    stats.categories[category].push(record);
  }
  
  return stats;
}

/**
 * Parse reminder text into structured format
 */
function parseReminder(text) {
  // Simple parsing - could be enhanced with NLP
  const patterns = {
    timeIn: /in (\d+) (minutes?|mins?|hours?|hrs?)/i,
    timeAt: /at (\d{1,2}):?(\d{0,2})\s*(am|pm)?/i
  };
  
  const reminder = {
    text: text,
    time: null,
    action: null
  };
  
  // Extract time
  let match = text.match(patterns.timeIn);
  if (match) {
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit.includes('hour') ? 60 : 1;
    reminder.time = new Date(Date.now() + amount * multiplier * 60 * 1000);
  } else {
    match = text.match(patterns.timeAt);
    if (match) {
      let hour = parseInt(match[1]);
      const minute = parseInt(match[2]) || 0;
      const ampm = match[3]?.toLowerCase();
      
      if (ampm === 'pm' && hour !== 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      
      const time = new Date();
      time.setHours(hour, minute, 0, 0);
      
      // If time has passed today, schedule for tomorrow
      if (time < new Date()) {
        time.setDate(time.getDate() + 1);
      }
      
      reminder.time = time;
    }
  }
  
  // Extract action
  const actionWords = ['drink', 'water', 'exercise', 'workout', 'sleep', 'eat'];
  for (const word of actionWords) {
    if (text.toLowerCase().includes(word)) {
      reminder.action = word;
      break;
    }
  }
  
  return reminder;
}

/**
 * Send a daily summary
 */
async function sendDailySummary() {
  if (!slack.isConnected) {
    console.log('Slack not connected');
    return;
  }
  
  try {
    // Get today's records
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayRecords = await tracker.getRecords({
      since: today,
      limit: 100
    });
    
    // Generate summary
    const summary = {
      text: generateDailySummaryText(todayRecords),
      stats: generateStatsFromRecords(todayRecords)
    };
    
    await slack.sendDailySummary(summary);
    console.log('✅ Daily summary sent to Slack');
  } catch (error) {
    console.error('❌ Failed to send daily summary:', error.message);
  }
}

/**
 * Generate daily summary text
 */
function generateDailySummaryText(records) {
  if (records.length === 0) {
    return "No activities logged today. Don't forget to track your progress! 📝";
  }
  
  const categories = {};
  for (const record of records) {
    const category = record.category || 'general';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(record);
  }
  
  let summary = `📊 Today's Summary (${records.length} entries):\n\n`;
  
  for (const [category, categoryRecords] of Object.entries(categories)) {
    summary += `• *${category.charAt(0).toUpperCase() + category.slice(1)}*: ${categoryRecords.length} entries\n`;
  }
  
  summary += '\nGreat work tracking your progress! 🎉';
  return summary;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting Slack Integration Example');
  
  // Initialize Slack
  const connected = await slack.init();
  if (!connected) {
    console.error('❌ Failed to connect to Slack');
    process.exit(1);
  }
  
  console.log('✅ Slack integration active');
  console.log('Available commands in Slack:');
  console.log('  /log <entry>   - Log an activity');
  console.log('  /stats         - View your stats');
  console.log('  /remind <text> - Set a reminder');
  
  // Send test nudge
  await slack.sendNudge('👋 StaticRebel Slack integration is now active! Try using /stats to see your progress.');
  
  // Schedule daily summaries (example at 9 AM)
  // This could be integrated with cronScheduler for proper scheduling
  console.log('📅 To enable daily summaries, integrate with cronScheduler');
  
  // Keep the process running
  console.log('🔄 Integration running... Press Ctrl+C to stop');
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await slack.disconnect();
    process.exit(0);
  });
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { slack, sendDailySummary };