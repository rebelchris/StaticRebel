/**
 * Simple Router - Deterministic first, LLM second
 * 
 * Philosophy: Don't ask the LLM to do what simple code can do better.
 * 
 * 1. Keyword matching for skills (fast, reliable)
 * 2. Regex for value extraction (deterministic)
 * 3. LLM only for: ambiguous cases, conversation, web search decisions
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getSkillManager } from './skills/skill-manager.js';
import { getDefaultModel, chatCompletion } from './modelRegistry.js';
import { sendMessage } from '../agents/main/agent.js';
import { research as webResearch } from './webOracle.js';
import { applyPersonalityFilter } from './personality/index.js';

const CONFIG = {
  DEBUG: process.env.DEBUG_ROUTER === 'true',
};

// ============================================================================
// Value Extraction (Regex-based, deterministic)
// ============================================================================

const VALUE_PATTERNS = [
  // Explicit amounts: "500ml", "2L", "400kcal", "20 reps"
  { regex: /(\d+(?:\.\d+)?)\s*(ml|l|liters?|litres?|oz|cups?|glasses?|bottles?)/i, unit: 'ml', multiplier: (m) => m[2].match(/^l|liter|litre/i) ? 1000 : m[2].match(/glass/i) ? 250 : m[2].match(/bottle/i) ? 500 : m[2].match(/cup/i) ? 250 : 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(kcal|calories?|cals?)/i, unit: 'kcal', multiplier: () => 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(kg|kilos?|lbs?|pounds?)/i, unit: 'kg', multiplier: (m) => m[2].match(/lb|pound/i) ? 0.45 : 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(km|miles?|m|meters?)/i, unit: 'km', multiplier: (m) => m[2].match(/mile/i) ? 1.6 : m[2] === 'm' ? 0.001 : 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(steps?)/i, unit: 'steps', multiplier: () => 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(reps?|times?|sets?)/i, unit: 'reps', multiplier: () => 1 },
  { regex: /(\d+(?:\.\d+)?)\s*(mins?|minutes?|hrs?|hours?)/i, unit: 'minutes', multiplier: (m) => m[2].match(/hr|hour/i) ? 60 : 1 },
  // Contextual amounts: "2 glasses", "a bottle", "3 coffees"
  { regex: /(\d+)\s*glasses?/i, unit: 'ml', multiplier: () => 250 },
  { regex: /(\d+)\s*bottles?/i, unit: 'ml', multiplier: () => 500 },
  { regex: /(\d+)\s*cups?/i, unit: 'ml', multiplier: () => 250 },
  { regex: /a\s+glass/i, unit: 'ml', value: 250 },
  { regex: /a\s+bottle/i, unit: 'ml', value: 500 },
  { regex: /a\s+cup/i, unit: 'ml', value: 250 },
  // Bare numbers at the end: "water 500", "pushups 20"
  { regex: /\s(\d+)\s*$/, unit: 'count', multiplier: () => 1 },
];

function extractValue(input) {
  for (const pattern of VALUE_PATTERNS) {
    const match = input.match(pattern.regex);
    if (match) {
      if (pattern.value) {
        return { value: pattern.value, unit: pattern.unit };
      }
      const rawValue = parseFloat(match[1]);
      const multiplier = pattern.multiplier ? pattern.multiplier(match) : 1;
      return { value: Math.round(rawValue * multiplier), unit: pattern.unit };
    }
  }
  return { value: 1, unit: 'count' }; // Default
}

// ============================================================================
// Intent Detection (Keyword-based)
// ============================================================================

const QUERY_PATTERNS = [
  /how (many|much)/i,
  /show (me )?(my )?/i,
  /what('s| is| are) (my )?/i,
  /display/i,
  /stats?/i,
  /today('s)?/i,
  /history/i,
  /total/i,
  /progress/i,
];

const LOG_PATTERNS = [
  /^(i |my |just |had |ate |drank |did |logged |tracked |walked |ran )/i,
  /was \d+/i,
  /\d+\s*(ml|l|kcal|cal|kg|km|steps|reps|mins|hours)/i,
];

function detectIntent(input) {
  const lower = input.toLowerCase();
  
  // Check for query intent
  if (QUERY_PATTERNS.some(p => p.test(lower))) {
    return 'query';
  }
  
  // Check for log intent
  if (LOG_PATTERNS.some(p => p.test(lower))) {
    return 'log';
  }
  
  return 'unknown';
}

// ============================================================================
// Skill Matching (Keyword-based)
// ============================================================================

function findMatchingSkill(input, skills) {
  const lower = input.toLowerCase();
  
  // Score each skill by keyword matches
  let bestMatch = null;
  let bestScore = 0;
  
  for (const skill of skills) {
    let score = 0;
    
    // Check skill ID
    if (lower.includes(skill.id)) score += 10;
    
    // Check skill name
    if (lower.includes(skill.name.toLowerCase())) score += 10;
    
    // Check triggers
    for (const trigger of (skill.triggers || [])) {
      if (lower.includes(trigger.toLowerCase())) score += 5;
    }
    
    // Semantic matching - what is this skill FOR?
    const skillPurpose = getSkillPurpose(skill);
    if (inputMatchesPurpose(lower, skillPurpose)) score += 8;
    
    // Negative matching - penalize wrong matches
    if (isPurposeMismatch(lower, skill)) score -= 20;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = skill;
    }
  }
  
  // Only return if score is positive
  return bestScore > 0 ? bestMatch : null;
}

function getSkillPurpose(skill) {
  const id = skill.id.toLowerCase();
  if (id.includes('water') || id.includes('hydrat')) return 'hydration';
  if (id.includes('calorie') || id.includes('food') || id.includes('meal')) return 'food';
  if (id.includes('coffee') || id.includes('caffeine')) return 'coffee';
  if (id.includes('step') || id.includes('walk')) return 'walking';
  if (id.includes('run') || id.includes('jog')) return 'running';
  if (id.includes('push') || id.includes('exercise') || id.includes('workout')) return 'exercise';
  if (id.includes('mood') || id.includes('emotion') || id.includes('feeling')) return 'mood';
  if (id.includes('sleep')) return 'sleep';
  return 'general';
}

function inputMatchesPurpose(input, purpose) {
  const purposeKeywords = {
    hydration: ['water', 'drank', 'drink', 'glass', 'bottle', 'hydrat', 'ml', 'liter'],
    food: ['calorie', 'kcal', 'food', 'meal', 'lunch', 'dinner', 'breakfast', 'ate', 'eaten', 'snack'],
    coffee: ['coffee', 'espresso', 'latte', 'cappuccino', 'caffeine', 'cup of'],
    walking: ['step', 'walk', 'walked'],
    running: ['run', 'ran', 'jog', 'jogged', 'km', 'mile'],
    exercise: ['pushup', 'push-up', 'pullup', 'squat', 'rep', 'set', 'workout', 'exercise', 'gym'],
    mood: ['mood', 'feeling', 'felt', 'emotion', 'happy', 'sad', 'anxious', 'stress'],
    sleep: ['sleep', 'slept', 'nap', 'hours of sleep', 'bedtime', 'woke'],
  };
  
  const keywords = purposeKeywords[purpose] || [];
  return keywords.some(kw => input.includes(kw));
}

function isPurposeMismatch(input, skill) {
  const purpose = getSkillPurpose(skill);
  
  // Food/calorie keywords should NOT match water
  if (purpose === 'hydration') {
    const foodKeywords = ['calorie', 'kcal', 'food', 'meal', 'lunch', 'dinner', 'breakfast', 'ate', 'eaten'];
    if (foodKeywords.some(kw => input.includes(kw))) return true;
  }
  
  // Water keywords should NOT match food
  if (purpose === 'food') {
    const waterKeywords = ['water', 'hydrat'];
    // Only mismatch if ONLY water keywords, not "drank water with lunch"
    if (waterKeywords.some(kw => input.includes(kw)) && !input.includes('lunch') && !input.includes('dinner')) return true;
  }
  
  return false;
}

// ============================================================================
// Main Router
// ============================================================================

export async function routeSimply(input, options = {}) {
  const startTime = Date.now();
  const { context = {} } = options;
  
  if (CONFIG.DEBUG) {
    console.log(`[SimpleRouter] Input: "${input}"`);
  }
  
  // Step 1: Get skills
  const skillManager = await getSkillManager();
  await skillManager.init();
  const skills = Array.from(skillManager.skills.values());
  
  if (CONFIG.DEBUG) {
    console.log(`[SimpleRouter] Available skills: ${skills.map(s => s.id).join(', ')}`);
  }
  
  // Step 2: Detect intent (query vs log vs unknown)
  const intent = detectIntent(input);
  
  if (CONFIG.DEBUG) {
    console.log(`[SimpleRouter] Detected intent: ${intent}`);
  }
  
  // Step 3: Find matching skill
  const matchedSkill = findMatchingSkill(input, skills);
  
  if (CONFIG.DEBUG) {
    console.log(`[SimpleRouter] Matched skill: ${matchedSkill?.id || 'none'}`);
  }
  
  // Step 4: Handle based on intent and match
  
  // Case A: Matched a skill
  if (matchedSkill) {
    if (intent === 'query') {
      return await handleSkillQuery(matchedSkill, skillManager, startTime);
    } else {
      // Log to skill
      const extracted = extractValue(input);
      return await handleSkillLog(matchedSkill, extracted, skillManager, startTime);
    }
  }
  
  // Case B: Looks like a tracking request but no skill found
  if (intent === 'log') {
    // Determine what kind of skill to create
    const skillType = detectSkillType(input);
    return await handleSkillCreation(input, skillType, skillManager, context, startTime);
  }
  
  // Case C: Query for non-existent skill
  if (intent === 'query') {
    return {
      success: true,
      type: 'chat',
      content: "I don't have any data tracked for that yet. Would you like to start tracking it?",
      duration: Date.now() - startTime,
    };
  }
  
  // Case D: Unknown intent - use LLM for conversation
  return await handleConversation(input, startTime);
}

// ============================================================================
// Handlers
// ============================================================================

async function handleSkillLog(skill, extracted, skillManager, startTime) {
  try {
    await skillManager.addEntry(skill.id, {
      value: extracted.value,
      unit: extracted.unit || skill.unit,
      source: 'simple-router',
    });
    
    const stats = await skillManager.getTodayStats(skill.id);
    let response = `${skill.icon || '📊'} Logged to **${skill.name}**: ${extracted.value}${skill.unit ? ' ' + skill.unit : ''}`;
    
    if (stats.sum > 0) {
      response += `\n📊 Today's total: ${stats.sum}${skill.unit ? ' ' + skill.unit : ''}`;
      if (skill.dailyGoal) {
        const progress = Math.round((stats.sum / skill.dailyGoal) * 100);
        response += ` (${progress}% of ${skill.dailyGoal} goal)`;
      }
    }
    
    return {
      success: true,
      type: 'skill_log',
      content: response,
      skill: skill.id,
      logged: extracted,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      type: 'error',
      content: `Failed to log: ${error.message}`,
      duration: Date.now() - startTime,
    };
  }
}

async function handleSkillQuery(skill, skillManager, startTime) {
  try {
    const stats = await skillManager.getTodayStats(skill.id);
    
    let response = `**${skill.name}** ${skill.icon || '📊'}\n`;
    response += `Today: ${stats.sum}${skill.unit ? ' ' + skill.unit : ''} (${stats.count} entries)`;
    
    if (skill.dailyGoal) {
      const progress = Math.round((stats.sum / skill.dailyGoal) * 100);
      response += `\n🎯 Goal: ${progress}% of ${skill.dailyGoal}`;
    }
    
    return {
      success: true,
      type: 'skill_query',
      content: response,
      skill: skill.id,
      stats,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      type: 'error',
      content: `Failed to query: ${error.message}`,
      duration: Date.now() - startTime,
    };
  }
}

function detectSkillType(input) {
  const lower = input.toLowerCase();
  
  if (lower.match(/calorie|kcal|food|meal|lunch|dinner|breakfast|ate/)) {
    return { name: 'calories', unit: 'kcal', description: 'Track daily calorie intake' };
  }
  if (lower.match(/run|ran|jog|km|mile/)) {
    return { name: 'running', unit: 'km', description: 'Track running distance' };
  }
  if (lower.match(/sleep|slept|hours of sleep/)) {
    return { name: 'sleep', unit: 'hours', description: 'Track sleep duration' };
  }
  if (lower.match(/weight|kg|lbs/)) {
    return { name: 'weight', unit: 'kg', description: 'Track body weight' };
  }
  
  return { name: 'custom', unit: 'count', description: 'Custom tracker' };
}

async function handleSkillCreation(input, skillType, skillManager, context, startTime) {
  const extracted = extractValue(input);
  
  try {
    // Create the skill
    const skillId = skillType.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    
    // Check if already exists
    if (skillManager.skills.has(skillId)) {
      // Use existing
      const skill = skillManager.skills.get(skillId);
      return await handleSkillLog(skill, extracted, skillManager, startTime);
    }
    
    await skillManager.createSkill(skillId, {
      description: skillType.description,
      unit: skillType.unit,
      type: 'number',
      triggers: [skillType.name.toLowerCase()],
      icon: '📊',
    });
    
    await skillManager.loadAllSkills();
    const newSkill = skillManager.skills.get(skillId);
    
    // Log the initial value
    await skillManager.addEntry(skillId, {
      value: extracted.value,
      unit: skillType.unit,
      source: 'simple-router',
    });
    
    return {
      success: true,
      type: 'skill_created_and_logged',
      content: `✨ Created **${skillType.name}** tracker and logged ${extracted.value} ${skillType.unit}`,
      skill: skillId,
      logged: extracted,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      type: 'error',
      content: `Failed to create skill: ${error.message}`,
      duration: Date.now() - startTime,
    };
  }
}

async function handleConversation(input, startTime) {
  try {
    const response = await sendMessage(input);
    return {
      success: true,
      type: 'chat',
      content: applyPersonalityFilter(response?.content || "I'm not sure how to help with that."),
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      type: 'error',
      content: "I'm having trouble responding right now.",
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default { routeSimply };
