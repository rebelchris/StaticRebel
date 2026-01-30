'use client';

import { useState, useEffect } from 'react';
import {
  Settings,
  Server,
  Bot,
  Heart,
  FolderOpen,
  Cpu,
  Save,
  Download,
  RotateCcw,
  Check,
  AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';

type ConfigSection = 'ollama' | 'models' | 'telegram' | 'heartbeat' | 'paths';

interface Config {
  ollama: {
    baseUrl: string;
    timeout: number;
  };
  models: {
    defaults: {
      general: string;
      coding: string;
      analysis: string;
      vision: string;
    };
  };
  telegram: {
    enabled: boolean;
    botToken: string;
  };
  heartbeat: {
    enabled: boolean;
    intervalMs: number;
    quietHours: {
      start: string;
      end: string;
    };
  };
  paths: {
    configDir: string;
    workspacesDir: string;
    memoryDir: string;
  };
}

const defaultConfig: Config = {
  ollama: {
    baseUrl: 'http://localhost:11434',
    timeout: 120000,
  },
  models: {
    defaults: {
      general: 'ollama/llama3.2',
      coding: 'ollama/qwen3-coder:latest',
      analysis: 'ollama/deepseek-r1:32b',
      vision: 'ollama/llava',
    },
  },
  telegram: {
    enabled: false,
    botToken: '',
  },
  heartbeat: {
    enabled: true,
    intervalMs: 1800000,
    quietHours: {
      start: '23:00',
      end: '08:00',
    },
  },
  paths: {
    configDir: '',
    workspacesDir: '',
    memoryDir: '',
  },
};

const tabs = [
  { id: 'ollama' as ConfigSection, label: 'Ollama', icon: Server },
  { id: 'models' as ConfigSection, label: 'Models', icon: Cpu },
  { id: 'telegram' as ConfigSection, label: 'Telegram', icon: Bot },
  { id: 'heartbeat' as ConfigSection, label: 'Heartbeat', icon: Heart },
  { id: 'paths' as ConfigSection, label: 'Paths', icon: FolderOpen },
];

export default function ConfigPage() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ConfigSection>('ollama');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        setConfig((prev) => ({ ...prev, ...data.config }));
      }
    } catch (err) {
      setError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError('Failed to save configuration');
      }
    } catch (err) {
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const saveSection = async (section: ConfigSection) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data: config[section] }),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError('Failed to save section');
      }
    } catch (err) {
      setError('Failed to save section');
    } finally {
      setSaving(false);
    }
  };

  const exportConfig = () => {
    const dataStr = JSON.stringify(config, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ollama-assistant-config.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetConfig = async () => {
    if (!confirm('Are you sure you want to reset to default configuration?')) {
      return;
    }
    setConfig(defaultConfig);
    await saveConfig();
  };

  const updateConfig = (
    section: ConfigSection,
    updates: Partial<Config[ConfigSection]>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='w-8 h-8 border-b-2 rounded-full animate-spin border-primary-600' />
      </div>
    );
  }

  return (
    <div className='max-w-5xl mx-auto'>
      {/* Header */}
      <div className='mb-8'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>Configuration</h1>
            <p className='mt-1 text-sm text-gray-500'>
              Manage system settings and integrations
            </p>
          </div>
          <div className='flex gap-3'>
            <button
              onClick={exportConfig}
              className='inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50'
            >
              <Download className='w-4 h-4 mr-2' />
              Export
            </button>
            <button
              onClick={resetConfig}
              className='inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 border border-red-200 rounded-md bg-red-50 hover:bg-red-100'
            >
              <RotateCcw className='w-4 h-4 mr-2' />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className='p-4 mb-6 text-red-700 rounded-md bg-red-50'>
          <div className='flex items-center'>
            <AlertCircle className='w-5 h-5 mr-2' />
            {error}
          </div>
        </div>
      )}

      {/* Success Message */}
      {saved && (
        <div className='p-4 mb-6 text-green-700 rounded-md bg-green-50'>
          <div className='flex items-center'>
            <Check className='w-5 h-5 mr-2' />
            Configuration saved successfully!
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className='mb-6 border-b border-gray-200'>
        <nav className='flex -mb-px space-x-8'>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'inline-flex items-center px-1 py-4 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                )}
              >
                <Icon className='w-5 h-5 mr-2' />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className='bg-white rounded-lg shadow'>
        {/* Ollama Section */}
        {activeTab === 'ollama' && (
          <div className='p-6'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h3 className='text-lg font-medium text-gray-900'>
                  Ollama Server
                </h3>
                <p className='text-sm text-gray-500'>
                  Configure connection to your Ollama instance
                </p>
              </div>
              <button
                onClick={() => saveSection('ollama')}
                disabled={saving}
                className='inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-50'
              >
                <Save className='w-4 h-4 mr-2' />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            <div className='grid grid-cols-1 gap-6 sm:grid-cols-2'>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  Base URL
                </label>
                <input
                  type='text'
                  value={config.ollama.baseUrl}
                  onChange={(e) =>
                    updateConfig('ollama', { baseUrl: e.target.value })
                  }
                  className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  Timeout (ms)
                </label>
                <input
                  type='number'
                  value={config.ollama.timeout}
                  onChange={(e) =>
                    updateConfig('ollama', {
                      timeout: parseInt(e.target.value),
                    })
                  }
                  className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                />
              </div>
            </div>
          </div>
        )}

        {/* Models Section */}
        {activeTab === 'models' && (
          <div className='p-6'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h3 className='text-lg font-medium text-gray-900'>
                  Default Models
                </h3>
                <p className='text-sm text-gray-500'>
                  Set default models for different task types
                </p>
              </div>
              <button
                onClick={() => saveSection('models')}
                disabled={saving}
                className='inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-50'
              >
                <Save className='w-4 h-4 mr-2' />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            <div className='grid grid-cols-1 gap-6 sm:grid-cols-2'>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  General Purpose
                </label>
                <input
                  type='text'
                  value={config.models.defaults.general}
                  onChange={(e) =>
                    updateConfig('models', {
                      defaults: {
                        ...config.models.defaults,
                        general: e.target.value,
                      },
                    })
                  }
                  className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  Coding
                </label>
                <input
                  type='text'
                  value={config.models.defaults.coding}
                  onChange={(e) =>
                    updateConfig('models', {
                      defaults: {
                        ...config.models.defaults,
                        coding: e.target.value,
                      },
                    })
                  }
                  className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  Analysis
                </label>
                <input
                  type='text'
                  value={config.models.defaults.analysis}
                  onChange={(e) =>
                    updateConfig('models', {
                      defaults: {
                        ...config.models.defaults,
                        analysis: e.target.value,
                      },
                    })
                  }
                  className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  Vision
                </label>
                <input
                  type='text'
                  value={config.models.defaults.vision}
                  onChange={(e) =>
                    updateConfig('models', {
                      defaults: {
                        ...config.models.defaults,
                        vision: e.target.value,
                      },
                    })
                  }
                  className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                />
              </div>
            </div>
          </div>
        )}

        {/* Telegram Section */}
        {activeTab === 'telegram' && (
          <div className='p-6'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h3 className='text-lg font-medium text-gray-900'>
                  Telegram Bot
                </h3>
                <p className='text-sm text-gray-500'>
                  Configure Telegram bot integration
                </p>
              </div>
              <button
                onClick={() => saveSection('telegram')}
                disabled={saving}
                className='inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-50'
              >
                <Save className='w-4 h-4 mr-2' />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            <div className='space-y-6'>
              <div className='flex items-center'>
                <input
                  type='checkbox'
                  id='telegram-enabled'
                  checked={config.telegram.enabled}
                  onChange={(e) =>
                    updateConfig('telegram', { enabled: e.target.checked })
                  }
                  className='w-4 h-4 border-gray-300 rounded text-primary-600 focus:ring-primary-500'
                />
                <label
                  htmlFor='telegram-enabled'
                  className='block ml-3 text-sm font-medium text-gray-700'
                >
                  Enable Telegram Bot
                </label>
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  Bot Token
                </label>
                <input
                  type='password'
                  value={config.telegram.botToken}
                  onChange={(e) =>
                    updateConfig('telegram', { botToken: e.target.value })
                  }
                  placeholder='Enter your bot token from @BotFather'
                  className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                />
                <p className='mt-1 text-xs text-gray-500'>
                  Get your token from{' '}
                  <a
                    href='https://t.me/BotFather'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-primary-600 hover:underline'
                  >
                    @BotFather
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Heartbeat Section */}
        {activeTab === 'heartbeat' && (
          <div className='p-6'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h3 className='text-lg font-medium text-gray-900'>
                  Heartbeat Monitor
                </h3>
                <p className='text-sm text-gray-500'>
                  Configure system health monitoring
                </p>
              </div>
              <button
                onClick={() => saveSection('heartbeat')}
                disabled={saving}
                className='inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-50'
              >
                <Save className='w-4 h-4 mr-2' />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            <div className='space-y-6'>
              <div className='flex items-center'>
                <input
                  type='checkbox'
                  id='heartbeat-enabled'
                  checked={config.heartbeat.enabled}
                  onChange={(e) =>
                    updateConfig('heartbeat', { enabled: e.target.checked })
                  }
                  className='w-4 h-4 border-gray-300 rounded text-primary-600 focus:ring-primary-500'
                />
                <label
                  htmlFor='heartbeat-enabled'
                  className='block ml-3 text-sm font-medium text-gray-700'
                >
                  Enable Heartbeat Monitoring
                </label>
              </div>
              <div className='grid grid-cols-1 gap-6 sm:grid-cols-3'>
                <div>
                  <label className='block text-sm font-medium text-gray-700'>
                    Check Interval (ms)
                  </label>
                  <input
                    type='number'
                    value={config.heartbeat.intervalMs}
                    onChange={(e) =>
                      updateConfig('heartbeat', {
                        intervalMs: parseInt(e.target.value),
                      })
                    }
                    className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700'>
                    Quiet Hours Start
                  </label>
                  <input
                    type='time'
                    value={config.heartbeat.quietHours.start}
                    onChange={(e) =>
                      updateConfig('heartbeat', {
                        quietHours: {
                          ...config.heartbeat.quietHours,
                          start: e.target.value,
                        },
                      })
                    }
                    className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700'>
                    Quiet Hours End
                  </label>
                  <input
                    type='time'
                    value={config.heartbeat.quietHours.end}
                    onChange={(e) =>
                      updateConfig('heartbeat', {
                        quietHours: {
                          ...config.heartbeat.quietHours,
                          end: e.target.value,
                        },
                      })
                    }
                    className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Paths Section */}
        {activeTab === 'paths' && (
          <div className='p-6'>
            <div className='flex items-center justify-between mb-6'>
              <div>
                <h3 className='text-lg font-medium text-gray-900'>
                  File Paths
                </h3>
                <p className='text-sm text-gray-500'>
                  System directories configuration
                </p>
              </div>
            </div>
            <div className='space-y-6'>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  Config Directory
                </label>
                <input
                  type='text'
                  value={config.paths.configDir}
                  readOnly
                  className='block w-full mt-1 text-gray-500 bg-gray-100 border-gray-300 rounded-md shadow-sm sm:text-sm'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  Workspaces Directory
                </label>
                <input
                  type='text'
                  value={config.paths.workspacesDir}
                  readOnly
                  className='block w-full mt-1 text-gray-500 bg-gray-100 border-gray-300 rounded-md shadow-sm sm:text-sm'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700'>
                  Memory Directory
                </label>
                <input
                  type='text'
                  value={config.paths.memoryDir}
                  readOnly
                  className='block w-full mt-1 text-gray-500 bg-gray-100 border-gray-300 rounded-md shadow-sm sm:text-sm'
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
