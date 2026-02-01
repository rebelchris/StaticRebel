#!/usr/bin/env node

/**
 * StaticRebel REST API Server
 * 
 * Provides REST API endpoints for external apps, shortcuts, and widgets
 * to interact with StaticRebel's skills tracking system.
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { TrackerStore, QueryEngine, parseRecordFromText } from '../../tracker.js';
import { loadConfig } from '../configManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StaticRebelAPIServer {
  constructor(options = {}) {
    this.app = express();
    this.port = options.port || process.env.SR_API_PORT || 3000;
    this.config = null;
    this.trackerStore = null;
    this.queryEngine = null;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // CORS configuration
    const corsOptions = {
      origin: process.env.SR_API_CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      credentials: true
    };
    
    this.app.use(cors(corsOptions));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // API Key authentication middleware
    this.app.use('/api/', this.authenticateAPIKey.bind(this));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  authenticateAPIKey(req, res, next) {
    // Skip authentication for docs and health
    if (req.path === '/api/docs' || req.path.startsWith('/api/docs/') || req.path === '/health') {
      return next();
    }

    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        message: 'Please provide an API key in X-API-Key header or Authorization header'
      });
    }

    // Get configured API key from environment or config
    const validApiKey = process.env.SR_API_KEY || this.generateDefaultApiKey();
    
    if (apiKey !== validApiKey) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }

    next();
  }

  generateDefaultApiKey() {
    // Generate a consistent default API key based on machine info
    const machineId = process.env.HOSTNAME || os.hostname();
    return crypto.createHash('sha256').update(`staticrebel-${machineId}`).digest('hex').substring(0, 32);
  }

  async initializeTracker() {
    try {
      this.config = await loadConfig();
      this.trackerStore = new TrackerStore();
      this.queryEngine = new QueryEngine(this.trackerStore);
      
      // Ensure tracker directory exists
      await this.trackerStore.ensureDir();
      
      console.log('StaticRebel tracker initialized');
    } catch (error) {
      console.error('Failed to initialize tracker:', error);
      throw error;
    }
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // API documentation
    this.app.get('/api/docs', (req, res) => {
      res.json(this.getOpenAPISpec());
    });

    // Skills endpoints
    this.app.get('/api/skills', this.getSkills.bind(this));
    this.app.get('/api/skills/:id/entries', this.getSkillEntries.bind(this));
    this.app.post('/api/skills/:id/log', this.logSkillEntry.bind(this));

    // Statistics endpoints  
    this.app.get('/api/stats', this.getStats.bind(this));
    this.app.get('/api/streaks', this.getStreaks.bind(this));

    // Reminders endpoint
    this.app.post('/api/reminders', this.createReminder.bind(this));

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'StaticRebel API',
        version: '1.0.0',
        docs: '/api/docs',
        endpoints: [
          'GET /api/skills',
          'GET /api/skills/:id/entries',  
          'POST /api/skills/:id/log',
          'GET /api/stats',
          'GET /api/streaks',
          'POST /api/reminders'
        ]
      });
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} not found`
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('API Error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });
  }

  // API Endpoints Implementation

  async getSkills(req, res) {
    try {
      if (!this.trackerStore) {
        return res.status(503).json({ error: 'Tracker not initialized' });
      }

      const trackers = await this.trackerStore.listTrackers();
      const skills = [];

      for (const tracker of trackers) {
        const entries = await this.trackerStore.getEntries(tracker.id);
        skills.push({
          id: tracker.id,
          name: tracker.name || tracker.displayName,
          description: tracker.description || '',
          unit: tracker.unit || '',
          type: tracker.type || 'increment',
          category: tracker.category || 'general',
          created: tracker.createdAt ? new Date(tracker.createdAt).getTime() : Date.now(),
          totalEntries: entries.length,
          lastEntry: entries.length > 0 ? 
            new Date(entries[entries.length - 1].timestamp).getTime() : null
        });
      }

      res.json({
        skills,
        count: skills.length
      });
    } catch (error) {
      console.error('Error fetching skills:', error);
      res.status(500).json({ error: 'Failed to fetch skills' });
    }
  }

  async getSkillEntries(req, res) {
    try {
      const { id } = req.params;
      const { limit = 100, offset = 0, from, to } = req.query;

      if (!this.trackerStore) {
        return res.status(503).json({ error: 'Tracker not initialized' });
      }

      const tracker = await this.trackerStore.getTracker(id);
      if (!tracker) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      const records = await this.trackerStore.getEntries(id);
      
      let entries = records.map(record => ({
        id: record.id,
        value: record.value,
        notes: record.notes || '',
        timestamp: new Date(record.timestamp).getTime(),
        date: new Date(record.timestamp).toISOString().split('T')[0]
      }));

      // Filter by date range if provided
      if (from) {
        const fromDate = new Date(from).getTime();
        entries = entries.filter(entry => entry.timestamp >= fromDate);
      }
      if (to) {
        const toDate = new Date(to).getTime();
        entries = entries.filter(entry => entry.timestamp <= toDate);
      }

      // Sort by timestamp (newest first)
      entries.sort((a, b) => b.timestamp - a.timestamp);

      // Apply pagination
      const paginatedEntries = entries.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

      res.json({
        skill: {
          id: tracker.id,
          name: tracker.name || tracker.displayName,
          unit: tracker.unit || ''
        },
        entries: paginatedEntries,
        pagination: {
          total: entries.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < entries.length
        }
      });
    } catch (error) {
      console.error('Error fetching skill entries:', error);
      res.status(500).json({ error: 'Failed to fetch entries' });
    }
  }

  async logSkillEntry(req, res) {
    try {
      const { id } = req.params;
      const { value = 1, notes = '', timestamp } = req.body;

      if (!this.trackerStore) {
        return res.status(503).json({ error: 'Tracker not initialized' });
      }

      const tracker = await this.trackerStore.getTracker(id);
      if (!tracker) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      // Create the entry
      const entry = {
        value: parseFloat(value) || 1,
        notes: String(notes || ''),
        timestamp: timestamp || new Date().toISOString()
      };

      // Add to tracker using TrackerStore method
      const savedEntry = await this.trackerStore.addRecord(id, entry);

      res.status(201).json({
        success: true,
        entry: {
          id: savedEntry.id,
          value: savedEntry.value,
          notes: savedEntry.notes,
          timestamp: new Date(savedEntry.timestamp).getTime(),
          date: new Date(savedEntry.timestamp).toISOString().split('T')[0]
        }
      });
    } catch (error) {
      console.error('Error logging entry:', error);
      res.status(500).json({ error: 'Failed to log entry' });
    }
  }

  async getStats(req, res) {
    try {
      if (!this.trackerStore || !this.queryEngine) {
        return res.status(503).json({ error: 'Tracker not initialized' });
      }

      const trackers = await this.trackerStore.listTrackers();
      const now = Date.now();
      const today = new Date(now).toDateString();
      const thisWeek = now - (7 * 24 * 60 * 60 * 1000);
      const thisMonth = now - (30 * 24 * 60 * 60 * 1000);

      const stats = {
        totalSkills: trackers.length,
        totalEntries: 0,
        entriesToday: 0,
        entriesThisWeek: 0,
        entriesThisMonth: 0,
        activeSkills: 0,
        skillStats: []
      };

      for (const tracker of trackers) {
        const entries = await this.trackerStore.getEntries(tracker.id);
        
        const todayEntries = entries.filter(r => 
          new Date(r.timestamp).toDateString() === today
        );
        const weekEntries = entries.filter(r => 
          new Date(r.timestamp).getTime() >= thisWeek
        );
        const monthEntries = entries.filter(r => 
          new Date(r.timestamp).getTime() >= thisMonth
        );

        stats.totalEntries += entries.length;
        stats.entriesToday += todayEntries.length;
        stats.entriesThisWeek += weekEntries.length;
        stats.entriesThisMonth += monthEntries.length;

        if (entries.length > 0) {
          stats.activeSkills++;
        }

        stats.skillStats.push({
          id: tracker.id,
          name: tracker.name || tracker.displayName,
          totalEntries: entries.length,
          entriesToday: todayEntries.length,
          entriesThisWeek: weekEntries.length,
          entriesThisMonth: monthEntries.length,
          lastEntry: entries.length > 0 ? 
            new Date(entries[entries.length - 1].timestamp).getTime() : null
        });
      }

      res.json(stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }

  async getStreaks(req, res) {
    try {
      if (!this.trackerStore) {
        return res.status(503).json({ error: 'Tracker not initialized' });
      }

      const trackers = await this.trackerStore.listTrackers();
      const streaks = [];

      for (const tracker of trackers) {
        const entries = await this.trackerStore.getEntries(tracker.id);
        if (entries.length === 0) continue;

        const streak = this.calculateStreak({ ...tracker, records: entries });
        if (streak.current > 0 || streak.longest > 0) {
          streaks.push({
            id: tracker.id,
            name: tracker.name || tracker.displayName,
            currentStreak: streak.current,
            longestStreak: streak.longest,
            lastEntry: streak.lastEntry
          });
        }
      }

      res.json({
        streaks,
        count: streaks.length
      });
    } catch (error) {
      console.error('Error fetching streaks:', error);
      res.status(500).json({ error: 'Failed to fetch streaks' });
    }
  }

  calculateStreak(tracker) {
    const records = tracker.records.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    if (records.length === 0) {
      return { current: 0, longest: 0, lastEntry: null };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    // Group records by day
    const dayGroups = {};
    for (const record of records) {
      const recordDate = new Date(record.timestamp);
      recordDate.setHours(0, 0, 0, 0);
      const dayKey = recordDate.getTime();
      
      if (!dayGroups[dayKey]) {
        dayGroups[dayKey] = [];
      }
      dayGroups[dayKey].push(record);
    }

    const sortedDays = Object.keys(dayGroups)
      .map(key => parseInt(key))
      .sort((a, b) => b - a);

    // Calculate current streak
    let currentStreak = 0;
    let checkDate = todayTime;

    for (let i = 0; i < sortedDays.length; i++) {
      const dayTime = sortedDays[i];
      
      if (dayTime === checkDate) {
        currentStreak++;
        checkDate -= 24 * 60 * 60 * 1000; // Go back one day
      } else if (dayTime === checkDate + 24 * 60 * 60 * 1000) {
        // Yesterday's entry (still counts if we haven't logged today)
        currentStreak++;
        checkDate -= 24 * 60 * 60 * 1000;
      } else {
        break;
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    let expectedDate = null;

    for (const dayTime of sortedDays.reverse()) {
      if (expectedDate === null || dayTime === expectedDate) {
        tempStreak++;
        expectedDate = dayTime + 24 * 60 * 60 * 1000;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
        expectedDate = dayTime + 24 * 60 * 60 * 1000;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return {
      current: currentStreak,
      longest: longestStreak,
      lastEntry: new Date(records[0].timestamp).getTime()
    };
  }

  async createReminder(req, res) {
    try {
      const { skillId, message, scheduleType, scheduleValue, enabled = true } = req.body;

      if (!message || !scheduleType) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'message and scheduleType are required'
        });
      }

      // Validate skill exists if skillId provided
      if (skillId && this.trackerStore) {
        const skill = this.trackerStore.getTracker(skillId);
        if (!skill) {
          return res.status(404).json({ error: 'Skill not found' });
        }
      }

      const reminder = {
        id: crypto.randomUUID(),
        skillId: skillId || null,
        message,
        scheduleType, // 'daily', 'weekly', 'monthly', 'custom'
        scheduleValue, // time for daily, day+time for weekly, etc.
        enabled,
        created: Date.now(),
        lastTriggered: null
      };

      // TODO: Integrate with StaticRebel's cron scheduler
      // For now, just return the reminder object
      // In a full implementation, this would schedule the reminder

      res.status(201).json({
        success: true,
        reminder,
        note: 'Reminder created but scheduling integration pending'
      });
    } catch (error) {
      console.error('Error creating reminder:', error);
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  }

  getOpenAPISpec() {
    return {
      openapi: '3.0.0',
      info: {
        title: 'StaticRebel API',
        version: '1.0.0',
        description: 'REST API for StaticRebel skills tracking system',
        contact: {
          name: 'StaticRebel API Support'
        }
      },
      servers: [
        {
          url: `http://localhost:${this.port}`,
          description: 'Local development server'
        }
      ],
      security: [
        {
          ApiKeyAuth: []
        }
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key'
          }
        },
        schemas: {
          Skill: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              unit: { type: 'string' },
              type: { type: 'string' },
              category: { type: 'string' },
              created: { type: 'number' },
              totalEntries: { type: 'number' },
              lastEntry: { type: 'number', nullable: true }
            }
          },
          Entry: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              value: { type: 'number' },
              notes: { type: 'string' },
              timestamp: { type: 'number' },
              date: { type: 'string' }
            }
          },
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' }
            }
          }
        }
      },
      paths: {
        '/api/skills': {
          get: {
            summary: 'List all skills',
            responses: {
              200: {
                description: 'List of skills',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        skills: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Skill' }
                        },
                        count: { type: 'number' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/skills/{id}/entries': {
          get: {
            summary: 'Get entries for a skill',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              },
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'number', default: 100 }
              },
              {
                name: 'offset',
                in: 'query',
                schema: { type: 'number', default: 0 }
              },
              {
                name: 'from',
                in: 'query',
                schema: { type: 'string', format: 'date' }
              },
              {
                name: 'to',
                in: 'query',
                schema: { type: 'string', format: 'date' }
              }
            ],
            responses: {
              200: {
                description: 'Skill entries',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        skill: { $ref: '#/components/schemas/Skill' },
                        entries: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Entry' }
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            total: { type: 'number' },
                            limit: { type: 'number' },
                            offset: { type: 'number' },
                            hasMore: { type: 'boolean' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/skills/{id}/log': {
          post: {
            summary: 'Log an entry for a skill',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' }
              }
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      value: { type: 'number', default: 1 },
                      notes: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            },
            responses: {
              201: {
                description: 'Entry logged successfully',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        entry: { $ref: '#/components/schemas/Entry' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '/api/stats': {
          get: {
            summary: 'Get usage statistics',
            responses: {
              200: {
                description: 'Usage statistics'
              }
            }
          }
        },
        '/api/streaks': {
          get: {
            summary: 'Get current streaks',
            responses: {
              200: {
                description: 'Current streaks'
              }
            }
          }
        },
        '/api/reminders': {
          post: {
            summary: 'Create a reminder',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['message', 'scheduleType'],
                    properties: {
                      skillId: { type: 'string' },
                      message: { type: 'string' },
                      scheduleType: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'custom'] },
                      scheduleValue: { type: 'string' },
                      enabled: { type: 'boolean', default: true }
                    }
                  }
                }
              }
            },
            responses: {
              201: {
                description: 'Reminder created successfully'
              }
            }
          }
        }
      }
    };
  }

  async start() {
    try {
      await this.initializeTracker();
      
      return new Promise((resolve, reject) => {
        const server = this.app.listen(this.port, () => {
          console.log(`🚀 StaticRebel API Server started on port ${this.port}`);
          console.log(`📚 API Documentation: http://localhost:${this.port}/api/docs`);
          console.log(`🔐 API Key: ${process.env.SR_API_KEY || this.generateDefaultApiKey()}`);
          resolve(server);
        });

        server.on('error', reject);
      });
    } catch (error) {
      console.error('Failed to start API server:', error);
      throw error;
    }
  }
}

export { StaticRebelAPIServer };

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new StaticRebelAPIServer();
  
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down StaticRebel API Server...');
    process.exit(0);
  });
  
  server.start().catch(console.error);
}