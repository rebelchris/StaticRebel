/**
 * Intelligent Router - LLM-first intent routing
 * 
 * Replaces the pattern-matching + LLM-classification hybrid with a
 * single intelligent LLM call that understands context and skills.
 * 
 * The LLM decides:
 * 1. Use an existing skill (with parameters)
 * 2. Create a new skill (if user is trying to do something trackable/repeatable)
 * 3. Search the web (for current events, facts, lookups)
 * 4. Just chat (conversation, questions, help)
 */

import { getDefaultModel, chatCompletion } from './modelRegistry.js';
import { SkillManager, getSkillManager } from './skills/skill-manager.js';
import { research as webResearch } from './webOracle.js';
import { sendMessage } from '../agents/main/agent.js';
import { writeDailyMemory, readDailyMemory } from './memoryManager.js';
import { searchMemories } from './vectorMemory.js';
import { applyPersonalityFilter } from './personality/index.js';
import IntelligentCreator from './skills/intelligent-creator.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  DEBUG: process.env.DEBUG_ROUTER === 'true',
  MIN_CONFIDENCE: 0.6,
  ENABLE_AUTO_SKILL_CREATION: true,
  ENABLE_WEB_SEARCH: true,
  MAX_SKILLS_IN_PROMPT: 15, // Limit skills shown to LLM to avoid token bloat
};

// ============================================================================
// Core Router
// ============================================================================

/**
 * Main intelligent router - single entry point for all user input
 * 
 * @param {string} input - User's message
 * @param {Object} options - Router options
 * @returns {Promise<Object>} Response with type, content, metadata
 */
export async function routeIntelligently(input, options = {}) {
  const startTime = Date.now();
  const { context = {}, conversationHistory = [] } = options;
  
  if (CONFIG.DEBUG) {
    console.log(`[IntelligentRouter] Processing: "${input.substring(0, 100)}..."`);
  }

  try {
    // Step 1: Gather context
    const skillManager = await getSkillManager();
    const availableSkills = await getSkillSummaries(skillManager);
    const recentMemory = await getRecentContext(input);
    
    // Step 2: Ask LLM to understand intent
    const decision = await analyzeIntent(input, {
      availableSkills,
      recentMemory,
      conversationHistory: conversationHistory.slice(-5), // Last 5 messages
    });
    
    if (CONFIG.DEBUG) {
      console.log(`[IntelligentRouter] Decision:`, JSON.stringify(decision, null, 2));
    }
    
    // Step 3: Execute based on decision
    let result;
    switch (decision.action) {
      case 'use_skill':
        result = await executeSkill(decision, skillManager, context);
        break;
        
      case 'create_skill':
        result = await proposeSkillCreation(decision, input, context);
        break;
        
      case 'web_search':
        result = await performWebSearch(decision, input);
        break;
        
      case 'chat':
      default:
        result = await handleConversation(input, decision, context);
        break;
    }
    
    // Step 4: Log to memory if meaningful
    if (decision.action !== 'chat' || decision.confidence > 0.8) {
      try {
        writeDailyMemory(`[${decision.action}] ${input.substring(0, 80)}... -> ${result.type}`);
      } catch (e) {
        // Ignore memory errors
      }
    }
    
    const duration = Date.now() - startTime;
    
    return {
      ...result,
      decision,
      duration,
      source: options.source || 'unknown',
    };
    
  } catch (error) {
    console.error('[IntelligentRouter] Error:', error.message);
    
    // Fallback to basic chat
    const fallbackResponse = await sendMessage(input).catch(() => ({ content: "I'm having trouble processing that. Could you try rephrasing?" }));
    
    return {
      success: false,
      type: 'error_fallback',
      content: fallbackResponse?.content || "Sorry, something went wrong.",
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Intent Analysis
// ============================================================================

/**
 * Ask the LLM to understand what the user wants
 */
async function analyzeIntent(input, context) {
  const { availableSkills, recentMemory, conversationHistory } = context;
  
  const model = getDefaultModel();
  
  // Build skill descriptions
  const skillList = availableSkills.length > 0
    ? availableSkills.map(s => `- **${s.name}** (${s.id}): ${s.description}${s.triggers?.length ? ` [triggers: ${s.triggers.slice(0, 3).join(', ')}]` : ''}`).join('\n')
    : '(No skills configured yet)';
  
  // Build conversation context
  const historyText = conversationHistory.length > 0
    ? conversationHistory.map(m => `${m.role}: ${m.content.substring(0, 100)}`).join('\n')
    : '(No recent conversation)';
  
  const prompt = `You are an intelligent assistant router. Analyze the user's input and decide how to handle it.

## User Input
"${input}"

## Available Skills
${skillList}

## Recent Conversation
${historyText}

## Recent Memory Context
${recentMemory || '(No recent relevant memory)'}

## Your Task
Decide the best way to handle this input:

1. **use_skill** - If the user wants to log data, track something, or use a capability that matches an existing skill
2. **create_skill** - If the user is trying to track/log something NEW that doesn't have a skill yet (habits, metrics, activities)
3. **web_search** - If the user needs current information, facts, news, or real-time data you don't have
4. **chat** - If it's a question you can answer, conversation, help request, or general discussion

## Response Format (JSON only)
{
  "action": "use_skill" | "create_skill" | "web_search" | "chat",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of your choice",
  
  // For use_skill:
  "skillId": "skill_id_to_use",
  "skillAction": "log" | "query" | "stats" | "help",
  "extractedData": { "value": 123, "unit": "ml", "note": "optional note" },
  
  // For create_skill:
  "proposedSkill": {
    "name": "skill name",
    "type": "counter" | "number" | "duration" | "scale" | "text",
    "description": "what it tracks",
    "unit": "optional unit",
    "triggers": ["keyword1", "keyword2"]
  },
  
  // For web_search:
  "searchQuery": "optimized search query",
  
  // For chat:
  "suggestedResponse": "optional direct response if simple"
}

Rules:
- Be decisive. Pick the most appropriate action.
- For tracking inputs like "drank 500ml water" or "did 20 pushups", use_skill or create_skill
- For questions like "what's the weather" or "latest news about X", use web_search
- For conversation, questions about the assistant, or help requests, use chat
- If a skill exists that matches, prefer use_skill over create_skill
- Confidence should reflect how certain you are (0.9+ for clear matches, 0.6-0.8 for likely, <0.6 for uncertain)`;

  try {
    const response = await chatCompletion(model, [
      {
        role: 'system',
        content: 'You are an intent classifier. Output ONLY valid JSON. No explanations outside JSON.',
      },
      { role: 'user', content: prompt },
    ]);
    
    const content = response?.message || '';
    
    // Parse JSON response
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse LLM response as JSON');
      }
    }
    
    // Validate and normalize
    return {
      action: result.action || 'chat',
      confidence: result.confidence || 0.5,
      reasoning: result.reasoning || '',
      skillId: result.skillId,
      skillAction: result.skillAction,
      extractedData: result.extractedData,
      proposedSkill: result.proposedSkill,
      searchQuery: result.searchQuery,
      suggestedResponse: result.suggestedResponse,
    };
    
  } catch (error) {
    console.error('[IntelligentRouter] Intent analysis failed:', error.message);
    
    // Default to chat on error
    return {
      action: 'chat',
      confidence: 0.3,
      reasoning: 'Fallback due to analysis error',
    };
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Execute an existing skill
 */
async function executeSkill(decision, skillManager, context) {
  const { skillId, skillAction, extractedData } = decision;
  
  const skill = skillManager.skills.get(skillId);
  if (!skill) {
    return {
      success: false,
      type: 'skill_not_found',
      content: `I couldn't find the skill "${skillId}". Available skills: ${Array.from(skillManager.skills.keys()).join(', ')}`,
    };
  }
  
  try {
    switch (skillAction) {
      case 'log':
        const logResult = await skillManager.addEntry(skillId, {
          value: extractedData?.value || 1,
          unit: extractedData?.unit || skill.unit,
          note: extractedData?.note,
          source: 'intelligent-router',
        });
        
        const todayStats = await skillManager.getTodayStats(skillId);
        let response = `${skill.icon || '✅'} Logged to **${skill.name}**: ${extractedData?.value || 1}${skill.unit ? ' ' + skill.unit : ''}`;
        
        if (todayStats.sum > 0) {
          response += `\n📊 Today's total: ${todayStats.sum}${skill.unit ? ' ' + skill.unit : ''}`;
          if (skill.dailyGoal) {
            const progress = Math.round((todayStats.sum / skill.dailyGoal) * 100);
            response += ` (${progress}% of ${skill.dailyGoal} goal)`;
          }
        }
        
        return {
          success: true,
          type: 'skill_log',
          content: response,
          skill: skill.name,
          logged: extractedData,
        };
        
      case 'query':
      case 'stats':
        const stats = await skillManager.getTodayStats(skillId);
        const weekStats = await skillManager.getWeekStats?.(skillId) || { sum: 0, count: 0 };
        
        let statsResponse = `**${skill.name}** ${skill.icon || '📊'}\n`;
        statsResponse += `Today: ${stats.sum}${skill.unit ? ' ' + skill.unit : ''} (${stats.count} entries)\n`;
        statsResponse += `This week: ${weekStats.sum}${skill.unit ? ' ' + skill.unit : ''} (${weekStats.count} entries)`;
        
        if (skill.dailyGoal) {
          const todayProgress = Math.round((stats.sum / skill.dailyGoal) * 100);
          statsResponse += `\n🎯 Daily goal: ${todayProgress}% complete`;
        }
        
        return {
          success: true,
          type: 'skill_stats',
          content: statsResponse,
          skill: skill.name,
          stats: { today: stats, week: weekStats },
        };
        
      case 'help':
      default:
        return {
          success: true,
          type: 'skill_help',
          content: `**${skill.name}** ${skill.icon || ''}\n${skill.description || 'No description'}\n\nTriggers: ${skill.triggers.join(', ')}\nExamples: ${skill.examples?.slice(0, 3).join(', ') || 'None'}`,
          skill: skill.name,
        };
    }
  } catch (error) {
    console.error(`[IntelligentRouter] Skill execution failed:`, error);
    return {
      success: false,
      type: 'skill_error',
      content: `Error using ${skill.name}: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Propose creating a new skill
 */
async function proposeSkillCreation(decision, input, context) {
  const { proposedSkill } = decision;
  
  if (!CONFIG.ENABLE_AUTO_SKILL_CREATION) {
    return {
      success: false,
      type: 'skill_creation_disabled',
      content: "I could create a skill for that, but auto-creation is disabled. You can create one manually.",
    };
  }
  
  if (!proposedSkill) {
    return {
      success: false,
      type: 'skill_creation_failed',
      content: "I couldn't figure out what kind of skill to create. Could you be more specific?",
    };
  }
  
  // If confidence is very high, create automatically
  if (decision.confidence >= 0.85) {
    try {
      const creator = new IntelligentCreator();
      const result = await creator.createSkill(proposedSkill);
      
      if (result.success) {
        // Also log the initial entry if there was extracted data
        let response = `✨ Created new skill: **${proposedSkill.name}**\n${proposedSkill.description}\n\nYou can now track this with phrases like: "${proposedSkill.triggers?.[0] || proposedSkill.name} [value]"`;
        
        return {
          success: true,
          type: 'skill_created',
          content: response,
          skill: proposedSkill,
        };
      }
    } catch (error) {
      console.error('[IntelligentRouter] Auto skill creation failed:', error);
    }
  }
  
  // Otherwise, ask for confirmation
  return {
    success: true,
    type: 'skill_creation_proposed',
    content: `I don't have a skill for that yet. Would you like me to create one?\n\n**Proposed skill:**\n- Name: ${proposedSkill.name}\n- Type: ${proposedSkill.type}\n- Description: ${proposedSkill.description}\n- Unit: ${proposedSkill.unit || 'none'}\n\nReply "yes" or "create it" to confirm.`,
    proposedSkill,
    awaitingConfirmation: true,
  };
}

/**
 * Perform web search
 */
async function performWebSearch(decision, input) {
  if (!CONFIG.ENABLE_WEB_SEARCH) {
    return {
      success: false,
      type: 'web_search_disabled',
      content: "Web search is disabled. I can only answer from my knowledge.",
    };
  }
  
  const query = decision.searchQuery || input;
  
  try {
    const searchResult = await webResearch(query);
    
    if (searchResult?.content) {
      return {
        success: true,
        type: 'web_search',
        content: searchResult.content,
        query,
        sources: searchResult.sources,
      };
    }
    
    return {
      success: false,
      type: 'web_search_no_results',
      content: `I couldn't find relevant information for: "${query}"`,
    };
    
  } catch (error) {
    console.error('[IntelligentRouter] Web search failed:', error);
    return {
      success: false,
      type: 'web_search_error',
      content: `Search failed: ${error.message}. Try rephrasing your question.`,
      error: error.message,
    };
  }
}

/**
 * Handle conversational response
 */
async function handleConversation(input, decision, context) {
  // If the LLM already provided a suggested response, use it
  if (decision.suggestedResponse && decision.confidence > 0.8) {
    return {
      success: true,
      type: 'chat',
      content: applyPersonalityFilter(decision.suggestedResponse),
    };
  }
  
  // Otherwise, send to the main chat agent
  try {
    const response = await sendMessage(input);
    const content = response?.content || "I'm not sure how to respond to that.";
    
    return {
      success: true,
      type: 'chat',
      content: applyPersonalityFilter(content),
    };
  } catch (error) {
    return {
      success: false,
      type: 'chat_error',
      content: "I'm having trouble connecting to my brain. Is Ollama running?",
      error: error.message,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get summaries of all available skills (limited for prompt size)
 */
async function getSkillSummaries(skillManager) {
  await skillManager.init();
  
  const skills = Array.from(skillManager.skills.values());
  
  // Sort by usage (if tracked) or alphabetically
  const sorted = skills.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  
  // Limit to avoid token bloat
  return sorted.slice(0, CONFIG.MAX_SKILLS_IN_PROMPT).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || `Track ${s.name}`,
    triggers: s.triggers,
    type: s.type || 'counter',
    icon: s.icon,
  }));
}

/**
 * Get recent memory context relevant to the input
 */
async function getRecentContext(input) {
  try {
    // Search vector memory for relevant past context
    const memories = await searchMemories(input, 3);
    
    if (memories && memories.length > 0) {
      return memories.map(m => m.content || m.text).join('\n');
    }
    
    // Fall back to today's memory
    const todayMemory = await readDailyMemory();
    if (todayMemory) {
      // Return last few entries
      const lines = todayMemory.split('\n').filter(l => l.trim());
      return lines.slice(-5).join('\n');
    }
    
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  routeIntelligently,
  CONFIG,
};
