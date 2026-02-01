// Calendar Integration Module for StaticRebel
// Supports Google Calendar API and iCal/ICS feeds with timezone handling

import { google } from 'googleapis';
import ICAL from 'ical.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { setProfile, getProfile } from '../db.js';

const CALENDAR_CONFIG_KEY = 'calendar';
const CREDENTIALS_PATH = path.join(os.homedir(), '.static-rebel', 'calendar-credentials.json');

// Calendar integration class
export class CalendarIntegration {
  constructor() {
    this.googleAuth = null;
    this.calendar = null;
    this.config = this.loadConfig();
  }

  /**
   * Load calendar configuration from user profile
   */
  loadConfig() {
    const config = getProfile(CALENDAR_CONFIG_KEY) || {
      providers: {},
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      enabledProviders: [],
      nudgeSettings: {
        enabled: true,
        beforeMinutes: [30, 15, 5],
        quietHours: { start: '22:00', end: '07:00' }
      }
    };
    return config;
  }

  /**
   * Save calendar configuration to user profile
   */
  saveConfig() {
    setProfile(CALENDAR_CONFIG_KEY, this.config);
  }

  /**
   * Configure Google Calendar integration
   * @param {Object} credentials - OAuth2 credentials from Google Cloud Console
   * @param {string} redirectUri - OAuth2 redirect URI
   */
  async configureGoogleCalendar(credentials, redirectUri = 'urn:ietf:wg:oauth:2.0:oob') {
    try {
      const { client_id, client_secret } = credentials.installed || credentials.web || credentials;
      
      this.googleAuth = new google.auth.OAuth2(client_id, client_secret, redirectUri);
      this.calendar = google.calendar({ version: 'v3', auth: this.googleAuth });

      // Save credentials
      this.config.providers.google = {
        enabled: true,
        credentials: { client_id, client_secret, redirect_uri: redirectUri },
        refreshToken: null
      };
      
      this.saveConfig();
      return true;
    } catch (error) {
      console.error('Failed to configure Google Calendar:', error);
      throw new Error(`Google Calendar configuration failed: ${error.message}`);
    }
  }

  /**
   * Generate Google OAuth2 authorization URL
   */
  getGoogleAuthUrl() {
    if (!this.googleAuth) {
      throw new Error('Google Calendar not configured. Call configureGoogleCalendar first.');
    }

    const scopes = ['https://www.googleapis.com/auth/calendar.readonly'];
    return this.googleAuth.generateAuthUrl({
      access_type: 'offline',
      scope: scopes
    });
  }

  /**
   * Complete Google OAuth2 flow with authorization code
   * @param {string} code - Authorization code from Google
   */
  async authorizeGoogle(code) {
    if (!this.googleAuth) {
      throw new Error('Google Calendar not configured. Call configureGoogleCalendar first.');
    }

    try {
      const { tokens } = await this.googleAuth.getToken(code);
      this.googleAuth.setCredentials(tokens);
      
      this.config.providers.google.refreshToken = tokens.refresh_token;
      this.config.providers.google.accessToken = tokens.access_token;
      this.config.enabledProviders = [...new Set([...this.config.enabledProviders, 'google'])];
      
      this.saveConfig();
      return true;
    } catch (error) {
      console.error('Failed to authorize Google Calendar:', error);
      throw new Error(`Google Calendar authorization failed: ${error.message}`);
    }
  }

  /**
   * Configure iCal feed
   * @param {string} feedUrl - URL to the iCal feed
   * @param {string} name - Name for this calendar feed
   */
  async configureICalFeed(feedUrl, name) {
    try {
      // Test the feed by fetching it
      const response = await fetch(feedUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const icalData = await response.text();
      ICAL.parse(icalData); // Validate the iCal data
      
      if (!this.config.providers.ical) {
        this.config.providers.ical = {};
      }
      
      this.config.providers.ical[name] = {
        enabled: true,
        url: feedUrl,
        name: name
      };
      
      this.config.enabledProviders = [...new Set([...this.config.enabledProviders, 'ical'])];
      this.saveConfig();
      
      return true;
    } catch (error) {
      console.error(`Failed to configure iCal feed ${name}:`, error);
      throw new Error(`iCal feed configuration failed: ${error.message}`);
    }
  }

  /**
   * Refresh Google Calendar access token if needed
   */
  async refreshGoogleToken() {
    if (!this.googleAuth || !this.config.providers.google?.refreshToken) {
      throw new Error('Google Calendar not properly configured');
    }

    try {
      this.googleAuth.setCredentials({
        refresh_token: this.config.providers.google.refreshToken
      });
      
      const { credentials } = await this.googleAuth.refreshAccessToken();
      this.googleAuth.setCredentials(credentials);
      
      this.config.providers.google.accessToken = credentials.access_token;
      this.saveConfig();
    } catch (error) {
      console.error('Failed to refresh Google token:', error);
      throw error;
    }
  }

  /**
   * Fetch events from Google Calendar
   * @param {number} daysAhead - Number of days to look ahead (default: 7)
   */
  async fetchGoogleCalendarEvents(daysAhead = 7) {
    if (!this.config.providers.google?.enabled) {
      return [];
    }

    try {
      await this.refreshGoogleToken();
      
      const timeMin = new Date();
      const timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + daysAhead);

      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: this.config.timezone
      });

      return response.data.items.map(event => this.normalizeGoogleEvent(event));
    } catch (error) {
      console.error('Failed to fetch Google Calendar events:', error);
      if (error.code === 401) {
        // Token expired, try to refresh
        try {
          await this.refreshGoogleToken();
          return await this.fetchGoogleCalendarEvents(daysAhead);
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        }
      }
      return [];
    }
  }

  /**
   * Fetch events from iCal feeds
   * @param {number} daysAhead - Number of days to look ahead (default: 7)
   */
  async fetchICalEvents(daysAhead = 7) {
    if (!this.config.providers.ical) {
      return [];
    }

    const events = [];
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + daysAhead);

    for (const [name, feedConfig] of Object.entries(this.config.providers.ical)) {
      if (!feedConfig.enabled) continue;

      try {
        const response = await fetch(feedConfig.url);
        if (!response.ok) continue;

        const icalData = await response.text();
        const jcalData = ICAL.parse(icalData);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');

        for (const vevent of vevents) {
          const event = new ICAL.Event(vevent);
          const startTime = event.startDate.toJSDate();
          const endTime = event.endDate.toJSDate();

          if (startTime >= timeMin && startTime <= timeMax) {
            events.push(this.normalizeICalEvent(event, name));
          }
        }
      } catch (error) {
        console.error(`Failed to fetch iCal feed ${name}:`, error);
      }
    }

    return events.sort((a, b) => a.start - b.start);
  }

  /**
   * Normalize Google Calendar event to standard format
   */
  normalizeGoogleEvent(event) {
    const start = event.start.dateTime 
      ? new Date(event.start.dateTime) 
      : new Date(event.start.date);
    const end = event.end.dateTime 
      ? new Date(event.end.dateTime) 
      : new Date(event.end.date);

    return {
      id: event.id,
      title: event.summary || 'Untitled Event',
      description: event.description || '',
      start,
      end,
      isAllDay: !event.start.dateTime,
      location: event.location || '',
      provider: 'google',
      attendees: event.attendees?.map(a => a.email) || [],
      url: event.htmlLink,
      timezone: event.start.timeZone || this.config.timezone
    };
  }

  /**
   * Normalize iCal event to standard format
   */
  normalizeICalEvent(event, feedName) {
    return {
      id: event.uid,
      title: event.summary || 'Untitled Event',
      description: event.description || '',
      start: event.startDate.toJSDate(),
      end: event.endDate.toJSDate(),
      isAllDay: event.isRecurring() || !event.startDate.isDate,
      location: event.location || '',
      provider: `ical:${feedName}`,
      attendees: [],
      url: '',
      timezone: this.config.timezone
    };
  }

  /**
   * Get all upcoming events from all enabled providers
   * @param {number} daysAhead - Number of days to look ahead (default: 7)
   */
  async getUpcomingEvents(daysAhead = 7) {
    const allEvents = [];

    // Fetch from Google Calendar
    if (this.config.enabledProviders.includes('google')) {
      try {
        const googleEvents = await this.fetchGoogleCalendarEvents(daysAhead);
        allEvents.push(...googleEvents);
      } catch (error) {
        console.error('Failed to fetch Google Calendar events:', error);
      }
    }

    // Fetch from iCal feeds
    if (this.config.enabledProviders.includes('ical')) {
      try {
        const icalEvents = await this.fetchICalEvents(daysAhead);
        allEvents.push(...icalEvents);
      } catch (error) {
        console.error('Failed to fetch iCal events:', error);
      }
    }

    // Sort by start time
    return allEvents.sort((a, b) => a.start - b.start);
  }

  /**
   * Get events that need nudges (upcoming within specified minutes)
   * @param {number[]} beforeMinutes - Array of minutes before event to nudge
   */
  async getEventsNeedingNudges(beforeMinutes = null) {
    if (!this.config.nudgeSettings.enabled) {
      return [];
    }

    const nudgeMinutes = beforeMinutes || this.config.nudgeSettings.beforeMinutes;
    const now = new Date();
    
    // Check if we're in quiet hours
    if (this.isInQuietHours(now)) {
      return [];
    }

    const upcomingEvents = await this.getUpcomingEvents(1); // Just today
    const eventsNeedingNudges = [];

    for (const event of upcomingEvents) {
      if (event.isAllDay) continue;
      
      const minutesUntil = Math.floor((event.start - now) / (1000 * 60));
      
      if (nudgeMinutes.includes(minutesUntil)) {
        eventsNeedingNudges.push({
          ...event,
          minutesUntil,
          nudgeMessage: this.generateNudgeMessage(event, minutesUntil)
        });
      }
    }

    return eventsNeedingNudges;
  }

  /**
   * Check if current time is within quiet hours
   */
  isInQuietHours(time = new Date()) {
    const settings = this.config.nudgeSettings.quietHours;
    const timeStr = time.toTimeString().slice(0, 5); // HH:MM format
    
    if (settings.start <= settings.end) {
      // Same day range (e.g., 07:00 to 22:00)
      return timeStr >= settings.start && timeStr <= settings.end;
    } else {
      // Overnight range (e.g., 22:00 to 07:00)
      return timeStr >= settings.start || timeStr <= settings.end;
    }
  }

  /**
   * Generate a nudge message for an upcoming event
   */
  generateNudgeMessage(event, minutesUntil) {
    const timeStr = minutesUntil === 0 ? 'now' : `in ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}`;
    const location = event.location ? ` at ${event.location}` : '';
    
    return `📅 Reminder: "${event.title}" starts ${timeStr}${location}`;
  }

  /**
   * Get context about the user's schedule for the assistant
   * @param {number} daysAhead - Number of days to look ahead (default: 2)
   */
  async getScheduleContext(daysAhead = 2) {
    try {
      const events = await this.getUpcomingEvents(daysAhead);
      const now = new Date();
      const today = new Date(now);
      today.setHours(23, 59, 59, 999);
      
      const todaysEvents = events.filter(e => e.start <= today);
      const upcomingEvents = events.filter(e => e.start > today);
      
      // Find next event
      const nextEvent = events.find(e => e.start > now);
      
      const context = {
        hasCalendarAccess: this.config.enabledProviders.length > 0,
        nextEvent: nextEvent ? {
          title: nextEvent.title,
          start: nextEvent.start,
          minutesUntil: Math.floor((nextEvent.start - now) / (1000 * 60)),
          location: nextEvent.location
        } : null,
        todayCount: todaysEvents.length,
        upcomingCount: upcomingEvents.length,
        timezone: this.config.timezone
      };

      return context;
    } catch (error) {
      console.error('Failed to get schedule context:', error);
      return {
        hasCalendarAccess: false,
        error: error.message
      };
    }
  }

  /**
   * Format events for display
   */
  formatEventsForDisplay(events, options = {}) {
    if (!events || events.length === 0) {
      return 'No upcoming events found.';
    }

    const { groupByDay = true, includeTime = true, includeLocation = true } = options;
    
    if (!groupByDay) {
      return events.map(event => this.formatSingleEvent(event, { includeTime, includeLocation })).join('\n');
    }

    // Group by day
    const groupedEvents = {};
    for (const event of events) {
      const dateKey = event.start.toDateString();
      if (!groupedEvents[dateKey]) {
        groupedEvents[dateKey] = [];
      }
      groupedEvents[dateKey].push(event);
    }

    let output = '';
    for (const [dateKey, dayEvents] of Object.entries(groupedEvents)) {
      const date = new Date(dateKey);
      const isToday = date.toDateString() === new Date().toDateString();
      const isTomorrow = date.toDateString() === new Date(Date.now() + 86400000).toDateString();
      
      let dayLabel = date.toLocaleDateString();
      if (isToday) dayLabel = 'Today';
      else if (isTomorrow) dayLabel = 'Tomorrow';
      
      output += `\n📅 **${dayLabel}**\n`;
      for (const event of dayEvents) {
        output += this.formatSingleEvent(event, { includeTime, includeLocation, indent: '  ' }) + '\n';
      }
    }

    return output.trim();
  }

  /**
   * Format a single event for display
   */
  formatSingleEvent(event, options = {}) {
    const { includeTime = true, includeLocation = true, indent = '' } = options;
    
    let formatted = `${indent}• ${event.title}`;
    
    if (includeTime && !event.isAllDay) {
      const timeStr = event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      formatted += ` (${timeStr})`;
    }
    
    if (includeLocation && event.location) {
      formatted += ` @ ${event.location}`;
    }
    
    return formatted;
  }

  /**
   * Convert timezone
   */
  convertTimezone(date, fromTz, toTz) {
    // Simple timezone conversion - in production you might want a more robust library
    const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(utc.toLocaleString('en-US', { timeZone: toTz }));
  }

  /**
   * Get calendar statistics
   */
  getStats() {
    return {
      enabledProviders: this.config.enabledProviders,
      timezone: this.config.timezone,
      nudgesEnabled: this.config.nudgeSettings.enabled,
      googleConfigured: !!this.config.providers.google?.enabled,
      icalFeeds: Object.keys(this.config.providers.ical || {}).length
    };
  }
}

// Singleton instance
let calendarInstance = null;

/**
 * Get the calendar integration instance
 */
export function getCalendar() {
  if (!calendarInstance) {
    calendarInstance = new CalendarIntegration();
  }
  return calendarInstance;
}

// Convenience functions for easy integration

/**
 * Get upcoming events
 */
export async function getUpcomingEvents(daysAhead = 7) {
  const calendar = getCalendar();
  return await calendar.getUpcomingEvents(daysAhead);
}

/**
 * Get schedule context for the assistant
 */
export async function getScheduleContext(daysAhead = 2) {
  const calendar = getCalendar();
  return await calendar.getScheduleContext(daysAhead);
}

/**
 * Get events that need nudges
 */
export async function getEventsNeedingNudges(beforeMinutes = null) {
  const calendar = getCalendar();
  return await calendar.getEventsNeedingNudges(beforeMinutes);
}

/**
 * Format events for display
 */
export function formatEventsForDisplay(events, options = {}) {
  const calendar = getCalendar();
  return calendar.formatEventsForDisplay(events, options);
}

/**
 * Configure Google Calendar
 */
export async function configureGoogleCalendar(credentials, redirectUri) {
  const calendar = getCalendar();
  return await calendar.configureGoogleCalendar(credentials, redirectUri);
}

/**
 * Configure iCal feed
 */
export async function configureICalFeed(feedUrl, name) {
  const calendar = getCalendar();
  return await calendar.configureICalFeed(feedUrl, name);
}

/**
 * Get calendar statistics
 */
export function getCalendarStats() {
  const calendar = getCalendar();
  return calendar.getStats();
}

export default CalendarIntegration;