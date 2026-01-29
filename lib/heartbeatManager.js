// Heartbeat Manager - Proactive periodic checks
import fs from 'fs';
import path from 'os';
import { loadConfig, getConfig } from './configManager.js';
import { getHeartbeatState, updateHeartbeatState } from './memoryManager.js';
import { spawn } from 'child_process';

let heartbeatInterval = null;
const CHECK_INTERVAL = 1800000; // 30 minutes default

export function getHeartbeatConfig() {
  const config = loadConfig();
  return config.heartbeat || {
    enabled: true,
    intervalMs: CHECK_INTERVAL,
    quietHours: { start: '23:00', end: '08:00' },
    checks: { email: true, calendar: true, mentions: true }
  };
}

// Check if currently in quiet hours
export function isQuietHours() {
  const config = getHeartbeatConfig();
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const start = config.quietHours?.start || '23:00';
  const end = config.quietHours?.end || '08:00';

  if (start > end) {
    // Quiet hours span midnight
    return currentTime >= start || currentTime <= end;
  }
  return currentTime >= start && currentTime <= end;
}

// Get list of checks to perform
export function getScheduledChecks() {
  const state = getHeartbeatState();
  const config = getHeartbeatConfig();
  const checks = [];
  const now = Date.now();
  const hourMs = 3600000;

  // Check email every 2 hours
  if (config.checks?.email && (!state.lastChecks?.email || now - state.lastChecks.email > 2 * hourMs)) {
    checks.push('email');
  }

  // Check calendar every 2 hours
  if (config.checks?.calendar && (!state.lastChecks?.calendar || now - state.lastChecks.calendar > 2 * hourMs)) {
    checks.push('calendar');
  }

  // Check mentions every hour
  if (config.checks?.mentions && (!state.lastChecks?.mentions || now - state.lastChecks.mentions > hourMs)) {
    checks.push('mentions');
  }

  return checks;
}

// Perform a check and return result
export async function performCheck(checkType) {
  const results = {
    email: { label: 'Email', result: null, urgent: false },
    calendar: { label: 'Calendar', result: null, urgent: false },
    mentions: { label: 'Mentions', result: null, urgent: false },
    weather: { label: 'Weather', result: null, urgent: false }
  };

  const state = getHeartbeatState();
  const now = Date.now();

  try {
    switch (checkType) {
      case 'email':
        // Placeholder: Would integrate with email API
        results.email.result = 'No urgent emails';
        break;

      case 'calendar':
        // Placeholder: Would integrate with calendar API
        const nextCheck = new Date(state.lastChecks?.calendar || now + 7200000);
        results.calendar.result = `Next event check: ${nextCheck.toLocaleString()}`;
        break;

      case 'mentions':
        // Placeholder: Would check Twitter/social
        results.mentions.result = 'No new mentions';
        break;

      case 'weather':
        // Placeholder: Would check weather API
        results.weather.result = 'Weather check skipped';
        break;
    }

    // Update last check time
    updateHeartbeatState({
      lastChecks: {
        ...state.lastChecks,
        [checkType]: now
      },
      lastHeartbeat: now
    });

    return results[checkType];
  } catch (error) {
    return {
      label: checkType.charAt(0).toUpperCase() + checkType.slice(1),
      result: `Error: ${error.message}`,
      urgent: false
    };
  }
}

// Perform all scheduled checks
export async function performAllScheduledChecks() {
  const checks = getScheduledChecks();
  const results = [];

  for (const check of checks) {
    const result = await performCheck(check);
    results.push(result);
  }

  return results;
}

// Determine if we should reach out to user
export function shouldReachOut(checkResults) {
  // Reach out if any check has urgent: true
  // Or if it's been >8 hours since last contact
  const state = getHeartbeatState();

  for (const result of checkResults) {
    if (result.urgent) return true;
  }

  const hoursSinceContact = (Date.now() - (state.lastHeartbeat || 0)) / 3600000;
  if (hoursSinceContact > 8) return true;

  return false;
}

// Format heartbeat message
export function formatHeartbeatMessage(checkResults) {
  if (checkResults.length === 0) {
    return 'HEARTBEAT_OK - Nothing needs attention';
  }

  const lines = ['Heartbeat Check Results:'];

  for (const result of checkResults) {
    lines.push(`- ${result.label}: ${result.result}`);
  }

  return lines.join('\n');
}

// Start heartbeat monitor
export function startHeartbeatMonitor(onCheck) {
  const config = getHeartbeatConfig();

  if (!config.enabled) {
    console.log('Heartbeat monitor is disabled');
    return null;
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(async () => {
    // Skip if in quiet hours
    if (isQuietHours()) {
      return;
    }

    // Perform scheduled checks
    const results = await performAllScheduledChecks();

    // Notify if needed
    if (results.length > 0 && onCheck) {
      const message = formatHeartbeatMessage(results);
      await onCheck(results, shouldReachOut(results));
    }
  }, config.intervalMs || CHECK_INTERVAL);

  return heartbeatInterval;
}

// Stop heartbeat monitor
export function stopHeartbeatMonitor() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// Get heartbeat status
export function getHeartbeatStatus() {
  const state = getHeartbeatState();
  const config = getHeartbeatConfig();

  return {
    enabled: config.enabled,
    running: heartbeatInterval !== null,
    quietHours: isQuietHours(),
    intervalMs: config.intervalMs || CHECK_INTERVAL,
    lastHeartbeat: state.lastHeartbeat,
    scheduledChecks: getScheduledChecks()
  };
}

// Configure heartbeat checks
export function configureHeartbeat(updates) {
  const config = loadConfig();

  if (!config.heartbeat) {
    config.heartbeat = {
      enabled: true,
      intervalMs: CHECK_INTERVAL,
      quietHours: { start: '23:00', end: '08:00' },
      checks: { email: true, calendar: true, mentions: true }
    };
  }

  Object.assign(config.heartbeat, updates);

  const configPath = path.join(process.env.HOME, '.static-rebel', 'config', 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  return config.heartbeat;
}

// Reset heartbeat state
export function resetHeartbeatState() {
  updateHeartbeatState({
    lastChecks: {
      email: null,
      calendar: null,
      mentions: null,
      weather: null
    },
    lastHeartbeat: null
  });
}
