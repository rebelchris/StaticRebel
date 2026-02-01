/**
 * Natural Language Scheduling Parser
 * Converts natural language expressions into cron schedules or intervals
 * 
 * Supported patterns:
 * - "every X hours/minutes" -> interval-based scheduling
 * - "at Xpm every day" -> daily cron
 * - "every Monday at Xam" -> weekly cron  
 * - "in X minutes" -> one-time delay
 * - "tomorrow at noon" -> specific date/time
 * - "daily at X" -> daily cron
 * - "weekly on X" -> weekly cron
 */

const DAYS_OF_WEEK = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};

const MONTH_NAMES = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12
};

/**
 * Parse natural language into a schedule configuration
 * @param {string} input - Natural language scheduling expression
 * @returns {Object} Schedule configuration with type, cron/interval, and description
 */
export function parseNaturalLanguage(input) {
  const normalized = input.toLowerCase().trim();
  
  // Try different parsing strategies in order of specificity
  const parsers = [
    parseInterval,
    parseDailyTime,
    parseWeeklyTime,
    parseSpecificDateTime,
    parseRelativeTime,
    parseEveryPattern,
    parseAtPattern
  ];

  for (const parser of parsers) {
    const result = parser(normalized);
    if (result) {
      return {
        ...result,
        original: input,
        parsed: normalized
      };
    }
  }

  throw new Error(`Unable to parse: "${input}". Supported patterns: "every 2 hours", "at 9pm daily", "every Monday at 10am", "in 30 minutes", "tomorrow at noon"`);
}

/**
 * Parse interval-based patterns like "every 2 hours", "every 30 minutes"
 */
function parseInterval(input) {
  // Match "every X hours/minutes/seconds"
  const intervalMatch = input.match(/every\s+(\d+)\s+(hour|hours|minute|minutes|min|mins|second|seconds|sec|secs)(?:\s|$)/);
  
  if (intervalMatch) {
    const [, amount, unit] = intervalMatch;
    const num = parseInt(amount);
    
    let intervalMs;
    let description;
    
    if (unit.startsWith('hour')) {
      intervalMs = num * 60 * 60 * 1000;
      description = `every ${num} hour${num > 1 ? 's' : ''}`;
    } else if (unit.startsWith('min')) {
      intervalMs = num * 60 * 1000;
      description = `every ${num} minute${num > 1 ? 's' : ''}`;
    } else if (unit.startsWith('sec')) {
      intervalMs = num * 1000;
      description = `every ${num} second${num > 1 ? 's' : ''}`;
    }
    
    return {
      type: 'interval',
      interval: intervalMs,
      description
    };
  }

  return null;
}

/**
 * Parse daily time patterns like "at 9pm every day", "daily at 2:30pm"
 */
function parseDailyTime(input) {
  // Match "at Xpm every day" or "daily at X" or "at X daily"
  const dailyPatterns = [
    /(?:at\s+)?(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s+(?:every\s+)?(?:day|daily)/,
    /(?:daily|every\s+day)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?)\s*(am|pm)?/,
    /at\s+(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s+daily/
  ];

  for (const pattern of dailyPatterns) {
    const match = input.match(pattern);
    if (match) {
      const time = parseTime(match[1], match[2]);
      return {
        type: 'cron',
        expr: `${time.minute} ${time.hour} * * *`,
        description: `daily at ${formatTime(time)}`
      };
    }
  }

  return null;
}

/**
 * Parse weekly patterns like "every Monday at 10am", "weekly on Friday at 3pm"
 */
function parseWeeklyTime(input) {
  // Match "every [day] at [time]" or "weekly on [day] at [time]"
  const weeklyPatterns = [
    /every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|fri|sat)\s+at\s+(\d{1,2}(?::\d{2})?)\s*(am|pm)?/,
    /(?:weekly\s+)?on\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|fri|sat)\s+at\s+(\d{1,2}(?::\d{2})?)\s*(am|pm)?/,
    // This pattern should match "remind me to X every Monday at Y" where the day comes before "at"
    /(?:remind me to .+?|.+?)\s+every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|fri|sat)\s+at\s+(\d{1,2}(?::\d{2})?)\s*(am|pm)?/
  ];

  for (const pattern of weeklyPatterns) {
    const match = input.match(pattern);
    if (match) {
      let dayName, timeStr, ampm;
      if (pattern.source.includes('remind me to')) {
        // Special handling for the third pattern
        dayName = match[2];
        timeStr = match[3];
        ampm = match[4];
      } else {
        dayName = match[1];
        timeStr = match[2];
        ampm = match[3];
      }
      
      const dayNum = DAYS_OF_WEEK[dayName];
      const time = parseTime(timeStr, ampm);
      
      return {
        type: 'cron',
        expr: `${time.minute} ${time.hour} * * ${dayNum}`,
        description: `every ${capitalize(dayName)} at ${formatTime(time)}`
      };
    }
  }

  return null;
}

/**
 * Parse specific date/time patterns like "tomorrow at noon", "January 15th at 2pm"
 */
function parseSpecificDateTime(input) {
  const now = new Date();
  
  // Tomorrow patterns
  const tomorrowMatch = input.match(/tomorrow\s+at\s+(\d{1,2}(?::\d{2})?)\s*(am|pm)?|tomorrow\s+at\s+(noon|midnight)/);
  if (tomorrowMatch) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let time;
    if (tomorrowMatch[3] === 'noon') {
      time = { hour: 12, minute: 0 };
    } else if (tomorrowMatch[3] === 'midnight') {
      time = { hour: 0, minute: 0 };
    } else {
      time = parseTime(tomorrowMatch[1], tomorrowMatch[2]);
    }
    
    // Create a specific cron for tomorrow's date
    return {
      type: 'cron',
      expr: `${time.minute} ${time.hour} ${tomorrow.getDate()} ${tomorrow.getMonth() + 1} *`,
      description: `tomorrow at ${formatTime(time)}`,
      oneTime: true
    };
  }

  // Today patterns
  const todayMatch = input.match(/today\s+at\s+(\d{1,2}(?::\d{2})?)\s*(am|pm)?|today\s+at\s+(noon|midnight)/);
  if (todayMatch) {
    let time;
    if (todayMatch[3] === 'noon') {
      time = { hour: 12, minute: 0 };
    } else if (todayMatch[3] === 'midnight') {
      time = { hour: 0, minute: 0 };
    } else {
      time = parseTime(todayMatch[1], todayMatch[2]);
    }
    
    return {
      type: 'cron',
      expr: `${time.minute} ${time.hour} ${now.getDate()} ${now.getMonth() + 1} *`,
      description: `today at ${formatTime(time)}`,
      oneTime: true
    };
  }

  return null;
}

/**
 * Parse relative time patterns like "in 30 minutes", "in 2 hours"
 */
function parseRelativeTime(input) {
  const relativeMatch = input.match(/in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|second|seconds|sec|secs)/);
  
  if (relativeMatch) {
    const [, amount, unit] = relativeMatch;
    const num = parseInt(amount);
    
    let delayMs;
    let description;
    
    if (unit.startsWith('hour')) {
      delayMs = num * 60 * 60 * 1000;
      description = `in ${num} hour${num > 1 ? 's' : ''}`;
    } else if (unit.startsWith('min')) {
      delayMs = num * 60 * 1000;
      description = `in ${num} minute${num > 1 ? 's' : ''}`;
    } else if (unit.startsWith('sec')) {
      delayMs = num * 1000;
      description = `in ${num} second${num > 1 ? 's' : ''}`;
    }
    
    const targetTime = new Date(Date.now() + delayMs);
    
    return {
      type: 'cron',
      expr: `${targetTime.getMinutes()} ${targetTime.getHours()} ${targetTime.getDate()} ${targetTime.getMonth() + 1} *`,
      description,
      oneTime: true
    };
  }

  return null;
}

/**
 * Parse general "every X" patterns
 */
function parseEveryPattern(input) {
  // Match "every day", "every week", etc.
  if (input.match(/every\s+day|daily/)) {
    return {
      type: 'cron',
      expr: '0 9 * * *', // Default to 9am daily
      description: 'daily at 9:00 AM'
    };
  }

  if (input.match(/every\s+week|weekly/)) {
    return {
      type: 'cron',
      expr: '0 9 * * 1', // Default to Monday 9am
      description: 'every Monday at 9:00 AM'
    };
  }

  return null;
}

/**
 * Parse general "at X" patterns
 */
function parseAtPattern(input) {
  // Match standalone time like "at 3pm", "at noon"
  const timeMatch = input.match(/^(?:at\s+)?(\d{1,2}(?::\d{2})?)\s*(am|pm)$|^(?:at\s+)?(noon|midnight)$/);
  
  if (timeMatch) {
    let time;
    if (timeMatch[3] === 'noon') {
      time = { hour: 12, minute: 0 };
    } else if (timeMatch[3] === 'midnight') {
      time = { hour: 0, minute: 0 };
    } else {
      time = parseTime(timeMatch[1], timeMatch[2]);
    }
    
    // Default to daily
    return {
      type: 'cron',
      expr: `${time.minute} ${time.hour} * * *`,
      description: `daily at ${formatTime(time)}`
    };
  }

  return null;
}

/**
 * Parse time string like "9:30" or "9" with optional am/pm
 */
function parseTime(timeStr, ampm = null) {
  const parts = timeStr.split(':');
  let hour = parseInt(parts[0]);
  const minute = parts.length > 1 ? parseInt(parts[1]) : 0;
  
  if (ampm) {
    if (ampm.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12;
    } else if (ampm.toLowerCase() === 'am' && hour === 12) {
      hour = 0;
    }
  }
  
  return { hour, minute };
}

/**
 * Format time for display
 */
function formatTime(time) {
  const hour12 = time.hour === 0 ? 12 : (time.hour > 12 ? time.hour - 12 : time.hour);
  const ampm = time.hour < 12 ? 'AM' : 'PM';
  const minute = time.minute.toString().padStart(2, '0');
  
  return `${hour12}:${minute} ${ampm}`;
}

/**
 * Capitalize first letter of string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert schedule to human-readable description
 */
export function describeSchedule(schedule) {
  if (schedule.description) {
    return schedule.description;
  }
  
  if (schedule.type === 'interval') {
    const hours = schedule.interval / (1000 * 60 * 60);
    const minutes = schedule.interval / (1000 * 60);
    const seconds = schedule.interval / 1000;
    
    if (hours >= 1) {
      return `every ${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes >= 1) {
      return `every ${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return `every ${seconds} second${seconds > 1 ? 's' : ''}`;
    }
  }
  
  return 'unknown schedule';
}

/**
 * Validate parsed schedule
 */
export function validateSchedule(schedule) {
  if (!schedule || !schedule.type) {
    return { valid: false, error: 'Invalid schedule object' };
  }
  
  if (schedule.type === 'cron') {
    if (!schedule.expr) {
      return { valid: false, error: 'Missing cron expression' };
    }
    
    // Basic cron validation
    const parts = schedule.expr.trim().split(/\s+/);
    if (parts.length !== 5) {
      return { valid: false, error: 'Cron expression must have 5 fields' };
    }
  } else if (schedule.type === 'interval') {
    if (!schedule.interval || schedule.interval <= 0) {
      return { valid: false, error: 'Invalid interval value' };
    }
    
    // Minimum interval of 1 second
    if (schedule.interval < 1000) {
      return { valid: false, error: 'Interval must be at least 1 second' };
    }
  } else {
    return { valid: false, error: 'Unknown schedule type' };
  }
  
  return { valid: true };
}

/**
 * Get example patterns for help text
 */
export function getExamplePatterns() {
  return [
    'every 2 hours',
    'every 30 minutes', 
    'at 9pm every day',
    'daily at 6:30am',
    'every Monday at 10am',
    'weekly on Friday at 3pm',
    'in 30 minutes',
    'in 2 hours',
    'tomorrow at noon',
    'today at midnight'
  ];
}

/**
 * Test the parser with example inputs
 */
export function testParser() {
  const examples = [
    'every 2 hours',
    'every 30 minutes',
    'at 9pm every day',
    'daily at 6:30am',
    'every Monday at 10am',
    'weekly on Friday at 3pm', 
    'in 30 minutes',
    'in 2 hours',
    'tomorrow at noon',
    'today at midnight'
  ];
  
  const results = [];
  
  for (const example of examples) {
    try {
      const parsed = parseNaturalLanguage(example);
      results.push({ input: example, output: parsed, success: true });
    } catch (error) {
      results.push({ input: example, error: error.message, success: false });
    }
  }
  
  return results;
}