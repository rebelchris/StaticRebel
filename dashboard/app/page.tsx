'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Sparkles, Settings, Zap, ArrowRight } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<{ conversations: number; skills: number; connected: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(res => {
        if (res.ok) {
          return res.json().then(data => setStats({
            conversations: data?.totalInteractions || 0,
            skills: data?.activeSkills || 0,
            connected: true
          }));
        }
        throw new Error('Not ok');
      })
      .catch(() => setStats({ conversations: 0, skills: 0, connected: false }))
      .finally(() => setLoading(false));
  }, []);

  const quickActions = [
    { name: 'New Chat', href: '/chat', icon: MessageSquare },
    { name: 'Skills', href: '/skills', icon: Sparkles },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const examples = [
    { input: 'I drank 2 glasses of water', action: 'Track hydration' },
    { input: "What's trending on Twitter?", action: 'Search web' },
    { input: 'Make a todo list in react', action: 'Create project' },
  ];

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='w-8 h-8 border-2 border-gray-900 rounded-full animate-spin' />
      </div>
    );
  }

  return (
    <div className='max-w-4xl mx-auto space-y-8'>
      <div className='text-center'>
        <h1 className='text-3xl font-bold text-gray-900'>Welcome to StaticRebel</h1>
        <p className='mt-2 text-gray-500'>Your local AI assistant - just talk naturally</p>
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <div className='p-4 bg-gray-900 rounded-lg text-white text-center'>
          <MessageSquare className='w-6 h-6 mx-auto mb-2' />
          <div className='text-2xl font-bold'>{stats?.conversations || 0}</div>
          <div className='text-sm text-gray-400'>Conversations</div>
        </div>
        <div className='p-4 bg-gray-900 rounded-lg text-white text-center'>
          <Sparkles className='w-6 h-6 mx-auto mb-2' />
          <div className='text-2xl font-bold'>{stats?.skills || 0}</div>
          <div className='text-sm text-gray-400'>Skills</div>
        </div>
        <div className='p-4 bg-gray-900 rounded-lg text-white text-center'>
          <Zap className='w-6 h-6 mx-auto mb-2' />
          <div className='text-2xl font-bold'>{stats?.connected ? 'On' : 'Off'}</div>
          <div className='text-sm text-gray-400'>Status</div>
        </div>
      </div>

      <div>
        <h2 className='text-lg font-semibold text-gray-900 mb-4'>Quick Actions</h2>
        <div className='grid grid-cols-3 gap-3'>
          {quickActions.map(action => (
            <Link
              key={action.name}
              href={action.href}
              className='flex flex-col items-center p-4 bg-gray-900 rounded-lg text-white hover:opacity-90'
            >
              <action.icon className='w-6 h-6 mb-2' />
              <div className='font-medium'>{action.name}</div>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className='text-lg font-semibold text-gray-900 mb-4'>Try saying...</h2>
        <div className='space-y-2'>
          {examples.map((ex, i) => (
            <Link
              key={i}
              href={`/chat?message=${encodeURIComponent(ex.input)}`}
              className='flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100'
            >
              <div>
                <div className='font-medium text-gray-900'>"{ex.input}"</div>
                <div className='text-sm text-gray-500'>{ex.action}</div>
              </div>
              <ArrowRight className='w-4 h-4 text-gray-400' />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
