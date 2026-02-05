import { NextResponse } from 'next/server';
import os from 'os';
import { getActivePersona, getAvailablePersonas } from '@/lib/personaManager.js';
import { getMemoryStats } from '@/lib/vectorMemory.js';
import { getWorkerStats } from '@/lib/workerManager.js';
import { TrackerStore } from '@/tracker.js';

export async function GET() {
  try {
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
    try {
      status.personas.active = getActivePersona();
      const personas = getAvailablePersonas();
      status.personas.available = Object.values(personas);
      status.personas.stats.total = Object.keys(personas).length;
    } catch (e) {
      // Persona manager not available
    }

    // Get memory stats
    try {
      const memStats = getMemoryStats();
      status.memory.vector = {
        total: memStats.totalMemories || 0,
        byType: memStats.byType || {},
      };
    } catch (e) {
      // Memory stats not available
    }

    // Get worker stats
    try {
      const workerStats = getWorkerStats();
      status.workers.stats = {
        total: workerStats.totalTasks || 0,
        pending: workerStats.pending || 0,
        running: workerStats.running || 0,
        completed: workerStats.completed || 0,
        failed: workerStats.failed || 0,
      };
    } catch (e) {
      // Worker stats not available
    }

    // Try to get tracker stats
    try {
      const store = new TrackerStore();
      const trackers = await store.listTrackers();
      status.trackers.list = trackers;
      status.trackers.stats.total = trackers.length;
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
