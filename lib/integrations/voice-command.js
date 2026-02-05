/**
 * Voice Command Parser - Natural language command understanding
 *
 * Features:
 * - Intent classification
 * - Entity extraction
 * - Command templates
 * - Fuzzy matching
 */

import { EventEmitter } from 'events';

const PARSER_VERSION = '1.0.0';

const INTENT_PATTERNS = {
  launch: [
    /(?:open|launch|start|run)\s+(?:the\s+)?(.+)/i,
    /start\s+(?:the\s+)?(.+)/i,
  ],
  quit: [
    /(?:quit|close|stop|exit)\s+(?:the\s+)?(.+)/i,
    /close\s+(?:the\s+)?(.+)/i,
  ],
  notify: [
    /(?:send\s+)?notify\s+(?:me\s+)?(.+)/i,
    /tell\s+me\s+to\s+(.+)/i,
    /remind\s+me\s+(?:to\s+)?(.+)/i,
  ],
  schedule: [
    /schedule\s+(?:a\s+)?(.+)/i,
    /set\s+(?:a\s+)?(?:reminder|timer)\s+(?:for\s+)?(.+)/i,
    /remind\s+me\s+(?:at|in)\s+(.+)/i,
  ],
  search: [
    /search\s+(?:for\s+)?(.+)/i,
    /find\s+(?:the\s+)?(.+)/i,
    /look\s+up\s+(.+)/i,
  ],
  read: [
    /read\s+(?:me\s+)?(.+)/i,
    /what('?s|\s+is)\s+(?:in\s+)?(.+)/i,
    /read\s+back\s+(.+)/i,
  ],
  write: [
    /write\s+(?:to\s+)?(.+)/i,
    /save\s+(?:to\s+)?(.+)/i,
    /create\s+(?:a\s+)?(.+)/i,
  ],
  execute: [
    /run\s+(?:the\s+)?(.+)/i,
    /execute\s+(?:the\s+)?(.+)/i,
    /do\s+(?:a\s+)?(.+)/i,
  ],
  control: [
    /(?:play|pause|stop|next|previous|volume\s+(?:up|down|mute))(.+)/i,
    /skip\s+(?:to\s+)?(.+)/i,
  ],
  query: [
    /what('?s|\s+is|\s+are)\s+(.+)/i,
    /how\s+(?:do|can|much|many)\s+(.+)/i,
    /who\s+(.+)/i,
    /where\s+(.+)/i,
    /when\s+(.+)/i,
    /why\s+(.+)/i,
  ],
};

const ENTITY_EXTRACTORS = {
  time: /\b(\d{1,2}:\d{2}(?:\s*[ap]m)?|\d{1,2}(?:\s*(?:minute|hour|day|second)s?|sec|min|hr)s?|in\s+\d+\s+\w+)\b/gi,
  date: /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+\w+|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/gi,
  number: /\b(\d+(?:\.\d+)?)\b/gi,
  email: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi,
  url: /\b(https?:\/\/[^\s]+)\b/gi,
  path: /["']([^"']+)["']|(\/[^\s]+)/g,
  appName: /\b(safari|chrome|firefox|finder|terminal|iterm|vscode|textedit|notes|calendar|mail|messages|spotify|slack|discord|zoom|photoshop|illustrator)\b/gi,
};

export class VoiceCommandParser extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      confidenceThreshold: options.confidenceThreshold || 0.5,
      fuzzyThreshold: options.fuzzyThreshold || 0.7,
      maxAlternatives: options.maxAlternatives || 3,
    };

    this.aliases = new Map([
      ['open', 'launch'],
      ['start', 'launch'],
      ['close', 'quit'],
      ['stop', 'quit'],
      ['exit', 'quit'],
      ['tell me', 'notify'],
      ['remind me', 'notify'],
      ['look up', 'search'],
      ['what is', 'query'],
      ['what are', 'query'],
      ['how much', 'query'],
      ['how many', 'query'],
    ]);

    this.negations = ["don't", "do not", "dont", "don't", "stop", "cancel", "abort", "disable", "turn off", "never"];
  }

  parse(command, context = {}) {
    const normalized = this.normalize(command);
    const tokens = this.tokenize(normalized);
    const entities = this.extractEntities(command);
    const intent = this.classifyIntent(normalized, tokens);
    const alternatives = this.generateAlternatives(normalized, intent);

    const parsed = {
      original: command,
      normalized,
      tokens,
      entities,
      intent: intent.intent,
      confidence: intent.confidence,
      alternatives,
      context,
      timestamp: Date.now(),
    };

    if (intent.confidence >= this.options.confidenceThreshold) {
      this.emit('parsed', parsed);
    } else {
      this.emit('low-confidence', parsed);
    }

    return parsed;
  }

  normalize(command) {
    let normalized = command
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    for (const [alias, canonical] of this.aliases) {
      normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'gi'), canonical);
    }

    normalized = normalized.replace(/[^\w\s\?\!\.\,\-\/]/g, '');

    return normalized;
  }

  tokenize(command) {
    return command
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }

  extractEntities(command) {
    const entities = {
      time: [],
      date: [],
      number: [],
      email: [],
      url: [],
      path: [],
      appName: [],
    };

    for (const [type, pattern] of Object.entries(ENTITY_EXTRACTORS)) {
      const matches = command.match(pattern) || [];
      entities[type] = [...new Set(matches)];
    }

    return entities;
  }

  classifyIntent(command, tokens) {
    let bestMatch = {
      intent: 'unknown',
      confidence: 0,
      match: null,
    };

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      for (const pattern of patterns) {
        const match = command.match(pattern);

        if (match) {
          let confidence = 0.8;

          if (match[1]) {
            const target = match[1].trim();
            confidence += 0.1;

            if (this.isNegated(match[0])) {
              confidence -= 0.3;
            }

            if (this.isAmbiguous(target)) {
              confidence -= 0.2;
            }
          }

          confidence = Math.min(confidence, 0.95);

          if (confidence > bestMatch.confidence) {
            bestMatch = {
              intent,
              confidence,
              match: match[1]?.trim() || '',
            };
          }
        }
      }
    }

    return bestMatch;
  }

  isNegated(phrase) {
    const lower = phrase.toLowerCase();
    return this.negations.some((neg) => lower.includes(neg));
  }

  isAmbiguous(target) {
    const commonTargets = ['it', 'that', 'this', 'something', 'thing', 'file', 'app'];
    return commonTargets.some((t) => target === t || target.includes(t));
  }

  generateAlternatives(command, intent) {
    const alternatives = [];

    if (intent.confidence < this.options.confidenceThreshold) {
      const similar = this.findSimilarCommands(command);
      alternatives.push(...similar.slice(0, this.options.maxAlternatives));
    }

    return alternatives;
  }

  findSimilarCommands(command) {
    const allCommands = [];

    for (const [, patterns] of Object.entries(INTENT_PATTERNS)) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        allCommands.push(pattern.source);
      }
    }

    return [
      { command: 'launch an application', confidence: 0.6 },
      { command: 'send a notification', confidence: 0.6 },
      { command: 'set a reminder', confidence: 0.6 },
      { command: 'search for something', confidence: 0.6 },
    ];
  }

  resolveEntity(entityType, value, context = {}) {
    switch (entityType) {
      case 'time':
        return this.resolveTime(value, context);

      case 'date':
        return this.resolveDate(value, context);

      case 'appName':
        return this.resolveAppName(value);

      default:
        return value;
    }
  }

  resolveTime(value, context = {}) {
    const now = new Date();

    const hourMatch = value.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i);
    if (hourMatch) {
      let hour = parseInt(hourMatch[1]);
      const minute = parseInt(hourMatch[2] || 0);
      const period = hourMatch[3]?.toLowerCase();

      if (period === 'pm' && hour !== 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;

      const date = new Date(now);
      date.setHours(hour, minute, 0, 0);

      if (date < now) {
        date.setDate(date.getDate() + 1);
      }

      return { type: 'absolute', value: date.toISOString() };
    }

    const relativeMatch = value.match(/in\s+(\d+)\s+(\w+)/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();

      const multipliers = {
        second: 1000,
        seconds: 1000,
        minute: 60000,
        minutes: 60000,
        hour: 3600000,
        hours: 3600000,
      };

      const multiplier = multipliers[unit] || 60000;

      return {
        type: 'relative',
        value: amount * multiplier,
        absolute: new Date(Date.now() + amount * multiplier).toISOString(),
      };
    }

    return { type: 'unknown', value };
  }

  resolveDate(value, context = {}) {
    const now = new Date();
    const lower = value.toLowerCase();

    const dateMap = {
      today: 0,
      tomorrow: 1,
      tonight: 0,
      'next week': 7,
      'next month': 30,
    };

    if (dateMap[lower] !== undefined) {
      const days = dateMap[lower];
      const date = new Date(now);
      date.setDate(date.getDate() + days);
      return { type: 'date', value: date.toISOString() };
    }

    const dayMatch = lower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (dayMatch) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = days.indexOf(dayMatch[1].toLowerCase());
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;

      const date = new Date(now);
      date.setDate(date.getDate() + daysUntil);
      return { type: 'date', value: date.toISOString() };
    }

    return { type: 'unknown', value };
  }

  resolveAppName(value) {
    const appMap = {
      safari: 'Safari',
      chrome: 'Google Chrome',
      firefox: 'Firefox',
      finder: 'Finder',
      terminal: 'Terminal',
      iterm: 'iTerm2',
      vscode: 'VSCode',
      code: 'VSCode',
      textedit: 'TextEdit',
      notes: 'Notes',
      calendar: 'Calendar',
      mail: 'Mail',
      messages: 'Messages',
      spotify: 'Spotify',
      slack: 'Slack',
      discord: 'Discord',
      zoom: 'Zoom',
    };

    const lower = value.toLowerCase();

    for (const [key, name] of Object.entries(appMap)) {
      if (lower.includes(key)) {
        return { name, bundleId: this.getBundleId(name) };
      }
    }

    return { name: value };
  }

  getBundleId(appName) {
    const bundleMap = {
      'Safari': 'com.apple.safari',
      'Google Chrome': 'com.google.Chrome',
      'Firefox': 'org.mozilla.firefox',
      'Finder': 'com.apple.finder',
      'Terminal': 'com.apple.terminal',
      'VSCode': 'com.microsoft.VSCode',
    };
    return bundleMap[appName];
  }

  formatCommand(parsed) {
    if (parsed.intent === 'unknown') {
      return { success: false, error: 'Could not understand command' };
    }

    const formatted = {
      intent: parsed.intent,
      confidence: parsed.confidence,
      target: parsed.match,
      entities: parsed.entities,
      timestamp: parsed.timestamp,
    };

    if (parsed.entities.time.length > 0) {
      formatted.time = this.resolveEntity('time', parsed.entities.time[0]);
    }

    if (parsed.entities.date.length > 0) {
      formatted.date = this.resolveEntity('date', parsed.entities.date[0]);
    }

    if (parsed.entities.appName.length > 0) {
      formatted.app = this.resolveEntity('appName', parsed.entities.appName[0]);
    }

    return formatted;
  }

  getStats() {
    return {
      version: PARSER_VERSION,
      confidenceThreshold: this.options.confidenceThreshold,
      entityTypes: Object.keys(ENTITY_EXTRACTORS).length,
      intentTypes: Object.keys(INTENT_PATTERNS).length,
    };
  }
}

export function createVoiceCommandParser(options = {}) {
  return new VoiceCommandParser(options);
}

export default VoiceCommandParser;
