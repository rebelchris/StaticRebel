import { useEffect, useState } from 'react';
import {
  MessageSquare,
  Brain,
  Activity,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardStats {
  totalInteractions: number;
  todayInteractions: number;
  memoryEntries: number;
  activeTrackers: number;
  recentConversations: Array<{
    id: string;
    preview: string;
    timestamp: string;
  }>;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const statCards = [
    {
      name: 'Total Interactions',
      value: stats?.totalInteractions || 0,
      icon: MessageSquare,
      color: 'bg-blue-500',
      link: '/chat',
    },
    {
      name: 'Memory Entries',
      value: stats?.memoryEntries || 0,
      icon: Brain,
      color: 'bg-purple-500',
      link: '/memory',
    },
    {
      name: 'Active Trackers',
      value: stats?.activeTrackers || 0,
      icon: Activity,
      color: 'bg-green-500',
      link: '/trackers',
    },
    {
      name: "Today's Activity",
      value: stats?.todayInteractions || 0,
      icon: TrendingUp,
      color: 'bg-orange-500',
      link: '/chat',
    },
  ];

  return (
    <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
      <div className='mb-8'>
        <h2 className='text-2xl font-bold text-gray-900'>Dashboard</h2>
        <p className='mt-1 text-sm text-gray-500'>
          Overview of your StaticRebel activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4'>
        {statCards.map((card) => (
          <Link
            key={card.name}
            to={card.link}
            className='bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow'
          >
            <div className='p-5'>
              <div className='flex items-center'>
                <div className={`flex-shrink-0 ${card.color} rounded-md p-3`}>
                  <card.icon className='h-6 w-6 text-white' />
                </div>
                <div className='ml-5 w-0 flex-1'>
                  <dl>
                    <dt className='text-sm font-medium text-gray-500 truncate'>
                      {card.name}
                    </dt>
                    <dd className='text-2xl font-semibold text-gray-900'>
                      {card.value}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <div className='mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2'>
        <div className='bg-white shadow rounded-lg'>
          <div className='px-4 py-5 sm:p-6'>
            <h3 className='text-lg leading-6 font-medium text-gray-900'>
              Recent Conversations
            </h3>
            <div className='mt-4 space-y-3'>
              {stats?.recentConversations?.length ? (
                stats.recentConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className='flex items-center justify-between p-3 bg-gray-50 rounded-md'
                  >
                    <div className='flex items-center'>
                      <MessageSquare className='h-5 w-5 text-gray-400 mr-3' />
                      <p className='text-sm text-gray-700 truncate max-w-xs'>
                        {conv.preview}
                      </p>
                    </div>
                    <span className='text-xs text-gray-500'>
                      {new Date(conv.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              ) : (
                <p className='text-sm text-gray-500'>No recent conversations</p>
              )}
            </div>
            <div className='mt-4'>
              <Link
                to='/chat'
                className='text-sm font-medium text-primary-600 hover:text-primary-500'
              >
                Start a conversation →
              </Link>
            </div>
          </div>
        </div>

        <div className='bg-white shadow rounded-lg'>
          <div className='px-4 py-5 sm:p-6'>
            <h3 className='text-lg leading-6 font-medium text-gray-900'>
              Quick Actions
            </h3>
            <div className='mt-4 grid grid-cols-2 gap-3'>
              <Link
                to='/chat'
                className='inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700'
              >
                <MessageSquare className='h-4 w-4 mr-2' />
                Chat
              </Link>
              <Link
                to='/memory'
                className='inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50'
              >
                <Brain className='h-4 w-4 mr-2' />
                View Memory
              </Link>
              <Link
                to='/trackers'
                className='inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50'
              >
                <Activity className='h-4 w-4 mr-2' />
                Trackers
              </Link>
              <button
                onClick={() => window.location.reload()}
                className='inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50'
              >
                <Clock className='h-4 w-4 mr-2' />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
