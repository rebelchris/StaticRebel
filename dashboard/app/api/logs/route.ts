import { NextRequest, NextResponse } from 'next/server';
import { getLogs, getLogStats, clearLogs } from '@/lib/logManager.js';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const options = {
      type: searchParams.get('type') || undefined,
      level: searchParams.get('level') || undefined,
      since: searchParams.get('since') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100,
      search: searchParams.get('search') || undefined,
      days: searchParams.get('days') ? parseInt(searchParams.get('days')!, 10) : 1,
    };

    const logs = getLogs(options as any);
    const stats = getLogStats?.() || {};
    return NextResponse.json({ logs, count: logs.length, stats });
  } catch (error) {
    console.error('Logs fetch error:', error);
    return NextResponse.json({ logs: [], count: 0, stats: {} });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const options: any = {};
    if (searchParams.get('olderThanDays')) {
      options.olderThanDays = parseInt(searchParams.get('olderThanDays')!, 10);
    }

    const result = clearLogs(options) as any;

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
