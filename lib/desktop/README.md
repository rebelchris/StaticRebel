# StaticRebel Desktop Integration

Cross-platform desktop widgets and notifications for StaticRebel, integrating with the nudges system for proactive user engagement.

## Features

### 🔔 Desktop Notifications
- Cross-platform notifications using `node-notifier`
- Integration with nudges system for timely reminders
- Configurable notification types and priorities
- Rate limiting to avoid notification spam

### 🖥️ System Tray Integration
- macOS menu bar widget
- Windows system tray icon  
- Linux desktop notifications (fallback)
- Quick stats display
- Quick action menu for common tasks
- Graceful degradation on unsupported platforms

### 🎯 Nudge System Integration
- Automatic nudge polling and display
- Configurable nudge types (streak, goal, time, gap)
- Priority-based notification urgency
- Cooldown periods to prevent over-nudging

## Installation

The desktop integration is optional and lazy-loaded to avoid heavy dependencies for users who don't need it.

```bash
# Required dependency (already included)
npm install node-notifier

# Optional system tray dependencies (install only if needed)
npm install electron          # For Electron-based apps
npm install menubar          # For macOS menu bar
npm install node-windows-tray # For Windows system tray
```

## Usage

### Basic Integration

```javascript
import { DesktopIntegration } from './lib/desktop/index.js';
import { NudgeEngine } from './lib/skills/nudges.js';

// Initialize desktop integration
const desktop = new DesktopIntegration({
  notifications: { enabled: true },
  tray: { enabled: true },
  nudges: { enabled: true },
  nudgeEngine: yourNudgeEngine,
  skillManager: yourSkillManager,
  goalTracker: yourGoalTracker
});

await desktop.init();
```

### Send Custom Notifications

```javascript
// Simple notification
await desktop.notify('Title', 'Message');

// Advanced notification
await desktop.showNotification({
  title: 'StaticRebel',
  message: 'Your goal is almost complete!',
  urgency: 'high',
  timeout: 10000,
  actions: ['View Progress', 'Log Entry']
});
```

### Nudge Integration

```javascript
// Manual nudge
const nudge = {
  type: 'streak',
  priority: 'high',
  message: '🔥 Keep your 5-day streak alive!'
};

await desktop.showNudge(nudge);

// Automatic nudge polling (handled internally)
// Checks for nudges based on configured cooldown period
```

### System Tray Actions

The system tray automatically provides:
- Current goal progress display
- Quick action menu for logging skills
- Stats overview on click
- App control options

## Configuration

### Notification Settings

```javascript
notifications: {
  enabled: true,        // Enable/disable notifications
  sound: true,          // Play notification sounds
  timeout: 5000,        // Auto-dismiss timeout (ms)
  priority: 'normal'    // Default priority level
}
```

### System Tray Settings

```javascript
tray: {
  enabled: true,        // Enable/disable system tray
  showStats: true,      // Show stats in tray menu
  quickActions: true    // Enable quick action buttons
}
```

### Nudge Settings

```javascript
nudges: {
  enabled: true,                           // Enable/disable nudges
  cooldownMinutes: 60,                     // Minimum time between nudges
  types: ['streak', 'goal', 'time', 'gap'] // Nudge types to show
}
```

## Platform Support

| Feature | Windows | macOS | Linux |
|---------|---------|--------|-------|
| Notifications | ✅ | ✅ | ✅ |
| System Tray | ✅* | ✅* | 📝** |
| Quick Actions | ✅ | ✅ | 📝 |

*\* Requires optional dependencies*  
*\*\* Fallback mode (status logging only)*

## Integration Examples

### With Heartbeat System

```javascript
import { addDesktopToHeartbeat } from './lib/desktop/integration-example.js';

// Add nudge checking to existing heartbeat
addDesktopToHeartbeat(heartbeatManager, desktopIntegration);
```

### With Event Bus

```javascript
// Listen for skill events
eventBus.on('skill:logged', () => desktop.updateTrayStats());
eventBus.on('goal:completed', (goal) => {
  desktop.notify('🎉 Goal Completed!', `${goal.name} achieved!`);
});
```

### Configuration Presets

```javascript
import { DESKTOP_CONFIGS } from './lib/desktop/integration-example.js';

// Use preset configurations
const desktop = new DesktopIntegration({
  ...DESKTOP_CONFIGS.minimal,  // or 'full', 'silent', 'development'
  nudgeEngine,
  skillManager
});
```

## Error Handling

The desktop integration is designed to fail gracefully:

- Missing dependencies → Features disabled, app continues
- Platform incompatibility → Fallback modes activated  
- Notification failures → Logged but don't crash app
- Tray initialization failure → Continues without tray

## Development

### Testing Notifications

```javascript
import { testNudgeNotifications } from './lib/desktop/integration-example.js';

// Test different nudge types
await testNudgeNotifications(desktopIntegration);
```

### Adding Custom Tray Actions

Extend the `SystemTray` class to add platform-specific functionality:

```javascript
// Override buildQuickActionsMenu() for custom actions
class CustomTray extends SystemTray {
  async buildQuickActionsMenu() {
    const baseActions = await super.buildQuickActionsMenu();
    
    return [
      ...baseActions,
      { type: 'separator' },
      {
        label: 'Custom Action',
        click: () => this.handleCustomAction()
      }
    ];
  }
}
```

## Troubleshooting

### Notifications Not Showing
- Check if notifications are enabled in system settings
- Verify `node-notifier` installation
- Test with a simple notification first

### System Tray Missing
- Install optional tray dependencies for your platform
- Check if tray is supported in your desktop environment
- Look for fallback status messages in console

### Performance Issues
- Increase nudge cooldown period
- Disable tray stats updates if not needed
- Use minimal configuration preset

## Files

- `index.js` - Main desktop integration class
- `tray.js` - System tray implementation  
- `integration-example.js` - Usage examples and presets
- `assets/` - Icon files for tray/notifications
- `README.md` - This documentation

## Dependencies

**Required:**
- `node-notifier` - Cross-platform notifications

**Optional (for enhanced tray support):**
- `electron` - For Electron-based system tray
- `menubar` - For macOS menu bar integration
- `node-windows-tray` - For Windows system tray

The module works without optional dependencies but with reduced functionality.