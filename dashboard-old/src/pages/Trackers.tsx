import { useEffect, useState } from 'react';
import { Activity, Plus, TrendingUp, Calendar } from 'lucide-react';

interface Tracker {
  id: string;
  name: string;
  type: string;
  count: number;
  lastEntry: string | null;
}

export default function Trackers() {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchTrackers();
  }, []);

  const fetchTrackers = async () => {
    try {
      const response = await fetch('/api/trackers');
      if (response.ok) {
        const data = await response.json();
        setTrackers(data);
      }
    } catch (error) {
      console.error('Failed to fetch trackers:', error);
    }
  };

  return (
    <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
      <div className='mb-8 flex justify-between items-center'>
        <div>
          <h2 className='text-2xl font-bold text-gray-900'>Trackers</h2>
          <p className='mt-1 text-sm text-gray-500'>
            Monitor your habits, nutrition, workouts, and more
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700'
        >
          <Plus className='h-4 w-4 mr-2' />
          New Tracker
        </button>
      </div>

      {/* Trackers Grid */}
      <div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'>
        {trackers.map((tracker) => (
          <div
            key={tracker.id}
            className='bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow'
          >
            <div className='p-5'>
              <div className='flex items-center'>
                <div className='flex-shrink-0 bg-green-500 rounded-md p-3'>
                  <Activity className='h-6 w-6 text-white' />
                </div>
                <div className='ml-5 w-0 flex-1'>
                  <dl>
                    <dt className='text-sm font-medium text-gray-500 truncate'>
                      {tracker.displayName || tracker.name}
                    </dt>
                    <dd className='flex items-baseline'>
                      <div className='text-2xl font-semibold text-gray-900'>
                        {tracker.count || 0}
                      </div>
                      <span className='ml-2 text-sm text-gray-500'>
                        entries
                      </span>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            <div className='bg-gray-50 px-5 py-3'>
              <div className='text-sm'>
                <span className='text-gray-500'>Last entry: </span>
                <span className='font-medium text-gray-900'>
                  {tracker.lastEntry
                    ? new Date(tracker.lastEntry).toLocaleDateString()
                    : 'Never'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {trackers.length === 0 && (
        <div className='text-center py-12'>
          <Activity className='mx-auto h-12 w-12 text-gray-400' />
          <h3 className='mt-2 text-sm font-medium text-gray-900'>
            No trackers
          </h3>
          <p className='mt-1 text-sm text-gray-500'>
            Create your first tracker to start monitoring
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className='mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200'
          >
            <Plus className='h-4 w-4 mr-2' />
            Create Tracker
          </button>
        </div>
      )}

      {/* Create Modal Placeholder */}
      {showCreateModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50'>
          <div className='bg-white rounded-lg p-6 max-w-md w-full'>
            <h3 className='text-lg font-medium text-gray-900 mb-4'>
              Create New Tracker
            </h3>
            <p className='text-sm text-gray-500 mb-4'>
              Use the chat to create a tracker by saying something like: "Create
              a tracker for my daily pushups"
            </p>
            <button
              onClick={() => setShowCreateModal(false)}
              className='w-full inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700'
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
