// Trackers API - Tracker management and data visualization
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Import tracker module (lazy loading)
let trackerModule;

async function loadTrackerModule() {
  if (trackerModule) return trackerModule;
  try {
    const trackerPath = path.join(__dirname, '..', '..', 'tracker.js');
    trackerModule = await import(trackerPath);
    return trackerModule;
  } catch (error) {
    console.error('Error loading tracker module:', error.message);
    return null;
  }
}

// Get all trackers
router.get('/', async (req, res) => {
  try {
    const module = await loadTrackerModule();
    if (!module?.TrackerStore) {
      return res.json({ trackers: [], stats: { total: 0 } });
    }

    const store = new module.TrackerStore();
    const trackers = store.listTrackers();

    // Enrich tracker data with record counts
    const enrichedTrackers = trackers.map((tracker) => {
      const records = store.getRecords(tracker.name);
      return {
        ...tracker,
        recordCount: records.records?.length || 0,
        lastEntry:
          records.records?.length > 0
            ? records.records[records.records.length - 1].date
            : null,
      };
    });

    res.json({
      trackers: enrichedTrackers,
      stats: {
        total: trackers.length,
        byType: trackers.reduce((acc, t) => {
          acc[t.type] = (acc[t.type] || 0) + 1;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error('Error getting trackers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tracker by name
router.get('/:name', async (req, res) => {
  try {
    const module = await loadTrackerModule();
    if (!module?.TrackerStore) {
      return res.status(500).json({ error: 'Tracker system not available' });
    }

    const { name } = req.params;
    const store = new module.TrackerStore();
    const tracker = store.getTracker(name);

    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }

    const records = store.getRecords(name);

    res.json({
      tracker,
      records: records.records || [],
      recordCount: records.records?.length || 0,
    });
  } catch (error) {
    console.error('Error getting tracker:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tracker stats
router.get('/:name/stats', async (req, res) => {
  try {
    const module = await loadTrackerModule();
    if (!module?.TrackerStore || !module?.QueryEngine) {
      return res.status(500).json({ error: 'Tracker system not available' });
    }

    const { name } = req.params;
    const period = req.query.period || 'week';

    const store = new module.TrackerStore();
    const tracker = store.getTracker(name);

    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }

    const queryEngine = new module.QueryEngine();
    const stats = queryEngine.getStats(name, period);

    res.json(stats);
  } catch (error) {
    console.error('Error getting tracker stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tracker history
router.get('/:name/history', async (req, res) => {
  try {
    const module = await loadTrackerModule();
    if (!module?.TrackerStore) {
      return res.status(500).json({ error: 'Tracker system not available' });
    }

    const { name } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const store = new module.TrackerStore();
    const tracker = store.getTracker(name);

    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }

    const records = store.getRecentRecords(name, limit);

    res.json({
      tracker: tracker.displayName,
      records,
      total: records.length,
    });
  } catch (error) {
    console.error('Error getting tracker history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new tracker
router.post('/', async (req, res) => {
  try {
    const module = await loadTrackerModule();
    if (!module?.TrackerStore) {
      return res.status(500).json({ error: 'Tracker system not available' });
    }

    const { name, displayName, type, metrics, visionPrompt, config } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Tracker name is required' });
    }

    const store = new module.TrackerStore();
    const result = store.createTracker({
      name: name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, ''),
      displayName: displayName || name,
      type: type || 'custom',
      metrics: metrics || [],
      visionPrompt: visionPrompt || '',
      config: config || {},
    });

    if (result.success) {
      req.app.locals.broadcast?.('trackerCreated', { tracker: result.tracker });
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error creating tracker:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete tracker
router.delete('/:name', async (req, res) => {
  try {
    const module = await loadTrackerModule();
    if (!module?.TrackerStore) {
      return res.status(500).json({ error: 'Tracker system not available' });
    }

    const { name } = req.params;
    const store = new module.TrackerStore();
    const result = store.deleteTracker(name);

    if (result.success) {
      req.app.locals.broadcast?.('trackerDeleted', { name });
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error deleting tracker:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add record to tracker
router.post('/:name/records', async (req, res) => {
  try {
    const module = await loadTrackerModule();
    if (!module?.TrackerStore) {
      return res.status(500).json({ error: 'Tracker system not available' });
    }

    const { name } = req.params;
    const { data, source } = req.body;

    const store = new module.TrackerStore();
    const tracker = store.getTracker(name);

    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }

    const result = store.addRecord(name, {
      data: data || {},
      source: source || 'dashboard',
    });

    if (result.success) {
      req.app.locals.broadcast?.('trackerRecordAdded', {
        tracker: name,
        record: result.record,
      });
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error adding record:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tracker types
router.get('/types/list', async (req, res) => {
  try {
    const module = await loadTrackerModule();
    if (!module?.TRACKER_TYPES) {
      return res.json({ types: [] });
    }

    res.json({ types: module.TRACKER_TYPES });
  } catch (error) {
    console.error('Error getting tracker types:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
