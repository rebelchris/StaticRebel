// Persona Manager - Dynamic Persona System with Meta-Persona (Self-Modifying)
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.ollama-assistant');
const PERSONA_DIR = path.join(CONFIG_DIR, 'personas');
const ACTIVE_PERSONA_FILE = path.join(CONFIG_DIR, 'active-persona.json');

// Default persona templates
const DEFAULT_PERSONAS = {
  charlize: {
    id: 'charlize',
    name: 'Charlize',
    role: 'Primary Assistant',
    systemPrompt: `You are Charlize, an elegant, witty, and grounded AI assistant.

Core Traits:
- Concise and direct in communication
- Calm under pressure
- Warm but professional tone
- Adaptive to user preferences

Communication Style:
- Use elegant language without being flowery
- Be helpful and proactive
- Ask clarifying questions when needed
- Remember preferences across sessions

You have access to tools for:
- Running code and commands
- Managing files and projects
- Scheduling tasks
- Tracking information
- Research and web search`,
    baseTraits: ['concise', 'direct', 'calm', 'warm', 'professional'],
    specialties: ['general assistance', 'coding', 'analysis', 'scheduling'],
    createdAt: null,
    updatedAt: null
  },
  architect: {
    id: 'architect',
    name: 'The Architect',
    role: 'System Meta-Persona',
    systemPrompt: `You are The Architect - a meta-persona responsible for evolving and improving the assistant's own configuration.

Your Responsibilities:
1. Analyze conversation patterns to identify improvement opportunities
2. Modify system prompts based on user feedback (e.g., "Be more concise")
3. Adjust persona traits to better serve user needs
4. Recommend new skills or capabilities
5. Maintain the optimal balance between helpfulness and efficiency

When users say things like:
- "Be more concise" -> Reduce verbosity, get to the point faster
- "Be more detailed" -> Expand explanations, provide more context
- "Use simpler language" -> Reduce jargon, simplify explanations
- "Be friendlier" -> Add warmth, use more conversational language
- "Focus on coding" -> Emphasize technical expertise

You should respond by making actual changes to the persona configuration, not just temporary adjustments.

Current State Analysis:
- Evaluate conversation effectiveness
- Track user satisfaction signals
- Identify capability gaps
- Suggest concrete improvements`,
    metaCapabilities: ['self-modify', 'analyze-patterns', 'recommend-changes', 'evolve-skills'],
    createdAt: null,
    updatedAt: null
  },
  coder: {
    id: 'coder',
    name: 'Code Master',
    role: 'Coding Specialist',
    systemPrompt: `You are Code Master, a specialized coding assistant.

Expertise:
- Multiple programming languages (Python, JavaScript, TypeScript, Rust, Go, etc.)
- Code review and best practices
- Debugging and problem-solving
- Architecture and design patterns
- Testing and documentation

Workflow:
1. Understand the problem fully before coding
2. Write clean, well-documented code
3. Test edge cases
4. Explain your reasoning

You excel at:
- Writing new features
- Refactoring legacy code
- Explaining complex concepts
- Optimizing performance
- Security best practices`,
    baseTraits: ['precise', 'analytical', 'patient', 'thorough'],
    specialties: ['coding', 'debugging', 'architecture', 'code-review'],
    createdAt: null,
    updatedAt: null
  },
  researcher: {
    id: 'researcher',
    name: 'Deep Thinker',
    role: 'Research & Analysis Specialist',
    systemPrompt: `You are Deep Thinker, a research and analysis specialist.

Capabilities:
- In-depth research on any topic
- Analyzing complex problems from multiple angles
- Synthesizing information from various sources
- Creating comprehensive reports
- Identifying trends and patterns

Approach:
1. Break down complex topics systematically
2. Gather information from multiple perspectives
3. Analyze implications and connections
4. Present findings clearly with evidence
5. Suggest actionable recommendations

You excel at:
- Technical research
- Market analysis
- Competitive intelligence
- Trend identification
- Strategic planning`,
    baseTraits: ['analytical', 'thorough', 'objective', 'insightful'],
    specialties: ['research', 'analysis', 'strategy', 'reporting'],
    createdAt: null,
    updatedAt: null
  }
};

// Initialize persona system
export function initPersonaSystem() {
  // Create persona directory
  if (!fs.existsSync(PERSONA_DIR)) {
    fs.mkdirSync(PERSONA_DIR, { recursive: true });
  }

  // Initialize default personas
  for (const [key, persona] of Object.entries(DEFAULT_PERSONAS)) {
    const personaFile = path.join(PERSONA_DIR, `${persona.id}.json`);
    if (!fs.existsSync(personaFile)) {
      const now = new Date().toISOString();
      persona.createdAt = now;
      persona.updatedAt = now;
      fs.writeFileSync(personaFile, JSON.stringify(persona, null, 2));
    }
  }

  // Initialize active persona
  if (!fs.existsSync(ACTIVE_PERSONA_FILE)) {
    setActivePersona('charlize');
  }
}

// Get all available personas
export function getAvailablePersonas() {
  const personas = {};
  try {
    const files = fs.readdirSync(PERSONA_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const persona = JSON.parse(fs.readFileSync(path.join(PERSONA_DIR, file), 'utf-8'));
      personas[persona.id] = persona;
    }
  } catch (e) {
    console.error('Failed to load personas:', e.message);
  }
  return personas;
}

// Get active persona
export function getActivePersona() {
  try {
    if (fs.existsSync(ACTIVE_PERSONA_FILE)) {
      const config = JSON.parse(fs.readFileSync(ACTIVE_PERSONA_FILE, 'utf-8'));
      return getPersonaById(config.activeId) || getPersonaById('charlize');
    }
  } catch (e) {}
  return getPersonaById('charlize');
}

// Get persona by ID
export function getPersonaById(id) {
  try {
    const personaFile = path.join(PERSONA_DIR, `${id}.json`);
    if (fs.existsSync(personaFile)) {
      return JSON.parse(fs.readFileSync(personaFile, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

// Set active persona
export function setActivePersona(id) {
  const persona = getPersonaById(id);
  if (persona) {
    fs.writeFileSync(ACTIVE_PERSONA_FILE, JSON.stringify({ activeId: id }, null, 2));
    return true;
  }
  return false;
}

// Get system prompt for current persona
export function getSystemPrompt(personaId = null) {
  const persona = personaId ? getPersonaById(personaId) : getActivePersona();
  if (persona) {
    return persona.systemPrompt;
  }
  return DEFAULT_PERSONAS.charlize.systemPrompt;
}

// Modify persona based on feedback (Meta-Persona capability)
export function modifyPersonaFeedback(personaId, feedback) {
  const persona = getPersonaById(personaId);
  if (!persona) return { success: false, error: 'Persona not found' };

  const modifications = [];

  // Parse feedback and apply modifications
  const feedbackLower = feedback.toLowerCase();

  if (feedbackLower.includes('concise') || feedbackLower.includes('shorter') || feedbackLower.includes('brief')) {
    // Make system prompt more concise
    const lines = persona.systemPrompt.split('\n').filter(l => l.trim());
    const conciseLines = lines.slice(0, 10); // Keep only first 10 lines
    persona.systemPrompt = conciseLines.join('\n');
    modifications.push('Reduced verbosity for conciseness');
  }

  if (feedbackLower.includes('detail') || feedbackLower.includes('explain') || feedbackLower.includes('more info')) {
    // Add more detail orientation
    if (!persona.systemPrompt.includes('Provide detailed explanations')) {
      persona.systemPrompt += '\n\nProvide detailed explanations when appropriate.';
    }
    modifications.push('Added emphasis on detailed explanations');
  }

  if (feedbackLower.includes('simple') || feedbackLower.includes('jargon') || feedbackLower.includes('complex')) {
    // Add simplicity orientation
    if (!persona.systemPrompt.includes('Use clear, simple language')) {
      persona.systemPrompt += '\n\nUse clear, simple language avoiding unnecessary jargon.';
    }
    modifications.push('Added emphasis on simple language');
  }

  if (feedbackLower.includes('friendlier') || feedbackLower.includes('warmer') || feedbackLower.includes('casual')) {
    // Add warmth
    if (!persona.systemPrompt.includes('warm and conversational')) {
      persona.systemPrompt = persona.systemPrompt.replace('professional', 'warm and conversational');
    }
    modifications.push('Added warmth to communication style');
  }

  if (feedbackLower.includes('technical') || feedbackLower.includes('coding') || feedbackLower.includes('code')) {
    // Emphasize technical skills
    if (!persona.systemPrompt.includes('technical depth')) {
      persona.systemPrompt += '\n\nEmphasize technical depth and precision.';
    }
    modifications.push('Added emphasis on technical expertise');
  }

  // Save updated persona
  persona.updatedAt = new Date().toISOString();
  const personaFile = path.join(PERSONA_DIR, `${persona.id}.json`);
  fs.writeFileSync(personaFile, JSON.stringify(persona, null, 2));

  return {
    success: true,
    persona: persona,
    modifications: modifications,
    message: `Applied ${modifications.length} modification(s) to ${persona.name}`
  };
}

// Create a new custom persona
export function createPersona(config) {
  const newPersona = {
    id: config.id || uuidv4().slice(0, 8),
    name: config.name || 'Custom Persona',
    role: config.role || 'Custom Assistant',
    systemPrompt: config.systemPrompt || DEFAULT_PERSONAS.charlize.systemPrompt,
    baseTraits: config.traits || ['adaptive'],
    specialties: config.specialties || [],
    metaCapabilities: config.metaCapabilities || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const personaFile = path.join(PERSONA_DIR, `${newPersona.id}.json`);
  fs.writeFileSync(personaFile, JSON.stringify(newPersona, null, 2));

  return newPersona;
}

// Delete a persona
export function deletePersona(id) {
  if (id === 'charlize' || id === 'architect') {
    return { success: false, error: 'Cannot delete default personas' };
  }

  const personaFile = path.join(PERSONA_DIR, `${id}.json`);
  if (fs.existsSync(personaFile)) {
    fs.unlinkSync(personaFile);
    return { success: true, message: `Persona ${id} deleted` };
  }
  return { success: false, error: 'Persona not found' };
}

// Get persona evolution history
export function getPersonaEvolutionHistory(personaId) {
  const historyFile = path.join(PERSONA_DIR, `${personaId}-history.json`);
  try {
    if (fs.existsSync(historyFile)) {
      return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

// Record evolution event
export function recordEvolution(personaId, change) {
  const historyFile = path.join(PERSONA_DIR, `${personaId}-history.json`);
  const history = getPersonaEvolutionHistory(personaId);

  history.push({
    timestamp: new Date().toISOString(),
    change: change
  });

  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// Analyze conversation for persona improvements
export function analyzeForImprovements(conversationHistory) {
  const analysis = {
    patterns: [],
    suggestions: [],
    confidence: 0
  };

  // Simple pattern analysis (could be enhanced with LLM)
  const recentMessages = conversationHistory.slice(-10);
  const userMessages = recentMessages.filter(m => m.role === 'user');

  // Check for common feedback patterns
  for (const msg of userMessages) {
    const content = msg.content.toLowerCase();

    if (content.includes('too long') || content.includes('verbose') || content.includes('wordy')) {
      analysis.patterns.push({ type: 'verbosity', count: 1 });
      analysis.suggestions.push('Consider being more concise');
    }

    if (content.includes('what do you mean') || content.includes("didn't understand")) {
      analysis.patterns.push({ type: 'clarity', count: 1 });
      analysis.suggestions.push('Improve clarity and specificity');
    }

    if (content.includes('wrong') || content.includes('incorrect')) {
      analysis.patterns.push({ type: 'accuracy', count: 1 });
      analysis.suggestions.push('Double-check information accuracy');
    }
  }

  analysis.confidence = Math.min(analysis.patterns.length * 0.3, 0.9);

  return analysis;
}
