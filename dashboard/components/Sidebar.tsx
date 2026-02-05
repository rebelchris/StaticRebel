'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  LayoutDashboard,
  Settings,
  Sparkles,
  Menu,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Skills', href: '/skills', icon: Sparkles },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        className='fixed z-50 p-2 bg-white rounded-md shadow-md top-4 left-4 md:hidden'
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className='w-6 h-6' /> : <Menu className='w-6 h-6' />}
      </button>

      {sidebarOpen && (
        <div
          className='fixed inset-0 z-40 bg-gray-600 bg-opacity-75 md:hidden'
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:inset-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className='flex flex-col h-full'>
          <div className='flex items-center h-16 px-4 bg-gray-900'>
            <span className='text-xl font-bold text-white'>StaticRebel</span>
          </div>

          <nav className='flex-1 px-2 py-4 space-y-1 overflow-y-auto'>
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={clsx(
                    'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <item.icon className={clsx('mr-3 h-5 w-5', isActive ? 'text-white' : 'text-gray-400')} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className='p-4 border-t border-gray-200'>
            <StatusIndicator />
          </div>
        </div>
      </aside>
    </>
  );
}

function StatusIndicator() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.ok ? setStatus('connected') : setStatus('disconnected'))
      .catch(() => setStatus('disconnected'));
  }, []);

  return (
    <div className='flex items-center'>
      <div className={clsx('w-2 h-2 rounded-full',
        status === 'connected' ? 'bg-green-500' :
        status === 'disconnected' ? 'bg-red-500' : 'bg-yellow-500'
      )} />
      <span className='ml-2 text-sm text-gray-500'>
        {status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Offline' : 'Checking...'}
      </span>
    </div>
  );
}
