# Conversation Checkpoints

Conversation checkpoints allow you to save and restore conversation state, enabling the ability to "rewind" long conversations and try different approaches.

## Features

- **Named Checkpoints**: Save conversation state with descriptive names
- **Checkpoint Metadata**: Includes timestamp, description, message count, and session duration
- **Restore Functionality**: Truncate conversation history after a specific checkpoint
- **Auto-checkpoints**: Automatic checkpoints before major operations
- **Retention Policies**: Configurable cleanup of old checkpoints
- **Integration**: Works seamlessly with existing conversation and memory management

## Usage

### Basic Operations

```js
import conversationalEngine from './lib/conversationalEngine.js';

// Save a checkpoint
const result = await conversationalEngine.saveConversationCheckpoint(
  'before-big-change',
  'About to make major system changes'
);
console.log(result.checkpointId); // checkpoint_1234567890_abc123

// List available checkpoints
const list = await conversationalEngine.listConversationCheckpoints();
console.log(list.checkpoints); // Array of checkpoint metadata

// Restore to a previous checkpoint
await conversationalEngine.restoreConversationCheckpoint(
  'checkpoint_1234567890_abc123'
);

// Create auto-checkpoint before dangerous operations
await conversationalEngine.createAutoCheckpoint('file_delete');
```

### Using the Checkpoint Manager Directly

```js
import { ConversationCheckpoints, getCheckpointManager } from './lib/conversation/checkpoints.js';
import { getSessionMemory } from './lib/sessionMemory.js';

const sessionMemory = getSessionMemory();
const checkpointManager = getCheckpointManager('my-session-id');

// Save checkpoint
const checkpointId = await checkpointManager.saveCheckpoint('my-checkpoint', {
  sessionMemory,
  description: 'Before trying experimental approach'
});

// List checkpoints
const checkpoints = await checkpointManager.listCheckpoints();

// Restore checkpoint
await checkpointManager.restoreCheckpoint(checkpointId, sessionMemory);

// Auto-checkpoint
await checkpointManager.createAutoCheckpoint('bulk_operation', sessionMemory);
```

### Decorator Pattern for Auto-checkpoints

Use the `@withCheckpoint` decorator to automatically create checkpoints before method execution:

```js
import { withCheckpoint } from './lib/conversation/checkpoints.js';

class MyAgent {
  @withCheckpoint('before-file-deletion', 'Auto checkpoint before deleting files')
  async deleteFiles(filePaths) {
    // This method will automatically create a checkpoint before execution
    // if sessionMemory is available in context
  }
}
```

## Configuration

### Storage Location

Checkpoints are stored in `~/.static-rebel/checkpoints/{sessionId}/` by default. Each checkpoint is a JSON file containing:

```js
{
  "id": "checkpoint_1234567890_abc123",
  "name": "before-big-change",
  "description": "Testing major system changes",
  "timestamp": "2026-02-01T10:30:00.000Z",
  "isAuto": false,
  "metadata": {
    "messageCount": 15,
    "sessionDuration": 45,
    "sessionStart": "2026-02-01T09:45:00.000Z",
    "totalInteractions": 15
  },
  "conversationState": {
    "interactions": [...],
    "sessionMetadata": {...},
    "sessionSummary": {...}
  }
}
```

### Retention Policies

```js
const CONFIG = {
  retention: {
    manual: 7 * 24 * 60 * 60 * 1000, // 7 days for manual checkpoints
    auto: 24 * 60 * 60 * 1000,       // 1 day for auto checkpoints
  },
  maxCheckpoints: 50, // Maximum checkpoints per session
}
```

### Auto-checkpoint Triggers

Auto-checkpoints are created before these operations:

- `file_delete`: Before deleting files
- `git_reset`: Before git reset operations  
- `db_drop`: Before dropping databases
- `system_restart`: Before system restarts
- `major_config_change`: Before major configuration changes
- `bulk_operation`: Before bulk operations

## API Reference

### conversationalEngine Functions

#### `saveConversationCheckpoint(name, description?)`
Save current conversation state to a named checkpoint.

**Parameters:**
- `name` (string): Checkpoint name
- `description` (string, optional): Checkpoint description

**Returns:** `{ success: true, checkpointId: string, message: string, messageCount: number }`

#### `restoreConversationCheckpoint(checkpointId)`
Restore conversation to a previous checkpoint.

**Parameters:**
- `checkpointId` (string): Checkpoint ID to restore

**Returns:** `{ success: true, message: string, checkpoint: object, restoredState: object }`

#### `listConversationCheckpoints()`
List all available checkpoints for current session.

**Returns:** `{ success: true, checkpoints: array, count: number }`

#### `createAutoCheckpoint(action)`
Create automatic checkpoint before major operation.

**Parameters:**
- `action` (string): Action triggering the checkpoint

**Returns:** `{ success: true, checkpointId: string, message: string }`

### ConversationCheckpoints Class

#### Constructor
```js
new ConversationCheckpoints({
  sessionId: 'my-session',
  storageDir: '/custom/path',
  maxCheckpoints: 100,
  autoCheckpoint: true
})
```

#### Methods

- `saveCheckpoint(name, options)`: Save checkpoint
- `listCheckpoints()`: List all checkpoints
- `loadCheckpoint(checkpointId)`: Load full checkpoint data
- `restoreCheckpoint(checkpointId, sessionMemory)`: Restore to checkpoint
- `deleteCheckpoint(checkpointId)`: Delete a checkpoint
- `createAutoCheckpoint(action, sessionMemory)`: Create auto-checkpoint
- `cleanupOldCheckpoints()`: Clean up expired checkpoints
- `getStats()`: Get checkpoint statistics
- `exportCheckpoints()`: Export all checkpoints for backup
- `importCheckpoints(data)`: Import checkpoints from backup

## Examples

### Example 1: Safe Experimentation

```js
// Save checkpoint before trying experimental approach
await conversationalEngine.saveConversationCheckpoint(
  'before-experiment',
  'Trying new conversation strategy'
);

// ... experiment with different approaches ...

// If experiment fails, restore to checkpoint
const checkpoints = await conversationalEngine.listConversationCheckpoints();
const experimentCheckpoint = checkpoints.checkpoints.find(cp => cp.name === 'before-experiment');
if (experimentCheckpoint) {
  await conversationalEngine.restoreConversationCheckpoint(experimentCheckpoint.id);
}
```

### Example 2: Auto-checkpoints for Safety

```js
// This will automatically create a checkpoint before file deletion
await conversationalEngine.createAutoCheckpoint('file_delete');

// Proceed with potentially destructive operation
await deleteImportantFiles();
```

### Example 3: Checkpoint Management

```js
const manager = getCheckpointManager('my-conversation');

// Get statistics
const stats = await manager.getStats();
console.log(`Total checkpoints: ${stats.total}, Manual: ${stats.manual}, Auto: ${stats.auto}`);

// Export for backup
const backup = await manager.exportCheckpoints();
await fs.writeFile('backup.json', JSON.stringify(backup));

// Import from backup
const restored = await manager.importCheckpoints(backup);
console.log(`Restored ${restored.length} checkpoints`);
```

## Integration with Existing System

The checkpoint system integrates seamlessly with:

- **SessionMemory**: Stores and restores conversation interactions
- **ConversationalEngine**: Provides high-level checkpoint operations
- **Memory Management**: Works with existing memory systems
- **JSONL Transcripts**: Maintains compatibility with transcript logging

Checkpoints capture the complete conversation state including:
- All conversation interactions
- Session metadata (start time, duration, total interactions)
- Session summary (intents, topics, feedback)

This ensures that restored conversations maintain full context and continuity.