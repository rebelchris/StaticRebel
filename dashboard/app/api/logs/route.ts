import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

async function loadLogManager() {
  try {
    const logPath = path.join(process.cwd(), '..', 'lib', 'logManager.js');
    return await import(logPath);
  } catch (error) {
    console.error('Failed to load logManager:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const lm = await loadLogManager();

    const searchParams = request.nextUrl.searchParams;
    const options = {
      type: searchParams.get('type') || undefined,
      level: searchParams.get('level') || undefined,
      since: searchParams.get('since') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100,
      search: searchParams.get('search') || undefined,
      days: searchParams.get('days') ? parseInt(searchParams.get('days')!, 10) : 1,
    };

    if (lm?.getLogs) {
      const logs = lm.getLogs(options);
      const stats = lm.getLogStats?.() || {};
      return NextResponse.json({ logs, count: logs.length, stats });
    }

    // Fallback: return empty logs
    return NextResponse.json({ logs: [], count: 0, stats: {} });
  } catch (error) {
    console.error('Logs fetch error:', error);
    return NextResponse.json({ logs: [], count: 0, stats: {} });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const lm = await loadLogManager();

    if (!lm?.clearLogs) {
      return NextResponse.json({ error: 'Log manager not available' }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const options: any = {};
    if (searchParams.get('olderThanDays')) {
      options.olderThanDays = parseInt(searchParams.get('olderThanDays')!, 10);
    }

    const result = lm.clearLogs(options);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Deleted ${result.deleted} log file(s)`,
        deleted: result.deleted,
      });
    }

    return NextResponse.json({ error: result.error }, { status: 500 });
  } catch (error) {
    console.error('Logs delete error:', error);
    return NextResponse.json({ error: 'Failed to delete logs' }, { status: 500 });
  }
}
