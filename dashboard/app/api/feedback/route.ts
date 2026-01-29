import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

async function loadModule(moduleName: string) {
  try {
    const modulePath = path.join(process.cwd(), '..', 'lib', `${moduleName}.js`);
    return await import(modulePath);
  } catch (error) {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messageId, feedback } = await request.json();

    if (!messageId || !feedback) {
      return NextResponse.json(
        { error: 'Message ID and feedback are required' },
        { status: 400 }
      );
    }

    // Try to use feedback manager
    const feedbackManager = await loadModule('feedbackManager');

    if (feedbackManager?.logFeedback) {
      await feedbackManager.logFeedback({
        messageId,
        feedback: feedback === 'up' ? 'positive' : 'negative',
        timestamp: new Date().toISOString(),
        source: 'dashboard',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const feedbackManager = await loadModule('feedbackManager');

    if (feedbackManager?.getFeedbackStats) {
      const stats = feedbackManager.getFeedbackStats();
      return NextResponse.json(stats);
    }

    return NextResponse.json({ positive: 0, negative: 0, total: 0 });
  } catch (error) {
    console.error('Feedback fetch error:', error);
    return NextResponse.json({ positive: 0, negative: 0, total: 0 });
  }
}
