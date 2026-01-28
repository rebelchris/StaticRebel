// Skills Manager - Portable skill packages
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, resolvePath } from './configManager.js';

const SKILLS_DIR = resolvePath('~/.ollama-assistant/skills');

// Skill file structure
const SKILL_STRUCTURE = {
  'SKILL.md': '# Skill Name\n\nDescription...',
  'TRIGGERS.md': '- trigger: "start with"\n  response: "Hello!"',
  'PROMPTS.md': '- name: "custom prompt"\n  content: "..."'
};

export function getSkillsDir() {
  return SKILLS_DIR;
}

// Initialize skills directory
export function initSkills() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

// List all installed skills
export function listSkills() {
  const skills = [];

  try {
    const items = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const item of items) {
      if (item.isDirectory()) {
        const skillPath = path.join(SKILLS_DIR, item.name);
        const skill = loadSkill(item.name);
        if (skill) {
          skills.push(skill);
        }
      } else if (item.name.endsWith('.skill')) {
        // ZIP-based skill file (simplified: just read metadata)
        const skill = loadSkill(item.name);
        if (skill) {
          skills.push(skill);
        }
      }
    }
  } catch (e) {
    console.error('Failed to list skills:', e.message);
  }

  return skills;
}

// Load a skill by name
export function loadSkill(skillName) {
  try {
    // Check directory
    const dirPath = path.join(SKILLS_DIR, skillName);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      return loadSkillFromDir(skillName, dirPath);
    }

    // Check .skill file (simplified)
    const filePath = path.join(SKILLS_DIR, skillName);
    if (fs.existsSync(filePath) && skillName.endsWith('.skill')) {
      return loadSkillFromFile(skillName, filePath);
    }
  } catch (e) {
    console.error(`Failed to load skill ${skillName}:`, e.message);
  }

  return null;
}

function loadSkillFromDir(name, dirPath) {
  const skill = {
    name,
    path: dirPath,
    type: 'directory',
    loaded: false,
    triggers: [],
    prompts: [],
    config: null
  };

  try {
    // Load SKILL.md
    const skillMd = path.join(dirPath, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      skill.description = fs.readFileSync(skillMd, 'utf-8')
        .split('\n')[0]
        .replace(/^#\s*/, '')
        .trim();
    }

    // Load TRIGGERS.md
    const triggersMd = path.join(dirPath, 'TRIGGERS.md');
    if (fs.existsSync(triggersMd)) {
      skill.triggers = parseTriggers(fs.readFileSync(triggersMd, 'utf-8'));
      skill.loaded = true;
    }

    // Load PROMPTS.md
    const promptsMd = path.join(dirPath, 'PROMPTS.md');
    if (fs.existsSync(promptsMd)) {
      skill.prompts = parsePrompts(fs.readFileSync(promptsMd, 'utf-8'));
    }

    // Load config
    const configPath = path.join(dirPath, 'skill.json');
    if (fs.existsSync(configPath)) {
      skill.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Error parsing skill ${name}:`, e.message);
  }

  return skill;
}

function loadSkillFromFile(name, filePath) {
  // Simplified: just metadata for .skill files
  return {
    name: name.replace('.skill', ''),
    path: filePath,
    type: 'file',
    loaded: false,
    triggers: [],
    prompts: []
  };
}

function parseTriggers(content) {
  const triggers = [];
  const lines = content.split('\n');

  let current = {};
  for (const line of lines) {
    if (line.startsWith('- trigger:')) {
      if (current.trigger) {
        triggers.push(current);
      }
      current = { trigger: line.replace('- trigger:', '').trim().replace(/"/g, '') };
    } else if (line.startsWith('  response:')) {
      current.response = line.replace('  response:', '').trim().replace(/"/g, '');
    }
  }
  if (current.trigger) triggers.push(current);

  return triggers;
}

function parsePrompts(content) {
  const prompts = [];
  const lines = content.split('\n');

  let current = {};
  for (const line of lines) {
    if (line.startsWith('- name:')) {
      if (current.name) {
        prompts.push(current);
      }
      current = { name: line.replace('- name:', '').trim().replace(/"/g, '') };
    } else if (line.startsWith('  content:')) {
      current.content = line.replace('  content:', '').trim().replace(/"/g, '');
    }
  }
  if (current.name) prompts.push(current);

  return prompts;
}

// Install a skill from directory
export function installSkill(sourcePath, name = null) {
  const skillName = name || path.basename(sourcePath);
  const destPath = path.join(SKILLS_DIR, skillName);

  try {
    // Copy directory
    copyDir(sourcePath, destPath);
    return { success: true, name: skillName, path: destPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const items = fs.readdirSync(src, { withFileTypes: true });
  for (const item of items) {
    const srcPath = path.join(src, item.name);
    const destPath = path.join(dest, item.name);

    if (item.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Uninstall a skill
export function uninstallSkill(skillName) {
  const skill = loadSkill(skillName);
  if (!skill) {
    return { success: false, error: 'Skill not found' };
  }

  try {
    if (skill.type === 'directory') {
      fs.rmSync(skill.path, { recursive: true, force: true });
    }
    return { success: true, name: skillName };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Create a new skill
export function createSkill(name, description, options = {}) {
  const skillPath = path.join(SKILLS_DIR, name);

  try {
    fs.mkdirSync(skillPath, { recursive: true });

    // SKILL.md
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `# ${name}\n\n${description}\n`);

    // TRIGGERS.md (template)
    const triggersContent = options.triggers || `- trigger: "start with ${name.toLowerCase()}"
  response: "Hello from ${name}!"`;
    fs.writeFileSync(path.join(skillPath, 'TRIGGERS.md'), triggersContent);

    // PROMPTS.md (template)
    const promptsContent = options.prompts || `- name: "${name} Prompt"
  content: "You are ${name}. ${description}"`;
    fs.writeFileSync(path.join(skillPath, 'PROMPTS.md'), promptsContent);

    // skill.json (optional)
    if (options.config) {
      fs.writeFileSync(path.join(skillPath, 'skill.json'), JSON.stringify(options.config, null, 2));
    }

    return { success: true, name, path: skillPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Check for matching triggers
export function checkTriggers(input, skillList = null) {
  const skills = skillList || listSkills();
  const matches = [];

  for (const skill of skills) {
    if (!skill.loaded) continue;

    for (const trigger of skill.triggers) {
      if (input.toLowerCase().includes(trigger.trigger.toLowerCase())) {
        matches.push({
          skill: skill.name,
          trigger: trigger.trigger,
          response: trigger.response
        });
      }
    }
  }

  return matches;
}

// Execute skill trigger
export async function executeTrigger(match, context = {}) {
  let response = match.response;

  // Simple variable substitution
  response = response.replace(/\{\{user\}\}/g, context.user || 'User');
  response = response.replace(/\{\{time\}\}/g, new Date().toLocaleTimeString());

  return response;
}

// Get skill statistics
export function getSkillsStats() {
  const skills = listSkills();
  return {
    total: skills.length,
    loaded: skills.filter(s => s.loaded).length,
    totalTriggers: skills.reduce((acc, s) => acc + s.triggers.length, 0),
    totalPrompts: skills.reduce((acc, s) => acc + s.prompts.length, 0)
  };
}
