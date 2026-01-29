/**
 * Skills Action
 * Lists and manages custom skills
 */

export default {
  name: 'skills',
  displayName: 'Skills Management',
  description: 'List installed custom skills and their triggers',
  category: 'system',
  version: '1.0.0',

  intentExamples: [
    'what skills do I have',
    'list skills',
    'installed skills',
    'show my skills',
    'add a skill',
    'skill list',
  ],

  parameters: {},

  dependencies: ['skillsManager.listSkills', 'skillsManager.getSkillsStats'],

  async handler(input, context, params) {
    const { listSkills, getSkillsStats } = context.modules;

    const skills = listSkills();
    const stats = getSkillsStats();

    if (skills.length === 0) {
      return "You don't have any custom skills yet. Skills are reusable prompts and workflows.";
    }

    return (
      `**Your Skills (${stats.total}):**\n\n` +
      skills
        .map(
          (s) =>
            `- **${s.name}**: ${s.description || 'No description'}\n  ${s.triggers.length} triggers`,
        )
        .join('\n\n')
    );
  },

  source: 'builtin',
  enabled: true,
  createdAt: '2026-01-29',
};
