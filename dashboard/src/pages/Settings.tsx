import { useState, useEffect } from 'react';
import { User, Bell, Palette, Save } from 'lucide-react';

interface UserProfile {
  name: string;
  preferences: {
    tone: string;
    responseLength: string;
    codeStyle: string;
    notifications: boolean;
  };
}

export default function Settings() {
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    preferences: {
      tone: 'friendly',
      responseLength: 'medium',
      codeStyle: 'explained',
      notifications: true,
    },
  });
  const [saved, setSaved] = useState(false);

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

  const saveProfile = async () => {
    try {
      const response = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
  };

  return (
    <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8'>
      <div className='mb-8'>
        <h2 className='text-2xl font-bold text-gray-900'>Settings</h2>
        <p className='mt-1 text-sm text-gray-500'>
          Customize your StaticRebel experience
        </p>
      </div>

      <div className='space-y-6'>
        {/* Profile Section */}
        <div className='bg-white shadow rounded-lg'>
          <div className='px-4 py-5 sm:p-6'>
            <div className='flex items-center mb-4'>
              <User className='h-5 w-5 text-gray-400 mr-2' />
              <h3 className='text-lg font-medium text-gray-900'>Profile</h3>
            </div>

            <div className='grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6'>
              <div className='sm:col-span-4'>
                <label
                  htmlFor='name'
                  className='block text-sm font-medium text-gray-700'
                >
                  Your Name
                </label>
                <input
                  type='text'
                  id='name'
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                  className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                  placeholder='Enter your name'
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className='bg-white shadow rounded-lg'>
          <div className='px-4 py-5 sm:p-6'>
            <div className='flex items-center mb-4'>
              <Palette className='h-5 w-5 text-gray-400 mr-2' />
              <h3 className='text-lg font-medium text-gray-900'>Preferences</h3>
            </div>

            <div className='grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6'>
              <div className='sm:col-span-3'>
                <label
                  htmlFor='tone'
                  className='block text-sm font-medium text-gray-700'
                >
                  Assistant Tone
                </label>
                <select
                  id='tone'
                  value={profile.preferences.tone}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      preferences: {
                        ...profile.preferences,
                        tone: e.target.value,
                      },
                    })
                  }
                  className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                >
                  <option value='friendly'>Friendly</option>
                  <option value='professional'>Professional</option>
                  <option value='concise'>Concise</option>
                  <option value='humorous'>Humorous</option>
                </select>
              </div>

              <div className='sm:col-span-3'>
                <label
                  htmlFor='responseLength'
                  className='block text-sm font-medium text-gray-700'
                >
                  Response Length
                </label>
                <select
                  id='responseLength'
                  value={profile.preferences.responseLength}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      preferences: {
                        ...profile.preferences,
                        responseLength: e.target.value,
                      },
                    })
                  }
                  className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                >
                  <option value='short'>Short</option>
                  <option value='medium'>Medium</option>
                  <option value='detailed'>Detailed</option>
                </select>
              </div>

              <div className='sm:col-span-3'>
                <label
                  htmlFor='codeStyle'
                  className='block text-sm font-medium text-gray-700'
                >
                  Code Style
                </label>
                <select
                  id='codeStyle'
                  value={profile.preferences.codeStyle}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      preferences: {
                        ...profile.preferences,
                        codeStyle: e.target.value,
                      },
                    })
                  }
                  className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                >
                  <option value='raw'>Raw Code</option>
                  <option value='explained'>With Explanations</option>
                  <option value='tutorial'>Tutorial Style</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className='bg-white shadow rounded-lg'>
          <div className='px-4 py-5 sm:p-6'>
            <div className='flex items-center mb-4'>
              <Bell className='h-5 w-5 text-gray-400 mr-2' />
              <h3 className='text-lg font-medium text-gray-900'>
                Notifications
              </h3>
            </div>

            <div className='flex items-center'>
              <input
                id='notifications'
                type='checkbox'
                checked={profile.preferences.notifications}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    preferences: {
                      ...profile.preferences,
                      notifications: e.target.checked,
                    },
                  })
                }
                className='h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded'
              />
              <label
                htmlFor='notifications'
                className='ml-2 block text-sm text-gray-900'
              >
                Enable notifications
              </label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className='flex justify-end'>
          <button
            onClick={saveProfile}
            className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
          >
            <Save className='h-4 w-4 mr-2' />
            Save Changes
          </button>
        </div>

        {saved && (
          <div className='rounded-md bg-green-50 p-4'>
            <p className='text-sm text-green-800'>
              Settings saved successfully!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
