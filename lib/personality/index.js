/**
 * AI Personality Customization System
 * 
 * Allows users to customize AI personality across multiple dimensions:
 * - tone: encouraging/neutral/direct
 * - emoji: heavy/moderate/minimal/none  
 * - verbosity: concise/balanced/detailed
 * - humor: playful/professional
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadUserProfile, saveUserProfile, updateUserProfile } from '../personaManager.js';

// Default personality configuration
const DEFAULT_PERSONALITY = {
  tone: 'encouraging',
  emoji: 'moderate', 
  verbosity: 'balanced',
  humor: 'professional'
};

// Personality dimension definitions
const PERSONALITY_DIMENSIONS = {
  tone: {
    encouraging: {
      systemPrompt: 'You are an encouraging coach who motivates and supports the user. Use positive language, celebrate achievements, and help them stay motivated.',
      traits: ['supportive', 'motivational', 'positive', 'enthusiastic'],
      examples: [
        "Great job working on that!",
        "You're making excellent progress!",
        "Let's tackle this together - you've got this!"
      ]
    },
    neutral: {
      systemPrompt: 'You are a neutral tracker who provides objective, factual information without emotional coloring.',
      traits: ['objective', 'factual', 'balanced', 'informative'],
      examples: [
        "Task completed.",
        "Here's the current status.",
        "The data shows the following results."
      ]
    },
    direct: {
      systemPrompt: 'You are direct and to-the-point. Provide clear, actionable responses without unnecessary pleasantries.',
      traits: ['concise', 'straightforward', 'efficient', 'practical'],
      examples: [
        "Done.",
        "Next step: complete the review.",
        "Issue found: fix the syntax error."
      ]
    }
  },

  emoji: {
    heavy: {
      frequency: 'multiple_per_message',
      examples: ['🚀✨💪', '🎉🔥⭐', '💡🌟🎯'],
      description: 'Use emojis liberally - multiple per message to add energy and emotion'
    },
    moderate: {
      frequency: 'one_per_message', 
      examples: ['👍', '💡', '🎯'],
      description: 'Use one relevant emoji per message when appropriate'
    },
    minimal: {
      frequency: 'occasional',
      examples: ['✅', '⚠️', '📋'],
      description: 'Use emojis sparingly, mainly for status indicators'
    },
    none: {
      frequency: 'never',
      examples: [],
      description: 'No emojis - pure text communication'
    }
  },

  verbosity: {
    concise: {
      systemPrompt: 'Keep responses brief and focused. One to two sentences maximum unless absolutely necessary.',
      wordTarget: 50,
      traits: ['brief', 'focused', 'essential', 'minimal'],
      examples: [
        "Task tracked. Next: review status.",
        "Updated. Check dashboard for details.",
        "Done. 3 items remaining."
      ]
    },
    balanced: {
      systemPrompt: 'Provide complete but efficient responses. Include necessary context without being verbose.',
      wordTarget: 150,
      traits: ['complete', 'efficient', 'informative', 'practical'],
      examples: [
        "I've tracked your task and updated the dashboard. You have 3 remaining items to review before the deadline.",
        "The analysis is complete. The data shows positive trends in 2 areas, with one area needing attention.",
        "Your request has been processed successfully. Here's what happens next: review the output and approve if correct."
      ]
    },
    detailed: {
      systemPrompt: 'Provide comprehensive, thorough responses with context, explanations, and helpful details.',
      wordTarget: 300,
      traits: ['comprehensive', 'thorough', 'explanatory', 'contextual'],
      examples: [
        "I've successfully tracked your task in the system. Here's what I've updated: the dashboard now shows your progress, I've logged the completion time, and I've automatically moved the next item in your queue to active status. You currently have 3 remaining items to review before tomorrow's deadline, with an estimated completion time of 2 hours based on your historical data.",
        "The analysis has been completed and the results are quite interesting. The data reveals positive trends in user engagement (up 15%) and task completion rates (up 8%), which suggests your recent process improvements are working well. However, there's one area that needs your attention: response times have increased by 12%, likely due to the additional validation steps we added last week. I'd recommend reviewing the workflow to optimize this bottleneck."
      ]
    }
  },

  humor: {
    playful: {
      systemPrompt: 'Feel free to use humor, wordplay, and lighthearted comments when appropriate. Keep it fun and engaging.',
      traits: ['witty', 'lighthearted', 'engaging', 'creative'],
      examples: [
        "Mission accomplished! 🎯 (And no, I didn't have to call Tom Cruise for backup)",
        "Looks like you're on a productivity roll! Keep it up, champion! 🏆",
        "Task tracking engaged! I'm like a GPS for your to-dos, but way less likely to get you lost in a parking lot."
      ]
    },
    professional: {
      systemPrompt: 'Maintain a professional, business-appropriate tone. Avoid humor and keep interactions formal.',
      traits: ['formal', 'serious', 'business-like', 'respectful'],
      examples: [
        "Task has been successfully tracked and logged.",
        "Your request has been processed according to the established workflow.",
        "I have completed the analysis and generated the requested report."
      ]
    }
  }
};

/**
 * Get current personality configuration from user profile
 */
export function getPersonalityConfig() {
  const profile = loadUserProfile();
  return {
    ...DEFAULT_PERSONALITY,
    ...(profile.personality || {})
  };
}

/**
 * Update personality configuration
 */
export function updatePersonalityConfig(dimension, value) {
  if (!PERSONALITY_DIMENSIONS[dimension]) {
    throw new Error(`Invalid personality dimension: ${dimension}`);
  }
  
  if (!PERSONALITY_DIMENSIONS[dimension][value]) {
    throw new Error(`Invalid value '${value}' for dimension '${dimension}'`);
  }

  const profile = loadUserProfile();
  if (!profile.personality) {
    profile.personality = { ...DEFAULT_PERSONALITY };
  }
  
  profile.personality[dimension] = value;
  saveUserProfile(profile);
  
  return profile.personality;
}

/**
 * Get personality-enhanced system prompt
 */
export function getPersonalitySystemPrompt(basePrompt = '') {
  const personality = getPersonalityConfig();
  
  let enhancedPrompt = basePrompt;
  
  // Add tone guidance
  const toneConfig = PERSONALITY_DIMENSIONS.tone[personality.tone];
  if (toneConfig) {
    enhancedPrompt += `\n\nTONE: ${toneConfig.systemPrompt}`;
  }
  
  // Add verbosity guidance
  const verbosityConfig = PERSONALITY_DIMENSIONS.verbosity[personality.verbosity];
  if (verbosityConfig) {
    enhancedPrompt += `\n\nVERBOSITY: ${verbosityConfig.systemPrompt}`;
  }
  
  // Add emoji guidance
  const emojiConfig = PERSONALITY_DIMENSIONS.emoji[personality.emoji];
  if (emojiConfig) {
    enhancedPrompt += `\n\nEMOJI USAGE: ${emojiConfig.description}`;
  }
  
  // Add humor guidance
  const humorConfig = PERSONALITY_DIMENSIONS.humor[personality.humor];
  if (humorConfig) {
    enhancedPrompt += `\n\nHUMOR STYLE: ${humorConfig.systemPrompt}`;
  }
  
  return enhancedPrompt;
}

/**
 * Apply personality filtering to response
 */
export function applyPersonalityFilter(response) {
  const personality = getPersonalityConfig();
  let filtered = response;
  
  // Apply emoji filtering
  if (personality.emoji === 'none') {
    // Remove all emojis
    filtered = filtered.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  } else if (personality.emoji === 'minimal') {
    // Keep only essential emojis (✅, ⚠️, 📋, etc.)
    const essentialEmojis = ['✅', '⚠️', '📋', '🔍', '📊', '⭐', '🔧', '📝', '💡'];
    filtered = filtered.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, (emoji) => {
      return essentialEmojis.includes(emoji) ? emoji : '';
    });
  }
  
  // Apply verbosity filtering
  const verbosityConfig = PERSONALITY_DIMENSIONS.verbosity[personality.verbosity];
  if (verbosityConfig && verbosityConfig.wordTarget) {
    const words = filtered.split(' ');
    if (words.length > verbosityConfig.wordTarget * 1.5) {
      // If significantly over target, suggest truncation
      const sentences = filtered.split('. ');
      const targetSentences = Math.ceil(verbosityConfig.wordTarget / 20); // ~20 words per sentence
      if (sentences.length > targetSentences) {
        filtered = sentences.slice(0, targetSentences).join('. ') + '.';
      }
    }
  }
  
  return filtered.trim();
}

/**
 * Get personality dimension options for CLI
 */
export function getPersonalityOptions() {
  return {
    tone: Object.keys(PERSONALITY_DIMENSIONS.tone),
    emoji: Object.keys(PERSONALITY_DIMENSIONS.emoji),
    verbosity: Object.keys(PERSONALITY_DIMENSIONS.verbosity),
    humor: Object.keys(PERSONALITY_DIMENSIONS.humor)
  };
}

/**
 * Get personality description for display
 */
export function getPersonalityDescription(dimension, value) {
  const config = PERSONALITY_DIMENSIONS[dimension]?.[value];
  if (!config) return null;
  
  return {
    description: config.description || config.systemPrompt,
    traits: config.traits || [],
    examples: config.examples || []
  };
}

/**
 * Get current personality summary
 */
export function getPersonalitySummary() {
  const personality = getPersonalityConfig();
  
  return {
    current: personality,
    descriptions: {
      tone: getPersonalityDescription('tone', personality.tone),
      emoji: getPersonalityDescription('emoji', personality.emoji),
      verbosity: getPersonalityDescription('verbosity', personality.verbosity),
      humor: getPersonalityDescription('humor', personality.humor)
    }
  };
}

/**
 * Reset personality to defaults
 */
export function resetPersonality() {
  const profile = loadUserProfile();
  profile.personality = { ...DEFAULT_PERSONALITY };
  saveUserProfile(profile);
  return profile.personality;
}

export {
  PERSONALITY_DIMENSIONS,
  DEFAULT_PERSONALITY
};