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

import fs from 'fs';
import path from 'path';
import os from 'os';
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
// Pending State (for confirmations) - File-based for web dashboard support
// ============================================================================

const PENDING_FILE = path.join(os.homedir(), '.static-rebel', 'data', 'pending-confirmations.json');

function ensureDataDir() {
  const dir = path.dirname(PENDING_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadPendingConfirmations() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('[IntelligentRouter] Failed to load pending confirmations:', e.message);
  }
  return {};
}

function savePendingConfirmations(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[IntelligentRouter] Failed to save pending confirmations:', e.message);
  }
}

function setPendingConfirmation(sessionId, data) {
  const all = loadPendingConfirmations();
  all[sessionId || 'default'] = {
    ...data,
    timestamp: Date.now(),
  };
  savePendingConfirmations(all);
}

function getPendingConfirmation(sessionId) {
  const all = loadPendingConfirmations();
  const pending = all[sessionId || 'default'];
  // Expire after 5 minutes
  if (pending && Date.now() - pending.timestamp < 5 * 60 * 1000) {
    return pending;
  }
  // Clean up expired
  if (pending) {
    delete all[sessionId || 'default'];
    savePendingConfirmations(all);
  }
  return null;
}

function clearPendingConfirmation(sessionId) {
  const all = loadPendingConfirmations();
  delete all[sessionId || 'default'];
  savePendingConfirmations(all);
}

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
  const sessionId = context.sessionId || context.chatId || 'default';
  
  if (CONFIG.DEBUG) {
    console.log(`[IntelligentRouter] Processing: "${input.substring(0, 100)}..."`);
  }

  try {
    // Step 0: Check for pending confirmation (yes/no/create responses)
    const lowerInput = input.toLowerCase().trim();
    const isConfirmation = /^(yes|yeah|yep|ok|okay|sure|create|create it|do it|go ahead|confirm)$/i.test(lowerInput);
    const isRejection = /^(no|nope|nah|cancel|nevermind|never mind)$/i.test(lowerInput);
    
    if (isConfirmation || isRejection) {
      const pending = getPendingConfirmation(sessionId);
      if (pending) {
        clearPendingConfirmation(sessionId);
        
        if (isRejection) {
          return {
            success: true,
            type: 'confirmation_rejected',
            content: "Okay, cancelled.",
            duration: Date.now() - startTime,
          };
        }
        
        // Handle the pending action
        if (pending.type === 'create_skill' && pending.proposedSkill) {
          const skillManager = await getSkillManager();
          const result = await executeSkillCreation(pending.proposedSkill, pending.originalInput, skillManager);
          return {
            ...result,
            duration: Date.now() - startTime,
          };
        }
      }
    }
    
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
  
  // Build skill descriptions with rich matching context
  const skillList = availableSkills.length > 0
    ? availableSkills.map(s => 
        `- **${s.name}** (id: ${s.id}, unit: ${s.unit || 'count'}): ${s.description}` +
        `\n  Matches: ${s.matchHints || s.triggers?.join(', ') || s.name}`
      ).join('\n')
    : '(No skills configured yet)';
  
  // Build conversation context
  const historyText = conversationHistory.length > 0
    ? conversationHistory.map(m => `${m.role}: ${m.content.substring(0, 100)}`).join('\n')
    : '(No recent conversation)';
  
  const prompt = `You are an intelligent assistant router. Analyze the user's input and decide how to handle it.

## User Input
"${input}"

## Available Skills (ONLY these exist)
${skillList}

## Your Task
Decide the BEST way to handle this input:

1. **use_skill** - User wants to LOG DATA to an EXISTING skill listed above
2. **create_skill** - User wants to track something that has NO matching skill above
3. **web_search** - User needs CURRENT/REAL-TIME info (today's weather, live scores, recent news)
4. **chat** - General questions, facts, conversation, help (YOU CAN ANSWER THESE DIRECTLY)

## CRITICAL RULES

### For use_skill:
- Match skills by their "Matches" keywords - if ANY keyword matches, USE that skill
- "2 glasses of water" → matches "water" skill (glass, glasses are water-related!)
- "had some water" → matches "water" skill
- "drank coffee" → matches "coffee" skill
- NEVER use a skill for unrelated things (mood ≠ food, exercise ≠ water)
- EXTRACT THE EXACT NUMERIC VALUE from the input:
  - "500ml water" → value: 500, unit: "ml"
  - "2 glasses of water" → value: 500, unit: "ml" (1 glass ≈ 250ml, so 2 = 500)
  - "2L water" → value: 2000, unit: "ml" (convert!)
  - "20 pushups" → value: 20, unit: "reps"
  - "400kcal lunch" → value: 400, unit: "kcal"

### For create_skill:
- Use when user tries to track something with NO matching skill
- "400kcal lunch" with no food/calories skill → create_skill
- Propose a sensible skill structure

### For web_search:
- ONLY for real-time, current, changing information
- Weather TODAY, news TODAY, live events, stock prices
- NOT for general knowledge facts!

### For chat:
- General knowledge questions (size of moon, capital of France)
- Conversations, greetings, help requests
- Anything you can answer from your training data
- "How big is the moon?" → chat (you know this!)
- "How big is Uranus?" → chat (you know this!)

## Response Format (JSON only)
{
  "action": "use_skill" | "create_skill" | "web_search" | "chat",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  
  "skillId": "exact_skill_id",
  "skillAction": "log",
  "extractedData": { "value": <NUMBER>, "unit": "<unit>" },
  
  "proposedSkill": {
    "name": "skill name",
    "type": "number",
    "description": "what it tracks",
    "unit": "unit",
    "triggers": ["keyword1", "keyword2"]
  },
  
  "searchQuery": "query for web search",
  
  "suggestedResponse": "your direct answer for chat"
}

IMPORTANT: Extract the ACTUAL numeric value. "500ml" means value=500, NOT value=1.`;

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
  
  if (CONFIG.DEBUG) {
    console.log(`[IntelligentRouter] executeSkill: skillId=${skillId}, action=${skillAction}, extractedData=`, extractedData);
  }
  
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
        // Ensure we have a valid numeric value
        let valueToLog = 1;
        if (extractedData?.value !== undefined && extractedData?.value !== null) {
          valueToLog = Number(extractedData.value);
          if (isNaN(valueToLog)) valueToLog = 1;
        }
        
        const logResult = await skillManager.addEntry(skillId, {
          value: valueToLog,
          unit: extractedData?.unit || skill.unit,
          note: extractedData?.note,
          source: 'intelligent-router',
        });
        
        const todayStats = await skillManager.getTodayStats(skillId);
        let response = `${skill.icon || '✅'} Logged to **${skill.name}**: ${valueToLog}${skill.unit ? ' ' + skill.unit : ''}`;
        
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
  const sessionId = context?.sessionId || context?.chatId || 'default';
  
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
    const skillManager = await getSkillManager();
    const result = await executeSkillCreation(proposedSkill, input, skillManager);
    if (result.success) {
      return result;
    }
  }
  
  // Otherwise, ask for confirmation and store pending state
  setPendingConfirmation(sessionId, {
    type: 'create_skill',
    proposedSkill,
    originalInput: input,
    extractedData: decision.extractedData,
  });
  
  return {
    success: true,
    type: 'skill_creation_proposed',
    content: `I don't have a skill for that yet. Would you like me to create one?\n\n**Proposed skill:**\n- Name: ${proposedSkill.name}\n- Type: ${proposedSkill.type}\n- Description: ${proposedSkill.description}\n- Unit: ${proposedSkill.unit || 'none'}\n\nReply "yes" or "create it" to confirm.`,
    proposedSkill,
    awaitingConfirmation: true,
  };
}

/**
 * Execute skill creation (after confirmation or auto)
 */
async function executeSkillCreation(proposedSkill, originalInput, skillManager) {
  try {
    const creator = new IntelligentCreator();
    const result = await creator.createSkill(proposedSkill);
    
    if (result.success) {
      // Reload skills
      await skillManager.loadAllSkills();
      
      let response = `✨ Created new skill: **${proposedSkill.name}**\n${proposedSkill.description}\n\nYou can now track this with phrases like: "${proposedSkill.triggers?.[0] || proposedSkill.name} [value]"`;
      
      return {
        success: true,
        type: 'skill_created',
        content: response,
        skill: proposedSkill,
      };
    }
    
    return {
      success: false,
      type: 'skill_creation_failed',
      content: `Failed to create skill: ${result.error || 'Unknown error'}`,
    };
  } catch (error) {
    console.error('[IntelligentRouter] Skill creation failed:', error);
    return {
      success: false,
      type: 'skill_creation_failed',
      content: `Failed to create skill: ${error.message}`,
    };
  }
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
  
  // Limit to avoid token bloat - but include rich detail for matching
  return sorted.slice(0, CONFIG.MAX_SKILLS_IN_PROMPT).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description || `Track ${s.name}`,
    triggers: s.triggers || [],
    unit: s.unit || '',
    type: s.type || 'counter',
    icon: s.icon || '📊',
    dailyGoal: s.dailyGoal,
    // Include raw content hints for better matching
    matchHints: [
      s.name.toLowerCase(),
      ...(s.triggers || []),
      s.unit,
      // Common related terms
      s.id === 'water' ? 'glass,glasses,drink,drank,hydrate,hydration,bottle' : '',
      s.id === 'coffee' ? 'cup,cups,espresso,latte,caffeine' : '',
      s.id === 'steps' ? 'walk,walked,walking,distance' : '',
    ].filter(Boolean).join(','),
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
