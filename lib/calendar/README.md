# Calendar Integration for StaticRebel

The calendar integration provides awareness of the user's schedule through Google Calendar API and iCal feed support, including context-aware suggestions and meeting reminders.

## Features

- **Google Calendar API integration** with OAuth2 flow
- **iCal/ICS feed parser** for generic calendar support
- **Fetch upcoming events** from multiple calendar sources
- **Meeting nudges** ("You have a meeting in 30 min")
- **Context for the assistant** about user's schedule
- **Calendar configuration** stored in user profile
- **Timezone conversion** handling

## Quick Start

### 1. Basic Setup

```javascript
import { getCalendar, getUpcomingEvents, getScheduleContext } from './lib/calendar/index.js';
import { createSetup } from './lib/calendar/setup.js';

// Create setup instance
const setup = createSetup();

// Show current configuration
setup.showConfig();

// Interactive setup
const setupInstance = await runInteractiveSetup();
```

### 2. Configure iCal Feed (Easiest)

```javascript
// Add an iCal feed (works with most calendar apps)
await setup.setupICalFeed('https://calendar.google.com/calendar/ical/user@gmail.com/private-xyz/basic.ics', 'Personal');

// Test the integration
await setup.testIntegration();
```

### 3. Configure Google Calendar (Full Features)

```javascript
// 1. Set up credentials (see Google Calendar API section below)
// 2. Configure Google Calendar
const result = await setup.setupGoogleCalendar();
console.log(result.authUrl); // Open this URL in browser

// 3. Authorize with the code from Google
await setup.authorizeGoogle('4/0AX4XfWh...');  // Paste code from browser
```

## Usage Examples

### Get Upcoming Events

```javascript
import { getUpcomingEvents, formatEventsForDisplay } from './lib/calendar/index.js';

// Get next 7 days of events
const events = await getUpcomingEvents(7);
console.log(`Found ${events.length} upcoming events`);

// Format for display
const formatted = formatEventsForDisplay(events);
console.log(formatted);
```

### Get Schedule Context for Assistant

```javascript
import { getScheduleContext } from './lib/calendar/index.js';

const context = await getScheduleContext();
console.log('Schedule context:', context);
/*
{
  hasCalendarAccess: true,
  nextEvent: {
    title: "Team Meeting",
    start: "2024-02-01T14:00:00Z",
    minutesUntil: 45,
    location: "Conference Room A"
  },
  todayCount: 3,
  upcomingCount: 12,
  timezone: "America/New_York"
}
*/
```

### Check for Meeting Nudges

```javascript
import { getEventsNeedingNudges } from './lib/calendar/index.js';

const nudges = await getEventsNeedingNudges();
nudges.forEach(event => {
  console.log(event.nudgeMessage);
  // "📅 Reminder: Team Meeting starts in 30 minutes at Conference Room A"
});
```

### Heartbeat Integration

```javascript
import { handleCalendarHeartbeat, getCalendarStatusForAssistant } from './lib/calendar/heartbeat.js';

// Check calendar during heartbeat
const heartbeatResult = await handleCalendarHeartbeat();

// Get full status for assistant
const status = await getCalendarStatusForAssistant();
console.log('Assistant context:', status.contextSummary);
// "Next meeting 'Daily Standup' in 15 minutes"
```

## Calendar Sources

### Google Calendar API

**Pros:**
- Full read/write access
- Real-time updates
- Rich event details
- Multiple calendars

**Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable Google Calendar API
4. Create OAuth2 credentials (Desktop application)
5. Download credentials JSON file
6. Save as `~/.static-rebel/calendar-credentials.json`

### iCal Feeds

**Pros:**
- Easy setup
- Works with most calendar apps
- No OAuth required
- Universal format

**Common Sources:**
- **Gmail:** `https://calendar.google.com/calendar/ical/[email]/private-[key]/basic.ics`
- **Outlook:** `https://outlook.live.com/owa/calendar/[id]/calendar.ics`
- **iCloud:** `https://[server].icloud.com/published/2/[key]`
- **CalDAV:** Most calendar apps can export iCal URLs

**Get iCal URL:**
- Google Calendar: Settings → Calendar → Integrate → Secret address in iCal format
- Outlook: Settings → View all Outlook settings → Calendar → Shared calendars
- iCloud: Settings → Share Calendar → Public Calendar

## Configuration

### Nudge Settings

```javascript
import { createSetup } from './lib/calendar/setup.js';

const setup = createSetup();

// Configure when to send nudges
setup.configureNudges({
  enabled: true,
  beforeMinutes: [30, 15, 5],  // Nudge 30, 15, and 5 minutes before
  quietHours: { 
    start: '22:00',  // No nudges after 10 PM
    end: '07:00'     // No nudges before 7 AM
  }
});
```

### Timezone

```javascript
// Set timezone (auto-detected by default)
setup.configureTimezone('America/New_York');
setup.configureTimezone('Europe/London');
setup.configureTimezone('Asia/Tokyo');
```

## Integration with StaticRebel

### In your assistant code:

```javascript
import { getScheduleContext, getCalendarStatusForAssistant } from './lib/calendar/index.js';

// During conversation context building
const scheduleContext = await getScheduleContext();
if (scheduleContext.hasCalendarAccess) {
  // Include schedule information in AI context
  const context = scheduleContext.nextEvent 
    ? `Next meeting: "${scheduleContext.nextEvent.title}" in ${scheduleContext.nextEvent.minutesUntil} minutes`
    : "No upcoming meetings";
}

// During heartbeat checks
const calendarStatus = await getCalendarStatusForAssistant();
if (calendarStatus.pendingNudges.length > 0) {
  // Send nudges to user
  calendarStatus.pendingNudges.forEach(nudge => {
    console.log(nudge); // or send via notification system
  });
}
```

### In heartbeat system:

```javascript
import { handleCalendarHeartbeat } from './lib/calendar/heartbeat.js';

// Add to heartbeat checks
async function doHeartbeat() {
  // ... other heartbeat checks
  
  const calendarResult = await handleCalendarHeartbeat();
  if (calendarResult.nudgesCount > 0) {
    calendarResult.nudges.forEach(nudge => {
      // Send nudge notification
      console.log(`🔔 ${nudge}`);
    });
  }
}
```

## API Reference

### Main Functions

- `getUpcomingEvents(daysAhead)` - Get upcoming events
- `getScheduleContext(daysAhead)` - Get context for assistant
- `getEventsNeedingNudges()` - Get events needing reminders
- `formatEventsForDisplay(events, options)` - Format events for display
- `getCalendarStats()` - Get integration statistics

### Setup Functions

- `configureGoogleCalendar(credentials)` - Setup Google Calendar
- `configureICalFeed(url, name)` - Setup iCal feed
- `createSetup()` - Create setup utility instance
- `runInteractiveSetup()` - Run interactive setup

### Heartbeat Functions

- `handleCalendarHeartbeat()` - Main heartbeat handler
- `getCalendarStatusForAssistant()` - Get full status for AI
- `checkTodaysMeetings()` - Check today's schedule
- `getNextMeeting()` - Get next meeting info
- `isCurrentlyInMeeting()` - Check if user is in a meeting

## Configuration Storage

Calendar configuration is stored in the user profile via StaticRebel's database system:

- **Key:** `calendar`
- **Storage:** SQLite (primary) or JSON fallback
- **Location:** `~/.static-rebel/data.db` or `~/.static-rebel/data/profile.json`

## Error Handling

The calendar integration gracefully handles:
- Network failures (offline mode)
- Invalid credentials (OAuth token expiry)
- Malformed iCal feeds
- Timezone conversion errors
- API rate limits

## Security

- OAuth tokens are stored securely in user profile
- No calendar data is cached permanently
- Credentials files should be protected (`600` permissions recommended)
- iCal URLs may contain private tokens - treat as sensitive

## Troubleshooting

### Google Calendar not working
1. Check credentials file exists and is valid JSON
2. Verify Google Calendar API is enabled in Cloud Console
3. Ensure OAuth redirect URI matches configuration
4. Check token expiry and refresh if needed

### iCal feed not working
1. Test URL in browser (should download .ics file)
2. Verify iCal format is valid
3. Check if feed requires authentication
4. Ensure network connectivity

### No events showing
1. Check timezone configuration
2. Verify date range (default is 7 days)
3. Confirm calendar has events in the time period
4. Check provider configuration and enabled status

### Nudges not working
1. Verify nudge settings are enabled
2. Check quiet hours configuration
3. Ensure events are within nudge time windows
4. Confirm heartbeat system is running

## Example Calendar URLs

**Google Calendar (iCal):**
```
https://calendar.google.com/calendar/ical/your.email%40gmail.com/private-abcdef1234567890/basic.ics
```

**Office 365 (iCal):**
```
https://outlook.live.com/owa/calendar/12345678-1234-1234-1234-123456789012/calendar.ics
```

**iCloud (public):**
```
https://p123-calendars.icloud.com/published/2/abcdefghijklmnopqrstuvwxyz1234567890
```

Remember to keep these URLs private as they often contain access tokens!