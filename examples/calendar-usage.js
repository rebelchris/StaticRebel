#!/usr/bin/env node
// Calendar Integration Usage Examples for StaticRebel

import { 
  getCalendar, 
  getUpcomingEvents, 
  getScheduleContext, 
  formatEventsForDisplay,
  configureICalFeed 
} from '../lib/calendar/index.js';

import { createSetup } from '../lib/calendar/setup.js';
import { getCalendarIntegration, getCalendarContextForAI } from '../lib/calendar/integration.js';

console.log('📅 StaticRebel Calendar Integration Examples');
console.log('===========================================\n');

// Example 1: Basic Setup and Configuration
async function example1_BasicSetup() {
  console.log('Example 1: Basic Setup');
  console.log('----------------------');
  
  const setup = createSetup();
  
  // Show current configuration
  console.log('\nCurrent Configuration:');
  const stats = setup.showConfig();
  
  // Example iCal feed setup (commented out - would need real URL)
  /*
  try {
    console.log('\nSetting up example iCal feed...');
    await setup.setupICalFeed('https://calendar.google.com/calendar/ical/example%40gmail.com/private-xyz/basic.ics', 'Personal');
    console.log('✅ iCal feed configured!');
  } catch (error) {
    console.log('❌ iCal setup failed (expected for demo):', error.message);
  }
  */
  
  console.log('\n💡 To configure real calendar sources:');
  console.log('   - Google Calendar: setup.setupGoogleCalendar()');
  console.log('   - iCal feed: setup.setupICalFeed(url, name)');
  console.log('   - See README.md for detailed instructions\n');
}

// Example 2: Getting Schedule Information
async function example2_ScheduleInfo() {
  console.log('Example 2: Getting Schedule Information');
  console.log('-------------------------------------');
  
  try {
    // Get schedule context for assistant
    console.log('\nGetting schedule context...');
    const context = await getScheduleContext();
    console.log('Schedule Context:', JSON.stringify(context, null, 2));
    
    // Get upcoming events
    console.log('\nGetting upcoming events...');
    const events = await getUpcomingEvents(7);
    console.log(`Found ${events.length} upcoming events`);
    
    if (events.length > 0) {
      // Format events for display
      const formatted = formatEventsForDisplay(events);
      console.log('\nFormatted Events:');
      console.log(formatted);
    } else {
      console.log('No upcoming events (no calendar providers configured)');
    }
    
  } catch (error) {
    console.log('❌ Schedule info error:', error.message);
  }
  
  console.log();
}

// Example 3: Assistant Integration
async function example3_AssistantIntegration() {
  console.log('Example 3: Assistant Integration');
  console.log('-------------------------------');
  
  try {
    const integration = getCalendarIntegration();
    
    // Get calendar context for AI
    console.log('\nGetting calendar context for AI...');
    const aiContext = await getCalendarContextForAI();
    console.log('AI Context Text:');
    console.log(aiContext);
    
    // Simulate conversation queries
    console.log('\nSimulating conversation queries...');
    const queries = [
      "What's my schedule today?",
      "Do I have any meetings tomorrow?",
      "When is my next meeting?",
      "Am I free this afternoon?"
    ];
    
    for (const query of queries) {
      console.log(`\nQuery: "${query}"`);
      const response = await integration.handleCalendarQuery(query);
      console.log(`Response: ${response.message}`);
    }
    
    // Get calendar insights
    console.log('\nGetting calendar insights...');
    const insights = await integration.getCalendarInsights();
    console.log('Insights:', JSON.stringify(insights, null, 2));
    
  } catch (error) {
    console.log('❌ Assistant integration error:', error.message);
  }
  
  console.log();
}

// Example 4: Nudges and Notifications
async function example4_NudgesNotifications() {
  console.log('Example 4: Nudges and Notifications');
  console.log('----------------------------------');
  
  try {
    const integration = getCalendarIntegration();
    
    // Check for nudges
    console.log('\nChecking for meeting nudges...');
    const nudgeResult = await integration.checkAndSendNudges();
    console.log('Nudge Result:', JSON.stringify(nudgeResult, null, 2));
    
    if (nudgeResult.nudges && nudgeResult.nudges.length > 0) {
      console.log('\n🔔 Nudges to send:');
      nudgeResult.nudges.forEach(nudge => console.log(`   ${nudge}`));
    } else {
      console.log('🔕 No nudges needed at this time');
    }
    
    // Configure nudge settings
    console.log('\nNudge configuration example:');
    console.log('integration.calendar.configureNudges({');
    console.log('  enabled: true,');
    console.log('  beforeMinutes: [30, 15, 5],');
    console.log('  quietHours: { start: "22:00", end: "07:00" }');
    console.log('});');
    
  } catch (error) {
    console.log('❌ Nudges error:', error.message);
  }
  
  console.log();
}

// Example 5: Heartbeat Integration
async function example5_HeartbeatIntegration() {
  console.log('Example 5: Heartbeat Integration');
  console.log('-------------------------------');
  
  try {
    const { handleCalendarHeartbeat } = await import('../lib/calendar/heartbeat.js');
    const { performCalendarHeartbeatCheck } = await import('../lib/calendar/integration.js');
    
    // Raw heartbeat check
    console.log('\nRunning heartbeat check...');
    const heartbeatResult = await handleCalendarHeartbeat();
    console.log('Heartbeat Result:', JSON.stringify(heartbeatResult, null, 2));
    
    // Formatted heartbeat check (for integration with StaticRebel heartbeat system)
    console.log('\nRunning formatted heartbeat check...');
    const formattedCheck = await performCalendarHeartbeatCheck();
    console.log('Formatted Check:', JSON.stringify(formattedCheck, null, 2));
    
    console.log('\n💡 Integration with heartbeatManager.js:');
    console.log('Replace the calendar case in performCheck() with:');
    console.log('case "calendar":');
    console.log('  const { performCalendarHeartbeatCheck } = await import("./calendar/integration.js");');
    console.log('  return await performCalendarHeartbeatCheck();');
    
  } catch (error) {
    console.log('❌ Heartbeat integration error:', error.message);
  }
  
  console.log();
}

// Example 6: Configuration Management
async function example6_Configuration() {
  console.log('Example 6: Configuration Management');
  console.log('---------------------------------');
  
  const calendar = getCalendar();
  
  // Show current config
  console.log('\nCurrent Configuration:');
  console.log(JSON.stringify(calendar.config, null, 2));
  
  // Show statistics
  console.log('\nCalendar Statistics:');
  const stats = calendar.getStats();
  console.log(JSON.stringify(stats, null, 2));
  
  // Configuration examples
  console.log('\n💡 Configuration Examples:');
  console.log('\n// Add Google Calendar:');
  console.log('await configureGoogleCalendar({');
  console.log('  installed: {');
  console.log('    client_id: "your-client-id",');
  console.log('    client_secret: "your-client-secret"');
  console.log('  }');
  console.log('});');
  
  console.log('\n// Add iCal feed:');
  console.log('await configureICalFeed(');
  console.log('  "https://calendar.google.com/calendar/ical/user@gmail.com/private-xyz/basic.ics",');
  console.log('  "Personal Calendar"');
  console.log(');');
  
  console.log('\n// Configure timezone:');
  console.log('setup.configureTimezone("America/New_York");');
  
  console.log('\n// Configure nudges:');
  console.log('setup.configureNudges({');
  console.log('  enabled: true,');
  console.log('  beforeMinutes: [30, 15, 5],');
  console.log('  quietHours: { start: "22:00", end: "07:00" }');
  console.log('});');
  
  console.log();
}

// Main function to run all examples
async function runExamples() {
  try {
    await example1_BasicSetup();
    await example2_ScheduleInfo();
    await example3_AssistantIntegration();
    await example4_NudgesNotifications();
    await example5_HeartbeatIntegration();
    await example6_Configuration();
    
    console.log('🎉 All examples completed!');
    console.log('\n📚 Next Steps:');
    console.log('1. Configure your calendar providers (Google Calendar or iCal)');
    console.log('2. Integrate with your assistant using the integration.js module');
    console.log('3. Add calendar checks to your heartbeat system');
    console.log('4. Test the integration with real calendar data');
    console.log('\n📖 See lib/calendar/README.md for detailed documentation');
    
  } catch (error) {
    console.error('❌ Example execution failed:', error);
  }
}

// Run examples if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}

export {
  runExamples,
  example1_BasicSetup,
  example2_ScheduleInfo,
  example3_AssistantIntegration,
  example4_NudgesNotifications,
  example5_HeartbeatIntegration,
  example6_Configuration
};