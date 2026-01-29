// Persona API - Persona management endpoints
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

let personaManager;

async function loadModules() {
  if (personaManager) return;
  try {
    const personaPath = path.join(__dirname, '..', '..', 'lib', 'personaManager.js');
    const module = await import(personaPath);
    personaManager = module;
  } catch (error) {
    console.error('Error loading persona module:', error.message);
  }
}

// Get all personas
router.get('/', async (req, res) => {
  try {
    await loadModules();

    if (!personaManager?.getAvailablePersonas) {
      return res.json({ personas: [], activeId: null });
    }

    const personas = personaManager.getAvailablePersonas();
    const activePersona = personaManager.getActivePersona();

    res.json({
      personas: Object.values(personas),
      activeId: activePersona?.id || null,
      activePersona: activePersona
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active persona
router.get('/active', async (req, res) => {
  try {
    await loadModules();

    if (!personaManager?.getActivePersona) {
      return res.json({ active: null });
    }

    const active = personaManager.getActivePersona();
    res.json({ active });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get persona by ID
router.get('/:id', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!personaManager?.getPersonaById) {
      return res.status(404).json({ error: 'Persona not found' });
    }

    const persona = personaManager.getPersonaById(id);

    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }

    res.json({ persona });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activate a persona
router.post('/:id/activate', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!personaManager?.setActivePersona) {
      return res.status(500).json({ error: 'Persona system not available' });
    }

    const result = personaManager.setActivePersona(id);

    if (result) {
      const active = personaManager.getActivePersona();
      req.app.locals.broadcast?.('personaChanged', { persona: active });
      res.json({ success: true, activePersona: active });
    } else {
      res.status(404).json({ error: 'Persona not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply feedback to persona
router.post('/:id/feedback', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;
    const { feedback } = req.body;

    if (!feedback) {
      return res.status(400).json({ error: 'Feedback is required' });
    }

    if (!personaManager?.modifyPersonaFeedback) {
      return res.status(500).json({ error: 'Persona system not available' });
    }

    const result = personaManager.modifyPersonaFeedback(id, feedback);

    if (result.success) {
      req.app.locals.broadcast?.('personaUpdated', result);
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new persona
router.post('/', async (req, res) => {
  try {
    await loadModules();

    const { name, role, systemPrompt, traits, specialties } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!personaManager?.createPersona) {
      return res.status(500).json({ error: 'Persona system not available' });
    }

    const persona = personaManager.createPersona({
      name,
      role: role || 'Custom Assistant',
      systemPrompt: systemPrompt || 'You are a helpful AI assistant.',
      traits: traits || ['adaptive'],
      specialties: specialties || []
    });

    req.app.locals.broadcast?.('personaCreated', { persona });
    res.json({ success: true, persona });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a persona
router.delete('/:id', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!personaManager?.deletePersona) {
      return res.status(500).json({ error: 'Persona system not available' });
    }

    const result = personaManager.deletePersona(id);

    if (result.success) {
      req.app.locals.broadcast?.('personaDeleted', { id });
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
