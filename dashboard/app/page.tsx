import Link from 'next/link';
import {
  MessageSquare,
  Brain,
  Activity,
  TrendingUp,
  Clock,
} from 'lucide-react';

async function getStats() {
  try {
    // In server component, we need absolute URL
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/status`, {
      cache: 'no-store',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error);
  }
  return null;
}

export default async function Dashboard() {
  const stats = await getStats();

  const statCards = [
    {
      name: 'Memory Entries',
      value: stats?.memory?.vector?.total || 0,
      icon: Brain,
      color: 'bg-purple-500',
      href: '/memory',
    },
    {
      name: 'Active Trackers',
      value: stats?.trackers?.stats?.total || 0,
      icon: Activity,
      color: 'bg-green-500',
      href: '/trackers',
    },
    {
      name: 'System Uptime',
      value: stats?.uptime ? `${Math.floor(stats.uptime / 60)}m` : '0m',
      icon: Clock,
      color: 'bg-orange-500',
      href: '/settings',
    },
    {
      name: 'Active Persona',
      value: stats?.personas?.active?.name || 'Default',
      icon: TrendingUp,
      color: 'bg-blue-500',
      href: '/settings',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your StaticRebel activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {statCards.map((card) => (
          <Link
            key={card.name}
            href={card.href}
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 ${card.color} rounded-md p-3`}>
                  <card.icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {card.name}
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {card.value}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Start Chat
            </Link>
            <Link
              href="/memory"
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Brain className="h-4 w-4 mr-2" />
              View Memory
            </Link>
            <Link
              href="/trackers"
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Activity className="h-4 w-4 mr-2" />
              Trackers
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Clock className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            System Status
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Platform</span>
              <span className="text-sm font-medium">{stats?.system?.platform || 'Unknown'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Memory</span>
              <span className="text-sm font-medium">{stats?.system?.freeMemory || 'N/A'} free</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">CPUs</span>
              <span className="text-sm font-medium">{stats?.system?.cpus || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
