/**
 * Status Action
 * Shows system status and health information
 */

export default {
  name: 'status',
  displayName: 'System Status',
  description: 'Check system status, heartbeat, scheduler, and subagent stats',
  category: 'system',
  version: '1.0.0',

  intentExamples: [
    'how are you',
    'what is your status',
    'system status',
    'heartbeat',
    'check on everything',
    'check up on me',
    'show status',
    'status check',
  ],

  parameters: {},

  dependencies: [
    'memoryManager.getMemoryStats',
    'cronScheduler.getSchedulerStatus',
    'heartbeatManager.getHeartbeatStatus',
    'subagentManager.getSubagentStats',
  ],

  async handler(input, context, params) {
    const {
      getMemoryStats,
      getSchedulerStatus,
      getHeartbeatStatus,
      getSubagentStats,
    } = context.modules;

    const memStats = getMemoryStats();
    const schedulerStatus = getSchedulerStatus();
    const heartbeatStatus = getHeartbeatStatus();
    const subagentStats = getSubagentStats();

    return (
      `**System Status**\n\n` +
      `**Heartbeat**: ${heartbeatStatus.running ? '✅ Monitoring' : '❌ Stopped'}\n` +
      `**Scheduler**: ${schedulerStatus.enabledCount} active tasks\n` +
      `**Subagents**: ${subagentStats.active} active\n` +
      `**Memory**: ${memStats.dailyFiles} daily files\n\n` +
      `Everything's running smoothly!`
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
