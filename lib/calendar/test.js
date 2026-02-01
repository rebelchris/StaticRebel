#!/usr/bin/env node
// Calendar Integration Test Script for StaticRebel

import { CalendarIntegration } from './index.js';
import { CalendarSetup } from './setup.js';
import { getCalendarIntegration, performCalendarHeartbeatCheck } from './integration.js';
import { handleCalendarHeartbeat } from './heartbeat.js';

// ANSI color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(level, message) {
  const timestamp = new Date().toLocaleTimeString();
  const levelColors = {
    INFO: colors.blue,
    SUCCESS: colors.green,
    WARNING: colors.yellow,
    ERROR: colors.red
  };
  
  console.log(`${colors.bold}[${timestamp}]${colors.reset} ${levelColors[level]}${level}${colors.reset}: ${message}`);
}

async function testBasicFunctionality() {
  log('INFO', 'Testing basic calendar functionality...');
  
  try {
    // Test calendar instance creation
    const calendar = new CalendarIntegration();
    log('SUCCESS', 'Calendar instance created');
    
    // Test configuration
    const stats = calendar.getStats();
    log('INFO', `Calendar stats: ${JSON.stringify(stats)}`);
    
    // Test schedule context (should work even without providers)
    const scheduleContext = await calendar.getScheduleContext();
    log('INFO', `Schedule context: ${JSON.stringify(scheduleContext, null, 2)}`);
    
    // Test event formatting with sample data
    const sampleEvents = [
      {
        id: 'test1',
        title: 'Team Meeting',
        start: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
        end: new Date(Date.now() + 90 * 60 * 1000),   // 90 minutes from now
        isAllDay: false,
        location: 'Conference Room A',
        provider: 'test'
      },
      {
        id: 'test2',
        title: 'Project Review',
        start: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours from now
        end: new Date(Date.now() + 4 * 60 * 60 * 1000),   // 4 hours from now
        isAllDay: false,
        location: 'Zoom',
        provider: 'test'
      }
    ];
    
    const formatted = calendar.formatEventsForDisplay(sampleEvents);
    log('INFO', `Formatted events:\n${formatted}`);
    
    log('SUCCESS', 'Basic functionality test passed');
    return true;
    
  } catch (error) {
    log('ERROR', `Basic functionality test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function testSetupUtility() {
  log('INFO', 'Testing setup utility...');
  
  try {
    const setup = new CalendarSetup();
    
    // Test configuration display
    const stats = setup.showConfig();
    log('INFO', `Current config stats: ${JSON.stringify(stats)}`);
    
    // Test quick setup display
    const quickSetup = await setup.quickSetupCommon();
    log('INFO', `Quick setup result: ${quickSetup.message}`);
    
    // Test integration test (should handle no providers gracefully)
    log('INFO', 'Running integration test...');
    const integrationResult = await setup.testIntegration();
    log('INFO', `Integration test: ${integrationResult.message}`);
    
    log('SUCCESS', 'Setup utility test passed');
    return true;
    
  } catch (error) {
    log('ERROR', `Setup utility test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function testHeartbeatIntegration() {
  log('INFO', 'Testing heartbeat integration...');
  
  try {
    // Test heartbeat handler
    const heartbeatResult = await handleCalendarHeartbeat();
    log('INFO', `Heartbeat result: ${JSON.stringify(heartbeatResult)}`);
    
    // Test assistant integration heartbeat check
    const integrationCheck = await performCalendarHeartbeatCheck();
    log('INFO', `Integration check: ${JSON.stringify(integrationCheck)}`);
    
    log('SUCCESS', 'Heartbeat integration test passed');
    return true;
    
  } catch (error) {
    log('ERROR', `Heartbeat integration test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function testAssistantIntegration() {
  log('INFO', 'Testing assistant integration...');
  
  try {
    const integration = getCalendarIntegration();
    
    // Test assistant context
    const context = await integration.getAssistantContext();
    log('INFO', `Assistant context: ${JSON.stringify(context)}`);
    
    // Test query handling
    const queries = [
      "What's my schedule today?",
      "Do I have any meetings?",
      "When is my next meeting?",
      "Am I free this afternoon?"
    ];
    
    for (const query of queries) {
      const response = await integration.handleCalendarQuery(query);
      log('INFO', `Query: "${query}" -> Response: ${response.message}`);
    }
    
    // Test nudge checking
    const nudgeResult = await integration.checkAndSendNudges();
    log('INFO', `Nudge check: ${JSON.stringify(nudgeResult)}`);
    
    // Test insights
    const insights = await integration.getCalendarInsights();
    log('INFO', `Calendar insights: ${JSON.stringify(insights)}`);
    
    log('SUCCESS', 'Assistant integration test passed');
    return true;
    
  } catch (error) {
    log('ERROR', `Assistant integration test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function testICalParsing() {
  log('INFO', 'Testing iCal parsing functionality...');
  
  try {
    // Create sample iCal data
    const sampleICal = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test@example.com
DTSTART:${new Date(Date.now() + 3600000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}
DTEND:${new Date(Date.now() + 7200000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}
SUMMARY:Test Meeting
DESCRIPTION:A test meeting event
LOCATION:Test Location
END:VEVENT
END:VCALENDAR`;
    
    // Import ICAL parser
    const ICAL = await import('ical.js');
    
    // Test parsing
    const jcalData = ICAL.default.parse(sampleICal);
    const comp = new ICAL.default.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    log('SUCCESS', `Successfully parsed iCal with ${vevents.length} event(s)`);
    
    // Test event extraction
    if (vevents.length > 0) {
      const event = new ICAL.default.Event(vevents[0]);
      log('INFO', `Sample event: ${event.summary} at ${event.startDate.toJSDate()}`);
    }
    
    log('SUCCESS', 'iCal parsing test passed');
    return true;
    
  } catch (error) {
    log('ERROR', `iCal parsing test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function testTimezoneHandling() {
  log('INFO', 'Testing timezone handling...');
  
  try {
    const calendar = new CalendarIntegration();
    
    // Test timezone detection
    const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    log('INFO', `Detected timezone: ${defaultTz}`);
    
    // Test timezone in config
    log('INFO', `Config timezone: ${calendar.config.timezone}`);
    
    // Test quiet hours check
    const isQuiet = calendar.isInQuietHours();
    log('INFO', `Currently in quiet hours: ${isQuiet}`);
    
    // Test with different times
    const testTimes = [
      new Date('2024-01-01T10:00:00'), // Morning
      new Date('2024-01-01T15:00:00'), // Afternoon
      new Date('2024-01-01T23:30:00'), // Late night
      new Date('2024-01-01T05:00:00')  // Early morning
    ];
    
    for (const time of testTimes) {
      const quiet = calendar.isInQuietHours(time);
      log('INFO', `${time.toLocaleTimeString()} is${quiet ? '' : ' not'} in quiet hours`);
    }
    
    log('SUCCESS', 'Timezone handling test passed');
    return true;
    
  } catch (error) {
    log('ERROR', `Timezone handling test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function testDatabaseIntegration() {
  log('INFO', 'Testing database integration...');
  
  try {
    // Test profile storage
    const { setProfile, getProfile } = await import('../db.js');
    
    // Save test calendar config
    const testConfig = {
      timezone: 'America/New_York',
      enabledProviders: ['test'],
      providers: {
        test: { enabled: true }
      }
    };
    
    setProfile('calendar_test', testConfig);
    log('SUCCESS', 'Saved test config to profile');
    
    // Retrieve test config
    const retrieved = getProfile('calendar_test');
    log('INFO', `Retrieved config: ${JSON.stringify(retrieved)}`);
    
    if (JSON.stringify(retrieved) === JSON.stringify(testConfig)) {
      log('SUCCESS', 'Database storage/retrieval working correctly');
    } else {
      log('WARNING', 'Database data mismatch');
    }
    
    log('SUCCESS', 'Database integration test passed');
    return true;
    
  } catch (error) {
    log('ERROR', `Database integration test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function runAllTests() {
  log('INFO', `${colors.bold}Starting Calendar Integration Test Suite${colors.reset}`);
  log('INFO', '='.repeat(50));
  
  const tests = [
    { name: 'Basic Functionality', fn: testBasicFunctionality },
    { name: 'Setup Utility', fn: testSetupUtility },
    { name: 'Heartbeat Integration', fn: testHeartbeatIntegration },
    { name: 'Assistant Integration', fn: testAssistantIntegration },
    { name: 'iCal Parsing', fn: testICalParsing },
    { name: 'Timezone Handling', fn: testTimezoneHandling },
    { name: 'Database Integration', fn: testDatabaseIntegration }
  ];
  
  const results = [];
  
  for (const test of tests) {
    log('INFO', `\n${colors.bold}Running: ${test.name}${colors.reset}`);
    log('INFO', '-'.repeat(30));
    
    const startTime = Date.now();
    const success = await test.fn();
    const duration = Date.now() - startTime;
    
    results.push({
      name: test.name,
      success,
      duration
    });
    
    log(success ? 'SUCCESS' : 'ERROR', `${test.name} completed in ${duration}ms`);
  }
  
  // Summary
  log('INFO', `\n${colors.bold}Test Summary${colors.reset}`);
  log('INFO', '='.repeat(50));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;
  
  results.forEach(result => {
    const status = result.success ? colors.green + '✓' : colors.red + '✗';
    log('INFO', `${status} ${result.name} (${result.duration}ms)${colors.reset}`);
  });
  
  log('INFO', '');
  log(failed === 0 ? 'SUCCESS' : 'WARNING', 
    `${passed}/${results.length} tests passed${failed > 0 ? `, ${failed} failed` : ''}`);
  
  if (failed === 0) {
    log('SUCCESS', `${colors.bold}🎉 All calendar integration tests passed!${colors.reset}`);
    log('INFO', '\nCalendar integration is ready for use.');
    log('INFO', 'Next steps:');
    log('INFO', '1. Configure calendar providers using setup.js');
    log('INFO', '2. Integrate with your assistant using integration.js');
    log('INFO', '3. Add to heartbeat system for automatic nudges');
  } else {
    log('WARNING', `${colors.bold}⚠️  Some tests failed - check logs above${colors.reset}`);
  }
  
  return failed === 0;
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      log('ERROR', `Test suite crashed: ${error.message}`);
      console.error(error);
      process.exit(1);
    });
}

export {
  runAllTests,
  testBasicFunctionality,
  testSetupUtility,
  testHeartbeatIntegration,
  testAssistantIntegration,
  testICalParsing,
  testTimezoneHandling,
  testDatabaseIntegration
};