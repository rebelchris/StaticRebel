/**
 * Inline Directives Parser
 * 
 * Parses special `[[directive: params]]` syntax from LLM output to enable
 * rich messaging features like quick replies, confirmation dialogs, and buttons.
 * 
 * Supported directives:
 * - [[quick_replies: opt1, opt2, opt3]]
 * - [[confirm: question | yes_label | no_label]]
 * - [[buttons: title | btn1:data1, btn2:data2]]
 * - [[typing: duration_ms]]
 * - [[react: emoji]]
 * - [[media: type | url | caption]]
 * 
 * @module lib/output/directives
 */

/**
 * @typedef {Object} QuickReply
 * @property {string} text - Button text
 * @property {string} [data] - Callback data
 */

/**
 * @typedef {Object} Confirm
 * @property {string} question - Question to ask
 * @property {string} yesLabel - Yes button label
 * @property {string} noLabel - No button label
 * @property {string} [yesData='yes'] - Yes callback data
 * @property {string} [noData='no'] - No callback data
 */

/**
 * @typedef {Object} Button
 * @property {string} text - Button text
 * @property {string} data - Callback data
 * @property {string} [url] - URL for link buttons
 */

/**
 * @typedef {Object} ButtonGroup
 * @property {string} [title] - Optional title/header
 * @property {Button[]} buttons - Array of buttons
 */

/**
 * @typedef {Object} Media
 * @property {'image'|'audio'|'video'|'file'} type - Media type
 * @property {string} url - Media URL or path
 * @property {string} [caption] - Optional caption
 */

/**
 * @typedef {Object} ParsedDirectives
 * @property {string} text - Clean text with directives removed
 * @property {QuickReply[]|null} quickReplies - Quick reply buttons
 * @property {Confirm|null} confirm - Confirmation dialog
 * @property {ButtonGroup[]|null} buttons - Button groups
 * @property {number|null} typing - Typing indicator duration
 * @property {string|null} react - Emoji reaction
 * @property {Media[]|null} media - Media attachments
 * @property {Object[]} [raw] - Raw parsed directives
 */

/**
 * Regex patterns for directive extraction
 */
const DIRECTIVE_PATTERNS = {
  // [[quick_replies: opt1, opt2, opt3]]
  quickReplies: /\[\[quick_replies?:\s*([^\]]+)\]\]/gi,
  
  // [[confirm: question | yes | no]]
  confirm: /\[\[confirm:\s*([^\]]+)\]\]/gi,
  
  // [[buttons: title | btn1:data1, btn2:data2]]
  buttons: /\[\[buttons?:\s*([^\]]+)\]\]/gi,
  
  // [[typing: 1000]]
  typing: /\[\[typing:\s*(\d+)\]\]/gi,
  
  // [[react: 👍]]
  react: /\[\[react:\s*([^\]]+)\]\]/gi,
  
  // [[media: image | https://... | caption]]
  media: /\[\[media:\s*([^\]]+)\]\]/gi,
  
  // Generic pattern for any directive
  any: /\[\[(\w+):\s*([^\]]+)\]\]/g,
};

/**
 * Parse quick replies from directive content
 * @param {string} content - Directive content
 * @returns {QuickReply[]}
 */
function parseQuickReplies(content) {
  const parts = content.split(',').map(s => s.trim()).filter(Boolean);
  
  return parts.map(part => {
    // Check for data format: "text:data"
    const colonIndex = part.indexOf(':');
    if (colonIndex > 0 && !part.startsWith('http')) {
      return {
        text: part.slice(0, colonIndex).trim(),
        data: part.slice(colonIndex + 1).trim() || part.slice(0, colonIndex).trim().toLowerCase(),
      };
    }
    
    return {
      text: part,
      data: part.toLowerCase().replace(/\s+/g, '_'),
    };
  });
}

/**
 * Parse confirm dialog from directive content
 * @param {string} content - Directive content (question | yes | no)
 * @returns {Confirm}
 */
function parseConfirm(content) {
  const parts = content.split('|').map(s => s.trim());
  
  return {
    question: parts[0] || 'Are you sure?',
    yesLabel: parts[1] || 'Yes',
    noLabel: parts[2] || 'No',
    yesData: 'confirm_yes',
    noData: 'confirm_no',
  };
}

/**
 * Parse buttons from directive content
 * @param {string} content - Directive content (title | btn1:data1, btn2:data2)
 * @returns {ButtonGroup}
 */
function parseButtons(content) {
  const pipeIndex = content.indexOf('|');
  
  let title = '';
  let buttonStr = content;
  
  if (pipeIndex > 0) {
    title = content.slice(0, pipeIndex).trim();
    buttonStr = content.slice(pipeIndex + 1).trim();
  }
  
  const buttons = buttonStr.split(',').map(s => s.trim()).filter(Boolean).map(btn => {
    const colonIndex = btn.indexOf(':');
    
    if (colonIndex > 0) {
      const text = btn.slice(0, colonIndex).trim();
      const data = btn.slice(colonIndex + 1).trim();
      
      // Check if data is a URL
      if (data.startsWith('http://') || data.startsWith('https://')) {
        return { text, url: data, data: text.toLowerCase().replace(/\s+/g, '_') };
      }
      
      return { text, data };
    }
    
    return {
      text: btn,
      data: btn.toLowerCase().replace(/\s+/g, '_'),
    };
  });
  
  return { title, buttons };
}

/**
 * Parse media from directive content
 * @param {string} content - Directive content (type | url | caption)
 * @returns {Media}
 */
function parseMedia(content) {
  const parts = content.split('|').map(s => s.trim());
  
  const type = (parts[0] || 'file').toLowerCase();
  const validTypes = ['image', 'audio', 'video', 'file'];
  
  return {
    type: validTypes.includes(type) ? type : 'file',
    url: parts[1] || '',
    caption: parts[2] || undefined,
  };
}

/**
 * Parse all directives from text
 * @param {string} text - Text containing directives
 * @param {Object} [options] - Parsing options
 * @param {boolean} [options.keepRaw=false] - Include raw directive data
 * @returns {ParsedDirectives}
 */
export function parseDirectives(text, options = {}) {
  const { keepRaw = false } = options;
  
  if (!text || typeof text !== 'string') {
    return {
      text: text || '',
      quickReplies: null,
      confirm: null,
      buttons: null,
      typing: null,
      react: null,
      media: null,
    };
  }
  
  const result = {
    text: text,
    quickReplies: null,
    confirm: null,
    buttons: null,
    typing: null,
    react: null,
    media: null,
    raw: keepRaw ? [] : undefined,
  };
  
  // Parse quick_replies
  let match;
  DIRECTIVE_PATTERNS.quickReplies.lastIndex = 0;
  while ((match = DIRECTIVE_PATTERNS.quickReplies.exec(text)) !== null) {
    result.quickReplies = result.quickReplies || [];
    result.quickReplies.push(...parseQuickReplies(match[1]));
    
    if (keepRaw) {
      result.raw.push({ type: 'quick_replies', content: match[1], full: match[0] });
    }
  }
  
  // Parse confirm
  DIRECTIVE_PATTERNS.confirm.lastIndex = 0;
  while ((match = DIRECTIVE_PATTERNS.confirm.exec(text)) !== null) {
    result.confirm = parseConfirm(match[1]);
    
    if (keepRaw) {
      result.raw.push({ type: 'confirm', content: match[1], full: match[0] });
    }
  }
  
  // Parse buttons
  DIRECTIVE_PATTERNS.buttons.lastIndex = 0;
  while ((match = DIRECTIVE_PATTERNS.buttons.exec(text)) !== null) {
    result.buttons = result.buttons || [];
    result.buttons.push(parseButtons(match[1]));
    
    if (keepRaw) {
      result.raw.push({ type: 'buttons', content: match[1], full: match[0] });
    }
  }
  
  // Parse typing
  DIRECTIVE_PATTERNS.typing.lastIndex = 0;
  while ((match = DIRECTIVE_PATTERNS.typing.exec(text)) !== null) {
    result.typing = parseInt(match[1], 10);
    
    if (keepRaw) {
      result.raw.push({ type: 'typing', content: match[1], full: match[0] });
    }
  }
  
  // Parse react
  DIRECTIVE_PATTERNS.react.lastIndex = 0;
  while ((match = DIRECTIVE_PATTERNS.react.exec(text)) !== null) {
    result.react = match[1].trim();
    
    if (keepRaw) {
      result.raw.push({ type: 'react', content: match[1], full: match[0] });
    }
  }
  
  // Parse media
  DIRECTIVE_PATTERNS.media.lastIndex = 0;
  while ((match = DIRECTIVE_PATTERNS.media.exec(text)) !== null) {
    result.media = result.media || [];
    result.media.push(parseMedia(match[1]));
    
    if (keepRaw) {
      result.raw.push({ type: 'media', content: match[1], full: match[0] });
    }
  }
  
  // Strip all directives from text
  result.text = text
    .replace(DIRECTIVE_PATTERNS.quickReplies, '')
    .replace(DIRECTIVE_PATTERNS.confirm, '')
    .replace(DIRECTIVE_PATTERNS.buttons, '')
    .replace(DIRECTIVE_PATTERNS.typing, '')
    .replace(DIRECTIVE_PATTERNS.react, '')
    .replace(DIRECTIVE_PATTERNS.media, '')
    .replace(/\n{3,}/g, '\n\n')  // Collapse multiple newlines
    .trim();
  
  return result;
}

/**
 * Check if text contains any directives
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export function hasDirectives(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  DIRECTIVE_PATTERNS.any.lastIndex = 0;
  return DIRECTIVE_PATTERNS.any.test(text);
}

/**
 * Extract only the clean text (strip directives)
 * @param {string} text - Text with directives
 * @returns {string} Clean text
 */
export function stripDirectives(text) {
  return parseDirectives(text).text;
}

/**
 * Create a quick replies directive string
 * @param {string[]} options - Reply options
 * @returns {string}
 */
export function createQuickReplies(options) {
  return `[[quick_replies: ${options.join(', ')}]]`;
}

/**
 * Create a confirm directive string
 * @param {string} question - Question to ask
 * @param {string} [yesLabel='Yes'] - Yes label
 * @param {string} [noLabel='No'] - No label
 * @returns {string}
 */
export function createConfirm(question, yesLabel = 'Yes', noLabel = 'No') {
  return `[[confirm: ${question} | ${yesLabel} | ${noLabel}]]`;
}

/**
 * Create a buttons directive string
 * @param {string} title - Button group title
 * @param {Array<{text: string, data: string}>} buttons - Buttons
 * @returns {string}
 */
export function createButtons(title, buttons) {
  const btnStr = buttons.map(b => `${b.text}:${b.data}`).join(', ');
  return `[[buttons: ${title} | ${btnStr}]]`;
}

/**
 * Create a typing directive string
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string}
 */
export function createTyping(durationMs) {
  return `[[typing: ${durationMs}]]`;
}

/**
 * Create a react directive string
 * @param {string} emoji - Emoji to react with
 * @returns {string}
 */
export function createReact(emoji) {
  return `[[react: ${emoji}]]`;
}

/**
 * Create a media directive string
 * @param {string} type - Media type
 * @param {string} url - Media URL
 * @param {string} [caption] - Optional caption
 * @returns {string}
 */
export function createMedia(type, url, caption) {
  const parts = [type, url];
  if (caption) parts.push(caption);
  return `[[media: ${parts.join(' | ')}]]`;
}

/**
 * Convert parsed directives to Telegram-compatible format
 * @param {ParsedDirectives} parsed - Parsed directives
 * @returns {Object} Telegram-compatible reply markup
 */
export function toTelegramMarkup(parsed) {
  const result = {};
  
  // Quick replies become inline keyboard
  if (parsed.quickReplies && parsed.quickReplies.length > 0) {
    result.reply_markup = {
      inline_keyboard: [
        parsed.quickReplies.map(qr => ({
          text: qr.text,
          callback_data: qr.data,
        })),
      ],
    };
  }
  
  // Confirm becomes inline keyboard with yes/no
  if (parsed.confirm) {
    result.reply_markup = {
      inline_keyboard: [
        [
          { text: parsed.confirm.yesLabel, callback_data: parsed.confirm.yesData },
          { text: parsed.confirm.noLabel, callback_data: parsed.confirm.noData },
        ],
      ],
    };
  }
  
  // Buttons become inline keyboard rows
  if (parsed.buttons && parsed.buttons.length > 0) {
    const rows = [];
    
    for (const group of parsed.buttons) {
      const row = group.buttons.map(btn => {
        if (btn.url) {
          return { text: btn.text, url: btn.url };
        }
        return { text: btn.text, callback_data: btn.data };
      });
      rows.push(row);
    }
    
    result.reply_markup = { inline_keyboard: rows };
  }
  
  return result;
}

/**
 * Convert parsed directives to Discord-compatible format
 * @param {ParsedDirectives} parsed - Parsed directives
 * @returns {Object} Discord-compatible message components
 */
export function toDiscordComponents(parsed) {
  const result = { components: [] };
  
  // Quick replies become action row with buttons
  if (parsed.quickReplies && parsed.quickReplies.length > 0) {
    result.components.push({
      type: 1, // ACTION_ROW
      components: parsed.quickReplies.slice(0, 5).map((qr, i) => ({
        type: 2, // BUTTON
        style: 1, // PRIMARY
        label: qr.text,
        custom_id: qr.data,
      })),
    });
  }
  
  // Buttons become action rows
  if (parsed.buttons && parsed.buttons.length > 0) {
    for (const group of parsed.buttons) {
      result.components.push({
        type: 1, // ACTION_ROW
        components: group.buttons.slice(0, 5).map((btn, i) => {
          if (btn.url) {
            return {
              type: 2, // BUTTON
              style: 5, // LINK
              label: btn.text,
              url: btn.url,
            };
          }
          return {
            type: 2, // BUTTON
            style: 1, // PRIMARY
            label: btn.text,
            custom_id: btn.data,
          };
        }),
      });
    }
  }
  
  return result;
}

export default {
  parseDirectives,
  hasDirectives,
  stripDirectives,
  createQuickReplies,
  createConfirm,
  createButtons,
  createTyping,
  createReact,
  createMedia,
  toTelegramMarkup,
  toDiscordComponents,
};
