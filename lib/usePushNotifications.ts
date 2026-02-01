'use client';

import { useState, useEffect } from 'react';

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface UsePushNotificationsReturn {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  sendTestNotification: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if push notifications are supported
    if (typeof window !== 'undefined') {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      setIsSupported(supported);
      
      if (supported) {
        checkSubscriptionStatus();
      }
    }
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      }
    } catch (err) {
      console.error('Error checking subscription status:', err);
    }
  };

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribe = async () => {
    if (!isSupported) {
      throw new Error('Push notifications are not supported');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
        ),
      });

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      setIsSubscribed(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to subscribe';
      setError(errorMessage);
      console.error('Error subscribing to push notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!isSupported) {
      throw new Error('Push notifications are not supported');
    }

    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push notifications
        await subscription.unsubscribe();

        // Remove subscription from server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(subscription),
        });
      }

      setIsSubscribed(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to unsubscribe';
      setError(errorMessage);
      console.error('Error unsubscribing from push notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestNotification = async () => {
    if (!isSubscribed) {
      throw new Error('Not subscribed to push notifications');
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      const response = await fetch('/api/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription,
          payload: {
            title: 'Test Notification',
            body: 'This is a test notification from StaticRebel Dashboard!',
            data: {
              url: '/',
              timestamp: new Date().toISOString(),
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send test notification');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send test notification';
      setError(errorMessage);
      console.error('Error sending test notification:', err);
    }
  };

  return {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}