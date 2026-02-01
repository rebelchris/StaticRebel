import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { TrackerStore } from '../../tracker.js';

/**
 * Notion Integration for StaticRebel
 * Provides two-way sync between StaticRebel trackers and Notion databases
 */

const CONFIG_DIR = path.join(os.homedir(), '.static-rebel', 'integrations');
const NOTION_CONFIG_FILE = path.join(CONFIG_DIR, 'notion-config.json');
const SYNC_STATE_FILE = path.join(CONFIG_DIR, 'notion-sync-state.json');

// Notion API Base URL
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

class NotionIntegration {
  constructor() {
    this.config = null;
    this.syncState = null;
    this.trackerStore = new TrackerStore();
  }

  /**
   * Initialize the Notion integration
   */
  async initialize() {
    await this.ensureConfigDir();
    await this.loadConfig();
    await this.loadSyncState();
  }

  /**
   * Ensure the configuration directory exists
   */
  async ensureConfigDir() {
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    }
  }

  /**
   * Load Notion configuration
   */
  async loadConfig() {
    try {
      const configData = await fs.readFile(NOTION_CONFIG_FILE, 'utf-8');
      this.config = JSON.parse(configData);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to load Notion config: ${error.message}`);
      }
      this.config = null;
    }
  }

  /**
   * Save Notion configuration
   */
  async saveConfig(config) {
    this.config = {
      ...this.config,
      ...config,
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(NOTION_CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  /**
   * Load sync state
   */
  async loadSyncState() {
    try {
      const stateData = await fs.readFile(SYNC_STATE_FILE, 'utf-8');
      this.syncState = JSON.parse(stateData);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to load sync state: ${error.message}`);
      }
      this.syncState = {
        lastSync: null,
        trackerMappings: {},
        syncHistory: []
      };
    }
  }

  /**
   * Save sync state
   */
  async saveSyncState() {
    await fs.writeFile(SYNC_STATE_FILE, JSON.stringify(this.syncState, null, 2));
  }

  /**
   * Check if Notion is configured
   */
  isConfigured() {
    return this.config && (this.config.authToken || this.config.oauthToken);
  }

  /**
   * Setup Notion integration with API key authentication
   */
  async setupWithApiKey(apiKey, options = {}) {
    const config = {
      authType: 'api_key',
      authToken: apiKey,
      setupAt: new Date().toISOString(),
      ...options
    };

    // Validate the API key by making a test request
    const isValid = await this.validateConnection(config);
    if (!isValid) {
      throw new Error('Invalid Notion API key or insufficient permissions');
    }

    await this.saveConfig(config);
    return { success: true, message: 'Notion API key configured successfully' };
  }

  /**
   * Setup Notion integration with OAuth (placeholder for future implementation)
   */
  async setupWithOAuth() {
    throw new Error('OAuth authentication not yet implemented. Please use API key authentication.');
  }

  /**
   * Validate Notion connection
   */
  async validateConnection(config = null) {
    const authConfig = config || this.config;
    if (!authConfig || !authConfig.authToken) {
      return false;
    }

    try {
      const response = await this.makeNotionRequest('GET', '/users/me', null, authConfig);
      return response && response.id;
    } catch (error) {
      console.error('Notion connection validation failed:', error.message);
      return false;
    }
  }

  /**
   * Make a request to the Notion API
   */
  async makeNotionRequest(method, endpoint, data = null, config = null) {
    const authConfig = config || this.config;
    if (!authConfig || !authConfig.authToken) {
      throw new Error('Notion not configured. Run "sr notion setup" first.');
    }

    const url = `${NOTION_API_BASE}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${authConfig.authToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    };

    const options = {
      method,
      headers
    };

    if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Notion API error (${response.status}): ${errorData.message || response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to Notion API');
      }
      throw error;
    }
  }

  /**
   * Search for databases in Notion workspace
   */
  async searchDatabases(query = '') {
    try {
      const response = await this.makeNotionRequest('POST', '/search', {
        query,
        filter: {
          value: 'database',
          property: 'object'
        },
        sort: {
          direction: 'descending',
          timestamp: 'last_edited_time'
        }
      });

      return response.results.map(db => ({
        id: db.id,
        title: this.extractTitle(db.title),
        url: db.url,
        lastEditedTime: db.last_edited_time,
        properties: Object.keys(db.properties)
      }));
    } catch (error) {
      throw new Error(`Failed to search databases: ${error.message}`);
    }
  }

  /**
   * Get database schema
   */
  async getDatabaseSchema(databaseId) {
    try {
      const response = await this.makeNotionRequest('GET', `/databases/${databaseId}`);
      
      return {
        id: response.id,
        title: this.extractTitle(response.title),
        properties: Object.entries(response.properties).map(([name, prop]) => ({
          name,
          type: prop.type,
          id: prop.id,
          options: prop[prop.type]?.options || null
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get database schema: ${error.message}`);
    }
  }

  /**
   * Map a StaticRebel tracker to a Notion database
   */
  async mapTrackerToDatabase(trackerId, databaseId, propertyMapping = {}) {
    const tracker = await this.trackerStore.getTracker(trackerId);
    if (!tracker) {
      throw new Error(`Tracker '${trackerId}' not found`);
    }

    const database = await this.getDatabaseSchema(databaseId);
    
    // Validate property mappings
    const dbPropertyNames = database.properties.map(p => p.name);
    const invalidMappings = Object.values(propertyMapping).filter(
      propName => propName && !dbPropertyNames.includes(propName)
    );

    if (invalidMappings.length > 0) {
      throw new Error(`Invalid property mappings: ${invalidMappings.join(', ')}`);
    }

    // Update sync state with mapping
    this.syncState.trackerMappings[trackerId] = {
      databaseId,
      databaseTitle: database.title,
      propertyMapping,
      createdAt: new Date().toISOString()
    };

    await this.saveSyncState();

    return {
      success: true,
      message: `Mapped tracker '${tracker.name}' to Notion database '${database.title}'`
    };
  }

  /**
   * Sync tracker data to Notion
   */
  async syncTrackerToNotion(trackerId, options = {}) {
    const mapping = this.syncState.trackerMappings[trackerId];
    if (!mapping) {
      throw new Error(`No Notion mapping found for tracker '${trackerId}'`);
    }

    const tracker = await this.trackerStore.getTracker(trackerId);
    const trackerRecords = await this.trackerStore.getRecords(trackerId);

    if (!trackerRecords || trackerRecords.records.length === 0) {
      return { success: true, message: 'No records to sync', synced: 0 };
    }

    let syncedCount = 0;
    const errors = [];

    // Filter records based on lastSync if incremental
    let recordsToSync = trackerRecords.records;
    if (options.incremental && this.syncState.lastSync) {
      const lastSyncTime = new Date(this.syncState.lastSync);
      recordsToSync = trackerRecords.records.filter(
        record => new Date(record.timestamp) > lastSyncTime
      );
    }

    for (const record of recordsToSync) {
      try {
        await this.createNotionPage(mapping.databaseId, record, tracker, mapping.propertyMapping);
        syncedCount++;
      } catch (error) {
        errors.push(`Record ${record.id || 'unknown'}: ${error.message}`);
      }
    }

    // Update sync state
    this.syncState.lastSync = new Date().toISOString();
    this.syncState.syncHistory.push({
      timestamp: this.syncState.lastSync,
      trackerId,
      syncedCount,
      errors: errors.length
    });

    // Keep only last 50 sync history entries
    if (this.syncState.syncHistory.length > 50) {
      this.syncState.syncHistory = this.syncState.syncHistory.slice(-50);
    }

    await this.saveSyncState();

    return {
      success: true,
      message: `Synced ${syncedCount} records to Notion`,
      synced: syncedCount,
      errors: errors.length > 0 ? errors : null
    };
  }

  /**
   * Create a new page in Notion database
   */
  async createNotionPage(databaseId, record, tracker, propertyMapping) {
    const properties = this.buildNotionProperties(record, tracker, propertyMapping);

    const pageData = {
      parent: {
        database_id: databaseId
      },
      properties
    };

    return await this.makeNotionRequest('POST', '/pages', pageData);
  }

  /**
   * Build Notion properties from StaticRebel record
   */
  buildNotionProperties(record, tracker, propertyMapping) {
    const properties = {};

    // Default mappings
    const defaultMappings = {
      title: propertyMapping.title || 'Entry',
      date: propertyMapping.date || 'Date',
      value: propertyMapping.value || 'Value',
      notes: propertyMapping.notes || 'Notes',
      tracker: propertyMapping.tracker || 'Tracker'
    };

    // Title (required for most databases)
    if (defaultMappings.title) {
      properties[defaultMappings.title] = {
        title: [{
          text: {
            content: this.generateEntryTitle(record, tracker)
          }
        }]
      };
    }

    // Date
    if (defaultMappings.date && record.timestamp) {
      properties[defaultMappings.date] = {
        date: {
          start: new Date(record.timestamp).toISOString().split('T')[0]
        }
      };
    }

    // Value(s) - handle different data types
    if (defaultMappings.value && record.data) {
      const value = this.extractRecordValue(record.data);
      if (value !== null) {
        properties[defaultMappings.value] = {
          number: typeof value === 'number' ? value : parseFloat(value) || 0
        };
      }
    }

    // Notes
    if (defaultMappings.notes && record.notes) {
      properties[defaultMappings.notes] = {
        rich_text: [{
          text: {
            content: record.notes
          }
        }]
      };
    }

    // Tracker name
    if (defaultMappings.tracker) {
      properties[defaultMappings.tracker] = {
        select: {
          name: tracker.displayName || tracker.name
        }
      };
    }

    // Custom field mappings from record data
    if (record.data && typeof record.data === 'object') {
      Object.entries(record.data).forEach(([key, value]) => {
        const mappedProperty = propertyMapping[key];
        if (mappedProperty && !Object.values(defaultMappings).includes(mappedProperty)) {
          if (typeof value === 'number') {
            properties[mappedProperty] = { number: value };
          } else if (typeof value === 'string') {
            properties[mappedProperty] = {
              rich_text: [{ text: { content: value } }]
            };
          } else if (typeof value === 'boolean') {
            properties[mappedProperty] = { checkbox: value };
          }
        }
      });
    }

    return properties;
  }

  /**
   * Generate a descriptive title for the entry
   */
  generateEntryTitle(record, tracker) {
    const date = new Date(record.timestamp).toLocaleDateString();
    const value = this.extractRecordValue(record.data);
    const trackerName = tracker.displayName || tracker.name;

    if (value !== null) {
      const unit = tracker.unit || '';
      return `${trackerName} - ${value}${unit} (${date})`;
    }

    return `${trackerName} Entry - ${date}`;
  }

  /**
   * Extract the primary value from record data
   */
  extractRecordValue(data) {
    if (!data) return null;
    
    if (typeof data === 'number') return data;
    if (typeof data === 'string' && !isNaN(data)) return parseFloat(data);
    if (typeof data === 'object') {
      // Look for common value fields
      const valueFields = ['value', 'amount', 'quantity', 'duration', 'count', 'volume'];
      for (const field of valueFields) {
        if (data[field] !== undefined) {
          return typeof data[field] === 'number' ? data[field] : parseFloat(data[field]) || 0;
        }
      }
      
      // Return the first numeric value found
      const firstNumeric = Object.values(data).find(val => 
        typeof val === 'number' || (typeof val === 'string' && !isNaN(val))
      );
      return firstNumeric ? (typeof firstNumeric === 'number' ? firstNumeric : parseFloat(firstNumeric)) : null;
    }
    
    return null;
  }

  /**
   * Create daily summary page in Notion
   */
  async createDailySummary(date = new Date(), options = {}) {
    const { databaseId, templateProperties = {} } = options;
    
    if (!databaseId) {
      throw new Error('Daily summary database ID required');
    }

    const dateStr = date.toISOString().split('T')[0];
    const trackers = await this.trackerStore.listTrackers();
    
    // Collect data for all trackers for this date
    const dailyData = {};
    for (const tracker of trackers) {
      const records = await this.trackerStore.getRecords(tracker.id);
      const dayRecords = records.records.filter(record => 
        record.timestamp.startsWith(dateStr)
      );
      
      if (dayRecords.length > 0) {
        dailyData[tracker.name] = {
          count: dayRecords.length,
          total: dayRecords.reduce((sum, record) => {
            const value = this.extractRecordValue(record.data);
            return sum + (value || 0);
          }, 0),
          records: dayRecords
        };
      }
    }

    const properties = {
      ...templateProperties,
      'Date': {
        date: { start: dateStr }
      },
      'Title': {
        title: [{
          text: { content: `Daily Summary - ${date.toLocaleDateString()}` }
        }]
      },
      'Summary': {
        rich_text: [{
          text: {
            content: this.generateDailySummaryText(dailyData)
          }
        }]
      }
    };

    const pageData = {
      parent: { database_id: databaseId },
      properties
    };

    return await this.makeNotionRequest('POST', '/pages', pageData);
  }

  /**
   * Generate text summary of daily data
   */
  generateDailySummaryText(dailyData) {
    if (Object.keys(dailyData).length === 0) {
      return 'No tracking data recorded for this day.';
    }

    const summaries = Object.entries(dailyData).map(([trackerName, data]) => {
      return `${trackerName}: ${data.count} entries, total: ${data.total}`;
    });

    return summaries.join('\n');
  }

  /**
   * Create weekly/monthly roll-up pages
   */
  async createRollupPage(period = 'weekly', date = new Date(), options = {}) {
    const { databaseId, templateProperties = {} } = options;
    
    if (!databaseId) {
      throw new Error('Rollup database ID required');
    }

    const { startDate, endDate, title } = this.calculatePeriodDates(period, date);
    const trackers = await this.trackerStore.listTrackers();
    
    // Collect data for the period
    const rollupData = {};
    for (const tracker of trackers) {
      const records = await this.trackerStore.getRecords(tracker.id);
      const periodRecords = records.records.filter(record => {
        const recordDate = new Date(record.timestamp);
        return recordDate >= startDate && recordDate <= endDate;
      });
      
      if (periodRecords.length > 0) {
        rollupData[tracker.name] = this.calculateRollupStats(periodRecords);
      }
    }

    const properties = {
      ...templateProperties,
      'Period': {
        rich_text: [{
          text: { content: period }
        }]
      },
      'Start Date': {
        date: { start: startDate.toISOString().split('T')[0] }
      },
      'End Date': {
        date: { start: endDate.toISOString().split('T')[0] }
      },
      'Title': {
        title: [{
          text: { content: title }
        }]
      },
      'Summary': {
        rich_text: [{
          text: {
            content: this.generateRollupSummaryText(rollupData)
          }
        }]
      }
    };

    const pageData = {
      parent: { database_id: databaseId },
      properties
    };

    return await this.makeNotionRequest('POST', '/pages', pageData);
  }

  /**
   * Calculate period start/end dates
   */
  calculatePeriodDates(period, date) {
    const baseDate = new Date(date);
    let startDate, endDate, title;

    if (period === 'weekly') {
      // Start of week (Monday)
      const dayOfWeek = baseDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startDate = new Date(baseDate);
      startDate.setDate(baseDate.getDate() - daysToMonday);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      
      title = `Weekly Summary - ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
    } else if (period === 'monthly') {
      startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
      
      title = `Monthly Summary - ${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    } else {
      throw new Error(`Unsupported period: ${period}`);
    }

    return { startDate, endDate, title };
  }

  /**
   * Calculate rollup statistics
   */
  calculateRollupStats(records) {
    const values = records.map(record => this.extractRecordValue(record.data)).filter(v => v !== null);
    
    if (values.length === 0) {
      return { count: records.length, total: 0, average: 0, min: 0, max: 0 };
    }

    const total = values.reduce((sum, val) => sum + val, 0);
    return {
      count: records.length,
      total,
      average: total / values.length,
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  /**
   * Generate rollup summary text
   */
  generateRollupSummaryText(rollupData) {
    if (Object.keys(rollupData).length === 0) {
      return 'No tracking data for this period.';
    }

    const summaries = Object.entries(rollupData).map(([trackerName, stats]) => {
      return `${trackerName}: ${stats.count} entries, avg: ${stats.average.toFixed(2)}, total: ${stats.total}`;
    });

    return summaries.join('\n');
  }

  /**
   * Extract title from Notion rich text
   */
  extractTitle(titleArray) {
    if (!titleArray || titleArray.length === 0) return 'Untitled';
    return titleArray[0]?.text?.content || 'Untitled';
  }

  /**
   * Get sync status and statistics
   */
  getSyncStatus() {
    return {
      configured: this.isConfigured(),
      lastSync: this.syncState?.lastSync || null,
      mappedTrackers: Object.keys(this.syncState?.trackerMappings || {}),
      syncHistory: this.syncState?.syncHistory?.slice(-10) || []
    };
  }

  /**
   * Reset Notion configuration
   */
  async reset() {
    try {
      await fs.unlink(NOTION_CONFIG_FILE);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      await fs.unlink(SYNC_STATE_FILE);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    this.config = null;
    this.syncState = {
      lastSync: null,
      trackerMappings: {},
      syncHistory: []
    };

    return { success: true, message: 'Notion configuration reset' };
  }
}

export default NotionIntegration;