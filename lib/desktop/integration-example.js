/**
 * Desktop Integration Example
 * 
 * Shows how to integrate desktop notifications and tray with StaticRebel's existing systems.
 */

import { DesktopIntegration } from './index.js';
import { NudgeEngine } from '../skills/nudges.js';

/**
 * Example integration with existing StaticRebel systems
 */
export async function initializeDesktopIntegration(staticRebel) {
  try {
    // Get existing managers from StaticRebel instance
    const skillManager = staticRebel.skillsManager;
    const goalTracker = staticRebel.goalTracker; // if available

    // Create or get nudge engine
    let nudgeEngine = null;
    if (skillManager) {
      const dataDir = staticRebel.dataDir || './data';
      nudgeEngine = new NudgeEngine(skillManager, goalTracker, dataDir);
      await nudgeEngine.init();
    }

    // Initialize desktop integration
    const desktopIntegration = new DesktopIntegration({
      notifications: {
        enabled: true,
        sound: true,
        timeout: 5000
      },
      tray: {
        enabled: true,
        showStats: true
      },
      nudges: {
        enabled: true,
        cooldownMinutes: 60,
        types: ['streak', 'goal', 'time', 'gap']
      },
      nudgeEngine,
      skillManager,
      goalTracker
    });

    await desktopIntegration.init();

    // Add to StaticRebel instance
    staticRebel.desktopIntegration = desktopIntegration;

    // Hook into existing event systems
    if (staticRebel.eventBus) {
      // Listen for skill logging events to update tray
      staticRebel.eventBus.on('skill:logged', async () => {
        await desktopIntegration.updateTrayStats();
      });

      // Listen for goal completions to show notifications
      staticRebel.eventBus.on('goal:completed', async (goal) => {
        await desktopIntegration.notify(
          '🎉 Goal Completed!',
          `You've reached your ${goal.skillId} goal: ${goal.target}${goal.unit || ''}`,
          { urgency: 'normal', timeout: 8000 }
        );
      });
    }

    console.log('✅ Desktop integration initialized successfully');
    return desktopIntegration;

  } catch (error) {
    console.error('Desktop integration initialization failed:', error);
    return null;
  }
}

/**
 * Example: Manual nudge testing
 */
export async function testNudgeNotifications(desktopIntegration) {
  if (!desktopIntegration) {
    console.log('Desktop integration not available');
    return;
  }

  // Test different types of nudges
  const testNudges = [
    {
      type: 'streak',
      priority: 'high',
      skillId: 'water',
      message: '🔥 3-day water streak! Don\'t forget to log today.'
    },
    {
      type: 'goal',
      priority: 'medium', 
      skillId: 'exercise',
      message: '💪 Almost there! 10 more minutes to hit your exercise goal.'
    },
    {
      type: 'time',
      priority: 'low',
      skillId: 'mood',
      message: '😊 You usually log your mood around now. How are you feeling?'
    }
  ];

  for (const nudge of testNudges) {
    console.log(`Testing ${nudge.type} nudge...`);
    await desktopIntegration.showNudge(nudge);
    
    // Wait between notifications
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Example: Integration with heartbeat system
 */
export function addDesktopToHeartbeat(heartbeatManager, desktopIntegration) {
  if (!heartbeatManager || !desktopIntegration) return;

  // Add desktop nudge checking to heartbeat
  heartbeatManager.addCheck('desktop-nudges', async () => {
    try {
      if (!desktopIntegration.nudgeEngine) return { status: 'no-engine' };

      const nudges = await desktopIntegration.nudgeEngine.generateNudges();
      
      if (nudges.length > 0) {
        const highPriorityNudge = nudges.find(n => n.priority === 'high') || nudges[0];
        await desktopIntegration.showNudge(highPriorityNudge);
        
        return {
          status: 'nudge-sent',
          nudgeType: highPriorityNudge.type,
          priority: highPriorityNudge.priority
        };
      }

      return { status: 'no-nudges' };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  });
}

/**
 * Example configuration for different use cases
 */
export const DESKTOP_CONFIGS = {
  // Minimal - notifications only
  minimal: {
    notifications: { enabled: true, sound: false },
    tray: { enabled: false },
    nudges: { enabled: true, types: ['high'] }
  },

  // Full featured
  full: {
    notifications: { enabled: true, sound: true },
    tray: { enabled: true, showStats: true },
    nudges: { enabled: true, cooldownMinutes: 30 }
  },

  // Silent mode
  silent: {
    notifications: { enabled: false },
    tray: { enabled: true, showStats: true },
    nudges: { enabled: false }
  },

  // Development/testing
  development: {
    notifications: { enabled: true, timeout: 2000 },
    tray: { enabled: false },
    nudges: { enabled: true, cooldownMinutes: 1 } // 1 minute for testing
  }
};

export default { initializeDesktopIntegration, testNudgeNotifications, addDesktopToHeartbeat };