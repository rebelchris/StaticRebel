'use client';

import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Upload, CheckCircle } from 'lucide-react';

interface QueuedSkillLog {
  id: string;
  skillId: string;
  data: any;
  timestamp: string;
}

export default function OfflineManager() {
  const [isOnline, setIsOnline] = useState(true);
  const [queuedLogs, setQueuedLogs] = useState<QueuedSkillLog[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Set initial online status
    setIsOnline(navigator.onLine);

    // Load queued logs from localStorage
    loadQueuedLogs();

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      syncQueuedLogs();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadQueuedLogs = () => {
    try {
      const stored = localStorage.getItem('offline-skill-logs');
      if (stored) {
        setQueuedLogs(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading queued logs:', error);
    }
  };

  const saveQueuedLogs = (logs: QueuedSkillLog[]) => {
    try {
      localStorage.setItem('offline-skill-logs', JSON.stringify(logs));
      setQueuedLogs(logs);
    } catch (error) {
      console.error('Error saving queued logs:', error);
    }
  };

  const addToQueue = (skillId: string, data: any) => {
    const newLog: QueuedSkillLog = {
      id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      skillId,
      data,
      timestamp: new Date().toISOString(),
    };

    const updatedLogs = [...queuedLogs, newLog];
    saveQueuedLogs(updatedLogs);
    return newLog.id;
  };

  const syncQueuedLogs = async () => {
    if (queuedLogs.length === 0 || isSyncing) return;

    setIsSyncing(true);
    const successfullysynced: string[] = [];

    for (const log of queuedLogs) {
      try {
        const response = await fetch('/api/skills/log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            skillId: log.skillId,
            ...log.data,
            // Add offline flag to indicate this was queued
            offline: true,
            originalTimestamp: log.timestamp,
          }),
        });

        if (response.ok) {
          successfullysynced.push(log.id);
        }
      } catch (error) {
        console.error(`Failed to sync log ${log.id}:`, error);
        // Stop syncing on network error
        break;
      }
    }

    // Remove successfully synced logs
    if (successfullysynced.length > 0) {
      const remainingLogs = queuedLogs.filter(log => !successfullysynced.includes(log.id));
      saveQueuedLogs(remainingLogs);
    }

    setIsSyncing(false);
  };

  const clearQueue = () => {
    saveQueuedLogs([]);
  };

  // Expose functions globally for use by other components
  useEffect(() => {
    (window as any).offlineManager = {
      addToQueue,
      isOnline,
    };
  }, [queuedLogs, isOnline]);

  if (isOnline && queuedLogs.length === 0) {
    return (
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <Wifi size={16} />
        <span className="text-sm">Online</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 ${
        isOnline ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      }`}>
        {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
        <span className="text-sm">{isOnline ? 'Online' : 'Offline'}</span>
      </div>

      {queuedLogs.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-md p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {queuedLogs.length} logs queued
              </span>
            </div>
            {isOnline && (
              <button
                onClick={syncQueuedLogs}
                disabled={isSyncing}
                className="flex items-center gap-1 px-2 py-1 bg-yellow-200 dark:bg-yellow-700 hover:bg-yellow-300 dark:hover:bg-yellow-600 rounded text-xs"
              >
                {isSyncing ? (
                  <>Syncing...</>
                ) : (
                  <>
                    <CheckCircle size={12} />
                    Sync Now
                  </>
                )}
              </button>
            )}
          </div>
          
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            {isOnline 
              ? 'Logs will sync automatically when online.'
              : 'Your skill logs are saved locally and will sync when you\'re back online.'
            }
          </p>

          {queuedLogs.length > 10 && (
            <button
              onClick={clearQueue}
              className="mt-2 text-xs text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200"
            >
              Clear queue ({queuedLogs.length} items)
            </button>
          )}
        </div>
      )}
    </div>
  );
}