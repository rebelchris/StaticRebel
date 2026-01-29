'use client';

import { useEffect, useState } from 'react';
import { Brain, Calendar, Search, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';

interface MemoryEntry {
  id: string;
  date: string;
  content: string;
  type: string;
  score?: number;
}

export default function Memory() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'daily' | 'vector'>('daily');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMemories();
  }, [activeTab]);

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/memory?type=${activeTab}`);
      if (response.ok) {
        const data = await response.json();
        setMemories(Array.isArray(data) ? data : data.memories || []);
      }
    } catch (error) {
      console.error('Failed to fetch memories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      fetchMemories();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/memory/search?q=${encodeURIComponent(searchTerm)}`);
      if (response.ok) {
        const data = await response.json();
        setMemories(Array.isArray(data) ? data : data.results || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/memory/${id}`, { method: 'DELETE' });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Memory</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse and search your conversation history
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('daily')}
            className={clsx(
              'py-4 px-1 border-b-2 font-medium text-sm',
              activeTab === 'daily'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            Daily Memories
          </button>
          <button
            onClick={() => setActiveTab('vector')}
            className={clsx(
              'py-4 px-1 border-b-2 font-medium text-sm',
              activeTab === 'vector'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            Vector Memory
          </button>
        </nav>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search memories..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
          />
        </div>
      </div>

      {/* Memory List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-sm text-gray-500">Loading memories...</p>
          </div>
        ) : memories.length > 0 ? (
          memories.map((memory) => (
            <div
              key={memory.id}
              className="bg-white shadow rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start">
                  <Brain className="h-5 w-5 text-primary-500 mr-3 mt-0.5" />
                  <div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="h-4 w-4 mr-1" />
                      {new Date(memory.date).toLocaleDateString()}
                      {memory.score && (
                        <span className="ml-2 text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                          {(memory.score * 100).toFixed(0)}% match
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-gray-900 whitespace-pre-wrap">
                      {memory.content}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(memory.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <Brain className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No memories</h3>
            <p className="mt-1 text-sm text-gray-500">
              Start chatting to create memories
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
