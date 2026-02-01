/**
 * Scheduling Coordinator
 * Integrates natural language parsing with the existing cron scheduler
 */

import {
  addCronJob,
  updateCronJob,
  deleteCronJob,
  getCronJob,
  listCronJobs,
  startScheduler,
  stopScheduler,
  getSchedulerStatus
} from '../cronScheduler.js';

import {
  parseNaturalLanguage,
  describeSchedule,
  validateSchedule,
  getExamplePatterns
} from './natural-language.js';

/**
 * Create a scheduled task from natural language
 * @param {string} naturalLanguage - Natural language expression like "every 2 hours"
 * @param {Object} taskConfig - Task configuration
 * @param {string} taskConfig.action - Action to perform
 * @param {string} taskConfig.message - User message/reminder
 * @param {Object} taskConfig.data - Additional task data
 * @returns {Object} Created job with human-readable confirmation
 */
export function scheduleTask(naturalLanguage, taskConfig) {
  try {
    // Parse the natural language input
    const schedule = parseNaturalLanguage(naturalLanguage);
    
    // Validate the parsed schedule
    const validation = validateSchedule(schedule);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    // Prepare job configuration for cronScheduler
    const jobConfig = {
      name: taskConfig.name || `Task: ${taskConfig.message || taskConfig.action}`,
      description: taskConfig.message || taskConfig.action,
      schedule: {
        type: schedule.type,
        expr: schedule.expr,
        interval: schedule.interval
      },
      task: {
        type: 'reminder', // Default task type
        action: taskConfig.action,
        message: taskConfig.message,
        data: taskConfig.data || {}
      },
      metadata: {
        originalInput: naturalLanguage,
        parsedAs: schedule.description,
        createdBy: 'natural-language-scheduler',
        oneTime: schedule.oneTime || false
      }
    };
    
    // For interval-based schedules, we need to handle them differently
    if (schedule.type === 'interval') {
      // Convert interval to a repeating execution pattern
      jobConfig.schedule.type = 'interval';
      jobConfig.schedule.intervalMs = schedule.interval;
      
      // Create a pseudo-cron that runs every minute to check intervals
      jobConfig.schedule.expr = '* * * * *';
    }
    
    // Add the job to the cron scheduler
    const createdJob = addCronJob(jobConfig);
    
    // Generate human-readable confirmation
    const confirmation = generateConfirmation(createdJob, schedule);
    
    return {
      success: true,
      job: createdJob,
      confirmation,
      schedule: {
        type: schedule.type,
        description: schedule.description,
        originalInput: naturalLanguage
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      examples: getExamplePatterns()
    };
  }
}

/**
 * List all scheduled tasks with human-readable descriptions
 * @returns {Array} Array of enhanced job objects
 */
export function listScheduledTasks() {
  const jobs = listCronJobs();
  
  return jobs.map(job => ({
    ...job,
    humanReadable: job.metadata?.parsedAs || job.description,
    originalInput: job.metadata?.originalInput,
    isOneTime: job.metadata?.oneTime || false,
    isNaturalLanguage: !!job.metadata?.createdBy?.includes('natural-language')
  }));
}

/**
 * Cancel a scheduled task
 * @param {string} jobId - Job ID to cancel
 * @returns {Object} Result with confirmation message
 */
export function cancelScheduledTask(jobId) {
  const job = getCronJob(jobId);
  if (!job) {
    return {
      success: false,
      error: 'Task not found'
    };
  }
  
  const deleted = deleteCronJob(jobId);
  if (deleted) {
    return {
      success: true,
      confirmation: `Cancelled task: ${job.metadata?.parsedAs || job.name}`
    };
  } else {
    return {
      success: false,
      error: 'Failed to cancel task'
    };
  }
}

/**
 * Update a scheduled task
 * @param {string} jobId - Job ID to update
 * @param {string} newSchedule - New natural language schedule
 * @param {Object} newTaskConfig - Updated task configuration
 * @returns {Object} Result with confirmation
 */
export function updateScheduledTask(jobId, newSchedule, newTaskConfig = {}) {
  const existingJob = getCronJob(jobId);
  if (!existingJob) {
    return {
      success: false,
      error: 'Task not found'
    };
  }
  
  try {
    // Parse the new schedule if provided
    let scheduleUpdate = {};
    let parsedSchedule = null;
    
    if (newSchedule) {
      parsedSchedule = parseNaturalLanguage(newSchedule);
      const validation = validateSchedule(parsedSchedule);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      
      scheduleUpdate = {
        schedule: {
          type: parsedSchedule.type,
          expr: parsedSchedule.expr,
          interval: parsedSchedule.interval
        },
        metadata: {
          ...existingJob.metadata,
          originalInput: newSchedule,
          parsedAs: parsedSchedule.description,
          oneTime: parsedSchedule.oneTime || false
        }
      };
    }
    
    // Merge task configuration updates
    const taskUpdate = {};
    if (newTaskConfig.message) {
      taskUpdate.task = {
        ...existingJob.task,
        message: newTaskConfig.message
      };
      taskUpdate.description = newTaskConfig.message;
    }
    if (newTaskConfig.action) {
      taskUpdate.task = {
        ...existingJob.task,
        action: newTaskConfig.action
      };
    }
    if (newTaskConfig.data) {
      taskUpdate.task = {
        ...existingJob.task,
        data: { ...existingJob.task.data, ...newTaskConfig.data }
      };
    }
    
    // Apply updates
    const updatedJob = updateCronJob(jobId, {
      ...scheduleUpdate,
      ...taskUpdate
    });
    
    const confirmation = parsedSchedule 
      ? generateConfirmation(updatedJob, parsedSchedule)
      : `Updated task: ${updatedJob.metadata?.parsedAs || updatedJob.name}`;
    
    return {
      success: true,
      job: updatedJob,
      confirmation
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      examples: getExamplePatterns()
    };
  }
}

/**
 * Get scheduler status with enhanced information
 */
export function getSchedulingStatus() {
  const status = getSchedulerStatus();
  const jobs = listCronJobs();
  
  const nlJobs = jobs.filter(job => job.metadata?.createdBy?.includes('natural-language'));
  const activeJobs = jobs.filter(job => job.enabled);
  const oneTimeJobs = jobs.filter(job => job.metadata?.oneTime);
  
  return {
    ...status,
    naturalLanguageJobs: nlJobs.length,
    activeJobs: activeJobs.length,
    oneTimeJobs: oneTimeJobs.length,
    totalJobs: jobs.length
  };
}

/**
 * Start the scheduling system
 * @param {Function} taskExecutor - Function to execute tasks
 */
export function startScheduling(taskExecutor) {
  return startScheduler((job) => {
    // Handle interval-based jobs
    if (job.schedule.type === 'interval') {
      const lastRun = job.state?.lastIntervalRun || 0;
      const now = Date.now();
      
      if (now - lastRun >= job.schedule.intervalMs) {
        // Update last interval run time
        updateCronJob(job.id, {
          state: {
            ...job.state,
            lastIntervalRun: now
          }
        });
        
        // Execute the task
        taskExecutor(job);
      }
    } else {
      // Regular cron-based execution
      taskExecutor(job);
    }
  });
}

/**
 * Stop the scheduling system
 */
export function stopScheduling() {
  return stopScheduler();
}

/**
 * Generate human-readable confirmation message
 */
function generateConfirmation(job, schedule) {
  const taskDescription = job.task.message || job.task.action;
  const scheduleDescription = schedule.description;
  
  if (schedule.oneTime) {
    return `✓ Scheduled "${taskDescription}" ${scheduleDescription}`;
  } else {
    return `✓ Scheduled "${taskDescription}" to run ${scheduleDescription}`;
  }
}

/**
 * Test scheduling with example natural language inputs
 */
export function testScheduling() {
  const examples = [
    {
      input: 'every 2 hours',
      task: { message: 'Drink water', action: 'remind' }
    },
    {
      input: 'at 9pm every day',
      task: { message: 'Log your mood', action: 'remind' }
    },
    {
      input: 'every Monday at 10am',
      task: { message: 'Weekly team standup', action: 'remind' }
    },
    {
      input: 'in 30 minutes',
      task: { message: 'Check on the laundry', action: 'remind' }
    }
  ];
  
  const results = [];
  
  for (const example of examples) {
    const result = scheduleTask(example.input, example.task);
    results.push({
      input: example.input,
      task: example.task,
      result: result.success ? result.confirmation : result.error
    });
  }
  
  return results;
}

/**
 * Parse and validate natural language without creating a job
 * Useful for preview/validation before scheduling
 */
export function previewSchedule(naturalLanguage) {
  try {
    const schedule = parseNaturalLanguage(naturalLanguage);
    const validation = validateSchedule(schedule);
    
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }
    
    return {
      success: true,
      schedule: {
        type: schedule.type,
        description: schedule.description,
        expression: schedule.expr,
        interval: schedule.interval,
        oneTime: schedule.oneTime || false
      },
      preview: `Would run ${schedule.description}`
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      examples: getExamplePatterns()
    };
  }
}