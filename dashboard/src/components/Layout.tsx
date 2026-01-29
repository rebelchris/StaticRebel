import { Link, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  LayoutDashboard,
  Brain,
  Activity,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import UserProfile from './UserProfile';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Memory', href: '/memory', icon: Brain },
  { name: 'Trackers', href: '/trackers', icon: Activity },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className='h-screen flex overflow-hidden bg-gray-50'>
      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className='fixed inset-0 z-40 flex md:hidden'>
          <div
            className='fixed inset-0 bg-gray-600 bg-opacity-75'
            onClick={() => setSidebarOpen(false)}
          />
          <div className='relative flex-1 flex flex-col max-w-xs w-full bg-white'>
            <div className='absolute top-0 right-0 -mr-12 pt-2'>
              <button
                className='ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white'
                onClick={() => setSidebarOpen(false)}
              >
                <X className='h-6 w-6 text-white' />
              </button>
            </div>
            <SidebarContent currentPath={location.pathname} />
          </div>
        </div>
      )}

      {/* Static sidebar for desktop */}
      <div className='hidden md:flex md:flex-shrink-0'>
        <div className='flex flex-col w-64'>
          <SidebarContent currentPath={location.pathname} />
        </div>
      </div>

      {/* Main content */}
      <div className='flex flex-col w-0 flex-1 overflow-hidden'>
        <div className='relative z-10 flex-shrink-0 flex h-16 bg-white border-b border-gray-200'>
          <button
            className='px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 md:hidden'
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className='h-6 w-6' />
          </button>
          <div className='flex-1 px-4 flex justify-between'>
            <div className='flex-1 flex items-center'>
              <h1 className='text-xl font-semibold text-gray-900'>
                StaticRebel
              </h1>
            </div>
            <div className='ml-4 flex items-center md:ml-6'>
              <UserProfile />
            </div>
          </div>
        </div>

        <main className='flex-1 relative overflow-y-auto focus:outline-none'>
          <div className='py-6'>{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ currentPath }: { currentPath: string }) {
  return (
    <div className='flex-1 flex flex-col min-h-0 border-r border-gray-200 bg-white'>
      <div className='flex items-center h-16 flex-shrink-0 px-4 bg-primary-600'>
        <span className='text-white text-xl font-bold'>StaticRebel</span>
      </div>
      <div className='flex-1 flex flex-col overflow-y-auto'>
        <nav className='flex-1 px-2 py-4 space-y-1'>
          {navigation.map((item) => {
            const isActive = currentPath === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`
                  group flex items-center px-2 py-2 text-sm font-medium rounded-md
                  ${
                    isActive
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                <item.icon
                  className={`
                    mr-3 flex-shrink-0 h-5 w-5
                    ${isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'}
                  `}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
