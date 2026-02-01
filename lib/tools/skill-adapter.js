/**
 * Skill Adapter
 * 
 * Adapts skills from the skills system to work as tools in the unified registry.
 * Bridges the gap between the existing skills system and the new tool system.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load skills as tools into the registry
 * @param {ToolRegistry} registry - Target registry
 */
export async function loadSkillsAsTools(registry) {
  console.log('🎯 Loading skills as tools...');
  
  try {
    // Import skills manager
    const { listSkills, loadSkill } = await import('../skillsManager.js');
    
    const skills = listSkills();
    let loadedCount = 0;
    
    for (const skill of skills) {
      try {
        await loadSkillAsTool(registry, skill);
        loadedCount++;
      } catch (error) {
        console.warn(`⚠️ Failed to load skill ${skill.name} as tool:`, error.message);
      }
    }
    
    // Load skill management tools
    registerSkillManagementTools(registry);
    
    console.log(`✅ Loaded ${loadedCount} skills as tools`);
  } catch (error) {
    console.warn('⚠️ Could not load skills as tools:', error.message);
  }
}

/**
 * Convert a skill to a tool
 * @param {ToolRegistry} registry - Target registry
 * @param {Object} skill - Skill definition
 */
async function loadSkillAsTool(registry, skill) {
  if (!skill.loaded || !skill.triggers || skill.triggers.length === 0) {
    return; // Skip skills without triggers
  }
  
  // Create a tool name from the skill
  const toolName = `skill_${skill.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  
  // Create tool definition
  const toolDef = {
    schema: {
      input: 'string',
      context: 'object?'
    },
    handler: async (params, context) => {
      const { input, context: skillContext = {} } = params;
      
      // Check triggers
      const matchedTriggers = skill.triggers.filter(trigger =>
        input.toLowerCase().includes(trigger.trigger.toLowerCase())
      );
      
      if (matchedTriggers.length === 0) {
        return {
          matched: false,
          message: `No triggers matched. Available triggers: ${skill.triggers.map(t => t.trigger).join(', ')}`
        };
      }
      
      // Execute the first matched trigger
      const trigger = matchedTriggers[0];
      
      // Import and use executeTrigger function
      const { executeTrigger } = await import('../skillsManager.js');
      const response = await executeTrigger({
        skill: skill.name,
        trigger: trigger.trigger,
        response: trigger.response
      }, {
        user: context.user || 'User',
        time: new Date().toLocaleTimeString(),
        ...skillContext
      });
      
      return {
        matched: true,
        trigger: trigger.trigger,
        response,
        skill: skill.name,
        input
      };
    },
    description: skill.description || `Skill: ${skill.name}`,
    metadata: {
      category: 'skill',
      skillName: skill.name,
      skillPath: skill.path,
      triggers: skill.triggers.map(t => t.trigger),
      prompts: skill.prompts.length
    }
  };
  
  registry.register(toolName, toolDef);
}

/**
 * Register skill management tools
 * @param {ToolRegistry} registry - Target registry
 */
function registerSkillManagementTools(registry) {
  // Tool to list all skills
  registry.register('skills_list', {
    schema: {},
    handler: async (params, context) => {
      const { listSkills, getSkillsStats } = await import('../skillsManager.js');
      
      const skills = listSkills();
      const stats = getSkillsStats();
      
      return {
        skills: skills.map(skill => ({
          name: skill.name,
          description: skill.description,
          loaded: skill.loaded,
          triggers: skill.triggers.length,
          prompts: skill.prompts.length,
          type: skill.type,
          path: skill.path
        })),
        stats
      };
    },
    description: 'List all available skills',
    metadata: {
      category: 'skill-management'
    }
  });
  
  // Tool to create new skills
  registry.register('skill_create', {
    schema: {
      name: 'string',
      description: 'string',
      triggers: 'array?',
      prompts: 'array?'
    },
    handler: async (params, context) => {
      const { name, description, triggers, prompts } = params;
      const { createSkill } = await import('../skillsManager.js');
      
      const options = {};
      if (triggers) {
        options.triggers = triggers.map(trigger => 
          typeof trigger === 'string' 
            ? `- trigger: "${trigger}"\n  response: "Hello from ${name}!"` 
            : `- trigger: "${trigger.trigger}"\n  response: "${trigger.response}"`
        ).join('\n');
      }
      
      if (prompts) {
        options.prompts = prompts.map(prompt =>
          typeof prompt === 'string'
            ? `- name: "${name} Prompt"\n  content: "${prompt}"`
            : `- name: "${prompt.name}"\n  content: "${prompt.content}"`
        ).join('\n');
      }
      
      const result = await createSkill(name, description, options);
      
      if (result.success) {
        // Reload the skill as a tool
        const { loadSkill } = await import('../skillsManager.js');
        const skill = loadSkill(name);
        if (skill) {
          await loadSkillAsTool(registry, skill);
        }
      }
      
      return result;
    },
    description: 'Create a new skill',
    rateLimit: {
      requests: 5,
      window: '5m'
    },
    metadata: {
      category: 'skill-management'
    }
  });
  
  // Tool to execute skill trigger directly
  registry.register('skill_trigger', {
    schema: {
      skill_name: 'string',
      trigger: 'string',
      context: 'object?'
    },
    handler: async (params, context) => {
      const { skill_name, trigger, context: skillContext = {} } = params;
      const { loadSkill, executeTrigger } = await import('../skillsManager.js');
      
      const skill = loadSkill(skill_name);
      if (!skill) {
        throw new Error(`Skill not found: ${skill_name}`);
      }
      
      const matchedTrigger = skill.triggers.find(t => 
        t.trigger.toLowerCase() === trigger.toLowerCase()
      );
      
      if (!matchedTrigger) {
        throw new Error(`Trigger not found in skill ${skill_name}: ${trigger}`);
      }
      
      const response = await executeTrigger({
        skill: skill_name,
        trigger: matchedTrigger.trigger,
        response: matchedTrigger.response
      }, {
        user: context.user || 'User',
        ...skillContext
      });
      
      return {
        skill: skill_name,
        trigger: matchedTrigger.trigger,
        response,
        executed: true
      };
    },
    description: 'Execute a specific skill trigger',
    metadata: {
      category: 'skill-management'
    }
  });
  
  console.log('✅ Registered skill management tools');
}

/**
 * Utility function to check if input matches any skill triggers
 * @param {string} input - User input
 * @param {ToolRegistry} registry - Tool registry
 * @returns {Array} Matching skill tools
 */
export async function findMatchingSkillTools(input, registry) {
  const skillTools = registry.list().filter(tool => 
    tool.metadata?.category === 'skill'
  );
  
  const matches = [];
  
  for (const tool of skillTools) {
    const triggers = tool.metadata?.triggers || [];
    const matchedTriggers = triggers.filter(trigger =>
      input.toLowerCase().includes(trigger.toLowerCase())
    );
    
    if (matchedTriggers.length > 0) {
      matches.push({
        toolName: tool.name,
        skillName: tool.metadata.skillName,
        matchedTriggers,
        confidence: matchedTriggers.length / triggers.length
      });
    }
  }
  
  // Sort by confidence
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Execute the best matching skill tool for given input
 * @param {string} input - User input
 * @param {ToolRegistry} registry - Tool registry
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Execution result
 */
export async function executeMatchingSkillTool(input, registry, context = {}) {
  const matches = await findMatchingSkillTools(input, registry);
  
  if (matches.length === 0) {
    return {
      success: false,
      message: 'No matching skill tools found',
      input
    };
  }
  
  // Execute the best match
  const bestMatch = matches[0];
  
  try {
    const result = await registry.execute(bestMatch.toolName, { input, context }, context);
    
    return {
      success: true,
      ...result,
      skillMatch: bestMatch
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      skillMatch: bestMatch
    };
  }
}