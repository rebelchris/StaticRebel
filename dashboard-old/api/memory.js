// Memory API - Vector memory endpoints
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

let vectorMemory, memoryManager;

async function loadModules() {
  if (vectorMemory && memoryManager) return;
  try {
    const vectorPath = path.join(__dirname, '..', '..', 'lib', 'vectorMemory.js');
    const memoryPath = path.join(__dirname, '..', '..', 'lib', 'memoryManager.js');

    const vectorModule = await import(vectorPath);
    vectorMemory = vectorModule;

    const memoryModule = await import(memoryPath);
    memoryManager = memoryModule;
  } catch (error) {
    console.error('Error loading memory modules:', error.message);
  }
}

// Get memory statistics
router.get('/stats', async (req, res) => {
  try {
    await loadModules();

    const stats = {
      vector: { totalMemories: 0, byType: {} },
      daily: { recent: [] },
      totalSize: 0
    };

    try {
      if (vectorMemory?.getMemoryStats) {
        stats.vector = vectorMemory.getMemoryStats();
      }
    } catch (e) {}

    try {
      if (memoryManager?.getRecentDailyMemories) {
        stats.daily.recent = memoryManager.getRecentDailyMemories(7);
      }
    } catch (e) {}

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search memories
router.get('/search', async (req, res) => {
  try {
    await loadModules();

    const { q, limit = 10, minScore = 0.3, type } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!vectorMemory?.searchMemories) {
      return res.json({ results: [] });
    }

    const results = await vectorMemory.searchMemories(q, {
      limit: parseInt(limit),
      minScore: parseFloat(minScore),
      type: type || null
    });

    res.json({ results, query: q });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all memories (paginated)
router.get('/', async (req, res) => {
  try {
    await loadModules();

    const { type, limit = 100, offset = 0 } = req.query;

    if (!vectorMemory?.getMemoriesByType) {
      return res.json({ memories: [], total: 0 });
    }

    let memories;
    if (type) {
      memories = vectorMemory.getMemoriesByType(type);
    } else if (vectorMemory?.exportMemories) {
      memories = vectorMemory.exportMemories();
    } else {
      memories = [];
    }

    const total = memories.length;
    const paginated = memories.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      memories: paginated,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new memory
router.post('/', async (req, res) => {
  try {
    await loadModules();

    const { content, type = 'general', metadata = {} } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    if (!vectorMemory?.addMemory) {
      return res.status(500).json({ error: 'Memory system not available' });
    }

    const result = await vectorMemory.addMemory(content, { type, ...metadata });

    req.app.locals.broadcast?.('memoryAdded', result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a memory
router.delete('/:id', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!vectorMemory?.deleteMemory) {
      return res.status(500).json({ error: 'Memory system not available' });
    }

    const result = vectorMemory.deleteMemory(id);

    if (result) {
      req.app.locals.broadcast?.('memoryDeleted', { id });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Memory not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all memories
router.delete('/', async (req, res) => {
  try {
    await loadModules();

    if (!vectorMemory?.clearAllMemories) {
      return res.status(500).json({ error: 'Memory system not available' });
    }

    const result = vectorMemory.clearAllMemories();

    req.app.locals.broadcast?.('memoriesCleared', result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export memories
router.get('/export/json', async (req, res) => {
  try {
    await loadModules();

    if (!vectorMemory?.exportMemories) {
      return res.json([]);
    }

    const memories = vectorMemory.exportMemories();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="memories.json"');
    res.json(memories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get daily memories
router.get('/daily', async (req, res) => {
  try {
    await loadModules();

    const { days = 7 } = req.query;

    if (!memoryManager?.getRecentDailyMemories) {
      return res.json({ entries: [] });
    }

    const entries = memoryManager.getRecentDailyMemories(parseInt(days));

    res.json({ entries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
