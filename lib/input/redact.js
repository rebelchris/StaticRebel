/**
 * Sensitive Data Redaction Module
 * 
 * Auto-redacts API keys, tokens, passwords, and other sensitive data
 * from logs and output. Inspired by OpenClaw's security patterns.
 * 
 * @module lib/input/redact
 */

/**
 * Patterns for detecting sensitive data
 * Each pattern includes a regex and optional group index to mask
 */
const REDACT_PATTERNS = [
  // OpenAI API keys (sk-...)
  {
    name: 'openai_key',
    pattern: /\b(sk-[A-Za-z0-9_-]{20,})\b/g,
    replacement: 'sk-****REDACTED****',
  },
  
  // OpenAI project keys (sk-proj-...)
  {
    name: 'openai_project_key',
    pattern: /\b(sk-proj-[A-Za-z0-9_-]{20,})\b/g,
    replacement: 'sk-proj-****REDACTED****',
  },
  
  // Anthropic API keys (sk-ant-...)
  {
    name: 'anthropic_key',
    pattern: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g,
    replacement: 'sk-ant-****REDACTED****',
  },
  
  // GitHub Personal Access Tokens (ghp_...)
  {
    name: 'github_pat',
    pattern: /\b(ghp_[A-Za-z0-9]{36,})\b/g,
    replacement: 'ghp_****REDACTED****',
  },
  
  // GitHub PAT new format (github_pat_...)
  {
    name: 'github_pat_new',
    pattern: /\b(github_pat_[A-Za-z0-9_]{20,})\b/g,
    replacement: 'github_pat_****REDACTED****',
  },
  
  // GitHub OAuth tokens (gho_...)
  {
    name: 'github_oauth',
    pattern: /\b(gho_[A-Za-z0-9]{36,})\b/g,
    replacement: 'gho_****REDACTED****',
  },
  
  // GitHub App tokens (ghs_..., ghr_...)
  {
    name: 'github_app',
    pattern: /\b(gh[sr]_[A-Za-z0-9]{36,})\b/g,
    replacement: 'ghs_****REDACTED****',
  },
  
  // Slack tokens (xox...)
  {
    name: 'slack_token',
    pattern: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    replacement: 'xox*-****REDACTED****',
  },
  
  // Google API keys (AIza...)
  {
    name: 'google_api',
    pattern: /\b(AIza[A-Za-z0-9_-]{35})\b/g,
    replacement: 'AIza****REDACTED****',
  },
  
  // AWS Access Key IDs (AKIA...)
  {
    name: 'aws_access_key',
    pattern: /\b(AKIA[A-Z0-9]{16})\b/g,
    replacement: 'AKIA****REDACTED****',
  },
  
  // AWS Secret Access Keys (often follow AKIA)
  {
    name: 'aws_secret',
    pattern: /\b([A-Za-z0-9/+=]{40})\b/g,
    // This is aggressive - only apply after AKIA context
    skipStandalone: true,
  },
  
  // Discord Bot Tokens
  {
    name: 'discord_token',
    pattern: /\b([MN][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,})\b/g,
    replacement: '****DISCORD_TOKEN_REDACTED****',
  },
  
  // Telegram Bot Tokens
  {
    name: 'telegram_token',
    pattern: /\b(\d{8,10}:[A-Za-z0-9_-]{35})\b/g,
    replacement: '****TELEGRAM_TOKEN_REDACTED****',
  },
  
  // Stripe API keys (sk_live_, sk_test_, pk_live_, pk_test_)
  {
    name: 'stripe_key',
    pattern: /\b([sp]k_(live|test)_[A-Za-z0-9]{20,})\b/g,
    replacement: (match) => match.slice(0, 8) + '****REDACTED****',
  },
  
  // Twilio tokens
  {
    name: 'twilio_token',
    pattern: /\b(SK[A-Za-z0-9]{32})\b/g,
    replacement: 'SK****REDACTED****',
  },
  
  // SendGrid API keys
  {
    name: 'sendgrid_key',
    pattern: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g,
    replacement: 'SG.****REDACTED****',
  },
  
  // Mailchimp API keys
  {
    name: 'mailchimp_key',
    pattern: /\b([a-f0-9]{32}-us\d{1,2})\b/g,
    replacement: '****REDACTED****-us**',
  },
  
  // Generic environment variable patterns: KEY=value, TOKEN=value, SECRET=value
  {
    name: 'env_key',
    pattern: /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)[A-Z0-9_]*)\s*[=:]\s*(['"]?)([^\s'"]{8,})\2/gi,
    replacement: (match, varName, quote, value) => `${varName}=${quote}****REDACTED****${quote}`,
  },
  
  // Bearer tokens in headers
  {
    name: 'bearer_token',
    pattern: /\b(Bearer\s+)([A-Za-z0-9._-]{20,})\b/gi,
    replacement: '$1****REDACTED****',
  },
  
  // Basic auth in URLs (user:pass@host)
  {
    name: 'basic_auth_url',
    pattern: /:\/\/([^:]+):([^@]{3,})@/g,
    replacement: '://$1:****REDACTED****@',
  },
  
  // SSH private keys
  {
    name: 'ssh_key',
    pattern: /-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '-----BEGIN PRIVATE KEY-----\n****REDACTED****\n-----END PRIVATE KEY-----',
  },
  
  // PGP private keys
  {
    name: 'pgp_key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
    replacement: '-----BEGIN PGP PRIVATE KEY BLOCK-----\n****REDACTED****\n-----END PGP PRIVATE KEY BLOCK-----',
  },
  
  // JWT tokens (three base64 parts separated by dots)
  {
    name: 'jwt',
    pattern: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
    replacement: 'eyJ****REDACTED_JWT****',
  },
  
  // Credit card numbers (basic pattern)
  {
    name: 'credit_card',
    pattern: /\b(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g,
    replacement: '****-****-****-REDACTED',
  },
  
  // Social Security Numbers (US)
  {
    name: 'ssn',
    pattern: /\b(\d{3}[-\s]?\d{2}[-\s]?\d{4})\b/g,
    replacement: '***-**-REDACTED',
  },
];

/**
 * Mask a token by showing first few chars and hiding the rest
 * @param {string} token - The token to mask
 * @param {number} showFirst - Number of characters to show at start
 * @returns {string} Masked token
 */
function maskToken(token, showFirst = 4) {
  if (token.length <= showFirst) {
    return '****REDACTED****';
  }
  return token.slice(0, showFirst) + '****REDACTED****';
}

/**
 * Redact sensitive data from text
 * @param {string} text - Text to redact
 * @param {Object} options - Redaction options
 * @param {string[]} options.skip - Pattern names to skip
 * @param {boolean} options.aggressive - Enable more aggressive patterns
 * @returns {string} Redacted text
 */
export function redactSensitive(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  const { skip = [], aggressive = false } = options;
  let result = text;
  
  for (const { name, pattern, replacement, skipStandalone } of REDACT_PATTERNS) {
    // Skip patterns in the skip list
    if (skip.includes(name)) {
      continue;
    }
    
    // Skip standalone-only patterns unless aggressive mode
    if (skipStandalone && !aggressive) {
      continue;
    }
    
    // Apply the pattern
    if (typeof replacement === 'function') {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  
  return result;
}

/**
 * Check if text contains sensitive data
 * @param {string} text - Text to check
 * @returns {Object} Detection result with found patterns
 */
export function containsSensitive(text) {
  if (!text || typeof text !== 'string') {
    return { hasSensitive: false, found: [] };
  }
  
  const found = [];
  
  for (const { name, pattern, skipStandalone } of REDACT_PATTERNS) {
    if (skipStandalone) continue;
    
    // Reset regex state (global flag)
    pattern.lastIndex = 0;
    
    if (pattern.test(text)) {
      found.push(name);
    }
    
    // Reset again after test
    pattern.lastIndex = 0;
  }
  
  return {
    hasSensitive: found.length > 0,
    found,
  };
}

/**
 * Create a redacting logger wrapper
 * @param {Object} logger - Original logger instance
 * @returns {Object} Logger that redacts sensitive data
 */
export function createRedactingLogger(logger) {
  const wrapMethod = (method) => (message, extra = {}) => {
    const redactedMessage = redactSensitive(message);
    const redactedExtra = {};
    
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === 'string') {
        redactedExtra[key] = redactSensitive(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively redact object values
        redactedExtra[key] = JSON.parse(
          redactSensitive(JSON.stringify(value))
        );
      } else {
        redactedExtra[key] = value;
      }
    }
    
    return method(redactedMessage, redactedExtra);
  };
  
  return {
    debug: wrapMethod(logger.debug.bind(logger)),
    info: wrapMethod(logger.info.bind(logger)),
    warn: wrapMethod(logger.warn.bind(logger)),
    error: wrapMethod(logger.error.bind(logger)),
    child: (childContext) => createRedactingLogger(logger.child(childContext)),
    getLevel: logger.getLevel?.bind(logger),
    setLevel: logger.setLevel?.bind(logger),
  };
}

/**
 * Get list of all redaction pattern names
 * @returns {string[]} Pattern names
 */
export function getRedactionPatterns() {
  return REDACT_PATTERNS.map(p => p.name);
}

/**
 * Add a custom redaction pattern
 * @param {Object} patternDef - Pattern definition
 * @param {string} patternDef.name - Unique name for the pattern
 * @param {RegExp} patternDef.pattern - Regex pattern (must have global flag)
 * @param {string|Function} patternDef.replacement - Replacement string or function
 */
export function addRedactionPattern(patternDef) {
  const { name, pattern, replacement } = patternDef;
  
  if (!name || !pattern || !replacement) {
    throw new Error('Pattern definition requires name, pattern, and replacement');
  }
  
  // Check for duplicates
  const existingIndex = REDACT_PATTERNS.findIndex(p => p.name === name);
  if (existingIndex >= 0) {
    REDACT_PATTERNS[existingIndex] = patternDef;
  } else {
    REDACT_PATTERNS.push(patternDef);
  }
}

// Aliases for index.js compatibility
export const redact = redactSensitive;
export const RedactionPatterns = REDACT_PATTERNS;

export default {
  redact,
  redactSensitive,
  containsSensitive,
  createRedactingLogger,
  getRedactionPatterns,
  addRedactionPattern,
  RedactionPatterns,
};
