import { NextRequest } from 'next/server';
import os from 'os';
import path from 'path';

async function loadModule(moduleName: string) {
  try {
    const modulePath = path.join(process.cwd(), '..', 'lib', `${moduleName}.js`);
    return await import(modulePath);
  } catch (error) {
    return null;
  }
}

async function getStatus() {
  const personaManager = await loadModule('personaManager');
  const vectorMemory = await loadModule('vectorMemory');
  const workerManager = await loadModule('workerManager');

  return {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    persona: personaManager?.getActivePersona?.()?.name || 'Default',
    memoryCount: vectorMemory?.getMemoryStats?.()?.total || 0,
    workerStats: workerManager?.getWorkerStats?.() || { total: 0 },
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
