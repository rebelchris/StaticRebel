/**
 * Natural Language Scheduling Conversation Handler
 * Processes conversational scheduling requests and integrates with chat system
 */

import {
  scheduleTask,
  listScheduledTasks,
  cancelScheduledTask,
  updateScheduledTask,
  previewSchedule,
  getSchedulingStatus
} from './index.js';

import { getExamplePatterns } from './natural-language.js';

/**
 * Detect if a message contains a scheduling intent
 * @param {string} message - User message
 * @returns {Object} Detection result with intent and extracted data
 */
export function detectSchedulingIntent(message) {
  const normalized = message.toLowerCase().trim();
  
  // Scheduling intent patterns
  const schedulingPatterns = [
    // Direct scheduling
    /remind me to (.+?) (every|at|in|tomorrow|today|daily|weekly)/,
    /schedule (.+?) (every|at|in|tomorrow|today|daily|weekly)/,
    /set (?:a )?(?:reminder|alarm) (?:to )?(.+?) (every|at|in|tomorrow|today|daily|weekly)/,
    
    // Question patterns
    /can you remind me to (.+?) (every|at|in|tomorrow|today|daily|weekly)/,
    /could you (?:remind me|schedule) (.+?) (every|at|in|tomorrow|today|daily|weekly)/,
    /(?:please )?(?:remind me|schedule) (?:to )?(.+?) (every|at|in|tomorrow|today|daily|weekly)/,
    
    // Task-specific patterns
    /(?:remind me to )?(.+?) (?:every|at|in|tomorrow|today|daily|weekly) (.+)/,
  ];
  
  // List/manage intent patterns
  const managementPatterns = [
    /(?:show|list|what are) (?:my )?(?:reminders|scheduled tasks|schedules)/,
    /cancel (?:the )?(?:reminder|task|schedule) (.+)/,
    /delete (?:the )?(?:reminder|task|schedule) (.+)/,
    /remove (?:the )?(?:reminder|task|schedule) (.+)/,
    /stop (?:reminding me|the reminder) (.+)/,
    /update (?:the )?(?:reminder|task|schedule) (.+)/,
    /change (?:the )?(?:reminder|task|schedule) (.+)/
  ];
  
  // Check for scheduling intent
  for (const pattern of schedulingPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        type: 'schedule',
        detected: true,
        confidence: 0.9,
        task: match[1]?.trim(),
        timePattern: extractTimePattern(normalized),
        originalMessage: message
      };
    }
  }
  
  // Check for management intent
  for (const pattern of managementPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        type: 'manage',
        detected: true,
        confidence: 0.8,
        action: extractManagementAction(normalized),
        target: match[1]?.trim(),
        originalMessage: message
      };
    }
  }
  
  // Weak patterns for potential scheduling
  const weakPatterns = [
    /every \d+ (hours?|minutes?|days?)/,
    /at \d{1,2}(:\d{2})?\s*(am|pm)/,
    /(?:daily|weekly|monthly)/,
    /(?:tomorrow|today)/,
    /in \d+ (minutes?|hours?)/
  ];
  
  for (const pattern of weakPatterns) {
    if (normalized.match(pattern)) {
      return {
        type: 'potential',
        detected: true,
        confidence: 0.5,
        timePattern: extractTimePattern(normalized),
        originalMessage: message
      };
    }
  }
  
  return {
    type: 'none',
    detected: false,
    confidence: 0
  };
}

/**
 * Process a scheduling conversation request
 * @param {string} message - User message
 * @param {Object} context - Conversation context
 * @returns {Object} Response with success/failure and reply message
 */
export function processSchedulingRequest(message, context = {}) {
  const intent = detectSchedulingIntent(message);
  
  if (!intent.detected) {
    return {
      success: false,
      type: 'no_intent',
      reply: null
    };
  }
  
  try {
    switch (intent.type) {
      case 'schedule':
        return handleScheduleRequest(intent);
        
      case 'manage':
        return handleManagementRequest(intent);
        
      case 'potential':
        return handlePotentialScheduling(intent);
        
      default:
        return {
          success: false,
          type: 'unknown_intent',
          reply: "I'm not sure what you'd like me to schedule. Try something like 'Remind me to drink water every 2 hours'."
        };
    }
    
  } catch (error) {
    return {
      success: false,
      type: 'error',
      reply: `Sorry, I couldn't process that scheduling request: ${error.message}`
    };
  }
}

/**
 * Handle direct scheduling requests
 */
function handleScheduleRequest(intent) {
  const timePattern = intent.timePattern;
  const taskMessage = intent.task;
  
  if (!timePattern) {
    return {
      success: false,
      type: 'no_time',
      reply: `I'd be happy to remind you about "${taskMessage}", but I need to know when. Try: "Remind me to ${taskMessage} every 2 hours" or "Remind me to ${taskMessage} at 9pm daily".`
    };
  }
  
  if (!taskMessage) {
    return {
      success: false,
      type: 'no_task',
      reply: "I can set up a reminder, but what would you like me to remind you about?"
    };
  }
  
  // Try to schedule the task
  const result = scheduleTask(timePattern, {
    message: taskMessage,
    action: 'remind',
    name: `Reminder: ${taskMessage}`
  });
  
  if (result.success) {
    return {
      success: true,
      type: 'scheduled',
      jobId: result.job.id,
      reply: result.confirmation
    };
  } else {
    // Provide helpful error with examples
    const examples = getExamplePatterns().slice(0, 3).map(ex => `"${ex}"`).join(', ');
    return {
      success: false,
      type: 'parse_error',
      reply: `${result.error}\n\nTry patterns like: ${examples}`
    };
  }
}

/**
 * Handle task management requests (list, cancel, update)
 */
function handleManagementRequest(intent) {
  const action = intent.action;
  
  switch (action) {
    case 'list':
      return handleListTasks();
      
    case 'cancel':
    case 'delete':
    case 'remove':
    case 'stop':
      return handleCancelTask(intent.target);
      
    case 'update':
    case 'change':
      return handleUpdateTask(intent.target);
      
    default:
      return {
        success: false,
        type: 'unknown_action',
        reply: "I can help you list, cancel, or update your scheduled tasks. What would you like to do?"
      };
  }
}

/**
 * Handle potential scheduling (weak patterns)
 */
function handlePotentialScheduling(intent) {
  const timePattern = intent.timePattern;
  
  if (timePattern) {
    const preview = previewSchedule(timePattern);
    if (preview.success) {
      return {
        success: false,
        type: 'clarification_needed',
        reply: `I see you mentioned "${timePattern}" - would you like me to schedule something ${preview.schedule.description}? If so, tell me what to remind you about!`
      };
    }
  }
  
  return {
    success: false,
    type: 'unclear',
    reply: "It sounds like you might want to schedule something. Try: 'Remind me to [task] [when]' - for example, 'Remind me to drink water every 2 hours'."
  };
}

/**
 * Handle listing scheduled tasks
 */
function handleListTasks() {
  const tasks = listScheduledTasks();
  const nlTasks = tasks.filter(task => task.isNaturalLanguage);
  
  if (nlTasks.length === 0) {
    return {
      success: true,
      type: 'empty_list',
      reply: "You don't have any scheduled reminders yet. Say something like 'Remind me to drink water every 2 hours' to create one!"
    };
  }
  
  const taskList = nlTasks.map((task, index) => {
    const status = task.enabled ? '✓' : '⏸️';
    const oneTime = task.isOneTime ? ' (one-time)' : '';
    return `${index + 1}. ${status} ${task.humanReadable}${oneTime}`;
  }).join('\n');
  
  return {
    success: true,
    type: 'task_list',
    reply: `Your scheduled reminders:\n\n${taskList}\n\nTo cancel a reminder, say "cancel reminder [number]" or describe what you want to cancel.`
  };
}

/**
 * Handle canceling a specific task
 */
function handleCancelTask(target) {
  if (!target) {
    return {
      success: false,
      type: 'no_target',
      reply: "Which reminder would you like to cancel? You can say 'list reminders' to see all your scheduled tasks."
    };
  }
  
  const tasks = listScheduledTasks().filter(task => task.isNaturalLanguage);
  
  // Try to find task by number
  const taskNumber = parseInt(target);
  if (!isNaN(taskNumber) && taskNumber > 0 && taskNumber <= tasks.length) {
    const task = tasks[taskNumber - 1];
    const result = cancelScheduledTask(task.id);
    
    if (result.success) {
      return {
        success: true,
        type: 'cancelled',
        reply: result.confirmation
      };
    }
  }
  
  // Try to find task by description match
  const matchingTask = tasks.find(task => 
    task.description?.toLowerCase().includes(target.toLowerCase()) ||
    task.task?.message?.toLowerCase().includes(target.toLowerCase()) ||
    task.humanReadable?.toLowerCase().includes(target.toLowerCase())
  );
  
  if (matchingTask) {
    const result = cancelScheduledTask(matchingTask.id);
    
    if (result.success) {
      return {
        success: true,
        type: 'cancelled',
        reply: result.confirmation
      };
    }
  }
  
  return {
    success: false,
    type: 'not_found',
    reply: `I couldn't find a reminder matching "${target}". Say 'list reminders' to see your current tasks.`
  };
}

/**
 * Handle updating a task (simplified - just suggest recreating)
 */
function handleUpdateTask(target) {
  return {
    success: false,
    type: 'update_not_supported',
    reply: "To update a reminder, please cancel the existing one and create a new one. Say 'list reminders' to see your current tasks."
  };
}

/**
 * Extract time pattern from message
 */
function extractTimePattern(message) {
  const patterns = [
    /every \d+ (?:hours?|minutes?|seconds?)/,
    /at \d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s+every\s+day|daily)?/,
    /every (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun) at \d{1,2}(?::\d{2})?\s*(?:am|pm)?/,
    /(?:daily|weekly) at \d{1,2}(?::\d{2})?\s*(?:am|pm)?/,
    /in \d+ (?:minutes?|hours?)/,
    /tomorrow at (?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)/,
    /today at (?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)/,
    /(?:daily|weekly|monthly)/,
    /every (?:day|week|month)/
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

/**
 * Extract management action from message
 */
function extractManagementAction(message) {
  if (message.includes('list') || message.includes('show')) {
    return 'list';
  }
  if (message.includes('cancel') || message.includes('delete') || message.includes('remove')) {
    return 'cancel';
  }
  if (message.includes('stop')) {
    return 'stop';
  }
  if (message.includes('update') || message.includes('change')) {
    return 'update';
  }
  return 'unknown';
}

/**
 * Get help text for scheduling commands
 */
export function getSchedulingHelp() {
  const examples = getExamplePatterns().slice(0, 5);
  
  return `**Natural Language Scheduling**

I can help you schedule reminders using natural language! Here are some examples:

**Scheduling:**
${examples.map(ex => `• "Remind me to [task] ${ex}"`).join('\n')}

**Managing:**
• "List my reminders" - Show all scheduled tasks
• "Cancel reminder [description/number]" - Remove a reminder
• "Cancel reminder 2" - Cancel the 2nd reminder in the list

**Supported patterns:**
${examples.map(ex => `• ${ex}`).join('\n')}

Try saying something like "Remind me to drink water every 2 hours"!`;
}

/**
 * Generate scheduling statistics for reporting
 */
export function getSchedulingStats() {
  const tasks = listScheduledTasks();
  const nlTasks = tasks.filter(task => task.isNaturalLanguage);
  const activeTasks = nlTasks.filter(task => task.enabled);
  const oneTimeTasks = nlTasks.filter(task => task.isOneTime);
  const recurringTasks = nlTasks.filter(task => !task.isOneTime);
  
  return {
    totalTasks: nlTasks.length,
    activeTasks: activeTasks.length,
    oneTimeTasks: oneTimeTasks.length,
    recurringTasks: recurringTasks.length,
    disabledTasks: nlTasks.length - activeTasks.length
  };
}