'use client';

import { useState, useEffect } from 'react';
import {
  User,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { clsx } from 'clsx';

interface Persona {
  id: string;
  name: string;
  role?: string;
  systemPrompt?: string;
  traits?: string[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    systemPrompt: '',
    traits: '',
  });

  useEffect(() => {
    fetchPersonas();
  }, []);

  const fetchPersonas = async () => {
    try {
      const response = await fetch('/api/personas');
      if (response.ok) {
        const data = await response.json();
        setPersonas(data.personas || []);
      }
    } catch (error) {
      console.error('Failed to fetch personas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          role: formData.role,
          systemPrompt: formData.systemPrompt,
          traits: formData.traits
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      if (response.ok) {
        await fetchPersonas();
        setIsCreating(false);
        setFormData({ name: '', role: '', systemPrompt: '', traits: '' });
      }
    } catch (error) {
      console.error('Failed to create persona:', error);
    }
  };

  const handleUpdate = async () => {
    if (!selectedPersona) return;

    try {
      const response = await fetch('/api/personas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedPersona.id,
          updates: {
            name: formData.name,
            role: formData.role,
            systemPrompt: formData.systemPrompt,
            traits: formData.traits
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          },
        }),
      });

      if (response.ok) {
        await fetchPersonas();
        setIsEditing(false);
        setSelectedPersona(null);
        setFormData({ name: '', role: '', systemPrompt: '', traits: '' });
      }
    } catch (error) {
      console.error('Failed to update persona:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this persona?')) return;

    try {
      const response = await fetch(`/api/personas?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchPersonas();
        if (selectedPersona?.id === id) {
          setSelectedPersona(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete persona:', error);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const response = await fetch('/api/personas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'activate' }),
      });

      if (response.ok) {
        await fetchPersonas();
      }
    } catch (error) {
      console.error('Failed to activate persona:', error);
    }
  };

  const startEdit = (persona: Persona) => {
    setSelectedPersona(persona);
    setFormData({
      name: persona.name,
      role: persona.role || '',
      systemPrompt: persona.systemPrompt || '',
      traits: persona.traits?.join(', ') || '',
    });
    setIsEditing(true);
    setIsCreating(false);
  };

  const startCreate = () => {
    setFormData({ name: '', role: '', systemPrompt: '', traits: '' });
    setIsCreating(true);
    setIsEditing(false);
    setSelectedPersona(null);
  };

  const cancelForm = () => {
    setIsCreating(false);
    setIsEditing(false);
    setSelectedPersona(null);
    setFormData({ name: '', role: '', systemPrompt: '', traits: '' });
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='w-8 h-8 border-b-2 rounded-full animate-spin border-primary-600' />
      </div>
    );
  }

  const activePersona = personas.find((p) => p.isActive);

  return (
    <div className='max-w-6xl mx-auto'>
      {/* Header */}
      <div className='mb-8'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>
              Persona Manager
            </h1>
            <p className='mt-1 text-sm text-gray-500'>
              Manage AI personas and customize their behavior
            </p>
          </div>
          <button
            onClick={startCreate}
            className='inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-md bg-primary-600 hover:bg-primary-700'
          >
            <Plus className='w-4 h-4 mr-2' />
            New Persona
          </button>
        </div>
      </div>

      {/* Active Persona Card */}
      {activePersona && (
        <div className='p-6 mb-8 rounded-lg shadow-lg bg-gradient-to-r from-primary-500 to-primary-600'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center'>
              <div className='p-3 bg-white rounded-full bg-opacity-20'>
                <Sparkles className='w-8 h-8 text-white' />
              </div>
              <div className='ml-4'>
                <p className='text-sm text-primary-100'>Active Persona</p>
                <h2 className='text-2xl font-bold text-white'>
                  {activePersona.name}
                </h2>
                {activePersona.role && (
                  <p className='text-primary-100'>{activePersona.role}</p>
                )}
              </div>
            </div>
            <div className='flex items-center space-x-2'>
              <span className='px-3 py-1 text-sm font-medium bg-white rounded-full text-primary-700'>
                Active
              </span>
            </div>
          </div>
        </div>
      )}

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        {/* Personas List */}
        <div className='lg:col-span-2'>
          <div className='bg-white rounded-lg shadow'>
            <div className='px-4 py-5 sm:p-6'>
              <h3 className='mb-4 text-lg font-medium text-gray-900'>
                Available Personas
              </h3>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    onClick={() => setSelectedPersona(persona)}
                    className={clsx(
                      'p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md',
                      selectedPersona?.id === persona.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-primary-300',
                      persona.isActive && 'ring-2 ring-green-500 ring-offset-2',
                    )}
                  >
                    <div className='flex items-start justify-between'>
                      <div className='flex items-center'>
                        <div className='p-2 bg-gray-100 rounded-lg'>
                          <User className='w-5 h-5 text-gray-600' />
                        </div>
                        <div className='ml-3'>
                          <h4 className='text-sm font-medium text-gray-900'>
                            {persona.name}
                          </h4>
                          {persona.role && (
                            <p className='text-xs text-gray-500'>
                              {persona.role}
                            </p>
                          )}
                        </div>
                      </div>
                      {persona.isActive && (
                        <span className='inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800'>
                          Active
                        </span>
                      )}
                    </div>
                    {persona.traits && persona.traits.length > 0 && (
                      <div className='flex flex-wrap gap-1 mt-3'>
                        {persona.traits.slice(0, 3).map((trait, idx) => (
                          <span
                            key={idx}
                            className='inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700'
                          >
                            {trait}
                          </span>
                        ))}
                        {persona.traits.length > 3 && (
                          <span className='text-xs text-gray-500'>
                            +{persona.traits.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Details / Form Panel */}
        <div className='lg:col-span-1'>
          {isCreating || isEditing ? (
            <div className='bg-white rounded-lg shadow'>
              <div className='px-4 py-5 sm:p-6'>
                <h3 className='mb-4 text-lg font-medium text-gray-900'>
                  {isCreating ? 'Create Persona' : 'Edit Persona'}
                </h3>
                <div className='space-y-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700'>
                      Name *
                    </label>
                    <input
                      type='text'
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                      placeholder='e.g., Research Assistant'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700'>
                      Role
                    </label>
                    <input
                      type='text'
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value })
                      }
                      className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                      placeholder='e.g., Research Specialist'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700'>
                      System Prompt
                    </label>
                    <textarea
                      value={formData.systemPrompt}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          systemPrompt: e.target.value,
                        })
                      }
                      rows={4}
                      className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                      placeholder="Describe the persona's behavior and capabilities..."
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700'>
                      Traits (comma-separated)
                    </label>
                    <input
                      type='text'
                      value={formData.traits}
                      onChange={(e) =>
                        setFormData({ ...formData, traits: e.target.value })
                      }
                      className='block w-full mt-1 border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm'
                      placeholder='e.g., analytical, thorough, patient'
                    />
                  </div>
                  <div className='flex pt-4 space-x-3'>
                    <button
                      onClick={isCreating ? handleCreate : handleUpdate}
                      className='inline-flex items-center justify-center flex-1 px-4 py-2 text-sm font-medium text-white rounded-md bg-primary-600 hover:bg-primary-700'
                    >
                      <Check className='w-4 h-4 mr-2' />
                      {isCreating ? 'Create' : 'Save'}
                    </button>
                    <button
                      onClick={cancelForm}
                      className='inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50'
                    >
                      <X className='w-4 h-4 mr-2' />
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : selectedPersona ? (
            <div className='bg-white rounded-lg shadow'>
              <div className='px-4 py-5 sm:p-6'>
                <div className='flex items-center justify-between mb-4'>
                  <h3 className='text-lg font-medium text-gray-900'>
                    Persona Details
                  </h3>
                  <div className='flex space-x-2'>
                    <button
                      onClick={() => startEdit(selectedPersona)}
                      className='p-2 text-gray-400 hover:text-gray-600'
                    >
                      <Edit2 className='w-4 h-4' />
                    </button>
                    {selectedPersona.id !== 'default' && (
                      <button
                        onClick={() => handleDelete(selectedPersona.id)}
                        className='p-2 text-red-400 hover:text-red-600'
                      >
                        <Trash2 className='w-4 h-4' />
                      </button>
                    )}
                  </div>
                </div>
                <div className='space-y-4'>
                  <div>
                    <label className='text-xs font-medium text-gray-500 uppercase'>
                      Name
                    </label>
                    <p className='text-sm text-gray-900'>
                      {selectedPersona.name}
                    </p>
                  </div>
                  {selectedPersona.role && (
                    <div>
                      <label className='text-xs font-medium text-gray-500 uppercase'>
                        Role
                      </label>
                      <p className='text-sm text-gray-900'>
                        {selectedPersona.role}
                      </p>
                    </div>
                  )}
                  {selectedPersona.systemPrompt && (
                    <div>
                      <label className='text-xs font-medium text-gray-500 uppercase'>
                        System Prompt
                      </label>
                      <p className='p-3 mt-1 text-sm text-gray-600 rounded-md bg-gray-50'>
                        {selectedPersona.systemPrompt}
                      </p>
                    </div>
                  )}
                  {selectedPersona.traits &&
                    selectedPersona.traits.length > 0 && (
                      <div>
                        <label className='text-xs font-medium text-gray-500 uppercase'>
                          Traits
                        </label>
                        <div className='flex flex-wrap gap-2 mt-1'>
                          {selectedPersona.traits.map((trait, idx) => (
                            <span
                              key={idx}
                              className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800'
                            >
                              {trait}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  {!selectedPersona.isActive && (
                    <button
                      onClick={() => handleActivate(selectedPersona.id)}
                      className='inline-flex items-center justify-center w-full px-4 py-2 mt-4 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700'
                    >
                      <Check className='w-4 h-4 mr-2' />
                      Activate Persona
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className='p-8 text-center border-2 border-gray-300 border-dashed rounded-lg bg-gray-50'>
              <MessageSquare className='w-12 h-12 mx-auto text-gray-400' />
              <h3 className='mt-4 text-sm font-medium text-gray-900'>
                Select a persona
              </h3>
              <p className='mt-1 text-sm text-gray-500'>
                Click on a persona to view details or create a new one
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
