// API Routes Index
import express from 'express';
import statusRouter from './status.js';
import personaRouter from './persona.js';
import memoryRouter from './memory.js';
import workersRouter from './workers.js';
import apiRouter from './api.js';
import chatRouter from './chat.js';
import configRouter from './config.js';
import trackersRouter from './trackers.js';
import logsRouter from './logs.js';

const router = express.Router();

router.use('/status', statusRouter);
router.use('/personas', personaRouter);
router.use('/memory', memoryRouter);
router.use('/workers', workersRouter);
router.use('/connectors', apiRouter);
router.use('/chat', chatRouter);
router.use('/config', configRouter);
router.use('/trackers', trackersRouter);
router.use('/logs', logsRouter);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
