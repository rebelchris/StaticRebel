'use client';

import { useEffect, useState } from 'react';
import { Activity, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Tracker {
  id: string;
  name: string;
  displayName?: string;
  type: string;
  count: number;
  lastEntry: string | null;
}

export default function Trackers() {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrackers();
  }, []);

  const fetchTrackers = async () => {
    try {
      const response = await fetch('/api/trackers');
      if (response.ok) {
        const data = await response.json();
        setTrackers(Array.isArray(data) ? data : data.trackers || []);
      }
    } catch (error) {
      console.error('Failed to fetch trackers:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trackers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor your habits, nutrition, workouts, and more
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Tracker
        </button>
      </div>

      {/* Trackers Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : trackers.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trackers.map((tracker) => (
            <motion.div
              key={tracker.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        {tracker.displayName || tracker.name}
                      </dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">
                          {tracker.count || 0}
                        </div>
                        <span className="ml-2 text-sm text-gray-500">entries</span>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-5 py-3">
                <div className="text-sm">
                  <span className="text-gray-500">Last entry: </span>
                  <span className="font-medium text-gray-900">
                    {tracker.lastEntry
                      ? new Date(tracker.lastEntry).toLocaleDateString()
                      : 'Never'}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Activity className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No trackers</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create your first tracker to start monitoring
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Tracker
          </button>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Create New Tracker
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Use the chat to create a tracker by saying something like:
              </p>
              <div className="bg-gray-50 rounded-md p-3 mb-4">
                <code className="text-sm text-gray-700">
                  "Create a tracker for my daily pushups"
                </code>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-full inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
