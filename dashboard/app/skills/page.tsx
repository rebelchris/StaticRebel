'use client';

import { useEffect, useState } from 'react';
import { Activity, Plus, Target, Flame, TrendingUp, RefreshCw, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  unit: string;
  dailyGoal: number | null;
  triggers: string[];
  stats: {
    totalEntries: number;
    todayCount: number;
    todaySum: number;
    weekSum: number;
  };
  streak: number;
  weeklyData: { day: string; date: string; value: number }[];
  recentEntries: any[];
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/skills');
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
        setSkills([]);
      } else {
        setSkills(data.skills || []);
      }
    } catch (err: any) {
      setError(err.message);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercent = (skill: Skill) => {
    if (!skill.dailyGoal) return null;
    return Math.min(100, Math.round((skill.stats.todaySum / skill.dailyGoal) * 100));
  };

  const getProgressBar = (percent: number) => {
    const filled = Math.round(percent / 10);
    return '▓'.repeat(filled) + '░'.repeat(10 - filled);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Skills</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track habits via the chat interface
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchSkills}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <Link
            href="/chat"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Open Chat
          </Link>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700 text-sm">{error}</p>
          <p className="text-red-500 text-xs mt-1">
            Make sure ~/.static-rebel/skills/ exists with skill .md files
          </p>
        </div>
      )}

      {/* Empty State */}
      {!error && skills.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <Activity className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No skills yet</h3>
          <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
            Start tracking by going to the chat and saying something like:
          </p>
          <div className="mt-4 space-y-2">
            <code className="block text-sm bg-white px-4 py-2 rounded border">"drank 500ml water"</code>
            <code className="block text-sm bg-white px-4 py-2 rounded border">"walked 5000 steps"</code>
            <code className="block text-sm bg-white px-4 py-2 rounded border">"did 20 pushups"</code>
          </div>
          <Link
            href="/chat"
            className="mt-6 inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Start Tracking
          </Link>
        </div>
      )}

      {/* Skills Grid */}
      {skills.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {skills.map((skill) => {
            const progress = getProgressPercent(skill);
            
            return (
              <motion.div
                key={skill.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{skill.icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{skill.name}</h3>
                        <p className="text-xs text-gray-500">{skill.description}</p>
                      </div>
                    </div>
                    {skill.streak > 0 && (
                      <div className="flex items-center gap-1 text-orange-500 bg-orange-50 px-2 py-1 rounded-full">
                        <Flame className="h-3 w-3" />
                        <span className="text-xs font-medium">{skill.streak}</span>
                      </div>
                    )}
                  </div>

                  {/* Today's Stats */}
                  <div className="mt-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-gray-900">
                        {skill.stats.todaySum}
                      </span>
                      <span className="text-sm text-gray-500">{skill.unit}</span>
                      {skill.dailyGoal && (
                        <span className="text-sm text-gray-400">
                          / {skill.dailyGoal}
                        </span>
                      )}
                    </div>
                    
                    {/* Progress Bar */}
                    {progress !== null && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Today's progress</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              progress >= 100 ? 'bg-green-500' : 'bg-primary-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        {progress >= 100 && (
                          <p className="text-xs text-green-600 mt-1">🎉 Goal reached!</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Weekly Chart */}
                <div className="px-5 pb-4">
                  <div className="flex items-end justify-between h-16 gap-1">
                    {skill.weeklyData.map((day, i) => {
                      const maxVal = Math.max(...skill.weeklyData.map(d => d.value), skill.dailyGoal || 1);
                      const height = maxVal > 0 ? (day.value / maxVal) * 100 : 0;
                      const isToday = day.date === new Date().toISOString().split('T')[0];
                      
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div 
                            className={`w-full rounded-t transition-all ${
                              isToday ? 'bg-primary-500' : 'bg-gray-200'
                            }`}
                            style={{ height: `${Math.max(4, height)}%` }}
                            title={`${day.day}: ${day.value} ${skill.unit}`}
                          />
                          <span className={`text-xs ${isToday ? 'text-primary-600 font-medium' : 'text-gray-400'}`}>
                            {day.day.slice(0, 1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{skill.stats.totalEntries} total entries</span>
                    <span>This week: {skill.stats.weekSum} {skill.unit}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Quick Log Tip */}
      {skills.length > 0 && (
        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-sm text-blue-800">
            <strong>💡 Tip:</strong> Log entries via the chat. Just say things like:
            <span className="ml-2 font-mono bg-blue-100 px-2 py-0.5 rounded">"drank 500ml water"</span>
            <span className="ml-2 font-mono bg-blue-100 px-2 py-0.5 rounded">"mood: great"</span>
          </p>
        </div>
      )}
    </div>
  );
}
