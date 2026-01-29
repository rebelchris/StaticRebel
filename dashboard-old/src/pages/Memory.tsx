import { useEffect, useState } from 'react';
import { Brain, Calendar, Search, Trash2 } from 'lucide-react';

interface MemoryEntry {
  id: string;
  date: string;
  content: string;
  type: 'daily' | 'long-term';
}

export default function Memory() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'daily' | 'long-term'>('daily');

  useEffect(() => {
    fetchMemories();
  }, [activeTab]);

  const fetchMemories = async () => {
    try {
      const response = await fetch(`/api/memory?type=${activeTab}`);
      if (response.ok) {
        const data = await response.json();
        setMemories(data);
      }
    } catch (error) {
      console.error('Failed to fetch memories:', error);
    }
  };

  const filteredMemories = memories.filter((m) =>
    m.content.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
      <div className='mb-8'>
        <h2 className='text-2xl font-bold text-gray-900'>Memory</h2>
        <p className='mt-1 text-sm text-gray-500'>
          Browse and search your conversation history
        </p>
      </div>

      {/* Tabs */}
      <div className='border-b border-gray-200 mb-6'>
        <nav className='-mb-px flex space-x-8'>
          <button
            onClick={() => setActiveTab('daily')}
            className={`
              py-4 px-1 border-b-2 font-medium text-sm
              ${
                activeTab === 'daily'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            Daily Memories
          </button>
          <button
            onClick={() => setActiveTab('long-term')}
            className={`
              py-4 px-1 border-b-2 font-medium text-sm
              ${
                activeTab === 'long-term'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            Long-term Memory
          </button>
        </nav>
      </div>

      {/* Search */}
      <div className='mb-6'>
        <div className='relative'>
          <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
            <Search className='h-5 w-5 text-gray-400' />
          </div>
          <input
            type='text'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder='Search memories...'
            className='block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
          />
        </div>
      </div>

      {/* Memory List */}
      <div className='space-y-4'>
        {filteredMemories.length > 0 ? (
          filteredMemories.map((memory) => (
            <div
              key={memory.id}
              className='bg-white shadow rounded-lg p-4 hover:shadow-md transition-shadow'
            >
              <div className='flex items-start justify-between'>
                <div className='flex items-center'>
                  <Brain className='h-5 w-5 text-primary-500 mr-3' />
                  <div>
                    <div className='flex items-center text-sm text-gray-500'>
                      <Calendar className='h-4 w-4 mr-1' />
                      {new Date(memory.date).toLocaleDateString()}
                    </div>
                    <p className='mt-1 text-gray-900 whitespace-pre-wrap'>
                      {memory.content}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    /* TODO: Delete memory */
                  }}
                  className='text-gray-400 hover:text-red-500'
                >
                  <Trash2 className='h-4 w-4' />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className='text-center py-12'>
            <Brain className='mx-auto h-12 w-12 text-gray-400' />
            <h3 className='mt-2 text-sm font-medium text-gray-900'>
              No memories
            </h3>
            <p className='mt-1 text-sm text-gray-500'>
              Start chatting to create memories
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
