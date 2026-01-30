'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { User, ChevronDown, Settings } from 'lucide-react';

interface UserProfileData {
  name: string | null;
  preferences: {
    tone: string;
    responseLength: string;
    codeStyle: string;
    notifications: boolean;
  };
  stats?: {
    totalInteractions: number;
    firstInteraction: string | null;
    lastInteraction: string | null;
  };
}

export function UserProfile() {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/user/profile');
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  };

  return (
    <div className='relative' ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='flex items-center p-1 space-x-2 text-sm font-medium text-gray-700 rounded-md hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
      >
        <div className='flex items-center justify-center w-8 h-8 rounded-full bg-primary-100'>
          <User className='w-5 h-5 text-primary-600' />
        </div>
        <span className='hidden md:block'>{profile?.name || 'Guest'}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className='absolute right-0 z-50 w-64 py-1 mt-2 bg-white border border-gray-200 rounded-md shadow-lg'>
          <div className='px-4 py-3 border-b border-gray-100'>
            <p className='text-sm font-medium text-gray-900'>
              {profile?.name || 'Guest User'}
            </p>
            <p className='text-xs text-gray-500'>
              {profile?.preferences?.tone || 'friendly'} mode
            </p>
          </div>

          <div className='px-4 py-2'>
            <div className='flex justify-between text-sm'>
              <span className='text-gray-500'>Interactions:</span>
              <span className='font-medium text-gray-900'>
                {profile?.stats?.totalInteractions || 0}
              </span>
            </div>
            <div className='flex justify-between mt-1 text-sm'>
              <span className='text-gray-500'>Response style:</span>
              <span className='font-medium text-gray-900 capitalize'>
                {profile?.preferences?.responseLength || 'medium'}
              </span>
            </div>
            <div className='flex justify-between mt-1 text-sm'>
              <span className='text-gray-500'>Code style:</span>
              <span className='font-medium text-gray-900 capitalize'>
                {profile?.preferences?.codeStyle || 'explained'}
              </span>
            </div>
          </div>

          <div className='mt-1 border-t border-gray-100'>
            <Link
              href='/settings'
              onClick={() => setIsOpen(false)}
              className='flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50'
            >
              <Settings className='w-4 h-4 mr-2 text-gray-400' />
              Settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
