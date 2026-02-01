# Social Tracking - StaticRebel

Local-first collaborative tracking system for sharing achievements and creating challenges with friends.

## Features

### 🏆 Challenge System
- Create group challenges (water intake, exercise streaks, etc.)
- Track progress across participants
- Real-time leaderboards
- Share challenges via codes (e.g., "SwiftTiger123")

### 📤 Sharing Mechanisms  
- Export streak/goal graphics (ASCII art, SVG)
- Generate shareable achievement links
- Anonymous sharing options
- Privacy controls

### 🔒 Privacy First
- Local-first storage (no server required)
- Granular privacy settings
- Anonymous participation mode
- Data export/import for portability

## Quick Start

### Create a Water Challenge
```bash
sr social challenge water "Daily Hydration" 7
# Creates a 7-day water intake challenge
```

### Share Your Progress
```bash
sr social share streak water --ascii
# Generates ASCII visualization of your water streak
```

### Join a Challenge
```bash
sr social challenge join SwiftTiger123
# Join using a friend's share code
```

## CLI Commands

### Challenge Management
- `sr social challenge create <name> <trackerId> [duration] [type]` - Create new challenge
- `sr social challenge water [name] [duration] [target]` - Quick water challenge setup
- `sr social challenge list` - Show active challenges
- `sr social challenge join <shareCode> [name] [--anonymous]` - Join existing challenge
- `sr social challenge progress <challengeId> [value] [note]` - Update your progress
- `sr social challenge leaderboard <challengeId>` - View current standings
- `sr social challenge end <challengeId>` - Complete a challenge

### Sharing & Export
- `sr social share <type> <trackerId> [--anonymous] [--ascii|--svg]` - Share achievements
- `sr social export <challengeId> [--personal]` - Export challenge data
- `sr social import <filePath>` - Import challenge from file

### Settings & Status
- `sr social settings [key] [value]` - View/update privacy settings
- `sr social status` - Show social activity overview
- `sr social help` - Full command reference

## Natural Language Support

You can also use natural language commands:

- "Create a water challenge" 
- "Share my water streak"
- "Show the leaderboard"
- "Who's winning?"

## Data Storage

All social data is stored locally in:
- `~/.static-rebel/social/challenges.json` - Challenge data
- `~/.static-rebel/social/settings.json` - Privacy preferences
- `~/.static-rebel/social/share-*.json` - Temporary share files

## Privacy Settings

Control what you share with these settings:

```bash
sr social settings shareStreaks true     # Allow streak sharing
sr social settings shareGoals true       # Allow goal sharing  
sr social settings shareAchievements true # Allow achievement sharing
sr social settings allowAnonymous true   # Enable anonymous mode
sr social settings defaultAnonymous false # Don't default to anonymous
sr social settings publicProfile false   # Keep profile private
```

## Challenge Types

- **Streak**: Track consecutive days (e.g., daily water intake)
- **Goal**: Reach a specific target (e.g., 10,000 steps)  
- **Total**: Accumulate over time (e.g., total distance run)

## Examples

### Weekly Water Challenge
```bash
# Host creates challenge
sr social challenge water "Office Hydration Challenge" 7

# Participants join
sr social challenge join SwiftTiger123 "Alice"
sr social challenge join SwiftTiger123 "Bob" --anonymous

# Update progress  
sr social challenge progress <challengeId> 2000 "Drank 2L today!"

# Check standings
sr social challenge leaderboard <challengeId>
```

### Share Achievement
```bash
# Share current streak with ASCII visualization
sr social share streak water --ascii

# Share anonymously  
sr social share streak water --anonymous --svg

# Export for other platforms
sr social share achievement fitness --ascii > my_progress.txt
```

### Export/Import Challenges
```bash
# Export challenge for sharing
sr social export <challengeId> --personal

# Import from shared file  
sr social import challenge-export-123456.json
```

## Integration

The social system integrates seamlessly with StaticRebel's existing tracker system:

- Uses existing tracker data for progress calculation
- Automatic streak detection for water/habit trackers
- Leverages privacy settings from main configuration
- Compatible with all tracker types (food, exercise, mood, custom)

## Technical Details

- **Local-first**: No server or internet required for core functionality
- **Privacy-focused**: All data stays on your device unless explicitly exported
- **Portable**: JSON-based storage for easy backup/migration
- **Extensible**: Plugin architecture for custom challenge types
- **Secure**: No personal data transmitted unless explicitly shared

## Contributing

The social system is designed to be extensible. To add new challenge types or sharing formats:

1. Edit `lib/social/index.js` to add new challenge logic
2. Update `lib/social/cli.js` for new CLI commands  
3. Add natural language patterns to `lib/chatHandler.js`
4. Update documentation and examples

---

Built for the StaticRebel ecosystem - local-first AI assistant with powerful tracking capabilities.