/**
 * Command Definitions
 * 
 * Declarative command definitions migrated from chatHandler.js INTENT_PATTERNS.
 * Each command is self-documenting with examples, arguments, and metadata.
 * 
 * @module lib/commands/definitions
 */

import { defineChatCommand, registerCommands } from './registry.js';

/**
 * All command definitions organized by category
 */
export const COMMAND_DEFINITIONS = [
  // ============================================================================
  // Scheduling Commands
  // ============================================================================
  {
    key: 'remind',
    nativeName: 'remind',
    description: 'Set a reminder for a specific time',
    textAliases: ['/remind', '/reminder', '/remindme'],
    args: [
      { name: 'time', type: 'duration', required: true, description: 'When to remind (e.g., 2h, 30m, tomorrow)' },
      { name: 'message', type: 'string', captureRemaining: true, description: 'What to remind about' },
    ],
    intentExamples: [
      'remind me',
      'set a reminder',
      'set an alarm',
      'alert me at',
      'remind me to',
      'remind me in',
    ],
    patterns: [
      /remind me/i,
      /set (a )?reminder/i,
      /set an alarm/i,
    ],
    category: 'scheduling',
  },
  {
    key: 'schedule',
    nativeName: 'schedule',
    description: 'Schedule a recurring task or one-time event',
    textAliases: ['/schedule', '/cron', '/task'],
    args: [
      { name: 'when', type: 'string', required: true, description: 'When to run (cron pattern or natural language)' },
      { name: 'action', type: 'string', captureRemaining: true, description: 'What to do' },
    ],
    intentExamples: [
      'schedule',
      'every day at',
      'every week',
      'create a scheduled task',
      'add a task',
    ],
    patterns: [
      /schedule/i,
      /every day at/i,
      /every week/i,
      /on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /at \d{1,2}(:\d{2})?( ?(am|pm))?/i,
      /cron/i,
      /create (a )?scheduled (task|job)/i,
      /add (a )?task/i,
    ],
    category: 'scheduling',
  },
  
  // ============================================================================
  // Coding/Development Commands
  // ============================================================================
  {
    key: 'code',
    nativeName: 'code',
    description: 'Write, debug, or analyze code',
    textAliases: ['/code', '/coding', '/dev'],
    args: [
      { name: 'request', type: 'string', captureRemaining: true, description: 'What to code' },
    ],
    intentExamples: [
      'write code',
      'write a function',
      'create a class',
      'build a module',
      'implement',
      'debug',
      'fix the bug',
      'refactor',
      'review my code',
    ],
    patterns: [
      /write (some )?(code|function|class|script)/i,
      /create (a )?(function|class|module|component|api)/i,
      /build (a )?/i,
      /implement/i,
      /code/i,
      /debug/i,
      /fix (the )?(bug|error)/i,
      /refactor/i,
      /review (my )?code/i,
      /program/i,
      /develop/i,
    ],
    category: 'coding',
  },
  {
    key: 'analyze',
    nativeName: 'analyze',
    description: 'Analyze, compare, or evaluate something',
    textAliases: ['/analyze', '/analyse', '/compare'],
    args: [
      { name: 'subject', type: 'string', captureRemaining: true, description: 'What to analyze' },
    ],
    intentExamples: [
      'analyze',
      'compare',
      'evaluate',
      'assess',
      'think about',
      'what do you think',
      'pros and cons',
    ],
    patterns: [
      /analyze/i,
      /compare/i,
      /evaluate/i,
      /assess/i,
      /think about/i,
      /what do you think/i,
      /should i/i,
      /pros and cons/i,
      /look into/i,
      /investigate/i,
      /figure out/i,
    ],
    category: 'coding',
  },
  
  // ============================================================================
  // Memory Commands
  // ============================================================================
  {
    key: 'memory',
    nativeName: 'memory',
    description: 'Access conversation memory and history',
    textAliases: ['/memory', '/memories', '/recall'],
    args: [
      { name: 'query', type: 'string', captureRemaining: true, description: 'What to search for' },
    ],
    intentExamples: [
      'what did we talk about',
      'remember anything',
      'show my memories',
      'memory stats',
    ],
    patterns: [
      /what did we (talk about|discuss|cover)/i,
      /remember (anything|that)/i,
      /show (me )?my memories/i,
      /memory stats/i,
      /curate/i,
      /long.?term/i,
    ],
    category: 'memory',
  },
  
  // ============================================================================
  // Voice/TTS Commands
  // ============================================================================
  {
    key: 'tts',
    nativeName: 'speak',
    description: 'Convert text to speech',
    textAliases: ['/speak', '/tts', '/voice', '/say'],
    args: [
      { name: 'text', type: 'string', captureRemaining: true, description: 'Text to speak' },
    ],
    intentExamples: [
      'read this aloud',
      'speak this',
      'say this out loud',
      'text to speech',
      'voice this',
    ],
    patterns: [
      /read (this|that|it) (aloud|out loud)/i,
      /speak (this|that|it)/i,
      /say (this|that|it) (aloud|out loud)/i,
      /(read|speak|say) the (daily )?summary/i,
      /convert to speech/i,
      /turn into voice/i,
      /voice (this|that|it)/i,
      /text to speech/i,
      /tts/i,
      /speak .+/i,
      /read aloud/i,
      /spoken reminder/i,
      /voice reminder/i,
    ],
    category: 'voice',
  },
  
  // ============================================================================
  // System Commands
  // ============================================================================
  {
    key: 'status',
    nativeName: 'status',
    description: 'Get system status and info',
    textAliases: ['/status', '/health', '/info'],
    args: [],
    intentExamples: [
      'status',
      'how are you',
      'what is your status',
      'system info',
    ],
    patterns: [
      /status/i,
      /how are you/i,
      /what('s| is) your status/i,
      /system (info|status)/i,
    ],
    category: 'system',
  },
  {
    key: 'tasks',
    nativeName: 'tasks',
    description: 'List scheduled tasks',
    textAliases: ['/tasks', '/jobs', '/scheduled'],
    args: [],
    intentExamples: [
      'list my tasks',
      'show my tasks',
      'what is scheduled',
    ],
    patterns: [
      /list (my )?tasks/i,
      /show (my )?tasks/i,
      /what('s| is) scheduled/i,
      /my (cron|scheduled)/i,
    ],
    category: 'system',
  },
  {
    key: 'models',
    nativeName: 'models',
    description: 'List available AI models',
    textAliases: ['/models'],
    args: [],
    intentExamples: [
      'list models',
      'what models',
      'available models',
    ],
    patterns: [
      /list (available )?models/i,
      /what models/i,
      /available models/i,
      /show models/i,
    ],
    category: 'system',
  },
  {
    key: 'skills',
    nativeName: 'skills',
    description: 'List available skills',
    textAliases: ['/skills'],
    args: [],
    intentExamples: [
      'list my skills',
      'what skills',
      'my skills',
    ],
    patterns: [
      /list (my )?skills/i,
      /what skills/i,
      /my skills/i,
      /show skills/i,
    ],
    category: 'system',
  },
  
  // ============================================================================
  // Calendar Commands
  // ============================================================================
  {
    key: 'calendar',
    nativeName: 'calendar',
    description: 'Check calendar events',
    textAliases: ['/calendar', '/cal', '/agenda'],
    args: [
      { name: 'timeframe', type: 'string', default: 'today', description: 'Time period to check' },
    ],
    intentExamples: [
      'check my calendar',
      'what is on my calendar',
      'upcoming events',
      'my agenda',
    ],
    patterns: [
      /check my calendar/i,
      /what('s| is) on my calendar/i,
      /calendar for (today|tomorrow|this week|next week)/i,
      /upcoming (events|meetings|appointments)/i,
      /schedule for/i,
      /calendar/i,
      /meetings today/i,
      /what('s| is) scheduled/i,
      /my agenda/i,
      /today('s| is) calendar/i,
    ],
    category: 'calendar',
  },
  
  // ============================================================================
  // Integration Commands
  // ============================================================================
  {
    key: 'slack',
    nativeName: 'slack',
    description: 'Send messages via Slack',
    textAliases: ['/slack'],
    args: [
      { name: 'target', type: 'string', required: true, description: 'Channel or user' },
      { name: 'message', type: 'string', captureRemaining: true, description: 'Message to send' },
    ],
    intentExamples: [
      'send a slack message',
      'post to slack',
      'notify on slack',
    ],
    patterns: [
      /send (a )?slack (message|msg) to/i,
      /slack (message|msg|post|send)/i,
      /post (this )?to slack/i,
      /send (this )?to slack/i,
      /slack (#|@)/i,
      /notify (me|them|everyone) on slack/i,
    ],
    category: 'integrations',
  },
  {
    key: 'discord',
    nativeName: 'discord',
    description: 'Send messages via Discord',
    textAliases: ['/discord'],
    args: [
      { name: 'target', type: 'string', required: true, description: 'Channel or user' },
      { name: 'message', type: 'string', captureRemaining: true, description: 'Message to send' },
    ],
    intentExamples: [
      'send a discord message',
      'post to discord',
      'notify on discord',
    ],
    patterns: [
      /send (a )?discord (message|msg) to/i,
      /discord (message|msg|post|send)/i,
      /post (this )?to discord/i,
      /send (this )?to discord/i,
      /discord (#|@)/i,
      /notify (me|them|everyone) on discord/i,
    ],
    category: 'integrations',
  },
  {
    key: 'notion',
    nativeName: 'notion',
    description: 'Create or update Notion pages',
    textAliases: ['/notion'],
    args: [
      { name: 'action', type: 'string', description: 'Action to perform' },
      { name: 'content', type: 'string', captureRemaining: true, description: 'Content' },
    ],
    intentExamples: [
      'add to notion',
      'create a notion page',
      'sync to notion',
    ],
    patterns: [
      /add (this )?to notion/i,
      /create (a )?notion (page|entry|note)/i,
      /notion (page|entry|note)/i,
      /sync (this )?to notion/i,
      /save (this )?to notion/i,
      /notion database/i,
      /update notion/i,
    ],
    category: 'integrations',
  },
  {
    key: 'whatsapp',
    nativeName: 'whatsapp',
    description: 'Send messages via WhatsApp',
    textAliases: ['/whatsapp', '/wa'],
    args: [
      { name: 'target', type: 'string', required: true, description: 'Contact' },
      { name: 'message', type: 'string', captureRemaining: true, description: 'Message' },
    ],
    intentExamples: [
      'send a whatsapp message',
      'message on whatsapp',
    ],
    patterns: [
      /send (a )?whatsapp (message|msg) to/i,
      /whatsapp (message|msg|send)/i,
      /send (this )?via whatsapp/i,
      /whatsapp to/i,
      /message (mom|dad|family|friend) on whatsapp/i,
    ],
    category: 'integrations',
  },
  {
    key: 'email',
    nativeName: 'email',
    description: 'Send emails',
    textAliases: ['/email', '/mail'],
    args: [
      { name: 'to', type: 'string', required: true, description: 'Recipient' },
      { name: 'subject', type: 'string', description: 'Subject line' },
      { name: 'body', type: 'string', captureRemaining: true, description: 'Email body' },
    ],
    intentExamples: [
      'send an email',
      'compose an email',
      'draft an email',
    ],
    patterns: [
      /send (an )?email/i,
      /compose (an )?email/i,
      /draft (an )?email/i,
      /email (someone|to)/i,
      /send email to/i,
    ],
    category: 'integrations',
  },
  {
    key: 'webhooks',
    nativeName: 'webhook',
    description: 'Trigger webhooks',
    textAliases: ['/webhook', '/trigger'],
    args: [
      { name: 'name', type: 'string', required: true, description: 'Webhook name' },
      { name: 'data', type: 'string', captureRemaining: true, description: 'Data to send' },
    ],
    intentExamples: [
      'trigger a webhook',
      'send a webhook',
      'fire webhook',
    ],
    patterns: [
      /trigger (a )?webhook/i,
      /send (a )?webhook to/i,
      /webhook (trigger|send)/i,
      /call (the )?webhook/i,
      /fire webhook/i,
      /webhook notification/i,
    ],
    category: 'integrations',
  },
  
  // ============================================================================
  // Analytics Commands
  // ============================================================================
  {
    key: 'analytics',
    nativeName: 'analytics',
    description: 'View analytics and reports',
    textAliases: ['/analytics', '/stats', '/report'],
    args: [
      { name: 'type', type: 'string', default: 'daily', description: 'Report type (daily, weekly, monthly)' },
    ],
    intentExamples: [
      'show my analytics',
      'generate a report',
      'daily summary',
      'my stats',
    ],
    patterns: [
      /show (my )?analytics/i,
      /(generate|show|create) (a )?report/i,
      /daily summary/i,
      /weekly report/i,
      /monthly report/i,
      /my (stats|statistics|progress)/i,
      /performance report/i,
      /analytics dashboard/i,
      /usage stats/i,
      /data insights/i,
    ],
    category: 'analytics',
  },
  
  // ============================================================================
  // Media Commands
  // ============================================================================
  {
    key: 'media',
    nativeName: 'analyze-image',
    description: 'Analyze images and media',
    textAliases: ['/analyze-image', '/vision', '/ocr'],
    args: [
      { name: 'url', type: 'string', description: 'Image URL' },
      { name: 'prompt', type: 'string', captureRemaining: true, description: 'What to look for' },
    ],
    intentExamples: [
      'analyze this image',
      'what is in this photo',
      'read text from image',
    ],
    patterns: [
      /(analyze|examine|describe) (this )?image/i,
      /(analyze|examine|describe) (this )?photo/i,
      /what('s| is) in (this )?image/i,
      /what('s| is) in (this )?photo/i,
      /(read|extract) text from (image|photo)/i,
      /ocr (this )?image/i,
      /image analysis/i,
      /photo analysis/i,
      /(analyze|examine|describe) (this )?video/i,
    ],
    category: 'media',
  },
  
  // ============================================================================
  // Data Commands
  // ============================================================================
  {
    key: 'export',
    nativeName: 'export',
    description: 'Export data',
    textAliases: ['/export', '/backup'],
    args: [
      { name: 'scope', type: 'string', default: 'all', description: 'What to export' },
      { name: 'format', type: 'string', default: 'json', description: 'Export format' },
    ],
    intentExamples: [
      'export my data',
      'download my data',
      'backup my data',
    ],
    patterns: [
      /export (my )?data/i,
      /download (my )?data/i,
      /backup (my )?data/i,
      /export as (json|csv)/i,
      /data export/i,
      /save (my )?data/i,
    ],
    category: 'data',
  },
  {
    key: 'import',
    nativeName: 'import',
    description: 'Import data',
    textAliases: ['/import', '/restore'],
    args: [
      { name: 'source', type: 'string', required: true, description: 'Source file or URL' },
    ],
    intentExamples: [
      'import data',
      'load data',
      'restore data',
    ],
    patterns: [
      /import data/i,
      /load data/i,
      /import from/i,
      /restore data/i,
      /upload data/i,
    ],
    category: 'data',
  },
  
  // ============================================================================
  // Skills Commands
  // ============================================================================
  {
    key: 'skill_creator',
    nativeName: 'create-skill',
    description: 'Create a new skill',
    textAliases: ['/create-skill', '/new-skill'],
    args: [
      { name: 'name', type: 'string', description: 'Skill name' },
      { name: 'description', type: 'string', captureRemaining: true, description: 'What the skill does' },
    ],
    intentExamples: [
      'create a skill',
      'build a skill',
      'make a skill',
    ],
    patterns: [
      /create (a )?skill (like|for)/i,
      /build (a )?skill/i,
      /make (a )?skill/i,
      /generate (a )?skill/i,
      /skill creator/i,
      /intelligent skill/i,
      /replace (.*) with (a )?skill/i,
      /turn (.*) into (a )?skill/i,
    ],
    category: 'skills',
  },
  
  // ============================================================================
  // Tracking Commands
  // ============================================================================
  {
    key: 'track',
    nativeName: 'track',
    description: 'Log data to a tracker',
    textAliases: ['/track', '/log'],
    args: [
      { name: 'data', type: 'string', captureRemaining: true, description: 'What to track' },
    ],
    intentExamples: [
      'track my',
      'log my',
      'record my',
      'i had',
      'i ate',
      'i did',
    ],
    patterns: [
      /track (my )?/i,
      /log (my )?/i,
      /record (my )?/i,
      /i had \d+/i,
      /i ate/i,
      /i did/i,
      /\d+\s*(cal|calorie|kcal)/i,
      /\d+\s*(km|miles?|meters?)/i,
      /\d+\s*(min|minutes?|hours?|hrs?)/i,
      /\d+\s*(sets?|reps?)/i,
    ],
    category: 'tracking',
  },
  
  // ============================================================================
  // Help Command
  // ============================================================================
  {
    key: 'help',
    nativeName: 'help',
    description: 'Show available commands and help',
    textAliases: ['/help', '/commands', '/?'],
    args: [
      { name: 'command', type: 'string', description: 'Specific command to get help for' },
    ],
    intentExamples: [
      'help',
      'show commands',
      'what can you do',
    ],
    patterns: [
      /^help$/i,
      /show (all )?commands/i,
      /what can you do/i,
      /how do i/i,
    ],
    category: 'system',
  },
];

/**
 * Initialize the command registry with all definitions
 */
export function initCommandDefinitions() {
  registerCommands(COMMAND_DEFINITIONS);
}

/**
 * Get command definitions for a specific category
 * @param {string} category - Category name
 * @returns {Object[]} Commands in that category
 */
export function getCommandsByCategory(category) {
  return COMMAND_DEFINITIONS.filter(cmd => cmd.category === category);
}

/**
 * Get all categories
 * @returns {string[]} List of categories
 */
export function getAllCategories() {
  return [...new Set(COMMAND_DEFINITIONS.map(cmd => cmd.category))];
}

export default {
  COMMAND_DEFINITIONS,
  initCommandDefinitions,
  getCommandsByCategory,
  getAllCategories,
};
