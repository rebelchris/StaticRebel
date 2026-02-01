import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';

// Configure VAPID details
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@staticrebel.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export async function POST(request: NextRequest) {
  try {
    const { subscription, payload, options = {} } = await request.json();
    
    if (!subscription) {
      return NextResponse.json(
        { error: 'Subscription is required' },
        { status: 400 }
      );
    }
    
    const pushPayload = JSON.stringify({
      title: payload.title || 'StaticRebel Notification',
      body: payload.body || 'You have a new notification',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: payload.data || {},
      ...payload
    });
    
    const result = await webpush.sendNotification(
      subscription,
      pushPayload,
      {
        TTL: options.ttl || 3600, // 1 hour
        urgency: options.urgency || 'normal',
        topic: options.topic,
        ...options
      }
    );
    
    return NextResponse.json({ 
      success: true, 
      result,
      message: 'Push notification sent successfully' 
    });
    
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    
    // Handle specific web-push errors
    if (error.statusCode === 410) {
      return NextResponse.json(
        { error: 'Subscription has expired', expired: true },
        { status: 410 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to send push notification', details: error.message },
      { status: 500 }
    );
  }
}