'use client';

import { useEffect, useState } from 'react';
import { Activity, Plus, Target, Flame, TrendingUp, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Skill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  stats: {
    totalEntries: number;
    todayCount: number;
    todaySum: number;
    weekSum: number;
  };
  goal: {
    daily?: number;
    weekly?: number;
    unit?: string;
  } | null;
  streak: {
    current: number;
    longest: number;
  };
  weeklyData: { day: string; value: number }[];
  recentEntries: any[];
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [logValue, setLogValue] = useState('');

  useEffect(() => {
    fetchSkills();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSkills, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSkills = async () => {
    try {
      const response = await fetch('/api/skills');
      if (response.ok) {
        const data = await response.json();
        setSkills(data.skills || []);
      }
    } catch (error) {
      console.error('Failed to fetch skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const logEntry = async (skillId: string, value: number) => {
    try {
      const response = await fetch(`/api/skills/${skillId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      if (response.ok) {
        fetchSkills();
        setLogValue('');
        setSelectedSkill(null);
      }
    } catch (error) {
      console.error('Failed to log entry:', error);
    }
  };

  const getProgressPercent = (skill: Skill) => {
    if (!skill.goal?.daily) return 0;
    return Math.min(100, Math.round((skill.stats.todaySum / skill.goal.daily) * 100));
  };

  const getMaxChartValue = (data: { value: number }[]) => {
    return Math.max(...data.map(d => d.value), 1);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Skills</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track habits, health, and activities with intelligent insights
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Skill
        </button>
      </div>

      {/* Skills Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-gray-500">Loading skills...</p>
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm">
          <Activity className="h-12 w-12 text-gray-400 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No skills yet</h3>
          <p className="mt-2 text-gray-500">Create your first skill to start tracking!</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Skill
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {skills.map((skill) => (
              <motion.div
                key={skill.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden"
              >
                {/* Card Header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Activity className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{skill.name}</h3>
                        <p className="text-xs text-gray-500">{skill.stats.totalEntries} entries</p>
                      </div>
                    </div>
                    
                    {/* Streak Badge */}
                    {skill.streak.current > 0 && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-orange-50 rounded-full">
                        <Flame className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium text-orange-600">
                          {skill.streak.current}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Goal Progress */}
                {skill.goal?.daily && (
                  <div className="px-5 py-3 bg-gray-50">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600">Today&apos;s Goal</span>
                      <span className="font-medium">
                        {skill.stats.todaySum} / {skill.goal.daily}
                        {skill.goal.unit && <span className="text-gray-400 ml-1">{skill.goal.unit}</span>}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${getProgressPercent(skill)}%` }}
                        className={`h-full rounded-full ${
                          getProgressPercent(skill) >= 100 ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* Weekly Chart */}
                <div className="px-5 py-4">
                  <div className="flex items-end gap-1 h-16">
                    {skill.weeklyData.map((day, i) => {
                      const max = getMaxChartValue(skill.weeklyData);
                      const height = max > 0 ? (day.value / max) * 100 : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-blue-200 rounded-t transition-all hover:bg-blue-300"
                            style={{ height: `${Math.max(height, 4)}%` }}
                          />
                          <span className="text-[10px] text-gray-400">{day.day.slice(0, 2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-gray-500">Today:</span>
                    <span className="ml-1 font-medium">{skill.stats.todayCount} entries</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Week:</span>
                    <span className="ml-1 font-medium">{skill.stats.weekSum}</span>
                  </div>
                </div>

                {/* Quick Log Button */}
                <div className="px-5 py-3 border-t border-gray-100">
                  <button
                    onClick={() => setSelectedSkill(skill)}
                    className="w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Quick Log
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Quick Log Modal */}
      <AnimatePresence>
        {selectedSkill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setSelectedSkill(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Log {selectedSkill.name}</h3>
              <input
                type="number"
                value={logValue}
                onChange={(e) => setLogValue(e.target.value)}
                placeholder={`Enter value${selectedSkill.goal?.unit ? ` (${selectedSkill.goal.unit})` : ''}`}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setSelectedSkill(null)}
                  className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => logValue && logEntry(selectedSkill.id, parseFloat(logValue))}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Log Entry
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Skill Modal */}
      <AnimatePresence>
        {showModal && (
          <CreateSkillModal 
            onClose={() => setShowModal(false)} 
            onCreated={() => {
              setShowModal(false);
              fetchSkills();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateSkillModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggers, setTriggers] = useState('');
  const [dataType, setDataType] = useState('number');
  const [unit, setUnit] = useState('');
  const [dailyGoal, setDailyGoal] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          triggers: triggers.split(',').map(t => t.trim()).filter(Boolean),
          dataType,
          unit: unit.trim(),
          dailyGoal: dailyGoal ? parseFloat(dailyGoal) : undefined
        })
      });
      
      if (response.ok) {
        onCreated();
      }
    } catch (error) {
      console.error('Failed to create skill:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">Create New Skill</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Water, Exercise, Mood"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this track?"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Words</label>
            <input
              type="text"
              value={triggers}
              onChange={(e) => setTriggers(e.target.value)}
              placeholder="water, drank, hydrate (comma separated)"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="number">Number</option>
                <option value="counter">Counter</option>
                <option value="scale">Scale (1-10)</option>
                <option value="duration">Duration</option>
                <option value="text">Text</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="ml, cups, min"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Daily Goal (optional)</label>
            <input
              type="number"
              value={dailyGoal}
              onChange={(e) => setDailyGoal(e.target.value)}
              placeholder="e.g., 2000"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Skill'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
