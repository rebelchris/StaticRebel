// Ollama Assistant Dashboard Server
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Security middleware - simple rate limiting implementation
class RateLimiter {
  constructor(windowMs = 15 * 60 * 1000, maxRequests = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();

    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), windowMs);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.requests) {
      if (now - data.resetTime > this.windowMs) {
        this.requests.delete(key);
      }
    }
  }

  isAllowed(identifier) {
    const now = Date.now();
    let data = this.requests.get(identifier);

    if (!data || now > data.resetTime) {
      // New window
      data = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.requests.set(identifier, data);
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (data.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((data.resetTime - now) / 1000),
      };
    }

    data.count++;
    return { allowed: true, remaining: this.maxRequests - data.count };
  }
}

const rateLimiter = new RateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes

// Rate limiting middleware
function rateLimitMiddleware(req, res, next) {
  // Get client identifier (IP or forwarded IP)
  const identifier =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const result = rateLimiter.isAllowed(identifier);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', 100);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter);
    return res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
    });
  }

  next();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Import backend modules
let personaManager, vectorMemory, workerManager, apiConnector, configManager;
let modelRegistry, memoryManager, subagentManager, skillsManager;

try {
  const personaPath = path.join(__dirname, '..', 'lib', 'personaManager.js');
  const vectorPath = path.join(__dirname, '..', 'lib', 'vectorMemory.js');
  const workerPath = path.join(__dirname, '..', 'lib', 'workerManager.js');
  const apiPath = path.join(__dirname, '..', 'lib', 'apiConnector.js');
  const configPath = path.join(__dirname, '..', 'lib', 'configManager.js');
  const modelPath = path.join(__dirname, '..', 'lib', 'modelRegistry.js');
  const memoryPath = path.join(__dirname, '..', 'lib', 'memoryManager.js');
  const subagentPath = path.join(__dirname, '..', 'lib', 'subagentManager.js');
  const skillsPath = path.join(__dirname, '..', 'lib', 'skillsManager.js');

  const personaModule = await import(personaPath);
  personaManager = personaModule;

  const vectorModule = await import(vectorPath);
  vectorMemory = vectorModule;

  const workerModule = await import(workerPath);
  workerManager = workerModule;

  const apiModule = await import(apiPath);
  apiConnector = apiModule;

  const configModule = await import(configPath);
  configManager = configModule;

  const modelModule = await import(modelPath);
  modelRegistry = modelModule;

  const memoryModule = await import(memoryPath);
  memoryManager = memoryModule;

  const subagentModule = await import(subagentPath);
  subagentManager = subagentModule;

  const skillsModule = await import(skillsPath);
  skillsManager = skillsModule;

  console.log('Backend modules loaded successfully');
} catch (error) {
  console.error('Error loading backend modules:', error.message);
}

// Initialize systems
try {
  if (personaManager?.initPersonaSystem) personaManager.initPersonaSystem();
  if (vectorMemory?.initVectorMemory) vectorMemory.initVectorMemory();
  if (workerManager?.initWorkerSystem) workerManager.initWorkerSystem();
  if (apiConnector?.initApiConnector) apiConnector.initApiConnector();
} catch (error) {
  console.error('Error initializing systems:', error.message);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Security middleware
// CORS - Restrict to allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting for API routes
app.use('/api/', rateLimitMiddleware);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
import apiRoutes from './api/index.js';
app.use('/api', apiRoutes);

// WebSocket for real-time updates
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected. Total clients:', clients.size);

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected. Total clients:', clients.size);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast to all connected clients
export function broadcast(type, data) {
  const message = JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString(),
  });
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Start status update interval
setInterval(() => {
  try {
    const status = getSystemStatus();
    broadcast('status', status);
  } catch (error) {
    console.error('Status broadcast error:', error.message);
  }
}, 5000);

// Get system status
function getSystemStatus() {
  const status = {
    personas: { active: null, available: 0 },
    memory: { total: 0, byType: {} },
    workers: { total: 0, pending: 0, running: 0, completed: 0 },
    connectors: { total: 0, active: 0 },
    models: { available: [], default: null },
    uptime: process.uptime(),
  };

  try {
    if (personaManager?.getActivePersona) {
      status.personas.active = personaManager.getActivePersona();
    }
    if (personaManager?.getAvailablePersonas) {
      status.personas.available = Object.keys(
        personaManager.getAvailablePersonas(),
      ).length;
    }
  } catch (e) {}

  try {
    if (vectorMemory?.getMemoryStats) {
      status.memory = vectorMemory.getMemoryStats();
    }
  } catch (e) {}

  try {
    if (workerManager?.getWorkerStats) {
      status.workers = workerManager.getWorkerStats();
    }
  } catch (e) {}

  try {
    if (apiConnector?.getApiStats) {
      status.connectors = apiConnector.getApiStats();
    }
  } catch (e) {}

  try {
    if (modelRegistry?.listAvailableModels) {
      status.models.available = modelRegistry.listAvailableModels() || [];
      status.models.default =
        configManager?.getConfig?.('models.defaults.general') ||
        'ollama/llama3.2';
    }
  } catch (e) {}

  return status;
}

// Make broadcast available to routes
app.locals.broadcast = broadcast;

// Serve main index.html for all routes (SPA-like behavior for pages)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/personas', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'personas.html'));
});

app.get('/memory', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'memory.html'));
});

app.get('/workers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'workers.html'));
});

app.get('/apis', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'apis.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/config', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
});

app.get('/trackers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trackers.html'));
});

app.get('/logs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logs.html'));
});

// Start server
server.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
  console.log('Available pages:');
  console.log(`  - Dashboard: http://localhost:${PORT}/`);
  console.log(`  - Personas: http://localhost:${PORT}/personas`);
  console.log(`  - Memory: http://localhost:${PORT}/memory`);
  console.log(`  - Workers: http://localhost:${PORT}/workers`);
  console.log(`  - Trackers: http://localhost:${PORT}/trackers`);
  console.log(`  - Logs: http://localhost:${PORT}/logs`);
  console.log(`  - APIs: http://localhost:${PORT}/apis`);
  console.log(`  - Chat: http://localhost:${PORT}/chat`);
  console.log(`  - Config: http://localhost:${PORT}/config`);
});
