/**
 * API Server - REST API for Static Rebel
 *
 * Endpoints:
 * - GET /status - System status
 * - POST /command - Execute command
 * - GET /context - Current context
 * - GET /queue/stats - Task queue stats
 * - POST /notify - Send notification
 */

import express from 'express';
import cors from 'cors';
import { createOrchestrator } from './orchestrator.js';

const API_VERSION = '1.0.0';
const PORT = process.env.PORT || 3131;

export class APIServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || PORT,
      cors: options.cors !== false,
      orchestrator: options.orchestrator,
    };

    this.app = express();
    this.server = null;
    this.orchestrator = options.orchestrator;
  }

  setupMiddleware() {
    this.app.use(express.json());

    if (this.options.cors) {
      this.app.use(cors());
    }

    this.app.use((req, res, next) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Static Rebel API',
        version: API_VERSION,
        endpoints: [
          'GET /status',
          'POST /command',
          'GET /context',
          'GET /queue/stats',
          'POST /queue/enqueue',
          'GET /queue/jobs',
          'POST /notify',
          'GET /suggestions',
          'GET /habits',
          'POST /habits/track',
          'WS /ws',
        ],
      });
    });

    this.app.get('/status', async (req, res) => {
      try {
        const status = this.orchestrator
          ? this.orchestrator.getFullStatus()
          : { orchestrator: 'not initialized' };
        res.json({ success: true, status, timestamp: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/command', async (req, res) => {
      try {
        const { command, options } = req.body;

        if (!command) {
          return res.status(400).json({ success: false, error: 'Command required' });
        }

        if (!this.orchestrator) {
          return res.status(503).json({ success: false, error: 'Orchestrator not available' });
        }

        const result = await this.orchestrator.processCommand(command, options);
        res.json({ success: result.success, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/context', async (req, res) => {
      try {
        const context = this.orchestrator?.getModule('context');
        const data = context?.getCurrentContext() || { error: 'Context not available' };
        res.json({ success: true, context: data });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/queue/stats', async (req, res) => {
      try {
        const queue = this.orchestrator?.getModule('queue');
        const data = queue?.getStats() || { error: 'Queue not available' };
        res.json({ success: true, stats: data });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/queue/jobs', async (req, res) => {
      try {
        const queue = this.orchestrator?.getModule('queue');
        const { status, limit } = req.query;
        const jobs = queue?.getJobs({ status, limit: parseInt(limit) || 50 }) || [];
        res.json({ success: true, jobs });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/queue/enqueue', async (req, res) => {
      try {
        const queue = this.orchestrator?.getModule('queue');
        const { type, payload, options } = req.body;

        if (!type) {
          return res.status(400).json({ success: false, error: 'Type required' });
        }

        if (!queue) {
          return res.status(503).json({ success: false, error: 'Queue not available' });
        }

        const jobId = await queue.enqueue(type, payload || {}, options || {});
        res.json({ success: true, jobId });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/notify', async (req, res) => {
      try {
        const notifications = this.orchestrator?.getModule('notifications');
        const { title, message, priority } = req.body;

        if (!message) {
          return res.status(400).json({ success: false, error: 'Message required' });
        }

        if (!notifications) {
          return res.status(503).json({ success: false, error: 'Notifications not available' });
        }

        const result = await notifications.send({ title, message, priority });
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/suggestions', async (req, res) => {
      try {
        const suggestions = this.orchestrator?.getModule('suggestions');
        const { limit } = req.query;
        const data = suggestions?.getSuggestions({ limit: parseInt(limit) || 10 }) || [];
        res.json({ success: true, suggestions: data });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/habits', async (req, res) => {
      try {
        const habits = this.orchestrator?.getModule('habits');
        const data = habits?.getHabits({ limit: 20 }) || [];
        res.json({ success: true, habits: data });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/habits/track', async (req, res) => {
      try {
        const habits = this.orchestrator?.getModule('habits');
        const { action, metadata } = req.body;

        if (!action) {
          return res.status(400).json({ success: false, error: 'Action required' });
        }

        habits?.track(action, metadata || {});
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/automation/apps', async (req, res) => {
      try {
        const automation = this.orchestrator?.getModule('automation');
        const apps = await automation?.apps.getRunningApplications();
        res.json({ success: true, apps });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/automation/launch', async (req, res) => {
      try {
        const automation = this.orchestrator?.getModule('automation');
        const { name } = req.body;

        if (!name) {
          return res.status(400).json({ success: false, error: 'App name required' });
        }

        const result = await automation?.apps.launch(name);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/automation/quit', async (req, res) => {
      try {
        const automation = this.orchestrator?.getModule('automation');
        const { name } = req.body;

        if (!name) {
          return res.status(400).json({ success: false, error: 'App name required' });
        }

        const result = await automation?.apps.quit(name);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.use((err, req, res) => {
      console.error('[API Error]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    });
  }

  async start() {
    this.setupMiddleware();
    this.setupRoutes();

    return new Promise((resolve) => {
      this.server = this.app.listen(this.options.port, () => {
        console.log(`[API] Server running on port ${this.options.port}`);
        resolve(this.server);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[API] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export function createAPIServer(options = {}) {
  return new APIServer(options);
}

export default APIServer;
