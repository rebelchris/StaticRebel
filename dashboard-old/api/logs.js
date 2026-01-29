// Logs API - Log viewing and management endpoints
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Lazy load log manager
let logManager = null;

async function loadLogManager() {
  if (logManager) return logManager;
  try {
    const logPath = path.join(__dirname, '..', '..', 'lib', 'logManager.js');
    logManager = await import(logPath);
    return logManager;
  } catch (error) {
    console.error('Error loading logManager:', error.message);
    return null;
  }
}

/**
 * GET /api/logs
 * Get logs with filtering
 * Query params: type, level, since, limit, search, days
 */
router.get('/', async (req, res) => {
  try {
    const lm = await loadLogManager();
    if (!lm) {
      return res.status(500).json({ error: 'Log manager not available' });
    }

    const options = {
      type: req.query.type,
      level: req.query.level,
      since: req.query.since,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 100,
      search: req.query.search,
      days: req.query.days ? parseInt(req.query.days, 10) : 1,
    };

    const logs = lm.getLogs(options);
    const stats = lm.getLogStats();

    res.json({
      logs,
      count: logs.length,
      stats,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs/telegram
 * Get Telegram-specific logs
 * Query params: type (telegram-in, telegram-out, telegram-error), limit, since, search, days
 */
router.get('/telegram', async (req, res) => {
  try {
    const lm = await loadLogManager();
    if (!lm) {
      return res.status(500).json({ error: 'Log manager not available' });
    }

    const options = {
      type: req.query.type, // Can filter to specific telegram type
      level: req.query.level,
      since: req.query.since,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 100,
      search: req.query.search,
      days: req.query.days ? parseInt(req.query.days, 10) : 1,
    };

    const logs = lm.getTelegramLogs(options);

    res.json({
      logs,
      count: logs.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/logs/stats
 * Get log statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const lm = await loadLogManager();
    if (!lm) {
      return res.status(500).json({ error: 'Log manager not available' });
    }

    const stats = lm.getLogStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/logs
 * Clear logs
 * Query params: olderThanDays (optional - if not provided, clears all)
 */
router.delete('/', async (req, res) => {
  try {
    const lm = await loadLogManager();
    if (!lm) {
      return res.status(500).json({ error: 'Log manager not available' });
    }

    const options = {};
    if (req.query.olderThanDays) {
      options.olderThanDays = parseInt(req.query.olderThanDays, 10);
    }

    const result = lm.clearLogs(options);

    if (result.success) {
      res.json({
        success: true,
        message: `Deleted ${result.deleted} log file(s)`,
        deleted: result.deleted,
        errors: result.errors,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/logs/cleanup
 * Trigger manual cleanup of old logs
 * Body: { retentionDays: number }
 */
router.post('/cleanup', async (req, res) => {
  try {
    const lm = await loadLogManager();
    if (!lm) {
      return res.status(500).json({ error: 'Log manager not available' });
    }

    const retentionDays = req.body.retentionDays || 7;
    const result = lm.cleanupOldLogs(retentionDays);

    if (result.success) {
      res.json({
        success: true,
        message: `Cleaned up logs older than ${retentionDays} days`,
        deleted: result.deleted,
        errors: result.errors,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
