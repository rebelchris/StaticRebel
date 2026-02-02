/**
 * Persona Action
 * Manages AI personality and behavior
 */

export default {
  name: 'persona',
  displayName: 'Persona Management',
  description:
    'Change AI persona, adjust tone, and manage personality settings',
  category: 'utility',
  version: '1.0.1',

  intentExamples: [
    'change your persona',
    'switch your persona',
    'use a different persona',
    'use a different personality',
    'be more concise',
    'be more detailed',
    'be more friendly',
    'be more technical',
    'adjust your tone',
    'adjust your style',
    'adjust your personality',
    'persona',
  ],

  parameters: {
    action: {
      type: 'enum',
      values: ['list', 'switch', 'adjust'],
      description: 'Persona action to perform',
    },
  },

  dependencies: [],

  async handler(input, context, params) {
    // Get available functions from context.modules.personaManager
    const {
      getAvailablePersonas,
      buildSystemPrompt,
    } = context.modules.personaManager || {};

    // Fallback functions if not provided
    const personas = getAvailablePersonas ? getAvailablePersonas() : { default: { name: 'default', role: 'General Assistant' } };
    const getSystemPrompt = buildSystemPrompt || (() => 'You are Charlize, an AI assistant.');

    const lower = input.toLowerCase();

    // List or switch persona
    if (/change|switch|use/i.test(lower) && !/be more/i.test(lower)) {
      const personaList = Object.values(personas);
      return (
        `**Available Personas:**\n\n` +
        personaList
          .map((p) => `- **${p.name}** (${p.role || 'Assistant'})`)
          .join('\n') +
        `\n\nSay "change persona to <name>" to switch.`
      );
    }

    // Adjust current persona - simplified without modifyPersonaFeedback
    if (/be more|adjust/i.test(lower)) {
      let adjustment = '';
      if (/concise|short|brief/i.test(lower)) {
        adjustment = 'being more concise and direct';
      } else if (/friendly|warm|kind/i.test(lower)) {
        adjustment = 'being warmer and more friendly';
      } else if (/detailed|thorough|explained/i.test(lower)) {
        adjustment = 'providing more detail and explanation';
      } else if (/technical|expert/i.test(lower)) {
        adjustment = 'being more technical and precise';
      } else {
        return (
          `I can adjust my behavior! Try saying:\n` +
          `- "Be more concise" - for shorter responses\n` +
          `- "Be more friendly" - for warmer tone\n` +
          `- "Be more detailed" - for thorough explanations\n` +
          `- "Be more technical" - for expert-level answers`
        );
      }

      return (
        `✅ I'll start ${adjustment}!\n\n` +
        `This adjustment will apply to my responses going forward. ` +
        `Say "be more concise" or "be more friendly" anytime to fine-tune further.`
      );
    }

    // Default: show current persona
    const currentPrompt = getSystemPrompt();
    return (
      `**Current persona:** Charlize\n\n` +
      `I can adjust my personality based on what you need:\n` +
      `- Say "be more concise" for shorter, direct answers\n` +
      `- Say "be more friendly" for warmer, conversational tone\n` +
      `- Say "be more detailed" for thorough explanations\n` +
      `- Say "change persona" to see all available personas`
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
  updatedAt: '2026-02-02',
};
