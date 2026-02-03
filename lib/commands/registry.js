/**
 * Declarative Command Registry
 * 
 * OpenClaw-inspired command registry that replaces scattered regex patterns
 * with structured, self-documenting command definitions.
 * 
 * @module lib/commands/registry
 */

/**
 * @typedef {Object} CommandArg
 * @property {string} name - Argument name
 * @property {'string'|'number'|'duration'|'boolean'|'date'} type - Argument type
 * @property {boolean} [required=false] - Whether argument is required
 * @property {boolean} [captureRemaining=false] - Capture all remaining text
 * @property {*} [default] - Default value if not provided
 * @property {string} [description] - Help text for this argument
 */

/**
 * @typedef {Object} CommandDefinition
 * @property {string} key - Unique command identifier
 * @property {string} [nativeName] - Platform-native command name (e.g., for Telegram menus)
 * @property {string} description - Human-readable description
 * @property {string[]} [textAliases=[]] - Slash command aliases (/remind, /reminder)
 * @property {CommandArg[]} [args=[]] - Command arguments schema
 * @property {string[]} [intentExamples=[]] - Natural language examples for intent detection
 * @property {RegExp[]} [patterns=[]] - Custom regex patterns for detection
 * @property {string} [category='general'] - Command category for grouping
 * @property {boolean} [hidden=false] - Hide from /help listings
 * @property {Function} [handler] - Optional inline handler function
 */

/** @type {Map<string, CommandDefinition>} */
const commandRegistry = new Map();

/** @type {Map<string, string>} */
const aliasMap = new Map(); // alias -> command key

/** @type {Map<string, CommandDefinition[]>} */
const categoryIndex = new Map();

/**
 * Define and register a chat command
 * @param {CommandDefinition} definition - Command definition
 * @returns {CommandDefinition} The registered command
 */
export function defineChatCommand(definition) {
  const {
    key,
    nativeName,
    description,
    textAliases = [],
    args = [],
    intentExamples = [],
    patterns = [],
    category = 'general',
    hidden = false,
    handler,
  } = definition;
  
  if (!key) {
    throw new Error('Command definition requires a key');
  }
  
  if (!description) {
    throw new Error(`Command '${key}' requires a description`);
  }
  
  // Build compiled patterns from intentExamples
  const compiledPatterns = [
    ...patterns,
    ...intentExamples.map(example => {
      // Escape special regex chars and convert to pattern
      const escaped = example.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(escaped, 'i');
    }),
  ];
  
  const command = {
    key,
    nativeName: nativeName || key,
    description,
    textAliases,
    args,
    intentExamples,
    patterns: compiledPatterns,
    category,
    hidden,
    handler,
  };
  
  // Register the command
  commandRegistry.set(key, command);
  
  // Register aliases
  for (const alias of textAliases) {
    const normalized = alias.toLowerCase().replace(/^\//, '');
    aliasMap.set(normalized, key);
  }
  
  // Update category index
  if (!categoryIndex.has(category)) {
    categoryIndex.set(category, []);
  }
  categoryIndex.get(category).push(command);
  
  return command;
}

/**
 * Register multiple commands at once
 * @param {CommandDefinition[]} definitions - Array of command definitions
 */
export function registerCommands(definitions) {
  for (const def of definitions) {
    defineChatCommand(def);
  }
}

/**
 * Find a command by key, alias, or pattern match
 * @param {string} input - User input or command key
 * @returns {Object|null} Match result with command and confidence
 */
export function findCommand(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }
  
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  
  // 1. Check for direct slash command
  if (trimmed.startsWith('/')) {
    const [cmdPart] = trimmed.slice(1).split(/\s+/);
    const cmdLower = cmdPart.toLowerCase();
    
    // Check aliases
    if (aliasMap.has(cmdLower)) {
      const key = aliasMap.get(cmdLower);
      return {
        command: commandRegistry.get(key),
        confidence: 1.0,
        method: 'alias',
        argString: trimmed.slice(1 + cmdPart.length).trim(),
      };
    }
    
    // Check direct key match
    if (commandRegistry.has(cmdLower)) {
      return {
        command: commandRegistry.get(cmdLower),
        confidence: 1.0,
        method: 'key',
        argString: trimmed.slice(1 + cmdPart.length).trim(),
      };
    }
  }
  
  // 2. Pattern matching for natural language
  let bestMatch = null;
  let bestConfidence = 0;
  
  for (const [key, command] of commandRegistry) {
    for (const pattern of command.patterns) {
      // Reset regex state
      pattern.lastIndex = 0;
      
      if (pattern.test(lower)) {
        // Calculate confidence based on pattern specificity
        const patternLength = pattern.source.length;
        const inputLength = lower.length;
        const confidence = Math.min(0.9, 0.6 + (patternLength / inputLength) * 0.3);
        
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = {
            command,
            confidence,
            method: 'pattern',
            argString: trimmed,
          };
        }
      }
      
      // Reset after test
      pattern.lastIndex = 0;
    }
  }
  
  return bestMatch;
}

/**
 * List all registered commands
 * @param {Object} options - Filter options
 * @param {string} [options.category] - Filter by category
 * @param {boolean} [options.includeHidden=false] - Include hidden commands
 * @returns {CommandDefinition[]} List of commands
 */
export function listCommands(options = {}) {
  const { category, includeHidden = false } = options;
  
  let commands;
  
  if (category) {
    commands = categoryIndex.get(category) || [];
  } else {
    commands = Array.from(commandRegistry.values());
  }
  
  if (!includeHidden) {
    commands = commands.filter(cmd => !cmd.hidden);
  }
  
  return commands;
}

/**
 * Get all command categories
 * @returns {string[]} List of category names
 */
export function getCategories() {
  return Array.from(categoryIndex.keys());
}

/**
 * Get a command by its key
 * @param {string} key - Command key
 * @returns {CommandDefinition|undefined} Command definition
 */
export function getCommand(key) {
  return commandRegistry.get(key);
}

/**
 * Parse command arguments from a string
 * @param {string} argString - Argument string
 * @param {CommandArg[]} argSchema - Argument schema
 * @returns {Object} Parsed arguments
 */
export function parseCommandArgs(argString, argSchema) {
  if (!argSchema || argSchema.length === 0) {
    return { _raw: argString };
  }
  
  const result = { _raw: argString };
  const parts = argString.split(/\s+/).filter(Boolean);
  let partIndex = 0;
  
  for (const arg of argSchema) {
    const { name, type, required, captureRemaining, default: defaultValue } = arg;
    
    if (captureRemaining) {
      // Capture all remaining parts
      result[name] = parts.slice(partIndex).join(' ') || defaultValue || '';
      break;
    }
    
    const part = parts[partIndex];
    
    if (part === undefined) {
      if (required) {
        result._errors = result._errors || [];
        result._errors.push(`Missing required argument: ${name}`);
      } else if (defaultValue !== undefined) {
        result[name] = defaultValue;
      }
      continue;
    }
    
    // Parse based on type
    switch (type) {
      case 'number':
        const num = parseFloat(part);
        if (isNaN(num)) {
          result._errors = result._errors || [];
          result._errors.push(`Invalid number for ${name}: ${part}`);
        } else {
          result[name] = num;
        }
        break;
        
      case 'boolean':
        result[name] = ['true', 'yes', '1', 'on'].includes(part.toLowerCase());
        break;
        
      case 'duration':
        result[name] = parseDuration(part);
        break;
        
      case 'date':
        result[name] = parseDate(part);
        break;
        
      case 'string':
      default:
        result[name] = part;
        break;
    }
    
    partIndex++;
  }
  
  return result;
}

/**
 * Parse a duration string (e.g., "2h", "30m", "1d")
 * @param {string} str - Duration string
 * @returns {Object} Parsed duration with value and unit
 */
function parseDuration(str) {
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day|w|week)?s?$/i);
  
  if (!match) {
    return { raw: str, ms: null };
  }
  
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'm').toLowerCase();
  
  const multipliers = {
    s: 1000,
    sec: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    h: 60 * 60 * 1000,
    hr: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
  };
  
  return {
    raw: str,
    value,
    unit,
    ms: value * (multipliers[unit] || 60000),
  };
}

/**
 * Parse a date/time string
 * @param {string} str - Date string
 * @returns {Object} Parsed date info
 */
function parseDate(str) {
  // Try native Date parsing first
  const date = new Date(str);
  
  if (!isNaN(date.getTime())) {
    return { raw: str, date, valid: true };
  }
  
  // Try relative patterns
  const lower = str.toLowerCase();
  const now = new Date();
  
  if (lower === 'today') {
    return { raw: str, date: now, valid: true };
  }
  
  if (lower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { raw: str, date: tomorrow, valid: true };
  }
  
  // Match "in X hours/days"
  const relMatch = lower.match(/in\s+(\d+)\s+(hour|day|minute|week)s?/);
  if (relMatch) {
    const value = parseInt(relMatch[1]);
    const unit = relMatch[2];
    const future = new Date(now);
    
    switch (unit) {
      case 'minute':
        future.setMinutes(future.getMinutes() + value);
        break;
      case 'hour':
        future.setHours(future.getHours() + value);
        break;
      case 'day':
        future.setDate(future.getDate() + value);
        break;
      case 'week':
        future.setDate(future.getDate() + value * 7);
        break;
    }
    
    return { raw: str, date: future, valid: true };
  }
  
  return { raw: str, date: null, valid: false };
}

/**
 * Generate help text for all commands or a specific command
 * @param {string} [commandKey] - Specific command to get help for
 * @returns {string} Formatted help text
 */
export function generateHelp(commandKey) {
  if (commandKey) {
    const cmd = commandRegistry.get(commandKey);
    if (!cmd) {
      return `Unknown command: ${commandKey}`;
    }
    
    let help = `**${cmd.nativeName}** - ${cmd.description}\n`;
    
    if (cmd.textAliases.length > 0) {
      help += `Aliases: ${cmd.textAliases.join(', ')}\n`;
    }
    
    if (cmd.args.length > 0) {
      help += '\nArguments:\n';
      for (const arg of cmd.args) {
        const req = arg.required ? '(required)' : '(optional)';
        help += `  - ${arg.name} [${arg.type}] ${req}`;
        if (arg.description) {
          help += `: ${arg.description}`;
        }
        help += '\n';
      }
    }
    
    if (cmd.intentExamples.length > 0) {
      help += `\nExamples: "${cmd.intentExamples.slice(0, 3).join('", "')}"\n`;
    }
    
    return help;
  }
  
  // Generate full help
  let help = '**Available Commands**\n\n';
  
  for (const [category, commands] of categoryIndex) {
    const visibleCommands = commands.filter(cmd => !cmd.hidden);
    if (visibleCommands.length === 0) continue;
    
    help += `**${category.charAt(0).toUpperCase() + category.slice(1)}**\n`;
    
    for (const cmd of visibleCommands) {
      help += `  /${cmd.nativeName} - ${cmd.description}\n`;
    }
    
    help += '\n';
  }
  
  return help;
}

/**
 * Clear all registered commands (useful for testing)
 */
export function clearCommands() {
  commandRegistry.clear();
  aliasMap.clear();
  categoryIndex.clear();
}

/**
 * Get statistics about registered commands
 * @returns {Object} Registry statistics
 */
export function getStats() {
  return {
    totalCommands: commandRegistry.size,
    totalAliases: aliasMap.size,
    categories: Array.from(categoryIndex.entries()).map(([name, cmds]) => ({
      name,
      count: cmds.length,
    })),
  };
}

export default {
  defineChatCommand,
  registerCommands,
  findCommand,
  listCommands,
  getCategories,
  getCommand,
  parseCommandArgs,
  generateHelp,
  clearCommands,
  getStats,
};
