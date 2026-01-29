import { NextResponse } from 'next/server';
import os from 'os';
import path from 'path';

// Helper to safely import lib modules
async function loadModule(moduleName: string) {
  try {
    const modulePath = path.join(process.cwd(), '..', 'lib', `${moduleName}.js`);
    return await import(modulePath);
  } catch (error) {
    return null;
  }
}

export async function GET() {
  try {
    // Try to load modules
    const [personaManager, vectorMemory, workerManager, configManager] = await Promise.all([
      loadModule('personaManager'),
      loadModule('vectorMemory'),
      loadModule('workerManager'),
      loadModule('configManager'),
    ]);

    const status = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      personas: {
        active: null as any,
        available: [] as any[],
        stats: { total: 0 },
      },
      memory: {
        vector: { total: 0, byType: {} },
      },
      workers: {
        stats: { total: 0, pending: 0, running: 0, completed: 0, failed: 0 },
      },
      trackers: {
        stats: { total: 0, byType: {} },
        list: [] as any[],
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
        freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)) + ' GB',
      },
    };

    // Get persona info
    if (personaManager?.getActivePersona) {
      status.personas.active = personaManager.getActivePersona();
    }
    if (personaManager?.getAvailablePersonas) {
      const personas = personaManager.getAvailablePersonas();
      status.personas.available = Object.values(personas);
      status.personas.stats.total = Object.keys(personas).length;
    }

    // Get memory stats
    if (vectorMemory?.getMemoryStats) {
      status.memory.vector = vectorMemory.getMemoryStats();
    }

    // Get worker stats
    if (workerManager?.getWorkerStats) {
      status.workers.stats = workerManager.getWorkerStats();
    }

    // Try to get tracker stats
    try {
      const trackerPath = path.join(process.cwd(), '..', 'tracker.js');
      const trackerModule = await import(trackerPath);
      if (trackerModule?.TrackerStore) {
        const store = new trackerModule.TrackerStore();
        const trackers = store.listTrackers();
        status.trackers.list = trackers;
        status.trackers.stats.total = trackers.length;
      }
    } catch (e) {
      // Tracker not available
    }

    return NextResponse.json(status);
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        system: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
          freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)) + ' GB',
        },
      },
      { status: 200 }
    );
  }
}
