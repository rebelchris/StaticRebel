import { NextRequest } from 'next/server';
import os from 'os';
import { getActivePersona } from '@/lib/personaManager.js';
import { getMemoryStats } from '@/lib/vectorMemory.js';
import { getWorkerStats } from '@/lib/workerManager.js';

async function getStatus() {
  let personaName = 'Default';
  let memoryCount = 0;
  let workerStats: any = { total: 0 };

  try {
    const persona = getActivePersona();
    personaName = persona?.name || 'Default';
  } catch (e) {
    // Persona not available
  }

  try {
    const memStats = getMemoryStats();
    memoryCount = memStats?.totalMemories || 0;
  } catch (e) {
    // Memory stats not available
  }

  try {
    const ws = getWorkerStats();
    workerStats = {
      total: ws?.totalTasks || 0,
      pending: ws?.pending || 0,
      running: ws?.running || 0,
      completed: ws?.completed || 0,
      failed: ws?.failed || 0,
    };
  } catch (e) {
    // Worker stats not available
  }

  return {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    persona: personaName,
    memoryCount,
    workerStats,
    system: {
      freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)) + ' GB',
      loadAvg: os.loadavg()[0].toFixed(2),
    },
  };
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial status
      const initialStatus = await getStatus();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialStatus)}\n\n`)
      );

      // Send updates every 5 seconds
      const interval = setInterval(async () => {
        try {
          const status = await getStatus();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(status)}\n\n`)
          );
        } catch (error) {
          console.error('Stream error:', error);
        }
      }, 5000);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
