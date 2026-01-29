/**
 * Feedback API Routes
 * Handles user feedback collection
 */

import { Router } from 'express';
import {
  logFeedback,
  getFeedbackAnalytics,
  getRecentFeedback,
} from '../../lib/feedbackManager.js';

const router = Router();

/**
 * POST /api/feedback
 * Submit feedback for a message
 */
router.post('/', (req, res) => {
  try {
    const { messageId, rating, comment, context } = req.body;

    const entry = logFeedback({
      messageId,
      rating,
      comment,
      context,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, entry });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/feedback/analytics
 * Get feedback analytics
 */
router.get('/analytics', (req, res) => {
  try {
    const analytics = getFeedbackAnalytics();
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/feedback/recent
 * Get recent feedback entries
 */
router.get('/recent', (req, res) => {
  try {
    const count = parseInt(req.query.count) || 50;
    const entries = getRecentFeedback(count);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
