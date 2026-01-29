// Status API - System status aggregation
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Import backend modules (lazy loading)
let personaManager, vectorMemory, workerManager, apiConnector, configManager;
let modelRegistry, memoryManager, subagentManager, skillsManager, trackerModule;

async function loadModules() {
  if (personaManager) return;
  try {
    const personaPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'personaManager.js',
    );
    const vectorPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'vectorMemory.js',
    );
    const workerPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'workerManager.js',
    );
    const apiPath = path.join(__dirname, '..', '..', 'lib', 'apiConnector.js');
    const configPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'configManager.js',
    );
    const modelPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'modelRegistry.js',
    );
    const memoryPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'memoryManager.js',
    );
    const subagentPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'subagentManager.js',
    );
    const skillsPath = path.join(
      __dirname,
      '..',
      '..',
      'lib',
      'skillsManager.js',
    );
    const trackerPath = path.join(__dirname, '..', '..', 'tracker.js');

    const personaModule = await import(personaPath);
    personaManager = personaModule;

    const vectorModule = await import(vectorPath);
    vectorMemory = vectorModule;

    const workerModule = await import(workerPath);
    workerManager = workerModule;

    const apiModule = await import(apiPath);
    apiConnector = apiModule;

    const configModule = await import(configPath);
    configManager = configModule;

    const modelModule = await import(modelPath);
    modelRegistry = modelModule;

    const memoryModule = await import(memoryPath);
    memoryManager = memoryModule;

    const subagentModule = await import(subagentPath);
    subagentManager = subagentModule;

    const skillsModule = await import(skillsPath);
    skillsManager = skillsModule;

    try {
      trackerModule = await import(trackerPath);
    } catch (e) {
      // Tracker module may not be available
    }
  } catch (error) {
    console.error('Error loading modules:', error.message);
  }
}

// Get full system status
router.get('/', async (req, res) => {
  try {
    await loadModules();

    const status = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      personas: {
        active: null,
        available: [],
        stats: { total: 0 },
      },
      memory: {
        vector: { total: 0, byType: {} },
        daily: { recent: [] },
      },
      workers: {
        stats: { total: 0, pending: 0, running: 0, completed: 0, failed: 0 },
        recent: [],
      },
      connectors: {
        stats: { total: 0, active: 0 },
      },
      trackers: {
        stats: { total: 0, byType: {} },
        list: [],
      },
      models: {
        available: [],
        defaults: {},
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
        freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)) + ' GB',
      },
    };

    // Get active persona
    try {
      if (personaManager?.getActivePersona) {
        status.personas.active = personaManager.getActivePersona();
      }
      if (personaManager?.getAvailablePersonas) {
        const personas = personaManager.getAvailablePersonas();
        status.personas.available = Object.values(personas);
        status.personas.stats.total = personas.length;
      }
    } catch (e) {
      console.error('Persona error:', e.message);
    }

    // Get memory stats
    try {
      if (vectorMemory?.getMemoryStats) {
        status.memory.vector = vectorMemory.getMemoryStats();
      }
    } catch (e) {}

    try {
      if (memoryManager?.getRecentDailyMemories) {
        status.memory.daily.recent = memoryManager.getRecentDailyMemories(5);
      }
    } catch (e) {}

    // Get worker stats
    try {
      if (workerManager?.getWorkerStats) {
        status.workers.stats = workerManager.getWorkerStats();
      }
      if (workerManager?.getAllTasks) {
        const tasks = workerManager.getAllTasks();
        status.workers.recent = tasks.slice(0, 10);
      }
    } catch (e) {}

    // Get connector stats
    try {
      if (apiConnector?.getApiStats) {
        status.connectors.stats = apiConnector.getApiStats();
      }
      if (apiConnector?.getAllConnectors) {
        status.connectors.list = apiConnector.getAllConnectors();
      }
    } catch (e) {}

    // Get models
    try {
      if (modelRegistry?.listAvailableModels) {
        status.models.available = modelRegistry.listAvailableModels() || [];
      }
      if (configManager?.getConfig) {
        status.models.defaults = {
          general: configManager.getConfig('models.defaults.general'),
          coding: configManager.getConfig('models.defaults.coding'),
          analysis: configManager.getConfig('models.defaults.analysis'),
        };
      }
    } catch (e) {}

    // Get tracker stats
    try {
      if (trackerModule?.TrackerStore) {
        const store = new trackerModule.TrackerStore();
        const trackers = store.listTrackers();
        status.trackers.list = trackers;
        status.trackers.stats.total = trackers.length;
        status.trackers.stats.byType = trackers.reduce((acc, t) => {
          acc[t.type] = (acc[t.type] || 0) + 1;
          return acc;
        }, {});
      }
    } catch (e) {}

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get simple status overview
router.get('/overview', async (req, res) => {
  try {
    await loadModules();

    const overview = {
      status: 'healthy',
      activePersona: null,
      memoryCount: 0,
      taskCount: 0,
      connectorCount: 0,
      modelsAvailable: 0,
      uptime: process.uptime(),
    };

    try {
      if (personaManager?.getActivePersona) {
        const active = personaManager.getActivePersona();
        overview.activePersona = active?.name || 'Unknown';
      }
    } catch (e) {}

    try {
      if (vectorMemory?.getMemoryStats) {
        overview.memoryCount = vectorMemory.getMemoryStats().totalMemories || 0;
      }
    } catch (e) {}

    try {
      if (workerManager?.getWorkerStats) {
        overview.taskCount = workerManager.getWorkerStats().totalTasks || 0;
      }
    } catch (e) {}

    try {
      if (apiConnector?.getApiStats) {
        overview.connectorCount =
          apiConnector.getApiStats().totalConnectors || 0;
      }
    } catch (e) {}

    try {
      if (modelRegistry?.listAvailableModels) {
        overview.modelsAvailable = (
          modelRegistry.listAvailableModels() || []
        ).length;
      }
    } catch (e) {}

    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
