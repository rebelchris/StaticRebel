# Natural Language Scheduling

This module provides natural language parsing for scheduling tasks in StaticRebel. Users can create scheduled reminders and tasks using natural language instead of learning cron syntax.

## Features

- **Natural Language Parsing**: Convert phrases like "every 2 hours" or "daily at 9pm" into cron expressions or intervals
- **Conversational Interface**: Integrated with the chat system to handle scheduling requests
- **Task Management**: List, cancel, and update scheduled tasks through conversation
- **Multiple Schedule Types**: Support for intervals, daily/weekly schedules, and one-time reminders

## Supported Patterns

### Interval-based Scheduling
- `every 2 hours` → Run every 2 hours
- `every 30 minutes` → Run every 30 minutes
- `every 5 seconds` → Run every 5 seconds

### Daily Scheduling
- `at 9pm every day` → Run at 9:00 PM daily
- `daily at 6:30am` → Run at 6:30 AM daily
- `at 2pm daily` → Run at 2:00 PM daily

### Weekly Scheduling
- `every Monday at 10am` → Run every Monday at 10:00 AM
- `weekly on Friday at 3pm` → Run every Friday at 3:00 PM
- `on Wednesday at 8:30am` → Run every Wednesday at 8:30 AM

### One-time Scheduling
- `in 30 minutes` → Run once, 30 minutes from now
- `in 2 hours` → Run once, 2 hours from now
- `tomorrow at noon` → Run tomorrow at 12:00 PM
- `today at midnight` → Run today at 12:00 AM

## Usage Examples

### Through Conversation
```javascript
// User says: "Remind me to drink water every 2 hours"
const result = processSchedulingRequest("Remind me to drink water every 2 hours");
// Returns: { success: true, reply: "✓ Scheduled 'drink water' to run every 2 hours" }
```

### Direct API Usage
```javascript
import { scheduleTask } from './lib/scheduling/index.js';

// Schedule a task
const result = scheduleTask('every 30 minutes', {
  message: 'Take a short break',
  action: 'remind',
  data: { type: 'break_reminder' }
});

console.log(result.confirmation);
// "✓ Scheduled 'Take a short break' to run every 30 minutes"
```

### Natural Language Parser Only
```javascript
import { parseNaturalLanguage } from './lib/scheduling/natural-language.js';

const schedule = parseNaturalLanguage('daily at 9pm');
console.log(schedule);
// {
//   type: 'cron',
//   expr: '0 21 * * *',
//   description: 'daily at 9:00 PM',
//   original: 'daily at 9pm'
// }
```

## Conversation Commands

Users can interact with the scheduling system through natural conversation:

### Creating Reminders
- "Remind me to drink water every 2 hours"
- "Set a reminder to log my mood at 9pm daily"
- "Can you remind me to take a break every Monday at 10am?"
- "Schedule me to check emails tomorrow at noon"

### Managing Reminders
- "List my reminders" - Show all scheduled tasks
- "Cancel reminder water" - Cancel reminder containing "water"
- "Cancel reminder 2" - Cancel the 2nd reminder in the list
- "Show my scheduled tasks" - List all reminders

### Getting Help
- "How do I create a reminder?"
- "What scheduling patterns are supported?"

## API Reference

### scheduleTask(naturalLanguage, taskConfig)
Create a scheduled task from natural language.

**Parameters:**
- `naturalLanguage` (string): Natural language expression like "every 2 hours"
- `taskConfig` (object):
  - `message` (string): User message/reminder text
  - `action` (string): Action to perform (default: 'remind')
  - `name` (string): Optional task name
  - `data` (object): Additional task data

**Returns:**
- Success: `{ success: true, job: {...}, confirmation: "..." }`
- Error: `{ success: false, error: "...", examples: [...] }`

### listScheduledTasks()
List all scheduled tasks with human-readable descriptions.

**Returns:** Array of enhanced job objects with `humanReadable` and `isNaturalLanguage` properties.

### cancelScheduledTask(jobId)
Cancel a scheduled task by ID.

**Parameters:**
- `jobId` (string): Job ID to cancel

**Returns:**
- Success: `{ success: true, confirmation: "..." }`
- Error: `{ success: false, error: "..." }`

### previewSchedule(naturalLanguage)
Parse and validate natural language without creating a job.

**Parameters:**
- `naturalLanguage` (string): Natural language expression to preview

**Returns:**
- Success: `{ success: true, schedule: {...}, preview: "..." }`
- Error: `{ success: false, error: "...", examples: [...] }`

## Integration

The natural language scheduling system is integrated into StaticRebel's chat handler. When a user sends a message that looks like a scheduling request, it's automatically processed by the scheduling conversation handler.

### In chatHandler.js
```javascript
// Step 0: Check for natural language scheduling first
const schedulingIntent = detectSchedulingIntent(input);
if (schedulingIntent.detected && schedulingIntent.confidence >= 0.7) {
  const schedulingResult = processSchedulingRequest(input, context);
  // Handle result...
}
```

## File Structure

```
lib/scheduling/
├── README.md                    # This documentation
├── natural-language.js          # Core natural language parser
├── index.js                     # Scheduling coordinator
└── conversation-handler.js      # Conversational interface
```

## Error Handling

The system provides helpful error messages and examples when parsing fails:

```javascript
// User: "Remind me to xyz at some point"
// Response: "Unable to parse: 'at some point'. Supported patterns: 'every 2 hours', 'at 9pm daily', ..."
```

## Testing

Run the test suite with:
```bash
node test-scheduling.js
```

This tests:
- Natural language parser with various patterns
- Scheduling coordinator functionality  
- Conversation handler intent detection
- Error handling and help responses

## Extensions

The system is designed to be easily extensible:

1. **Add new patterns**: Update `natural-language.js` with new regex patterns
2. **Add new task types**: Extend the task configuration options
3. **Add new conversation intents**: Update `conversation-handler.js`
4. **Integrate with external systems**: Modify the task execution handler

## Dependencies

- Existing `cronScheduler.js` for job storage and execution
- `chatHandler.js` for conversational integration
- Standard Node.js modules (no external dependencies)