// Calendar Heartbeat Integration for StaticRebel
// Checks for upcoming events and sends nudges during heartbeat cycles

import { getCalendar, getEventsNeedingNudges, getScheduleContext } from './index.js';
import { addMemory } from '../db.js';

/**
 * Calendar heartbeat handler
 * This function should be called during heartbeat cycles to check for calendar events
 */
export async function handleCalendarHeartbeat() {
  try {
    const calendar = getCalendar();
    const stats = calendar.getStats();
    
    // Skip if no providers are configured
    if (stats.enabledProviders.length === 0) {
      return {
        hasCalendarAccess: false,
        message: 'No calendar providers configured'
      };
    }

    // Check for events that need nudges
    const nudges = await getEventsNeedingNudges();
    const scheduleContext = await getScheduleContext();
    
    const result = {
      hasCalendarAccess: true,
      nudgesCount: nudges.length,
      nudges: nudges.map(event => event.nudgeMessage),
      scheduleContext,
      timestamp: new Date().toISOString()
    };

    // Log calendar check
    if (nudges.length > 0) {
      addMemory(
        new Date().toISOString().split('T')[0],
        'calendar_nudge',
        `Calendar nudges: ${nudges.map(n => n.nudgeMessage).join('; ')}`,
        { nudgeCount: nudges.length, events: nudges.map(n => n.title) }
      );
    }

    return result;
  } catch (error) {
    console.error('Calendar heartbeat check failed:', error);
    return {
      hasCalendarAccess: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Check if user has any meetings today
 */
export async function checkTodaysMeetings() {
  try {
    const calendar = getCalendar();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const events = await calendar.getUpcomingEvents(1);
    const todaysEvents = events.filter(event => {
      const eventDate = event.start.toDateString();
      return eventDate === today.toDateString();
    });

    return {
      hasEvents: todaysEvents.length > 0,
      eventCount: todaysEvents.length,
      events: todaysEvents.map(event => ({
        title: event.title,
        start: event.start,
        location: event.location,
        isAllDay: event.isAllDay
      })),
      summary: generateDaySummary(todaysEvents)
    };
  } catch (error) {
    return {
      hasEvents: false,
      error: error.message
    };
  }
}

/**
 * Generate a summary of the day's events
 */
function generateDaySummary(events) {
  if (events.length === 0) {
    return "No meetings scheduled for today.";
  }

  if (events.length === 1) {
    const event = events[0];
    const timeStr = event.isAllDay ? 'all day' : event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `One meeting today: "${event.title}" at ${timeStr}`;
  }

  const meetingTimes = events.map(event => {
    const timeStr = event.isAllDay ? 'all day' : event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `"${event.title}" at ${timeStr}`;
  });

  return `${events.length} meetings today: ${meetingTimes.join(', ')}`;
}

/**
 * Get next meeting information
 */
export async function getNextMeeting() {
  try {
    const scheduleContext = await getScheduleContext();
    
    if (!scheduleContext.nextEvent) {
      return {
        hasNextMeeting: false,
        message: "No upcoming meetings found"
      };
    }

    const { nextEvent } = scheduleContext;
    return {
      hasNextMeeting: true,
      title: nextEvent.title,
      start: nextEvent.start,
      minutesUntil: nextEvent.minutesUntil,
      location: nextEvent.location,
      message: generateNextMeetingMessage(nextEvent)
    };
  } catch (error) {
    return {
      hasNextMeeting: false,
      error: error.message
    };
  }
}

/**
 * Generate a message about the next meeting
 */
function generateNextMeetingMessage(nextEvent) {
  const { title, minutesUntil, location } = nextEvent;
  
  let timeStr;
  if (minutesUntil < 1) {
    timeStr = 'starting now';
  } else if (minutesUntil < 60) {
    timeStr = `in ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(minutesUntil / 60);
    const minutes = minutesUntil % 60;
    timeStr = `in ${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  }

  const locationStr = location ? ` at ${location}` : '';
  return `Next meeting: "${title}" ${timeStr}${locationStr}`;
}

/**
 * Check if user is currently in a meeting
 */
export async function isCurrentlyInMeeting() {
  try {
    const calendar = getCalendar();
    const events = await calendar.getUpcomingEvents(1);
    const now = new Date();
    
    const currentMeeting = events.find(event => {
      return event.start <= now && event.end > now;
    });

    return {
      inMeeting: !!currentMeeting,
      meeting: currentMeeting ? {
        title: currentMeeting.title,
        start: currentMeeting.start,
        end: currentMeeting.end,
        location: currentMeeting.location,
        minutesRemaining: Math.floor((currentMeeting.end - now) / (1000 * 60))
      } : null
    };
  } catch (error) {
    return {
      inMeeting: false,
      error: error.message
    };
  }
}

/**
 * Generate calendar status for assistant context
 */
export async function getCalendarStatusForAssistant() {
  try {
    const [heartbeatResult, todaysMeetings, nextMeeting, inMeeting] = await Promise.all([
      handleCalendarHeartbeat(),
      checkTodaysMeetings(),
      getNextMeeting(),
      isCurrentlyInMeeting()
    ]);

    const status = {
      hasCalendarAccess: heartbeatResult.hasCalendarAccess,
      timestamp: new Date().toISOString(),
      
      // Current status
      currentlyInMeeting: inMeeting.inMeeting,
      currentMeeting: inMeeting.meeting,
      
      // Today's schedule
      todaysEventCount: todaysMeetings.eventCount || 0,
      todaysSummary: todaysMeetings.summary,
      
      // Next event
      nextMeeting: nextMeeting.hasNextMeeting ? {
        title: nextMeeting.title,
        minutesUntil: nextMeeting.minutesUntil,
        location: nextMeeting.location
      } : null,
      
      // Pending nudges
      pendingNudges: heartbeatResult.nudges || [],
      
      // Quick context for AI
      contextSummary: generateContextSummary({
        inMeeting: inMeeting.inMeeting,
        nextMeeting: nextMeeting.hasNextMeeting ? nextMeeting : null,
        todayCount: todaysMeetings.eventCount || 0
      })
    };

    return status;
  } catch (error) {
    return {
      hasCalendarAccess: false,
      error: error.message,
      contextSummary: "Calendar access unavailable"
    };
  }
}

/**
 * Generate a concise context summary for the AI assistant
 */
function generateContextSummary({ inMeeting, nextMeeting, todayCount }) {
  if (inMeeting) {
    return "User is currently in a meeting";
  }
  
  if (nextMeeting && nextMeeting.minutesUntil < 30) {
    return `Next meeting "${nextMeeting.title}" in ${nextMeeting.minutesUntil} minutes`;
  }
  
  if (todayCount === 0) {
    return "No meetings scheduled for today";
  }
  
  if (todayCount === 1) {
    return "One meeting scheduled today";
  }
  
  return `${todayCount} meetings scheduled today`;
}

/**
 * Calendar heartbeat configuration
 */
export const calendarHeartbeatConfig = {
  name: 'calendar',
  description: 'Check for upcoming calendar events and send nudges',
  enabled: true,
  intervalMinutes: 5, // Check every 5 minutes for nudges
  handler: handleCalendarHeartbeat
};

export default {
  handleCalendarHeartbeat,
  checkTodaysMeetings,
  getNextMeeting,
  isCurrentlyInMeeting,
  getCalendarStatusForAssistant,
  calendarHeartbeatConfig
};