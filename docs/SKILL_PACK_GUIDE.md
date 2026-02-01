# Skill Pack Development Guide

Learn how to create, package, and share skill packs for the StaticRebel marketplace.

## Quick Start

### 1. Initialize a New Skill Pack

```bash
cd my-skill-pack-project
sr init
```

This creates:
- `staticrebel.json` - Package manifest
- `skills/example/` - Example skill structure
  - `SKILL.md` - Documentation
  - `TRIGGERS.md` - Trigger patterns
  - `PROMPTS.md` - AI prompts

### 2. Edit Your Manifest

Edit `staticrebel.json`:

```json
{
  "name": "my-awesome-pack",
  "version": "1.0.0", 
  "description": "Amazing skills for productivity",
  "author": "Your Name <you@example.com>",
  "license": "MIT",
  "keywords": ["productivity", "automation"],
  "skills": [
    {
      "name": "task-manager",
      "path": "skills/task-manager",
      "description": "Manage your tasks and todos"
    }
  ],
  "engines": {
    "static-rebel": ">=2.0.0"
  }
}
```

### 3. Create Your Skills

Each skill needs:

#### `SKILL.md` - Documentation
```markdown
# Task Manager

Organize and track your tasks and projects.

## Features
- Create and manage tasks
- Set priorities and due dates  
- Track completion progress
- Project organization

## Usage
- "Add task: finish the report"
- "Show my tasks for today"
- "Mark task complete"
```

#### `TRIGGERS.md` - Patterns that activate the skill
```markdown
- trigger: "add task"
  response: "I'll help you add that task. What's the task description?"

- trigger: "show tasks"
  response: "Here are your current tasks..."

- trigger: "task complete"
  response: "Great job! Which task did you complete?"
```

#### `PROMPTS.md` - AI behavior templates
```markdown
- name: "Task Manager Assistant"
  content: "You are a helpful task management assistant. Be encouraging and help users stay organized."

- name: "Productivity Coach"
  content: "You are a productivity coach. Help users prioritize tasks and manage their time effectively."
```

## Manifest Schema Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Package name (lowercase, hyphens) |
| `version` | string | Semantic version (x.y.z) |
| `description` | string | Brief description of the pack |
| `author` | string | Author name and email |
| `skills` | array | List of skills in the pack |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `license` | string | License (MIT, Apache-2.0, etc.) |
| `keywords` | array | Search tags |
| `homepage` | string | Project homepage URL |
| `repository` | string | Git repository URL |
| `dependencies` | object | Other required skill packs |
| `engines` | object | StaticRebel version constraints |
| `config` | object | Configuration schema |
| `scripts` | object | Lifecycle scripts |

### Skills Array Format

```json
{
  "skills": [
    {
      "name": "skill-name",
      "path": "skills/skill-name",
      "description": "What this skill does"
    }
  ]
}
```

### Dependencies

Depend on other skill packs:

```json
{
  "dependencies": {
    "health-base": "^1.0.0",
    "productivity-core": ">=2.1.0"
  }
}
```

## Advanced Features

### Configuration Schema

Define user-configurable options:

```json
{
  "config": {
    "theme": {
      "type": "string",
      "enum": ["light", "dark"],
      "default": "light",
      "description": "UI theme preference"
    },
    "notifications": {
      "type": "boolean", 
      "default": true,
      "description": "Enable push notifications"
    }
  }
}
```

### Lifecycle Scripts

Run commands during install/uninstall:

```json
{
  "scripts": {
    "postinstall": "echo 'Welcome to My Pack!'",
    "preuninstall": "echo 'Cleaning up data...'",
    "test": "npm test"
  }
}
```

## Testing Your Pack

### 1. Validate the Manifest

```bash
sr validate
```

### 2. Test Local Installation

```bash
sr install .
```

### 3. Test Your Skills

Try triggering your skills:
- "add task: test my skill pack"
- "show tasks"

### 4. Uninstall for Clean Testing

```bash
sr uninstall my-awesome-pack
```

## Publishing

### Option 1: GitHub Releases

1. Push your skill pack to GitHub
2. Create a release with a tag (e.g., `v1.0.0`)
3. Users can install with:
   ```bash
   sr install username/repo-name
   ```

### Option 2: Submit to Registry (Coming Soon)

```bash
sr publish
```

## Best Practices

### Naming Conventions

- **Pack names**: `kebab-case` (e.g., `fitness-tracker`)
- **Skill names**: `kebab-case` (e.g., `workout-logger`)
- **Versions**: Follow [semver](https://semver.org/) (e.g., `1.2.3`)

### File Organization

```
my-skill-pack/
├── staticrebel.json          # Manifest
├── README.md                 # Pack documentation
├── LICENSE                   # License file
└── skills/                   # Skills directory
    ├── skill-one/
    │   ├── SKILL.md
    │   ├── TRIGGERS.md
    │   ├── PROMPTS.md
    │   └── config.json       # Optional skill config
    └── skill-two/
        ├── SKILL.md
        ├── TRIGGERS.md
        └── PROMPTS.md
```

### Writing Good Triggers

- **Be specific**: `"schedule meeting"` not `"meeting"`
- **Use variants**: Include different ways people might phrase things
- **Consider context**: Think about when users would want this skill
- **Test thoroughly**: Try different phrasings

### Writing Effective Prompts

- **Clear role definition**: "You are a task management assistant..."
- **Behavioral guidelines**: "Be encouraging and positive..."
- **Context awareness**: "Consider the user's workload and priorities..."
- **Response format**: "Respond in bullet points..." or "Use a conversational tone..."

### Documentation

- Write clear, helpful skill documentation
- Include usage examples
- Explain what data is tracked/stored
- Document any setup requirements

### Keywords

Choose relevant keywords for discoverability:
- **Functional**: "task-management", "fitness", "finance"
- **Use-case**: "productivity", "health", "learning"
- **Industry**: "business", "personal", "education"

## Examples

Check out example skill packs:
- `examples/fitness-pack/` - Comprehensive fitness tracking
- `examples/productivity-pack/` - Task and time management
- `examples/learning-pack/` - Study and knowledge tracking

## Marketplace Commands Reference

```bash
# Development
sr init                    # Create new skill pack
sr validate               # Check manifest validity
sr publish                # Publish to registry

# Discovery  
sr search <query>         # Find skill packs
sr list                   # Show installed packs
sr update                 # Refresh registry

# Management
sr install <pack>         # Install a skill pack
sr uninstall <pack>       # Remove a skill pack
sr stats                  # Show marketplace stats
```

## Community

- **GitHub**: [static-rebel/skill-packs](https://github.com/static-rebel/skill-packs)
- **Registry**: [skill-registry.json](https://github.com/static-rebel/skill-registry)
- **Discussions**: Share ideas and get help
- **Issues**: Report bugs or request features

## What's Next?

- Central registry with web interface
- Automatic testing and validation
- Usage analytics and ratings
- Skill pack templates and generators
- Collaborative skill development

Happy building! 🚀