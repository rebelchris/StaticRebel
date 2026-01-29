/**
 * Tasks Action
 * Lists scheduled tasks and reminders
 */

export default {
  name: 'tasks',
  displayName: 'Task Management',
  description: 'List scheduled tasks, reminders, and upcoming events',
  category: 'system',
  version: '1.0.0',

  intentExamples: [
    'scheduled tasks',
    'upcoming tasks',
    'what do I have scheduled',
    'what is planned',
    'show my tasks',
    'show my schedule',
    'show my reminders',
    'cancel a task',
    'list tasks',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['list', 'cancel'],
      description: 'Action to perform',
      default: 'list',
    },
  },

  dependencies: [
    'cronScheduler.listCronJobs',
    'cronScheduler.getNextRunTime',
    'cronScheduler.describeCron',
  ],

  async handler(input, context, params) {
    const { listCronJobs, getNextRunTime, describeCron } =
      context.modules.cronScheduler;

    const jobs = listCronJobs();
    const enabled = jobs.filter((j) => j.enabled);

    if (enabled.length === 0) {
      return 'You don\'t have any scheduled tasks yet. Say something like "Remind me to stretch every hour" and I\'ll set it up!';
    }

    return (
      `**Your Scheduled Tasks (${enabled.length}):**\n\n` +
      enabled
        .map((job) => {
          const next = getNextRunTime(job);
          return `- **${job.name}**\n  ${describeCron(job.schedule.expr)}\n  Next: ${next?.toLocaleString() || 'Unknown'}`;
        })
        .join('\n\n')
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
