/**
 * User API Routes
 * Handles user profile and preferences
 */

import { Router } from 'express';
import { loadUserProfile, saveUserProfile } from '../../lib/personaManager.js';

const router = Router();

/**
 * GET /api/user/profile
 * Get user profile
 */
router.get('/profile', (req, res) => {
  try {
    const profile = loadUserProfile();
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/user/profile
 * Update user profile
 */
router.post('/profile', (req, res) => {
  try {
    const profile = saveUserProfile(req.body);
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/user/stats
 * Get user statistics
 */
router.get('/stats', (req, res) => {
  try {
    const profile = loadUserProfile();
    res.json({
      totalInteractions: profile.stats?.totalInteractions || 0,
      firstInteraction: profile.stats?.firstInteraction,
      lastInteraction: profile.stats?.lastInteraction,
      favoriteCommands: profile.stats?.favoriteCommands?.slice(0, 5) || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
