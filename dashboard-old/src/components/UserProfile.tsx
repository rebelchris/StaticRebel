import { useState, useEffect } from 'react';
import { User, ChevronDown } from 'lucide-react';

interface UserProfileData {
  name: string | null;
  preferences: {
    tone: string;
    responseLength: string;
  };
  stats: {
    totalInteractions: number;
  };
}

export default function UserProfile() {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchProfile();
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
    <div className='relative'>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none'
      >
        <div className='h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center'>
          <User className='h-5 w-5 text-primary-600' />
        </div>
        <span className='hidden md:block'>{profile?.name || 'Guest'}</span>
        <ChevronDown className='h-4 w-4' />
      </button>

      {isOpen && (
        <div className='absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200'>
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
            <div className='flex justify-between text-sm mt-1'>
              <span className='text-gray-500'>Response style:</span>
              <span className='font-medium text-gray-900'>
                {profile?.preferences?.responseLength || 'medium'}
              </span>
            </div>
          </div>

          <div className='border-t border-gray-100 mt-1'>
            <a
              href='/settings'
              className='block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50'
            >
              Settings
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
