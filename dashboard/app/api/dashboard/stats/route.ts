import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Helper to safely import lib modules
async function loadModule(moduleName: string) {
  try {
    const modulePath = path.join(
      process.cwd(),
      '..',
      'lib',
      `${moduleName}.js`,
    );
    return await import(modulePath);
  } catch (error) {
    return null;
  }
}

function loadUserProfile() {
  try {
    const profilePath = path.join(
      os.homedir(),
      '.static-rebel',
      'user-profile.json',
    );
    if (fs.existsSync(profilePath)) {
      const data = fs.readFileSync(profilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load user profile:', error);
  }
  return null;
}

function getRecentConversations() {
  try {
    const logDir = path.join(os.homedir(), '.static-rebel', 'logs');
    if (!fs.existsSync(logDir)) {
      return [];
    }

    const conversations: Array<{
      id: string;
      preview: string;
      timestamp: string;
      type: string;
    }> = [];

    // Get today's log file
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const logFile = path.join(logDir, `logs-${yyyy}-${mm}-${dd}.json`);

    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines.slice(-10)) {
        // Get last 10 entries
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'telegram-in' || entry.type === 'telegram-out') {
            conversations.push({
              id: entry.timestamp,
              preview: entry.message?.substring(0, 50) || 'No message',
              timestamp: entry.timestamp,
              type: entry.type,
            });
          }
        } catch (e) {
          // Skip invalid lines
        }
      }
    }

    // Sort by timestamp descending and limit to 5
    return conversations
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 5);
  } catch (error) {
    console.error('Failed to get recent conversations:', error);
    return [];
  }
}

function getTodayInteractionCount() {
  try {
    const logDir = path.join(os.homedir(), '.static-rebel', 'logs');
    if (!fs.existsSync(logDir)) {
      return 0;
    }

    // Get today's log file
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const logFile = path.join(logDir, `logs-${yyyy}-${mm}-${dd}.json`);

    if (!fs.existsSync(logFile)) {
      return 0;
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Count telegram-in messages (user interactions)
    return lines.filter((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.type === 'telegram-in';
      } catch (e) {
        return false;
      }
    }).length;
  } catch (error) {
    console.error('Failed to get today interaction count:', error);
    return 0;
  }
}

export async function GET() {
  try {
    // Try to load modules
    const [personaManager, vectorMemory, workerManager] = await Promise.all([
      loadModule('personaManager'),
      loadModule('vectorMemory'),
      loadModule('workerManager'),
    ]);

    const profile = loadUserProfile();
    const recentConversations = getRecentConversations();
    const todayInteractions = getTodayInteractionCount();

    const stats = {
      timestamp: new Date().toISOString(),
      totalInteractions: profile?.stats?.totalInteractions || 0,
      todayInteractions,
      memoryEntries: 0,
      activeTrackers: 0,
      recentConversations,
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
    };

    // Get persona info
    if (personaManager?.getActivePersona) {
      stats.personas.active = personaManager.getActivePersona();
    }

    // Get memory stats
    if (vectorMemory?.getMemoryStats) {
      stats.memory.vector = vectorMemory.getMemoryStats();
      stats.memoryEntries = stats.memory.vector.total;
    }

    // Get worker stats
    if (workerManager?.getWorkerStats) {
      stats.workers.stats = workerManager.getWorkerStats();
    }

    // Try to get tracker stats
    try {
      const trackerPath = path.join(process.cwd(), '..', 'tracker.js');
      const trackerModule = await import(trackerPath);
      if (trackerModule?.TrackerStore) {
        const store = new trackerModule.TrackerStore();
        const trackers = store.listTrackers();
        stats.trackers.list = trackers;
        stats.trackers.stats.total = trackers.length;
        stats.activeTrackers = trackers.length;
      }
    } catch (e) {
      // Tracker not available
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        totalInteractions: 0,
        todayInteractions: 0,
        memoryEntries: 0,
        activeTrackers: 0,
        recentConversations: [],
      },
      { status: 200 },
    );
  }
}
