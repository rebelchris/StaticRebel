/**
 * Hybrid Router - Simple LLM extraction + Deterministic execution
 * 
 * Philosophy:
 * - LLM does what it's good at: understanding natural language
 * - Code does what it's good at: reliable matching and execution
 * 
 * LLM extracts: { intent, category, value, unit, note }
 * Code handles: skill matching, creation, logging, querying
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getSkillManager } from './skills/skill-manager.js';
import { getDefaultModel, chatCompletion } from './modelRegistry.js';
import { sendMessage } from '../agents/main/agent.js';
import { applyPersonalityFilter } from './personality/index.js';

const CONFIG = {
  DEBUG: process.env.DEBUG_ROUTER === 'true',
  AUTO_CREATE_SKILLS: true,
};

// ============================================================================
// LLM Extraction (Simple prompt, structured output)
// ============================================================================

async function extractFromLLM(input) {
  const model = getDefaultModel();
  
  const prompt = `Extract information from this user input. Respond with ONLY valid JSON.

Input: "${input}"

Extract:
- intent: "log" (recording data), "query" (asking about data), or "chat" (conversation)
- category: what they're tracking (water, calories, steps, sleep, mood, weight, exercise, coffee, custom, etc.)
- value: the numeric amount (null if none)
- unit: the unit of measurement (ml, kcal, steps, hours, kg, reps, cups, etc.)
- note: any additional context

Examples:
"I drank 500ml of water" → {"intent":"log","category":"water","value":500,"unit":"ml","note":null}
"My lunch was 400kcal" → {"intent":"log","category":"calories","value":400,"unit":"kcal","note":"lunch"}
"How much water today?" → {"intent":"query","category":"water","value":null,"unit":null,"note":null}
"Did 20 pushups" → {"intent":"log","category":"exercise","value":20,"unit":"reps","note":"pushups"}
"Slept 7 hours" → {"intent":"log","category":"sleep","value":7,"unit":"hours","note":null}
"2 cups of coffee" → {"intent":"log","category":"coffee","value":2,"unit":"cups","note":null}
"Walked 5000 steps" → {"intent":"log","category":"steps","value":5000,"unit":"steps","note":null}
"Feeling good today" → {"intent":"log","category":"mood","value":null,"unit":null,"note":"feeling good"}
"What's the weather?" → {"intent":"chat","category":null,"value":null,"unit":null,"note":null}
"Hello" → {"intent":"chat","category":null,"value":null,"unit":null,"note":null}

Respond with ONLY the JSON object, no explanation:`;

  try {
    const response = await chatCompletion(model, [
      { role: 'system', content: 'You extract structured data from text. Output ONLY valid JSON.' },
      { role: 'user', content: prompt },
    ]);
    
    const content = response?.message || '';
    
    if (CONFIG.DEBUG) {
      console.log(`[HybridRouter] LLM response: ${content}`);
    }
    
    // Parse JSON
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON in response');
      }
    }
    
    return {
      intent: result.intent || 'chat',
      category: result.category || null,
      value: result.value !== undefined ? result.value : null,
      unit: result.unit || null,
      note: result.note || null,
    };
    
  } catch (error) {
    console.error('[HybridRouter] LLM extraction failed:', error.message);
    // Fallback: try simple pattern extraction
    return fallbackExtraction(input);
  }
}

/**
 * Fallback extraction using simple patterns (when LLM fails)
 */
function fallbackExtraction(input) {
  const lower = input.toLowerCase();
  
  // Detect intent
  let intent = 'chat';
  if (/^(how|what|show|display)/i.test(lower) || /\?$/.test(input)) {
    intent = 'query';
  } else if (/\d+/.test(input) || /^(i |my |had |ate |drank |did |just )/i.test(lower)) {
    intent = 'log';
  }
  
  // Detect category
  let category = null;
  if (/water|drank|glass|hydrat/i.test(lower)) category = 'water';
  else if (/calorie|kcal|food|meal|lunch|dinner|breakfast|ate/i.test(lower)) category = 'calories';
  else if (/coffee|espresso|latte|cappuccino/i.test(lower)) category = 'coffee';
  else if (/step|walk/i.test(lower)) category = 'steps';
  else if (/sleep|slept|hour.*sleep/i.test(lower)) category = 'sleep';
  else if (/mood|feeling|felt/i.test(lower)) category = 'mood';
  else if (/weight|kg|lbs/i.test(lower)) category = 'weight';
  else if (/pushup|exercise|workout|rep|gym/i.test(lower)) category = 'exercise';
  else if (/run|ran|km|mile|jog/i.test(lower)) category = 'running';
  
  // Extract value
  let value = null;
  let unit = null;
  const valueMatch = input.match(/(\d+(?:\.\d+)?)\s*(ml|l|kcal|cal|kg|km|steps?|reps?|hours?|mins?|cups?|glasses?)?/i);
  if (valueMatch) {
    value = parseFloat(valueMatch[1]);
    unit = valueMatch[2]?.toLowerCase() || null;
    
    // Convert units
    if (unit === 'l') { value *= 1000; unit = 'ml'; }
    if (unit === 'glasses') { value *= 250; unit = 'ml'; }
    if (unit === 'cups' && category === 'water') { value *= 250; unit = 'ml'; }
  }
  
  return { intent, category, value, unit, note: null };
}

// ============================================================================
// Skill Matching (Fuzzy, dynamic)
// ============================================================================

/**
 * Category to skill mapping - expandable
 */
const CATEGORY_SKILL_MAP = {
  // Water/Hydration
  water: ['water', 'hydration', 'drink', 'fluid'],
  hydration: ['water', 'hydration'],
  
  // Food/Calories
  calories: ['calories', 'food', 'nutrition', 'meals', 'eating'],
  food: ['calories', 'food', 'nutrition', 'meals'],
  meals: ['calories', 'food', 'meals'],
  nutrition: ['calories', 'nutrition', 'food'],
  
  // Beverages
  coffee: ['coffee', 'caffeine', 'espresso'],
  caffeine: ['coffee', 'caffeine'],
  tea: ['tea'],
  
  // Activity
  steps: ['steps', 'walking', 'walk'],
  walking: ['steps', 'walking'],
  running: ['running', 'run', 'jog', 'cardio'],
  exercise: ['exercise', 'workout', 'gym', 'pushups', 'fitness'],
  workout: ['exercise', 'workout', 'gym'],
  pushups: ['pushups', 'exercise'],
  
  // Health
  sleep: ['sleep', 'rest'],
  weight: ['weight', 'body'],
  mood: ['mood', 'emotions', 'feelings', 'mental'],
  
  // Default
  custom: ['custom'],
};

/**
 * Find the best matching skill for a category
 */
function findSkillForCategory(category, skills) {
  if (!category) return null;
  
  const categoryLower = category.toLowerCase();
  const possibleSkillIds = CATEGORY_SKILL_MAP[categoryLower] || [categoryLower];
  
  // Try exact match first
  for (const skillId of possibleSkillIds) {
    const skill = skills.find(s => s.id === skillId);
    if (skill) return skill;
  }
  
  // Try partial match on skill ID
  for (const skill of skills) {
    if (skill.id.includes(categoryLower) || categoryLower.includes(skill.id)) {
      return skill;
    }
  }
  
  // Try matching on triggers
  for (const skill of skills) {
    if (skill.triggers?.some(t => t.toLowerCase().includes(categoryLower) || categoryLower.includes(t.toLowerCase()))) {
      return skill;
    }
  }
  
  return null;
}

/**
 * Get default skill configuration for a category
 */
function getDefaultSkillConfig(category, unit) {
  const configs = {
    water: { unit: 'ml', icon: '💧', dailyGoal: 2000, description: 'Track water intake' },
    calories: { unit: 'kcal', icon: '🍽️', dailyGoal: 2000, description: 'Track calorie intake' },
    food: { unit: 'kcal', icon: '🍽️', dailyGoal: 2000, description: 'Track food calories' },
    coffee: { unit: 'cups', icon: '☕', dailyGoal: 3, description: 'Track coffee consumption' },
    steps: { unit: 'steps', icon: '🚶', dailyGoal: 10000, description: 'Track daily steps' },
    walking: { unit: 'steps', icon: '🚶', dailyGoal: 10000, description: 'Track walking' },
    running: { unit: 'km', icon: '🏃', dailyGoal: 5, description: 'Track running distance' },
    exercise: { unit: 'reps', icon: '💪', dailyGoal: 50, description: 'Track exercise' },
    pushups: { unit: 'reps', icon: '💪', dailyGoal: 50, description: 'Track pushups' },
    sleep: { unit: 'hours', icon: '😴', dailyGoal: 8, description: 'Track sleep hours' },
    weight: { unit: 'kg', icon: '⚖️', dailyGoal: null, description: 'Track body weight' },
    mood: { unit: 'score', icon: '😊', dailyGoal: null, description: 'Track mood' },
  };
  
  const config = configs[category?.toLowerCase()] || {
    unit: unit || 'count',
    icon: '📊',
    dailyGoal: null,
    description: `Track ${category || 'custom'}`,
  };
  
  // Override unit if provided
  if (unit) config.unit = unit;
  
  return config;
}

// ============================================================================
// Main Router
// ============================================================================

export async function routeHybrid(input, options = {}) {
  const startTime = Date.now();
  const { context = {} } = options;
  
  if (CONFIG.DEBUG) {
    console.log(`[HybridRouter] Input: "${input}"`);
  }
  
  // Step 1: Extract structured data from LLM
  const extracted = await extractFromLLM(input);
  
  if (CONFIG.DEBUG) {
    console.log(`[HybridRouter] Extracted:`, extracted);
  }
  
  // Step 2: Handle based on intent
  if (extracted.intent === 'chat') {
    return await handleChat(input, startTime);
  }
  
  // Step 3: Get skills and find match
  const skillManager = await getSkillManager();
  await skillManager.init();
  const skills = Array.from(skillManager.skills.values());
  
  const matchedSkill = findSkillForCategory(extracted.category, skills);
  
  if (CONFIG.DEBUG) {
    console.log(`[HybridRouter] Matched skill: ${matchedSkill?.id || 'none'} for category: ${extracted.category}`);
  }
  
  // Step 4: Execute based on intent and skill
  if (extracted.intent === 'query') {
    if (matchedSkill) {
      return await handleQuery(matchedSkill, skillManager, startTime);
    } else {
      return {
        success: true,
        type: 'no_data',
        content: `I don't have any ${extracted.category || 'data'} tracked yet. Would you like to start tracking it?`,
        duration: Date.now() - startTime,
      };
    }
  }
  
  if (extracted.intent === 'log') {
    // No value extracted - can't log
    if (extracted.value === null && extracted.category !== 'mood') {
      return {
        success: false,
        type: 'missing_value',
        content: `I understood you want to log ${extracted.category || 'something'}, but I couldn't find a value. Try: "${extracted.category} 100" or "100 ${extracted.unit || 'units'} of ${extracted.category}"`,
        duration: Date.now() - startTime,
      };
    }
    
    if (matchedSkill) {
      return await handleLog(matchedSkill, extracted, skillManager, startTime);
    } else if (CONFIG.AUTO_CREATE_SKILLS && extracted.category) {
      return await handleCreateAndLog(extracted, skillManager, startTime);
    } else {
      return {
        success: false,
        type: 'no_skill',
        content: `I don't have a skill for "${extracted.category}" yet. Would you like me to create one?`,
        duration: Date.now() - startTime,
      };
    }
  }
  
  // Fallback to chat
  return await handleChat(input, startTime);
}

// ============================================================================
// Handlers
// ============================================================================

async function handleLog(skill, extracted, skillManager, startTime) {
  try {
    // Ensure data structure exists
    const data = await skillManager.loadData(skill.id);
    if (!data.metadata) data.metadata = { created: Date.now() };
    if (!data.entries) data.entries = [];
    await skillManager.saveData(skill.id, data);
    
    // Determine value to log
    let valueToLog = extracted.value;
    if (valueToLog === null) valueToLog = 1;
    
    // Add entry
    await skillManager.addEntry(skill.id, {
      value: valueToLog,
      unit: extracted.unit || skill.unit,
      note: extracted.note,
      source: 'hybrid-router',
    });
    
    // Get updated stats
    const stats = await skillManager.getTodayStats(skill.id);
    
    let response = `${skill.icon || '📊'} Logged to **${skill.name}**: ${valueToLog}${skill.unit ? ' ' + skill.unit : ''}`;
    
    if (extracted.note) {
      response += ` (${extracted.note})`;
    }
    
    response += `\n📊 Today's total: ${stats.sum}${skill.unit ? ' ' + skill.unit : ''}`;
    
    if (skill.dailyGoal) {
      const progress = Math.round((stats.sum / skill.dailyGoal) * 100);
      response += ` (${progress}% of ${skill.dailyGoal} goal)`;
      
      // Celebrate milestones
      if (progress >= 100 && stats.count === 1) {
        response += `\n🎉 Goal reached!`;
      }
    }
    
    return {
      success: true,
      type: 'logged',
      content: response,
      skill: skill.id,
      logged: { value: valueToLog, unit: extracted.unit || skill.unit },
      stats,
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    console.error('[HybridRouter] Log failed:', error);
    return {
      success: false,
      type: 'error',
      content: `Failed to log: ${error.message}`,
      duration: Date.now() - startTime,
    };
  }
}

async function handleQuery(skill, skillManager, startTime) {
  try {
    const stats = await skillManager.getTodayStats(skill.id);
    
    let response = `**${skill.name}** ${skill.icon || '📊'}\n`;
    response += `Today: ${stats.sum}${skill.unit ? ' ' + skill.unit : ''} (${stats.count} entries)`;
    
    if (skill.dailyGoal) {
      const progress = Math.round((stats.sum / skill.dailyGoal) * 100);
      response += `\n🎯 Goal: ${progress}% of ${skill.dailyGoal}${skill.unit ? ' ' + skill.unit : ''}`;
      
      const remaining = skill.dailyGoal - stats.sum;
      if (remaining > 0) {
        response += `\n📍 ${remaining}${skill.unit ? ' ' + skill.unit : ''} to go!`;
      } else {
        response += `\n🎉 Goal achieved!`;
      }
    }
    
    return {
      success: true,
      type: 'query',
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

async function handleCreateAndLog(extracted, skillManager, startTime) {
  try {
    const skillId = extracted.category.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const config = getDefaultSkillConfig(extracted.category, extracted.unit);
    
    // Check if already exists
    if (skillManager.skills.has(skillId)) {
      const skill = skillManager.skills.get(skillId);
      return await handleLog(skill, extracted, skillManager, startTime);
    }
    
    // Create new skill
    await skillManager.createSkill(skillId, {
      description: config.description,
      unit: config.unit,
      type: 'number',
      triggers: [extracted.category.toLowerCase()],
      dailyGoal: config.dailyGoal,
      icon: config.icon,
    });
    
    await skillManager.loadAllSkills();
    const newSkill = skillManager.skills.get(skillId);
    
    // Ensure data structure
    const data = await skillManager.loadData(skillId);
    if (!data.metadata) data.metadata = { created: Date.now() };
    if (!data.entries) data.entries = [];
    await skillManager.saveData(skillId, data);
    
    // Log the initial value
    let valueToLog = extracted.value;
    if (valueToLog === null) valueToLog = 1;
    
    await skillManager.addEntry(skillId, {
      value: valueToLog,
      unit: config.unit,
      note: extracted.note,
      source: 'hybrid-router-create',
    });
    
    const stats = await skillManager.getTodayStats(skillId);
    
    let response = `✨ Created **${extracted.category}** tracker!\n`;
    response += `${config.icon} Logged: ${valueToLog} ${config.unit}`;
    
    if (extracted.note) {
      response += ` (${extracted.note})`;
    }
    
    if (config.dailyGoal) {
      const progress = Math.round((valueToLog / config.dailyGoal) * 100);
      response += `\n🎯 Daily goal: ${config.dailyGoal} ${config.unit} (${progress}% done)`;
    }
    
    return {
      success: true,
      type: 'created_and_logged',
      content: response,
      skill: skillId,
      logged: { value: valueToLog, unit: config.unit },
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    console.error('[HybridRouter] Create and log failed:', error);
    return {
      success: false,
      type: 'error',
      content: `Failed to create skill: ${error.message}`,
      duration: Date.now() - startTime,
    };
  }
}

async function handleChat(input, startTime) {
  try {
    const response = await sendMessage(input);
    return {
      success: true,
      type: 'chat',
      content: applyPersonalityFilter(response?.content || "I'm not sure how to respond to that."),
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      type: 'error',
      content: "I'm having trouble responding right now. Is Ollama running?",
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default { routeHybrid };
