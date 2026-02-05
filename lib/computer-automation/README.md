# Computer Automation Module

macOS automation capabilities for Static Rebel AI assistant.

## Quick Start

```javascript
import { createComputerAutomation } from './lib/computer-automation/index.js';

const automation = createComputerAutomation({
  safetyLevel: 'medium',
  requireConfirmation: true,
});

// Launch an app
await automation.apps.launch('Safari');

// Write to clipboard
await automation.clipboard.write('Hello from Static Rebel!');

// Read clipboard
const clip = await automation.clipboard.read();

// Safe file operations
await automation.files.write('./test.txt', 'Hello world!');
const content = await automation.files.read('./test.txt');

// Execute AppleScript
await automation.appleScript.execute('display notification "Done!" with title "Static Rebel"');
```

## Features

### 1. AppleScript Execution
- Execute any AppleScript command
- Preset scripts for common operations
- Safety checks on all scripts

### 2. Application Control
- Launch applications by name or bundle ID
- Quit running applications
- Get running apps list
- Switch between apps

```javascript
await automation.executeAction({
  type: 'launch_app',
  name: 'VSCode',
});

await automation.executeAction({
  type: 'get_running_apps',
});
```

### 3. File Operations
- Safe read/write/delete operations
- Path validation and protection
- Backup before destructive operations
- Dry-run mode for preview

```javascript
await automation.executeAction({
  type: 'file_write',
  path: './notes.txt',
  content: 'My notes...',
});

await automation.executeAction({
  type: 'file_read',
  path: './notes.txt',
});
```

### 4. Clipboard Management
- Read/write text, URLs, JSON
- Clipboard history
- Safety checks

```javascript
await automation.executeAction({
  type: 'clipboard_write',
  content: 'Hello clipboard!',
});

await automation.executeAction({
  type: 'clipboard_read',
});
```

## Safety Features

- **Path Protection**: Cannot access protected system paths
- **Confirmation**: Requires confirmation for risky operations
- **Dry-Run Mode**: Preview actions without execution
- **Audit Log**: All actions logged for accountability
- **Blocked Commands**: Dangerous patterns blocked

## Configuration

```javascript
const automation = createComputerAutomation({
  safetyLevel: 'low',      // 'low', 'medium', 'high'
  requireConfirmation: true, // Ask before risky ops
  allowedPaths: [            // Allowed directories
    process.cwd(),
    os.homedir(),
  ],
  dryRun: false,            // Preview only mode
  timeout: 30000,           // Command timeout (ms)
});
```

## Direct Access

```javascript
// AppleScript
automation.appleScript.execute(script);

// Apps
automation.apps.launch('Safari');
automation.apps.quit('Safari');
automation.apps.getRunningApplications();

// Files
automation.files.read('file.txt');
automation.files.write('file.txt', 'content');
automation.files.delete('file.txt');

// Clipboard
automation.clipboard.read();
automation.clipboard.write('text');
automation.clipboard.clear();
```

## API Reference

### ComputerAutomation

| Method | Description |
|--------|-------------|
| `executeAction(action)` | Execute an action with safety checks |
| `setSafetyLevel(level)` | Set safety level (low/medium/high) |
| `enableDryRun()` | Enable preview mode |
| `disableDryRun()` | Disable preview mode |
| `getStatus()` | Get automation status |
| `getHistory()` | Get action history |

### Actions

| Type | Parameters |
|------|------------|
| `applescript` | `script` |
| `launch_app` | `bundleId` or `name` |
| `quit_app` | `bundleId` or `name` |
| `switch_app` | `bundleId` or `name` |
| `get_running_apps` | - |
| `file_read` | `path` |
| `file_write` | `path`, `content` |
| `file_delete` | `path` |
| `file_move` | `source`, `destination` |
| `file_copy` | `source`, `destination` |
| `list_directory` | `path` |
| `create_directory` | `path` |
| `clipboard_read` | - |
| `clipboard_write` | `content`, `type` |
| `clipboard_clear` | - |
