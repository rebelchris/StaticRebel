// Calendar Integration with StaticRebel Assistant
// Integrates calendar functionality with the main assistant and heartbeat system

import { getScheduleContext, getEventsNeedingNudges, getUpcomingEvents } from './index.js';
import { handleCalendarHeartbeat, getCalendarStatusForAssistant } from './heartbeat.js';
import { addMemory } from '../db.js';

/**
 * Integrate calendar into the main StaticRebel assistant
 */
export class CalendarAssistantIntegration {
  constructor() {
    this.lastNudgeCheck = 0;
    this.lastContextUpdate = 0;
    this.contextCacheDuration = 5 * 60 * 1000; // 5 minutes
    this.cachedContext = null;
  }

  /**
   * Get calendar context for the AI assistant
   * Returns context that can be included in the AI's system prompt
   */
  async getAssistantContext() {
    const now = Date.now();
    
    // Use cached context if recent
    if (this.cachedContext && (now - this.lastContextUpdate) < this.contextCacheDuration) {
      return this.cachedContext;
    }

    try {
      const status = await getCalendarStatusForAssistant();
      
      if (!status.hasCalendarAccess) {
        this.cachedContext = {
          hasCalendar: false,
          contextText: "No calendar access configured."
        };
        return this.cachedContext;
      }

      // Build context text for AI
      let contextLines = [];
      
      // Current status
      if (status.currentlyInMeeting && status.currentMeeting) {
        contextLines.push(`🔴 User is currently in "${status.currentMeeting.title}" (ends in ${status.currentMeeting.minutesRemaining} minutes)`);
      }

      // Next meeting
      if (status.nextMeeting) {
        contextLines.push(`⏰ Next meeting: "${status.nextMeeting.title}" in ${status.nextMeeting.minutesUntil} minutes`);
        if (status.nextMeeting.location) {
          contextLines.push(`📍 Location: ${status.nextMeeting.location}`);
        }
      }

      // Today's schedule
      if (status.todaysEventCount > 0) {
        contextLines.push(`📅 ${status.todaysEventCount} meeting${status.todaysEventCount !== 1 ? 's' : ''} scheduled today`);
      } else {
        contextLines.push(`📅 No meetings scheduled today`);
      }

      // Pending nudges
      if (status.pendingNudges.length > 0) {
        contextLines.push(`🔔 ${status.pendingNudges.length} meeting reminder${status.pendingNudges.length !== 1 ? 's' : ''} pending`);
      }

      const contextText = contextLines.length > 0 
        ? `Calendar Status:\n${contextLines.join('\n')}`
        : "Calendar integrated and monitoring schedule.";

      this.cachedContext = {
        hasCalendar: true,
        contextText,
        status,
        timestamp: now
      };

      this.lastContextUpdate = now;
      return this.cachedContext;

    } catch (error) {
      console.error('Failed to get calendar context for assistant:', error);
      this.cachedContext = {
        hasCalendar: false,
        contextText: "Calendar integration error.",
        error: error.message
      };
      return this.cachedContext;
    }
  }

  /**
   * Check for and send meeting nudges
   * Should be called periodically (e.g., every 5 minutes)
   */
  async checkAndSendNudges() {
    const now = Date.now();
    
    // Check for nudges every 2 minutes max
    if (now - this.lastNudgeCheck < 2 * 60 * 1000) {
      return { nudgesSent: 0, message: 'Too soon since last check' };
    }

    try {
      const nudges = await getEventsNeedingNudges();
      this.lastNudgeCheck = now;

      if (nudges.length === 0) {
        return { nudgesSent: 0, message: 'No nudges needed' };
      }

      // Send nudges (implement your notification system here)
      const nudgeMessages = nudges.map(event => event.nudgeMessage);
      
      // Log to memory
      addMemory(
        new Date().toISOString().split('T')[0],
        'calendar_nudge',
        `Sent meeting reminders: ${nudgeMessages.join('; ')}`,
        { 
          nudgeCount: nudges.length,
          events: nudges.map(n => ({ title: n.title, minutesUntil: n.minutesUntil }))
        }
      );

      return {
        nudgesSent: nudges.length,
        message: `Sent ${nudges.length} meeting reminder${nudges.length !== 1 ? 's' : ''}`,
        nudges: nudgeMessages
      };

    } catch (error) {
      console.error('Failed to check/send nudges:', error);
      return {
        nudgesSent: 0,
        error: error.message
      };
    }
  }

  /**
   * Handle calendar-related conversation queries
   */
  async handleCalendarQuery(query) {
    const queryLower = query.toLowerCase();
    
    try {
      // What's my schedule today/tomorrow?
      if (queryLower.includes('schedule') || queryLower.includes('meetings')) {
        const daysAhead = queryLower.includes('tomorrow') ? 1 : 0;
        const events = await getUpcomingEvents(daysAhead + 1);
        
        if (queryLower.includes('today')) {
          const today = new Date().toDateString();
          const todaysEvents = events.filter(e => e.start.toDateString() === today);
          return this.formatEventsResponse(todaysEvents, 'today');
        } else if (queryLower.includes('tomorrow')) {
          const tomorrow = new Date(Date.now() + 86400000).toDateString();
          const tomorrowsEvents = events.filter(e => e.start.toDateString() === tomorrow);
          return this.formatEventsResponse(tomorrowsEvents, 'tomorrow');
        } else {
          return this.formatEventsResponse(events.slice(0, 10), 'upcoming');
        }
      }

      // When is my next meeting?
      if (queryLower.includes('next meeting')) {
        const scheduleContext = await getScheduleContext();
        
        if (!scheduleContext.nextEvent) {
          return {
            type: 'next_meeting',
            message: "You don't have any upcoming meetings scheduled."
          };
        }

        const { nextEvent } = scheduleContext;
        const timeStr = nextEvent.minutesUntil < 60 
          ? `${nextEvent.minutesUntil} minute${nextEvent.minutesUntil !== 1 ? 's' : ''}`
          : `${Math.floor(nextEvent.minutesUntil / 60)}h ${nextEvent.minutesUntil % 60}m`;
        
        return {
          type: 'next_meeting',
          message: `Your next meeting is "${nextEvent.title}" in ${timeStr}${nextEvent.location ? ` at ${nextEvent.location}` : ''}.`,
          event: nextEvent
        };
      }

      // Am I free at [time]?
      if (queryLower.includes('free') || queryLower.includes('available')) {
        // This would need more sophisticated time parsing
        return {
          type: 'availability',
          message: "I'd need to check your calendar for specific times. Can you specify when you'd like to check availability?"
        };
      }

      // Default calendar status
      const context = await this.getAssistantContext();
      return {
        type: 'general',
        message: context.contextText
      };

    } catch (error) {
      return {
        type: 'error',
        message: `I couldn't access your calendar right now: ${error.message}`
      };
    }
  }

  /**
   * Format events for conversation response
   */
  formatEventsResponse(events, timeframe) {
    if (!events || events.length === 0) {
      return {
        type: 'schedule',
        message: `You have no meetings scheduled for ${timeframe}.`
      };
    }

    const eventList = events.map(event => {
      const timeStr = event.isAllDay 
        ? 'all day' 
        : event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      return `• ${event.title} at ${timeStr}${event.location ? ` (${event.location})` : ''}`;
    }).join('\n');

    const summary = events.length === 1 
      ? `You have 1 meeting ${timeframe}:`
      : `You have ${events.length} meetings ${timeframe}:`;

    return {
      type: 'schedule',
      message: `${summary}\n\n${eventList}`,
      eventCount: events.length,
      events
    };
  }

  /**
   * Get calendar insights for proactive assistant behavior
   */
  async getCalendarInsights() {
    try {
      const status = await getCalendarStatusForAssistant();
      const insights = [];

      // Meeting starting soon
      if (status.nextMeeting && status.nextMeeting.minutesUntil <= 15) {
        insights.push({
          type: 'meeting_soon',
          priority: 'high',
          message: `Meeting "${status.nextMeeting.title}" starts in ${status.nextMeeting.minutesUntil} minutes`,
          event: status.nextMeeting
        });
      }

      // Currently in meeting
      if (status.currentlyInMeeting) {
        insights.push({
          type: 'in_meeting',
          priority: 'high',
          message: `User is currently in "${status.currentMeeting.title}"`,
          event: status.currentMeeting
        });
      }

      // Heavy meeting day
      if (status.todaysEventCount >= 5) {
        insights.push({
          type: 'busy_day',
          priority: 'medium',
          message: `Busy day with ${status.todaysEventCount} meetings scheduled`,
          eventCount: status.todaysEventCount
        });
      }

      // Light schedule
      if (status.todaysEventCount === 0) {
        insights.push({
          type: 'light_day',
          priority: 'low',
          message: 'Light schedule today with no meetings',
          eventCount: 0
        });
      }

      return insights;

    } catch (error) {
      console.error('Failed to get calendar insights:', error);
      return [];
    }
  }

  /**
   * Clear cached context (call when calendar data changes)
   */
  clearCache() {
    this.cachedContext = null;
    this.lastContextUpdate = 0;
  }
}

/**
 * Replace the calendar check in heartbeatManager.js
 * This function can be called from the existing heartbeat system
 */
export async function performCalendarHeartbeatCheck() {
  try {
    const result = await handleCalendarHeartbeat();
    
    return {
      label: 'Calendar',
      result: result.hasCalendarAccess 
        ? `${result.nudgesCount} nudges, next check in 5 min`
        : 'No calendar access',
      urgent: result.nudgesCount > 0,
      data: result
    };
  } catch (error) {
    return {
      label: 'Calendar',
      result: `Error: ${error.message}`,
      urgent: false,
      error
    };
  }
}

// Singleton instance
let calendarIntegration = null;

/**
 * Get the calendar assistant integration instance
 */
export function getCalendarIntegration() {
  if (!calendarIntegration) {
    calendarIntegration = new CalendarAssistantIntegration();
  }
  return calendarIntegration;
}

/**
 * Easy function to add calendar context to AI prompts
 */
export async function getCalendarContextForAI() {
  const integration = getCalendarIntegration();
  const context = await integration.getAssistantContext();
  return context.contextText;
}

/**
 * Easy function to handle calendar queries in conversation
 */
export async function handleCalendarConversation(query) {
  const integration = getCalendarIntegration();
  return await integration.handleCalendarQuery(query);
}

/**
 * Integration instructions for StaticRebel
 */
export const integrationInstructions = {
  heartbeat: {
    description: 'Replace calendar check in heartbeatManager.js',
    code: `
// In lib/heartbeatManager.js, replace the calendar case with:
case 'calendar':
  const { performCalendarHeartbeatCheck } = await import('./calendar/integration.js');
  return await performCalendarHeartbeatCheck();
`
  },
  
  assistant: {
    description: 'Add calendar context to AI assistant',
    code: `
// In your main assistant file, add calendar context:
import { getCalendarContextForAI } from './lib/calendar/integration.js';

// When building AI context/prompt:
const calendarContext = await getCalendarContextForAI();
const systemPrompt = \`You are StaticRebel AI assistant.

\${calendarContext}

[rest of your prompt]\`;
`
  },

  conversation: {
    description: 'Handle calendar queries in conversation',
    code: `
// In chat handler, check for calendar queries:
import { handleCalendarConversation } from './lib/calendar/integration.js';

if (message.includes('schedule') || message.includes('meeting') || message.includes('calendar')) {
  const response = await handleCalendarConversation(message);
  return response.message;
}
`
  }
};

export default {
  CalendarAssistantIntegration,
  getCalendarIntegration,
  getCalendarContextForAI,
  handleCalendarConversation,
  performCalendarHeartbeatCheck,
  integrationInstructions
};