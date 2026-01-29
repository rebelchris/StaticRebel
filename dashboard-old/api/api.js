// API Connector endpoints
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

let apiConnector;

async function loadModules() {
  if (apiConnector) return;
  try {
    const apiPath = path.join(__dirname, '..', '..', 'lib', 'apiConnector.js');
    const module = await import(apiPath);
    apiConnector = module;
  } catch (error) {
    console.error('Error loading API connector module:', error.message);
  }
}

// Get all connectors
router.get('/', async (req, res) => {
  try {
    await loadModules();

    if (!apiConnector?.getAllConnectors) {
      return res.json({ connectors: [], stats: {} });
    }

    const connectors = apiConnector.getAllConnectors();
    const stats = apiConnector.getApiStats?.() || {};

    res.json({ connectors, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get connector by ID
router.get('/:id', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!apiConnector?.getConnector) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    const connector = apiConnector.getConnector(id);

    if (!connector) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    res.json({ connector });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new connector
router.post('/', async (req, res) => {
  try {
    await loadModules();

    const { name, type = 'rest', description, baseUrl, authType = 'none', endpoints, headers } = req.body;

    if (!name || !baseUrl) {
      return res.status(400).json({ error: 'Name and base URL are required' });
    }

    if (!apiConnector?.createConnector) {
      return res.status(500).json({ error: 'API connector system not available' });
    }

    const connector = apiConnector.createConnector({
      name,
      type,
      description,
      baseUrl,
      authType,
      endpoints: endpoints || [],
      headers: headers || []
    });

    req.app.locals.broadcast?.('connectorCreated', { connector });
    res.json({ connector });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a connector
router.put('/:id', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;
    const updates = req.body;

    if (!apiConnector?.updateConnector) {
      return res.status(500).json({ error: 'API connector system not available' });
    }

    const result = apiConnector.updateConnector(id, updates);

    if (result.success) {
      req.app.locals.broadcast?.('connectorUpdated', result);
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a connector
router.delete('/:id', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!apiConnector?.deleteConnector) {
      return res.status(500).json({ error: 'API connector system not available' });
    }

    const result = apiConnector.deleteConnector(id);

    if (result.success) {
      req.app.locals.broadcast?.('connectorDeleted', { id });
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test a connector
router.post('/:id/test', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!apiConnector?.testConnector) {
      return res.status(500).json({ error: 'API connector system not available' });
    }

    const result = await apiConnector.testConnector(id);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Store API key
router.post('/:id/key', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    if (!apiConnector?.storeApiKey) {
      return res.status(500).json({ error: 'API connector system not available' });
    }

    const connector = apiConnector.getConnector?.(id);
    if (!connector) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    const result = apiConnector.storeApiKey(connector.name, apiKey);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate wrapper code
router.get('/:id/wrapper', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!apiConnector?.generateWrapperFunction) {
      return res.status(500).json({ error: 'API connector system not available' });
    }

    const result = apiConnector.generateWrapperFunction(id);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate documentation
router.get('/:id/docs', async (req, res) => {
  try {
    await loadModules();

    const { id } = req.params;

    if (!apiConnector?.generateDocumentation) {
      return res.status(500).json({ error: 'API connector system not available' });
    }

    const doc = apiConnector.generateDocumentation(id);

    if (!doc) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    res.json({ documentation: doc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get API statistics
router.get('/stats', async (req, res) => {
  try {
    await loadModules();

    if (!apiConnector?.getApiStats) {
      return res.json({ totalConnectors: 0, activeConnectors: 0 });
    }

    const stats = apiConnector.getApiStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create common service connector
router.post('/common/:service', async (req, res) => {
  try {
    await loadModules();

    const { service } = req.params;

    if (!apiConnector?.createCommonService) {
      return res.status(500).json({ error: 'API connector system not available' });
    }

    const connector = apiConnector.createCommonService(service);

    if (connector) {
      req.app.locals.broadcast?.('connectorCreated', { connector });
      res.json({ connector });
    } else {
      res.status(400).json({ error: 'Unknown common service' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
