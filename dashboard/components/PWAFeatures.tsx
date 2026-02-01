'use client';

import React from 'react';
import { usePushNotifications } from '@/lib/usePushNotifications';

export function PWAFeatures() {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    sendTestNotification,
  } = usePushNotifications();

  const [installPrompt, setInstallPrompt] = React.useState<any>(null);
  const [isInstalled, setIsInstalled] = React.useState(false);

  React.useEffect(() => {
    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstallPrompt(null);
        setIsInstalled(true);
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-2xl font-semibold mb-4 text-gray-900">PWA Features</h2>
      
      {/* Installation Status */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2 text-gray-800">Installation</h3>
        {isInstalled ? (
          <div className="flex items-center text-green-600">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
            App is installed
          </div>
        ) : installPrompt ? (
          <button
            onClick={handleInstall}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Install App
          </button>
        ) : (
          <div className="text-gray-500">
            Install prompt not available (try Chrome/Edge on desktop or Android)
          </div>
        )}
      </div>

      {/* Push Notifications */}
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2 text-gray-800">Push Notifications</h3>
        
        {!isSupported ? (
          <div className="text-gray-500">
            Push notifications are not supported in this browser
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center">
              <span className={`w-2 h-2 rounded-full mr-2 ${
                isSubscribed ? 'bg-green-500' : 'bg-gray-400'
              }`}></span>
              <span className="text-gray-700">
                {isSubscribed ? 'Subscribed' : 'Not subscribed'}
              </span>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              {!isSubscribed ? (
                <button
                  onClick={subscribe}
                  disabled={isLoading}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Subscribing...' : 'Enable Notifications'}
                </button>
              ) : (
                <>
                  <button
                    onClick={sendTestNotification}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Send Test Notification
                  </button>
                  <button
                    onClick={unsubscribe}
                    disabled={isLoading}
                    className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? 'Unsubscribing...' : 'Disable Notifications'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* PWA Info */}
      <div>
        <h3 className="text-lg font-medium mb-2 text-gray-800">PWA Status</h3>
        <div className="space-y-1 text-sm text-gray-600">
          <div>Service Worker: {typeof window !== 'undefined' && 'serviceWorker' in navigator ? '✅ Supported' : '❌ Not supported'}</div>
          <div>Offline Support: ✅ Enabled</div>
          <div>Manifest: ✅ Configured</div>
          <div>Icons: ✅ Available</div>
          <div>Theme: ✅ Configured</div>
        </div>
      </div>
    </div>
  );
}