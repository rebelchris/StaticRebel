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
  version: '1.0.0',

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

  dependencies: [
    'personaManager.getAvailablePersonas',
    'personaManager.setActivePersona',
    'personaManager.modifyPersonaFeedback',
    'personaManager.getSystemPrompt',
  ],

  async handler(input, context, params) {
    const {
      getAvailablePersonas,
      setActivePersona,
      modifyPersonaFeedback,
      getSystemPrompt,
    } = context.modules.personaManager;

    const lower = input.toLowerCase();
    const personas = getAvailablePersonas();

    // List or switch persona
    if (/change|switch|use/i.test(lower) && !/be more/i.test(lower)) {
      return (
        `**Available Personas:**\n\n` +
        Object.values(personas)
          .map((p) => `- **${p.name}** (${p.role})`)
          .join('\n') +
        `\n\nSay "Use <persona name>" to switch.`
      );
    }

    // Adjust current persona
    if (/be more|adjust/i.test(lower)) {
      const result = modifyPersonaFeedback('charlize', input);
      if (result.success) {
        return (
          `✅ Updated persona preferences:\n\n` +
          `- ${result.modifications.join('\n- ')}\n\n` +
          `These changes are now permanent.`
        );
      }
      return 'Could not update persona. Try rephrasing your request.';
    }

    // Default: show current persona
    const current = getSystemPrompt();
    return (
      `**Current persona:** Charlize\n\n` +
      `Say "be more concise" or "be more friendly" to adjust my behavior.\n` +
      `Say "change persona" to see all available personas.`
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
