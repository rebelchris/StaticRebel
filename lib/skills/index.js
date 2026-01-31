/**
 * Skills module - public API
 * 
 * Data stored in: ~/.static-rebel/skills/*.md (definitions)
 *                 ~/.static-rebel/data/*.json (entries)
 */

export { SkillManager, getSkillManager, resetSkillManager } from './skill-manager.js';
export { 
  parseInput, 
  parseForLogging,
  parseForQuery,
  detectIntent,
  extractNumbers, 
  extractSkill,
  isSkillRelated,
  isTrackingIntent,
  parseWithSuggestions,
  SKILL_DEFAULTS
} from './nlp-parser.js';
export { GoalTracker } from './goals.js';
export * as visualize from './visualize.js';
export { InsightsEngine } from './insights.js';
export { NudgeEngine } from './nudges.js';
export { ChainEngine } from './chains.js';
export { TemplateManager, TEMPLATE_PACKS } from './templates.js';
export { SkillTeacher } from './teaching.js';
export { SkillAgent, SKILL_TOOLS, generateSystemPrompt } from './llm-agent.js';
export * as llmProviders from './llm-providers.js';
export { SkillMemory } from './memory.js';
