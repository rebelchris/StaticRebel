'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, AlertCircle } from 'lucide-react';

export default function NotificationManager() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check current notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const sub = await registration.pushManager.getSubscription();
          setSubscription(sub);
        }
      } catch (err) {
        console.error('Error checking subscription:', err);
      }
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToNotifications = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Get service worker registration
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push messaging is not supported');
      }

      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        throw new Error('Service worker not registered');
      }

      // Get VAPID public key from server
      const response = await fetch('/api/notifications/send');
      const { publicKey } = await response.json();

      if (!publicKey) {
        throw new Error('VAPID public key not available');
      }

      // Subscribe to push notifications
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // Send subscription to server
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sub),
      });

      setSubscription(sub);
    } catch (err) {
      console.error('Error subscribing to notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to subscribe to notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribeFromNotifications = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (subscription) {
        await subscription.unsubscribe();
        
        // Remove subscription from server
        await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        setSubscription(null);
      }
    } catch (err) {
      console.error('Error unsubscribing from notifications:', err);
      setError('Failed to unsubscribe from notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestNotification = async () => {
    if (!subscription) return;

    try {
      await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription,
          payload: {
            title: 'StaticRebel Test',
            body: 'This is a test notification from your StaticRebel dashboard!',
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: 'test-notification',
            requireInteraction: false,
          },
        }),
      });
    } catch (err) {
      console.error('Error sending test notification:', err);
    }
  };

  if (!('Notification' in window)) {
    return (
      <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
        <AlertCircle size={16} />
        <span className="text-sm">Notifications not supported</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Push Notifications</h3>
        <div className="flex items-center gap-2">
          {subscription ? (
            <button
              onClick={unsubscribeFromNotifications}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md text-sm"
            >
              <BellOff size={16} />
              {isLoading ? 'Unsubscribing...' : 'Disable'}
            </button>
          ) : (
            <button
              onClick={subscribeToNotifications}
              disabled={isLoading || permission === 'denied'}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md text-sm"
            >
              <Bell size={16} />
              {isLoading ? 'Subscribing...' : 'Enable'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
        </div>
      )}

      <div className="text-sm text-gray-600 dark:text-gray-400">
        <p className="mb-2">
          Status: <span className="font-medium">{permission}</span>
        </p>
        <p className="mb-2">
          Subscription: <span className="font-medium">{subscription ? 'Active' : 'None'}</span>
        </p>
        {subscription && (
          <button
            onClick={sendTestNotification}
            className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-xs"
          >
            Send Test Notification
          </button>
        )}
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-500">
        <p>Enable notifications to receive:</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>Skill completion nudges</li>
          <li>Daily check-in reminders</li>
          <li>Goal achievement alerts</li>
          <li>System status updates</li>
        </ul>
      </div>
    </div>
  );
}