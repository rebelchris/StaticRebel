/**
 * Persona Manager - Dynamic persona and tone configuration
 * Handles user profiles, conversation styles, and personalized prompts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const PERSONA_DIR = path.join(os.homedir(), '.static-rebel', 'personas');
const USER_PROFILE_FILE = path.join(
  os.homedir(),
  '.static-rebel',
  'user-profile.json',
);
const DEFAULT_PERSONA_FILE = path.join(PERSONA_DIR, 'default.json');

// Default persona configuration
const DEFAULT_PERSONA = {
  name: 'Rebel',
  style: 'friendly',
  greeting: 'Hey there! 👋',
  fallback: "Hmm, I didn't quite get that — could you rephrase?",
  tone: {
    professional: {
      systemPrompt:
        'You are a professional AI assistant. Be concise, accurate, and helpful. Use formal language and provide structured responses.',
      greeting: 'Hello! How may I assist you today?',
      fallback:
        'I apologize, but I did not understand your request. Could you please clarify?',
    },
    friendly: {
      systemPrompt:
        'You are a friendly and approachable AI assistant named Rebel. Be warm, conversational, and helpful. Use casual language and emojis where appropriate.',
      greeting: 'Hey there! 👋 Ready to help you out!',
      fallback: "Hmm, I didn't quite get that — could you rephrase? 🤔",
    },
    concise: {
      systemPrompt:
        'You are a concise AI assistant. Provide brief, direct answers. Avoid unnecessary explanations.',
      greeting: 'Hi. What do you need?',
      fallback: 'Not clear. Rephrase?',
    },
    humorous: {
      systemPrompt:
        "You are a witty AI assistant with a sense of humor. Be helpful but don't be afraid to crack a joke or use playful language.",
      greeting: "Hey! 🤖 Ready to rock and roll! What's up?",
      fallback: 'You got me there! 🤷‍♂️ Mind saying that differently?',
    },
  },
  avatar: '🤖',
  colors: {
    primary: '#3b82f6',
    secondary: '#10b981',
    accent: '#f59e0b',
  },
};

// User profile template
const DEFAULT_USER_PROFILE = {
  name: null,
  preferences: {
    tone: 'friendly',
    responseLength: 'medium', // short, medium, detailed
    codeStyle: 'explained', // raw, explained, tutorial
    notifications: true,
  },
  memory: {
    frequentlyAsked: [],
    pastTasks: [],
    preferredTechnologies: [],
    communicationStyle: null,
  },
  stats: {
    totalInteractions: 0,
    firstInteraction: null,
    lastInteraction: null,
    favoriteCommands: [],
  },
};

/**
 * Initialize persona system
 */
export function initPersonaManager() {
  if (!fs.existsSync(PERSONA_DIR)) {
    fs.mkdirSync(PERSONA_DIR, { recursive: true });
  }

  // Create default persona if not exists
  if (!fs.existsSync(DEFAULT_PERSONA_FILE)) {
    fs.writeFileSync(
      DEFAULT_PERSONA_FILE,
      JSON.stringify(DEFAULT_PERSONA, null, 2),
    );
  }

  // Create user profile if not exists
  if (!fs.existsSync(USER_PROFILE_FILE)) {
    fs.writeFileSync(
      USER_PROFILE_FILE,
      JSON.stringify(DEFAULT_USER_PROFILE, null, 2),
    );
  }
}

/**
 * Load user profile
 */
export function loadUserProfile() {
  try {
    if (fs.existsSync(USER_PROFILE_FILE)) {
      return JSON.parse(fs.readFileSync(USER_PROFILE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load user profile:', e.message);
  }
  return { ...DEFAULT_USER_PROFILE };
}

/**
 * Save user profile
 */
export function saveUserProfile(profile) {
  try {
    fs.writeFileSync(USER_PROFILE_FILE, JSON.stringify(profile, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to save user profile:', e.message);
    return false;
  }
}

/**
 * Update user profile field
 */
export function updateUserProfile(path, value) {
  const profile = loadUserProfile();
  const keys = path.split('.');
  let current = profile;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }

  current[keys[keys.length - 1]] = value;
  saveUserProfile(profile);
  return profile;
}

/**
 * Load persona configuration
 */
export function loadPersona(personaName = 'default') {
  const file = path.join(PERSONA_DIR, `${personaName}.json`);
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load persona:', e.message);
  }
  return DEFAULT_PERSONA;
}

/**
 * Get active persona with user preferences applied
 */
export function getActivePersona() {
  const profile = loadUserProfile();
  const persona = loadPersona('default');
  const tone = profile.preferences?.tone || 'friendly';

  return {
    ...persona,
    ...persona.tone[tone],
    userName: profile.name,
    userPreferences: profile.preferences,
  };
}

/**
 * Build dynamic system prompt with context
 */
export function buildSystemPrompt(options = {}) {
  const persona = getActivePersona();
  const profile = loadUserProfile();
  const { context = {}, sessionMemory = [] } = options;

  let prompt = persona.systemPrompt || persona.tone.friendly.systemPrompt;

  // Add user context
  if (profile.name) {
    prompt += `\n\nThe user's name is ${profile.name}.`;
  }

  // Add user preferences
  if (profile.preferences?.responseLength === 'short') {
    prompt += '\nKeep responses brief and to the point.';
  } else if (profile.preferences?.responseLength === 'detailed') {
    prompt += '\nProvide detailed, comprehensive responses.';
  }

  // Add session context
  if (sessionMemory.length > 0) {
    prompt += '\n\nRecent conversation context:';
    sessionMemory.slice(-5).forEach((entry, i) => {
      prompt += `\n${i + 1}. User: ${entry.user}`;
      if (entry.assistant) {
        prompt += `\n   Assistant: ${entry.assistant.substring(0, 100)}${entry.assistant.length > 100 ? '...' : ''}`;
      }
    });
  }

  // Add relevant context
  if (context.recentTasks?.length > 0) {
    prompt += `\n\nRecent tasks: ${context.recentTasks.join(', ')}`;
  }

  if (context.preferredTech?.length > 0) {
    prompt += `\nUser prefers: ${context.preferredTech.join(', ')}`;
  }

  return prompt;
}

/**
 * Generate personalized greeting
 */
export function generateGreeting() {
  const persona = getActivePersona();
  const profile = loadUserProfile();
  const hour = new Date().getHours();

  let timeGreeting = '';
  if (hour < 12) timeGreeting = 'Good morning';
  else if (hour < 17) timeGreeting = 'Good afternoon';
  else timeGreeting = 'Good evening';

  if (profile.name) {
    timeGreeting += `, ${profile.name}`;
  }

  // Check if returning user
  if (profile.stats?.totalInteractions > 10) {
    const greetings = [
      `${timeGreeting}! Back at it again? 💪`,
      `${timeGreeting}! Ready to continue where we left off?`,
      `Hey${profile.name ? ' ' + profile.name : ''}! Good to see you again! 👋`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  return (
    persona.greeting ||
    `${timeGreeting}! ${persona.greeting || 'How can I help?'}`
  );
}

/**
 * Track interaction for analytics
 */
export function trackInteraction(type, data = {}) {
  const profile = loadUserProfile();

  profile.stats.totalInteractions++;
  profile.stats.lastInteraction = new Date().toISOString();

  if (!profile.stats.firstInteraction) {
    profile.stats.firstInteraction = profile.stats.lastInteraction;
  }

  // Track favorite commands
  if (type === 'command' && data.command) {
    const existing = profile.stats.favoriteCommands.find(
      (c) => c.command === data.command,
    );
    if (existing) {
      existing.count++;
    } else {
      profile.stats.favoriteCommands.push({ command: data.command, count: 1 });
    }
    // Sort by count
    profile.stats.favoriteCommands.sort((a, b) => b.count - a.count);
  }

  saveUserProfile(profile);
}

/**
 * Add to frequently asked
 */
export function addFrequentlyAsked(query, category = null) {
  const profile = loadUserProfile();
  const existing = profile.memory.frequentlyAsked.find(
    (q) => q.query === query,
  );

  if (existing) {
    existing.count++;
    existing.lastAsked = new Date().toISOString();
  } else {
    profile.memory.frequentlyAsked.push({
      query,
      category,
      count: 1,
      firstAsked: new Date().toISOString(),
      lastAsked: new Date().toISOString(),
    });
  }

  // Keep only top 20
  profile.memory.frequentlyAsked.sort((a, b) => b.count - a.count);
  profile.memory.frequentlyAsked = profile.memory.frequentlyAsked.slice(0, 20);

  saveUserProfile(profile);
}

/**
 * Get personalized fallback response
 */
export function getFallbackResponse() {
  const persona = getActivePersona();
  const profile = loadUserProfile();

  const fallbacks = [
    persona.fallback,
    "I'm not sure I understood that correctly. Could you try rephrasing?",
    'Hmm, could you clarify what you mean?',
  ];

  // Add personalized touch for returning users
  if (profile.name && profile.stats?.totalInteractions > 5) {
    fallbacks.push(
      `Sorry ${profile.name}, I didn't catch that. Can you say it differently?`,
    );
  }

  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

/**
 * Check if clarification is needed
 */
export function needsClarification(input) {
  const vaguePatterns = [
    /^(do|make|create|fix)\s+(it|this|that|something)$/i,
    /^(what|how)\s+(about|with)\s+(it|this|that)$/i,
    /^(yes|no|maybe|ok|okay|sure)$/i,
    /^\?+$/,
  ];

  return vaguePatterns.some((pattern) => pattern.test(input.trim()));
}

/**
 * Generate clarification question
 */
export function generateClarification(input) {
  const persona = getActivePersona();
  const profile = loadUserProfile();

  const clarifications = [
    "I'd love to help! Could you give me a bit more detail?",
    'I want to make sure I understand correctly. What specifically would you like me to do?',
    "Can you provide more context about what you're looking for?",
  ];

  if (profile.name) {
    clarifications.push(
      `${profile.name}, I want to get this right for you. Can you elaborate?`,
    );
  }

  return clarifications[Math.floor(Math.random() * clarifications.length)];
}

/**
 * Get available personas (for dashboard compatibility)
 */
export function getAvailablePersonas() {
  const personas = {};
  try {
    if (fs.existsSync(PERSONA_DIR)) {
      const files = fs.readdirSync(PERSONA_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const name = file.replace('.json', '');
        personas[name] = loadPersona(name);
      }
    }
  } catch (e) {
    console.error('Failed to list personas:', e.message);
  }
  return personas;
}
