/**
 * Skills Dashboard - Web UI for viewing skills and data
 * 
 * Provides a REST API and serves a simple dashboard UI.
 */

import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generate dashboard HTML
 */
function generateDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StaticRebel Skills Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #3b82f6;
      --success: #22c55e;
      --warning: #eab308;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    
    .container { max-width: 1200px; margin: 0 auto; }
    
    h1 { 
      font-size: 2rem; 
      margin-bottom: 2rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 1.5rem;
    }
    
    .card {
      background: var(--card);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
    }
    
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    
    .card-title {
      font-size: 1.25rem;
      font-weight: 600;
    }
    
    .badge {
      background: var(--accent);
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .badge.success { background: var(--success); }
    .badge.warning { background: var(--warning); color: black; }
    
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    
    .stat-row:last-child { border-bottom: none; }
    
    .stat-label { color: var(--muted); }
    .stat-value { font-weight: 600; }
    
    .progress-bar {
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
      margin: 0.5rem 0;
    }
    
    .progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    
    .progress-fill.complete { background: var(--success); }
    
    .streak {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.5rem;
      margin: 0.5rem 0;
    }
    
    .entries-list {
      max-height: 200px;
      overflow-y: auto;
      margin-top: 1rem;
    }
    
    .entry {
      padding: 0.5rem;
      background: rgba(255,255,255,0.05);
      border-radius: 6px;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
    }
    
    .entry-time {
      color: var(--muted);
      font-size: 0.75rem;
    }
    
    .chart {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 100px;
      margin-top: 1rem;
    }
    
    .chart-bar {
      flex: 1;
      background: var(--accent);
      border-radius: 4px 4px 0 0;
      min-width: 20px;
      position: relative;
    }
    
    .chart-bar:hover { opacity: 0.8; }
    
    .chart-label {
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.625rem;
      color: var(--muted);
    }
    
    .empty {
      color: var(--muted);
      text-align: center;
      padding: 2rem;
    }
    
    .refresh-btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
    }
    
    .refresh-btn:hover { opacity: 0.9; }
    
    #lastUpdate {
      color: var(--muted);
      font-size: 0.875rem;
      margin-left: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>
      🦞 Skills Dashboard
      <button class="refresh-btn" onclick="loadData()">Refresh</button>
      <span id="lastUpdate"></span>
    </h1>
    <div class="grid" id="skillsGrid">
      <div class="empty">Loading...</div>
    </div>
  </div>

  <script>
    async function loadData() {
      try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();
        renderDashboard(data);
        document.getElementById('lastUpdate').textContent = 
          'Updated: ' + new Date().toLocaleTimeString();
      } catch (err) {
        console.error('Failed to load:', err);
      }
    }

    function renderDashboard(data) {
      const grid = document.getElementById('skillsGrid');
      
      if (!data.skills || data.skills.length === 0) {
        grid.innerHTML = '<div class="empty">No skills yet. Start tracking something!</div>';
        return;
      }

      grid.innerHTML = data.skills.map(skill => renderSkillCard(skill)).join('');
    }

    function renderSkillCard(skill) {
      const { id, name, stats, goal, streak, recentEntries, weeklyData } = skill;
      
      let goalHtml = '';
      if (goal) {
        const percent = Math.min(100, Math.round((stats.todaySum / goal.daily) * 100));
        const complete = percent >= 100;
        goalHtml = \`
          <div class="stat-row">
            <span class="stat-label">Today's Goal</span>
            <span class="stat-value">\${stats.todaySum}/\${goal.daily}\${goal.unit || ''}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill \${complete ? 'complete' : ''}" style="width: \${percent}%"></div>
          </div>
        \`;
      }

      let streakHtml = '';
      if (streak && streak.current > 0) {
        streakHtml = \`
          <div class="streak">
            \${'🔥'.repeat(Math.min(streak.current, 7))} \${streak.current} day streak
          </div>
        \`;
      }

      let chartHtml = '';
      if (weeklyData && weeklyData.length > 0) {
        const max = Math.max(...weeklyData.map(d => d.value)) || 1;
        chartHtml = \`
          <div class="chart">
            \${weeklyData.map(d => \`
              <div class="chart-bar" style="height: \${(d.value / max) * 100}%">
                <span class="chart-label">\${d.day}</span>
              </div>
            \`).join('')}
          </div>
        \`;
      }

      let entriesHtml = '';
      if (recentEntries && recentEntries.length > 0) {
        entriesHtml = \`
          <div class="entries-list">
            \${recentEntries.slice(0, 5).map(e => \`
              <div class="entry">
                \${formatEntry(e)}
                <div class="entry-time">\${formatTime(e.timestamp)}</div>
              </div>
            \`).join('')}
          </div>
        \`;
      }

      return \`
        <div class="card">
          <div class="card-header">
            <span class="card-title">\${name}</span>
            <span class="badge">\${stats.totalEntries} entries</span>
          </div>
          
          \${goalHtml}
          \${streakHtml}
          
          <div class="stat-row">
            <span class="stat-label">Today</span>
            <span class="stat-value">\${stats.todayCount} entries (\${stats.todaySum || 0})</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">This Week</span>
            <span class="stat-value">\${stats.weekSum || 0}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Average</span>
            <span class="stat-value">\${stats.avg?.toFixed(1) || 0}</span>
          </div>
          
          \${chartHtml}
          \${entriesHtml}
        </div>
      \`;
    }

    function formatEntry(entry) {
      if (entry.value) return entry.value + (entry.note ? ' - ' + entry.note : '');
      if (entry.score) return '⭐ ' + entry.score + '/10' + (entry.note ? ' - ' + entry.note : '');
      if (entry.content) return entry.content.slice(0, 50);
      if (entry.duration) return entry.duration + ' min';
      return JSON.stringify(entry).slice(0, 50);
    }

    function formatTime(ts) {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return diffMins + 'm ago';
      if (diffHours < 24) return diffHours + 'h ago';
      return date.toLocaleDateString();
    }

    // Load on start and auto-refresh
    loadData();
    setInterval(loadData, 30000);
  </script>
</body>
</html>`;
}

/**
 * Create dashboard API handlers
 */
export function createDashboardAPI(skillManager, goalTracker) {
  return {
    /**
     * Get full dashboard data
     */
    async getDashboardData() {
      const skills = [];
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      for (const [id, skill] of skillManager.skills) {
        const allEntries = await skillManager.getEntries(id);
        const todayEntries = allEntries.filter(e => e.date === today);
        const weekEntries = allEntries.filter(e => e.date >= weekAgo);

        // Calculate stats
        const getValue = e => parseFloat(e.value) || parseFloat(e.score) || parseFloat(e.duration) || 1;
        const todaySum = todayEntries.reduce((sum, e) => sum + getValue(e), 0);
        const weekSum = weekEntries.reduce((sum, e) => sum + getValue(e), 0);
        const allValues = allEntries.map(getValue);
        const avg = allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;

        // Goal
        const goal = goalTracker?.getGoal(id);

        // Streak
        const streak = goalTracker?.calculateStreak(allEntries);

        // Weekly data for chart
        const weeklyData = [];
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const dayEntries = allEntries.filter(e => e.date === dateStr);
          const daySum = dayEntries.reduce((sum, e) => sum + getValue(e), 0);
          weeklyData.push({
            day: days[d.getDay()].slice(0, 2),
            date: dateStr,
            value: daySum
          });
        }

        skills.push({
          id,
          name: skill.name,
          description: skill.description,
          stats: {
            totalEntries: allEntries.length,
            todayCount: todayEntries.length,
            todaySum: Math.round(todaySum * 10) / 10,
            weekSum: Math.round(weekSum * 10) / 10,
            avg: Math.round(avg * 10) / 10
          },
          goal,
          streak,
          recentEntries: allEntries.slice(0, 10),
          weeklyData
        });
      }

      return { skills, generatedAt: Date.now() };
    }
  };
}

/**
 * Create and start the dashboard server
 */
export function createDashboardServer(skillManager, goalTracker, options = {}) {
  const port = options.port || 3456;
  const api = createDashboardAPI(skillManager, goalTracker);

  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${port}`);

    try {
      // API routes
      if (url.pathname === '/api/dashboard') {
        const data = await api.getDashboardData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      if (url.pathname === '/api/skills') {
        const skills = [...skillManager.skills.values()].map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          triggers: s.triggers
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ skills }));
        return;
      }

      if (url.pathname.startsWith('/api/skill/') && req.method === 'GET') {
        const skillId = url.pathname.split('/')[3];
        const entries = await skillManager.getEntries(skillId);
        const stats = await skillManager.getStats(skillId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ skillId, entries, stats }));
        return;
      }

      // Dashboard HTML
      if (url.pathname === '/' || url.pathname === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(generateDashboardHTML());
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));

    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  return {
    start() {
      return new Promise((resolve) => {
        server.listen(port, () => {
          console.log(`📊 Dashboard running at http://localhost:${port}`);
          resolve(server);
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        server.close(resolve);
      });
    },
    server
  };
}

export default { createDashboardAPI, createDashboardServer };
