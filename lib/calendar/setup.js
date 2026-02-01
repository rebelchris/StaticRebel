// Calendar Setup Utility for StaticRebel
// Interactive setup for Google Calendar and iCal feeds

import { CalendarIntegration } from './index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class CalendarSetup {
  constructor() {
    this.calendar = new CalendarIntegration();
    this.credentialsPath = path.join(os.homedir(), '.static-rebel', 'calendar-credentials.json');
  }

  /**
   * Interactive Google Calendar setup
   */
  async setupGoogleCalendar() {
    console.log('\n🗓️  Google Calendar Setup');
    console.log('================================');
    
    // Check if credentials file exists
    if (!fs.existsSync(this.credentialsPath)) {
      console.log('\n📝 Google Calendar requires OAuth2 credentials from Google Cloud Console.');
      console.log('   1. Go to https://console.cloud.google.com/');
      console.log('   2. Create a project or select existing one');
      console.log('   3. Enable Google Calendar API');
      console.log('   4. Create OAuth2 credentials (Desktop application)');
      console.log('   5. Download credentials JSON file');
      console.log(`   6. Save it as: ${this.credentialsPath}`);
      console.log('\n💡 Or provide credentials directly to configureGoogleCalendar()');
      
      return {
        success: false,
        message: 'Credentials file not found. Please follow the setup instructions above.',
        credentialsPath: this.credentialsPath
      };
    }

    try {
      const credentials = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf-8'));
      await this.calendar.configureGoogleCalendar(credentials);
      
      const authUrl = this.calendar.getGoogleAuthUrl();
      
      console.log('\n🔐 Authorization Required');
      console.log('Open this URL in your browser:');
      console.log(authUrl);
      console.log('\nAfter authorization, call authorizeGoogle(code) with the code from Google.');
      
      return {
        success: true,
        message: 'Google Calendar configured. Authorization required.',
        authUrl,
        nextStep: 'Call authorizeGoogle(code) with the authorization code'
      };
    } catch (error) {
      console.error('Google Calendar setup failed:', error);
      return {
        success: false,
        message: `Setup failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Complete Google authorization
   */
  async authorizeGoogle(code) {
    try {
      await this.calendar.authorizeGoogle(code);
      console.log('✅ Google Calendar authorized successfully!');
      return {
        success: true,
        message: 'Google Calendar authorized successfully!'
      };
    } catch (error) {
      console.error('Authorization failed:', error);
      return {
        success: false,
        message: `Authorization failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Setup iCal feed
   */
  async setupICalFeed(feedUrl, name) {
    try {
      console.log(`\n📡 Setting up iCal feed: ${name}`);
      console.log(`URL: ${feedUrl}`);
      
      await this.calendar.configureICalFeed(feedUrl, name);
      console.log('✅ iCal feed configured successfully!');
      
      return {
        success: true,
        message: `iCal feed "${name}" configured successfully!`
      };
    } catch (error) {
      console.error(`iCal feed setup failed:`, error);
      return {
        success: false,
        message: `iCal setup failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Test calendar integration
   */
  async testIntegration() {
    console.log('\n🧪 Testing Calendar Integration');
    console.log('================================');

    try {
      const stats = this.calendar.getStats();
      console.log('📊 Calendar Stats:', JSON.stringify(stats, null, 2));

      if (stats.enabledProviders.length === 0) {
        console.log('⚠️  No calendar providers enabled.');
        return {
          success: false,
          message: 'No calendar providers configured'
        };
      }

      console.log('\n📅 Fetching upcoming events...');
      const events = await this.calendar.getUpcomingEvents(7);
      
      if (events.length === 0) {
        console.log('📝 No upcoming events found.');
      } else {
        console.log(`📝 Found ${events.length} upcoming events:`);
        const formatted = this.calendar.formatEventsForDisplay(events);
        console.log(formatted);
      }

      console.log('\n🤖 Getting schedule context for assistant...');
      const context = await this.calendar.getScheduleContext();
      console.log('🧠 Schedule Context:', JSON.stringify(context, null, 2));

      console.log('\n🔔 Checking for events needing nudges...');
      const nudges = await this.calendar.getEventsNeedingNudges();
      if (nudges.length === 0) {
        console.log('🔕 No events need nudges right now.');
      } else {
        console.log(`🔔 ${nudges.length} events need nudges:`);
        nudges.forEach(event => console.log(`   ${event.nudgeMessage}`));
      }

      return {
        success: true,
        message: 'Calendar integration test completed successfully!',
        stats,
        eventCount: events.length,
        context
      };
    } catch (error) {
      console.error('Integration test failed:', error);
      return {
        success: false,
        message: `Integration test failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Show current configuration
   */
  showConfig() {
    const stats = this.calendar.getStats();
    console.log('\n⚙️  Current Calendar Configuration');
    console.log('==================================');
    console.log(`Timezone: ${stats.timezone}`);
    console.log(`Enabled Providers: ${stats.enabledProviders.join(', ') || 'None'}`);
    console.log(`Google Calendar: ${stats.googleConfigured ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`iCal Feeds: ${stats.icalFeeds} configured`);
    console.log(`Nudges: ${stats.nudgesEnabled ? '🔔 Enabled' : '🔕 Disabled'}`);
    
    return stats;
  }

  /**
   * Configure nudge settings
   */
  configureNudges(settings) {
    this.calendar.config.nudgeSettings = {
      ...this.calendar.config.nudgeSettings,
      ...settings
    };
    this.calendar.saveConfig();
    
    console.log('✅ Nudge settings updated!');
    return this.calendar.config.nudgeSettings;
  }

  /**
   * Configure timezone
   */
  configureTimezone(timezone) {
    this.calendar.config.timezone = timezone;
    this.calendar.saveConfig();
    
    console.log(`✅ Timezone set to: ${timezone}`);
    return timezone;
  }

  /**
   * Remove a calendar provider
   */
  removeProvider(provider, name = null) {
    if (provider === 'google') {
      delete this.calendar.config.providers.google;
      this.calendar.config.enabledProviders = this.calendar.config.enabledProviders.filter(p => p !== 'google');
    } else if (provider === 'ical' && name) {
      if (this.calendar.config.providers.ical) {
        delete this.calendar.config.providers.ical[name];
        if (Object.keys(this.calendar.config.providers.ical).length === 0) {
          this.calendar.config.enabledProviders = this.calendar.config.enabledProviders.filter(p => p !== 'ical');
        }
      }
    }
    
    this.calendar.saveConfig();
    console.log(`✅ Removed ${provider}${name ? ` feed "${name}"` : ''}`);
    
    return this.calendar.config;
  }

  /**
   * Reset all calendar configuration
   */
  resetConfig() {
    this.calendar.config = {
      providers: {},
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      enabledProviders: [],
      nudgeSettings: {
        enabled: true,
        beforeMinutes: [30, 15, 5],
        quietHours: { start: '22:00', end: '07:00' }
      }
    };
    this.calendar.saveConfig();
    
    console.log('✅ Calendar configuration reset to defaults');
    return this.calendar.config;
  }

  /**
   * Quick setup with common iCal providers
   */
  async quickSetupCommon() {
    console.log('\n🚀 Quick Setup - Common Calendar Providers');
    console.log('===========================================');
    console.log('Here are some common iCal feed examples:');
    console.log('');
    console.log('📧 Gmail: https://calendar.google.com/calendar/ical/[email]/private-[key]/basic.ics');
    console.log('🏢 Outlook: https://outlook.live.com/owa/calendar/[id]/calendar.ics');
    console.log('🍎 iCloud: https://[server].icloud.com/published/2/[key]');
    console.log('📱 CalDAV: Most calendar apps can export iCal URLs');
    console.log('');
    console.log('💡 For Google Calendar, you can also use the full Google Calendar API setup');
    console.log('   which provides more features like write access and better integration.');

    return {
      success: true,
      message: 'Quick setup guide displayed. Use setupICalFeed() or setupGoogleCalendar()'
    };
  }
}

/**
 * Create a setup instance
 */
export function createSetup() {
  return new CalendarSetup();
}

/**
 * Run interactive setup CLI
 */
export async function runInteractiveSetup() {
  const setup = new CalendarSetup();
  
  console.log('\n🗓️  StaticRebel Calendar Integration Setup');
  console.log('=========================================');
  
  // Show current config
  setup.showConfig();
  
  console.log('\nSetup Options:');
  console.log('1. setup.setupGoogleCalendar() - Full Google Calendar API');
  console.log('2. setup.setupICalFeed(url, name) - Add iCal feed');
  console.log('3. setup.quickSetupCommon() - Common provider examples');
  console.log('4. setup.testIntegration() - Test current setup');
  console.log('5. setup.configureNudges(settings) - Configure reminders');
  
  return setup;
}

export default CalendarSetup;