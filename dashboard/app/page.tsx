'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Brain,
  Activity,
  TrendingUp,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { UserProfile } from '@/components/UserProfile';
import { PWAFeatures } from '@/components/PWAFeatures';

interface Conversation {
  id: string;
  preview: string;
  timestamp: string;
  type: string;
}

interface DashboardStats {
  totalInteractions: number;
  todayInteractions: number;
  memoryEntries: number;
  activeTrackers: number;
  recentConversations: Conversation[];
  personas?: {
    active?: {
      name?: string;
    } | null;
  };
  memory?: {
    vector?: {
      total?: number;
    };
  };
  trackers?: {
    stats?: {
      total?: number;
    };
  };
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/dashboard/stats', {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    fetchStats();
  };

  const statCards = [
    {
      name: 'Total Interactions',
      value: stats?.totalInteractions || 0,
      icon: MessageSquare,
      color: 'bg-blue-500',
      href: '/chat',
    },
    {
      name: "Today's Activity",
      value: stats?.todayInteractions || 0,
      icon: TrendingUp,
      color: 'bg-orange-500',
      href: '/chat',
    },
    {
      name: 'Memory Entries',
      value: stats?.memory?.vector?.total || stats?.memoryEntries || 0,
      icon: Brain,
      color: 'bg-purple-500',
      href: '/memory',
    },
    {
      name: 'Active Trackers',
      value: stats?.trackers?.stats?.total || stats?.activeTrackers || 0,
      icon: Activity,
      color: 'bg-green-500',
      href: '/trackers',
    },
  ];

  if (loading) {
    return (
      <div className='mx-auto max-w-7xl'>
        <div className='flex items-center justify-center h-64'>
          <div className='w-8 h-8 border-b-2 rounded-full animate-spin border-primary-600'></div>
        </div>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-7xl'>
      {/* Header with UserProfile */}
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-2xl font-bold text-gray-900'>Dashboard</h1>
          <p className='mt-1 text-sm text-gray-500'>
            Overview of your StaticRebel activity
          </p>
        </div>
        <UserProfile />
      </div>

      {/* Stats Grid */}
      <div className='grid grid-cols-1 gap-5 mb-8 sm:grid-cols-2 lg:grid-cols-4'>
        {statCards.map((card) => (
          <Link
            key={card.name}
            href={card.href}
            className='overflow-hidden transition-shadow bg-white rounded-lg shadow hover:shadow-md'
          >
            <div className='p-5'>
              <div className='flex items-center'>
                <div className={`flex-shrink-0 ${card.color} rounded-md p-3`}>
                  <card.icon className='w-6 h-6 text-white' />
                </div>
                <div className='flex-1 w-0 ml-5'>
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

      {/* Main Content Grid */}
      <div className='grid grid-cols-1 gap-5 lg:grid-cols-2'>
        {/* Recent Conversations */}
        <div className='bg-white rounded-lg shadow'>
          <div className='px-4 py-5 sm:p-6'>
            <h3 className='text-lg font-medium leading-6 text-gray-900'>
              Recent Conversations
            </h3>
            <div className='mt-4 space-y-3'>
              {stats?.recentConversations?.length ? (
                stats.recentConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className='flex items-center justify-between p-3 rounded-md bg-gray-50'
                  >
                    <div className='flex items-center'>
                      <MessageSquare className='w-5 h-5 mr-3 text-gray-400' />
                      <p className='max-w-xs text-sm text-gray-700 truncate'>
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
                href='/chat'
                className='text-sm font-medium text-primary-600 hover:text-primary-500'
              >
                Start a conversation →
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className='p-6 bg-white rounded-lg shadow'>
          <h3 className='mb-4 text-lg font-medium text-gray-900'>
            Quick Actions
          </h3>
          <div className='grid grid-cols-2 gap-3'>
            <Link
              href='/chat'
              className='inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md bg-primary-600 hover:bg-primary-700'
            >
              <MessageSquare className='w-4 h-4 mr-2' />
              Start Chat
            </Link>
            <Link
              href='/memory'
              className='inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50'
            >
              <Brain className='w-4 h-4 mr-2' />
              View Memory
            </Link>
            <Link
              href='/trackers'
              className='inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50'
            >
              <Activity className='w-4 h-4 mr-2' />
              Trackers
            </Link>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className='inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* PWA Features */}
      <div className='mt-8'>
        <PWAFeatures />
      </div>
    </div>
  );
}
