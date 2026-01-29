/**
 * Conversational Engine - Unified chat processing with persona and memory
 * Integrates session memory, user profile, and dynamic prompts
 */

import {
  getActivePersona,
  buildSystemPrompt,
  generateGreeting,
  getFallbackResponse,
  needsClarification,
  generateClarification,
  trackInteraction,
  addFrequentlyAsked,
} from './personaManager.js';
import { getSessionMemory } from './sessionMemory.js';
import { logFeedback } from './feedbackManager.js';
import { chatCompletion, getDefaultModel } from './modelRegistry.js';
import { writeDailyMemory } from './memoryManager.js';
import { handleChat } from './chatHandler.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  maxRetries: 2,
  clarificationThreshold: 0.4,
  enableFeedback: true,
  enableSessionMemory: true,
  enablePersona: true,
};

// ============================================================================
// Main Conversational Interface
// ============================================================================

/**
 * Process user input with full conversational context
 */
export async function processConversation(userInput, options = {}) {
  const startTime = Date.now();
  const sessionMemory = getSessionMemory();

  // Check for continuation/references
  const continuation = sessionMemory.detectContinuation(userInput);
  const reference = sessionMemory.findReferencedTopic(userInput);

  // Check if clarification is needed
  if (needsClarification(userInput) && !continuation.isContinuation) {
    const clarification = generateClarification(userInput);

    // Store the interaction
    sessionMemory.addInteraction(userInput, clarification, {
      intent: 'clarification',
      context: { needsClarification: true },
    });

    return {
      type: 'clarification',
      content: clarification,
      metadata: {
        duration: Date.now() - startTime,
        needsClarification: true,
      },
    };
  }

  // Build enhanced context
  const context = buildConversationContext(userInput, {
    continuation,
    reference,
    sessionMemory: CONFIG.enableSessionMemory ? sessionMemory : null,
  });

  // Get response from chat handler
  let result;
  try {
    result = await handleChat(userInput, {
      source: options.source || 'conversational-engine',
      context,
      skipLLMClassification: options.skipLLMClassification,
    });
  } catch (error) {
    console.error('Chat handler error:', error);
    result = {
      type: 'error',
      content: getFallbackResponse(),
    };
  }

  // Enhance response with persona
  if (CONFIG.enablePersona && result.type === 'chat') {
    result.content = await enhanceWithPersona(result.content, context);
  }

  // Store in session memory
  if (CONFIG.enableSessionMemory) {
    sessionMemory.addInteraction(userInput, result.content, {
      intent: result.intent || result.type,
      action: result.action,
      context: {
        topic: extractTopic(userInput),
        confidence: result.confidence,
      },
    });
  }

  // Track interaction
  trackInteraction(result.type, {
    command: result.action,
    duration: Date.now() - startTime,
  });

  // Add to frequently asked if it's a question
  if (isQuestion(userInput)) {
    addFrequentlyAsked(userInput, result.type);
  }

  // Write to daily memory
  await writeDailyMemory(
    `User: ${userInput}\nAssistant: ${result.content.substring(0, 200)}...`,
  );

  const duration = Date.now() - startTime;

  return {
    ...result,
    metadata: {
      ...result.metadata,
      duration,
      feedbackEnabled: CONFIG.enableFeedback,
      interactionId:
        sessionMemory.interactions[sessionMemory.interactions.length - 1]?.id,
    },
  };
}

/**
 * Build comprehensive conversation context
 */
function buildConversationContext(userInput, options = {}) {
  const sessionMemory = options.sessionMemory || getSessionMemory();
  const persona = getActivePersona();

  const context = {
    userInput,
    persona: {
      name: persona.name,
      style: persona.style,
      greeting: persona.greeting,
    },
    session: {
      interactionCount: sessionMemory.interactions.length,
      duration: sessionMemory.getSessionDuration(),
    },
  };

  // Add continuation context
  if (options.continuation?.isContinuation) {
    context.continuation = options.continuation;
    context.isContinuation = true;
  }

  // Add reference context
  if (options.reference) {
    context.referencedTopic = options.reference;
  }

  return context;
}

/**
 * Enhance response with persona characteristics
 */
async function enhanceWithPersona(response, context) {
  const persona = getActivePersona();

  // If persona has specific formatting rules, apply them
  if (persona.style === 'concise' && response.length > 200) {
    // Keep it brief
    return response;
  }

  if (persona.style === 'friendly' && !response.match(/[😀-🿿]/u)) {
    // Add friendly emoji if none present (optional enhancement)
  }

  return response;
}

/**
 * Handle feedback on a response
 */
export function handleFeedback(interactionId, rating, comment = null) {
  const sessionMemory = getSessionMemory();

  // Add to session memory
  sessionMemory.addFeedback(interactionId, rating);

  // Log for analytics
  const interaction = sessionMemory.interactions.find(
    (i) => i.id === interactionId,
  );

  logFeedback({
    interactionId,
    rating,
    comment,
    timestamp: new Date().toISOString(),
    context: interaction
      ? {
          intent: interaction.intent,
          action: interaction.action,
          userInput: interaction.user,
        }
      : null,
  });

  return {
    success: true,
    message:
      rating === '👍'
        ? 'Thanks for the feedback! 😊'
        : "Thanks for letting me know. I'll try to do better!",
  };
}

/**
 * Get conversation history for display
 */
export function getConversationHistory(count = 10) {
  const sessionMemory = getSessionMemory();
  return sessionMemory.getRecent(count).map((i) => ({
    id: i.id,
    user: i.user,
    assistant: i.assistant,
    timestamp: i.timestamp,
    feedback: i.feedback,
  }));
}

/**
 * Get personalized greeting
 */
export function getGreeting() {
  return generateGreeting();
}

/**
 * Get session summary
 */
export function getSessionSummary() {
  const sessionMemory = getSessionMemory();
  return sessionMemory.getSummary();
}

/**
 * Clear conversation history
 */
export function clearConversation() {
  const sessionMemory = getSessionMemory();
  sessionMemory.clear();
  return { success: true, message: 'Conversation history cleared.' };
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractTopic(input) {
  // Simple topic extraction
  const lower = input.toLowerCase();

  if (
    lower.includes('code') ||
    lower.includes('function') ||
    lower.includes('script')
  ) {
    return 'coding';
  }
  if (
    lower.includes('file') ||
    lower.includes('folder') ||
    lower.includes('directory')
  ) {
    return 'filesystem';
  }
  if (
    lower.includes('git') ||
    lower.includes('commit') ||
    lower.includes('branch')
  ) {
    return 'git';
  }
  if (lower.includes('memory') || lower.includes('remember')) {
    return 'memory';
  }
  if (
    lower.includes('tracker') ||
    lower.includes('log') ||
    lower.includes('calories')
  ) {
    return 'tracking';
  }

  return 'general';
}

function isQuestion(input) {
  return /\?$|^(what|how|why|when|where|who|can|could|would|will|is|are|do|does)/i.test(
    input.trim(),
  );
}

// ============================================================================
// Export for use in other modules
// ============================================================================

export default {
  processConversation,
  handleFeedback,
  getConversationHistory,
  getGreeting,
  getSessionSummary,
  clearConversation,
};
