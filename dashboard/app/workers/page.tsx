'use client';

import { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  Trash2,
  Filter,
} from 'lucide-react';
import { clsx } from 'clsx';

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
type TaskType = 'general' | 'research' | 'code' | 'websearch' | 'process';
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

interface Task {
  id: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface TaskStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

const statusConfig = {
  pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  running: { color: 'bg-blue-100 text-blue-800', icon: Play },
  completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
  failed: { color: 'bg-red-100 text-red-800', icon: XCircle },
};

const priorityConfig = {
  low: { color: 'bg-gray-100 text-gray-700' },
  normal: { color: 'bg-blue-100 text-blue-700' },
  high: { color: 'bg-orange-100 text-orange-700' },
  urgent: { color: 'bg-red-100 text-red-700' },
};

const filters: { id: TaskStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'running', label: 'Running' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

export default function WorkersPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'general' as TaskType,
    priority: 'normal' as TaskPriority,
    payload: '{}',
  });

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [filter]);

  const fetchTasks = async () => {
    try {
      const response = await fetch(`/api/workers?filter=${filter}`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
        setStats(
          data.stats || {
            total: 0,
            pending: 0,
            running: 0,
            completed: 0,
            failed: 0,
          },
        );
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      let payload = {};
      try {
        payload = JSON.parse(formData.payload);
      } catch {
        // Invalid JSON, use empty object
      }

      const response = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          priority: formData.priority,
          payload,
        }),
      });

      if (response.ok) {
        await fetchTasks();
        setShowCreateModal(false);
        setFormData({
          name: '',
          type: 'general',
          priority: 'normal',
          payload: '{}',
        });
      }
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      const response = await fetch('/api/workers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'retry' }),
      });

      if (response.ok) {
        await fetchTasks();
      }
    } catch (error) {
      console.error('Failed to retry task:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const response = await fetch(`/api/workers?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchTasks();
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getDuration = (task: Task) => {
    if (!task.startedAt) return '-';
    const end = task.completedAt ? new Date(task.completedAt) : new Date();
    const start = new Date(task.startedAt);
    const diff = end.getTime() - start.getTime();
    return `${(diff / 1000).toFixed(1)}s`;
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='w-8 h-8 border-b-2 rounded-full animate-spin border-primary-600' />
      </div>
    );
  }

  return (
    <div className='max-w-6xl mx-auto'>
      {/* Header */}
      <div className='mb-8'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>Task Queue</h1>
            <p className='mt-1 text-sm text-gray-500'>
              Manage background tasks and workers
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className='inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md bg-primary-600 hover:bg-primary-700'
          >
            <Plus className='w-4 h-4 mr-2' />
            New Task
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className='grid grid-cols-2 gap-5 mb-8 sm:grid-cols-4'>
        <div className='p-5 bg-white rounded-lg shadow'>
          <div className='flex items-center'>
            <div className='flex-shrink-0 p-3 bg-blue-500 rounded-md'>
              <Server className='w-6 h-6 text-white' />
            </div>
            <div className='flex-1 w-0 ml-5'>
              <dl>
                <dt className='text-sm font-medium text-gray-500 truncate'>
                  Total Tasks
                </dt>
                <dd className='text-2xl font-semibold text-gray-900'>
                  {stats.total}
                </dd>
              </dl>
            </div>
          </div>
        </div>
        <div className='p-5 bg-white rounded-lg shadow'>
          <div className='flex items-center'>
            <div className='flex-shrink-0 p-3 bg-yellow-500 rounded-md'>
              <Clock className='w-6 h-6 text-white' />
            </div>
            <div className='flex-1 w-0 ml-5'>
              <dl>
                <dt className='text-sm font-medium text-gray-500 truncate'>
                  Pending
                </dt>
                <dd className='text-2xl font-semibold text-gray-900'>
                  {stats.pending}
                </dd>
              </dl>
            </div>
          </div>
        </div>
        <div className='p-5 bg-white rounded-lg shadow'>
          <div className='flex items-center'>
            <div className='flex-shrink-0 p-3 bg-green-500 rounded-md'>
              <CheckCircle className='w-6 h-6 text-white' />
            </div>
            <div className='flex-1 w-0 ml-5'>
              <dl>
                <dt className='text-sm font-medium text-gray-500 truncate'>
                  Completed
                </dt>
                <dd className='text-2xl font-semibold text-gray-900'>
                  {stats.completed}
                </dd>
              </dl>
            </div>
          </div>
        </div>
        <div className='p-5 bg-white rounded-lg shadow'>
          <div className='flex items-center'>
            <div className='flex-shrink-0 p-3 bg-red-500 rounded-md'>
              <XCircle className='w-6 h-6 text-white' />
            </div>
            <div className='flex-1 w-0 ml-5'>
              <dl>
                <dt className='text-sm font-medium text-gray-500 truncate'>
                  Failed
                </dt>
                <dd className='text-2xl font-semibold text-gray-900'>
                  {stats.failed}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className='mb-6'>
        <div className='flex items-center space-x-2'>
          <Filter className='w-5 h-5 text-gray-400' />
          <div className='flex p-1 space-x-1 bg-gray-100 rounded-lg'>
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={clsx(
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                  filter === f.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchTasks}
            className='p-2 ml-2 text-gray-400 hover:text-gray-600'
          >
            <RefreshCw className='w-5 h-5' />
          </button>
        </div>
      </div>

      {/* Tasks List */}
      <div className='bg-white rounded-lg shadow'>
        <div className='px-4 py-5 sm:p-6'>
          <h3 className='mb-4 text-lg font-medium text-gray-900'>
            Tasks{' '}
            <span className='text-sm font-normal text-gray-500'>
              ({tasks.length} shown)
            </span>
          </h3>
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200'>
              <thead>
                <tr>
                  <th className='px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase'>
                    Task
                  </th>
                  <th className='px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase'>
                    Status
                  </th>
                  <th className='px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase'>
                    Priority
                  </th>
                  <th className='px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase'>
                    Created
                  </th>
                  <th className='px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase'>
                    Duration
                  </th>
                  <th className='px-4 py-3 text-xs font-medium tracking-wider text-right text-gray-500 uppercase'>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-200'>
                {tasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className='px-4 py-8 text-center text-gray-500'
                    >
                      No tasks found
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => {
                    const StatusIcon = statusConfig[task.status].icon;
                    return (
                      <tr key={task.id} className='hover:bg-gray-50'>
                        <td className='px-4 py-4'>
                          <div>
                            <div className='text-sm font-medium text-gray-900'>
                              {task.name}
                            </div>
                            <div className='text-xs text-gray-500'>
                              {task.type}
                            </div>
                          </div>
                        </td>
                        <td className='px-4 py-4'>
                          <span
                            className={clsx(
                              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                              statusConfig[task.status].color,
                            )}
                          >
                            <StatusIcon className='w-3 h-3 mr-1' />
                            {task.status}
                          </span>
                        </td>
                        <td className='px-4 py-4'>
                          <span
                            className={clsx(
                              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                              priorityConfig[task.priority].color,
                            )}
                          >
                            {task.priority}
                          </span>
                        </td>
                        <td className='px-4 py-4 text-sm text-gray-500'>
                          {formatTime(task.createdAt)}
                        </td>
                        <td className='px-4 py-4 text-sm text-gray-500'>
                          {getDuration(task)}
                        </td>
                        <td className='px-4 py-4 text-right'>
                          <div className='flex items-center justify-end space-x-2'>
                            {task.status === 'failed' && (
                              <button
                                onClick={() => handleRetry(task.id)}
                                className='p-1 text-blue-600 hover:text-blue-800'
                                title='Retry'
                              >
                                <RefreshCw className='w-4 h-4' />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(task.id)}
                              className='p-1 text-red-600 hover:text-red-800'
                              title='Delete'
                            >
                              <Trash2 className='w-4 h-4' />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className='fixed inset-0 z-50 overflow-y-auto'>
          <div className='flex items-center justify-center min-h-screen px-4'>
            <div
              className='fixed inset-0 bg-gray-500 bg-opacity-75'
              onClick={() => setShowCreateModal(false)}
            />
            <div className='relative w-full max-w-md bg-white rounded-lg shadow-xl'>
              <div className='px-4 py-5 sm:p-6'>
                <h3 className='mb-4 text-lg font-medium text-gray-900'>
                  Create New Task
                </h3>
                <div className='space-y-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700'>
                      Task Name *
                    </label>
                    <input
                      type='text'
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                      placeholder='e.g., Research AI trends'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700'>
                      Task Type
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          type: e.target.value as TaskType,
                        })
                      }
                      className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                    >
                      <option value='general'>General</option>
                      <option value='research'>Research</option>
                      <option value='code'>Code</option>
                      <option value='websearch'>Web Search</option>
                      <option value='process'>Process</option>
                    </select>
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700'>
                      Priority
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          priority: e.target.value as TaskPriority,
                        })
                      }
                      className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                    >
                      <option value='low'>Low</option>
                      <option value='normal'>Normal</option>
                      <option value='high'>High</option>
                      <option value='urgent'>Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700'>
                      Payload (JSON)
                    </label>
                    <textarea
                      value={formData.payload}
                      onChange={(e) =>
                        setFormData({ ...formData, payload: e.target.value })
                      }
                      rows={3}
                      className='block w-full mt-1 font-mono border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                      placeholder='{"key": "value"}'
                    />
                  </div>
                </div>
                <div className='flex mt-6 space-x-3'>
                  <button
                    onClick={handleCreate}
                    className='inline-flex items-center justify-center flex-1 px-4 py-2 text-sm font-medium text-white rounded-md bg-primary-600 hover:bg-primary-700'
                  >
                    Create Task
                  </button>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className='inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50'
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
