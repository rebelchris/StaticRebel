/**
 * Schedule Action
 * Creates scheduled reminders and cron jobs
 */

export default {
  name: 'schedule',
  displayName: 'Schedule Reminders',
  description: 'Create scheduled reminders, set alarms, and manage cron jobs',
  category: 'utility',
  version: '1.0.0',

  intentExamples: [
    'remind me to',
    'schedule',
    'set a reminder',
    'set an alarm',
    'every day at',
    'every week',
    'on monday',
    'at 3pm',
    'create a scheduled task',
    'add a task',
    'cron job',
  ],

  parameters: {
    task: {
      type: 'string',
      description: 'The task or reminder text',
    },
    time: {
      type: 'string',
      description: 'Time specification (e.g., 3pm, 14:00)',
    },
    day: {
      type: 'string',
      description: 'Day specification (e.g., monday, every day)',
    },
  },

  dependencies: [
    'cronScheduler.addCronJob',
    'cronScheduler.getNextRunTime',
    'cronScheduler.describeCron',
  ],

  async handler(input, context, params) {
    const { addCronJob, getNextRunTime, describeCron } =
      context.modules.cronScheduler;

    // Extract time pattern
    const timeMatch = input.match(/(\d{1,2})(:(\d{2}))?( ?(am|pm))?/i);
    const daysMatch = input.match(
      /(every |on )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    );
    const taskMatch = input
      .replace(
        /remind me to?|schedule|every|at \d{1,2}(:\d{2})?( ?(am|pm))?/gi,
        '',
      )
      .trim();

    let cronExpr = '* * * * *';

    // Parse time
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = timeMatch[3] || '0';
      const period = (timeMatch[4] || '').toLowerCase();

      if (period === 'pm' && hour < 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;

      cronExpr = `${minute} ${hour} * * *`;
    }

    // Parse days
    const dayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    if (daysMatch) {
      const day = dayMap[daysMatch[2].toLowerCase()];
      cronExpr = cronExpr.replace('* *', `* ${day}`);
    }

    // Parse task
    const taskName = taskMatch || 'Scheduled Task';

    const job = addCronJob({
      name: taskName,
      schedule: { expr: cronExpr },
      payload: { text: input },
    });

    const nextRun = getNextRunTime(job);
    const humanSchedule = describeCron(cronExpr);

    return `✅ Done! I've scheduled "${taskName}" to run ${humanSchedule}.\nNext run: ${nextRun?.toLocaleString() || 'soon'}`;
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
