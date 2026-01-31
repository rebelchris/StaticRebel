/**
 * Skills module - public API
 */

export { SkillManager, getSkillManager } from './skill-manager.js';
export { parseInput, parseWithSuggestions, extractNumbers } from './nlp-parser.js';
export { GoalTracker } from './goals.js';
export * as visualize from './visualize.js';
export { InsightsEngine } from './insights.js';
export { TemplateManager, TEMPLATE_PACKS } from './templates.js';
