# Auto-Skill Creation Guide

The Auto-Skill Creation feature intelligently detects when you're trying to track something but don't have a skill for it yet, and either creates the skill automatically or asks for your confirmation.

## How It Works

When you say something like **"I drank 2 glasses of water"** but no water tracking skill exists, the assistant will:

1. **Detect** this is a tracking attempt
2. **Notice** no matching skill exists  
3. **Infer** what should be tracked (water, in glasses/ml, goal: 8 glasses/day)
4. **Either** auto-create the skill and log the entry, **OR** ask "I don't have a water tracking skill yet. Want me to create one?"
5. **Immediately log** your entry so you don't have to repeat yourself

## Examples

### ✅ Auto-Detection Patterns

| **You Say** | **Detected Skill** | **Auto-Created** |
|-------------|-------------------|------------------|
| "I drank 2 glasses of water" | Water Intake (number, ml, goal: 2000ml/day) | ✅ |
| "Did 30 pushups" | Push-ups (number, reps, goal: 50/day) | ✅ |
| "Walked 5000 steps" | Daily Steps (number, steps, goal: 10000/day) | ✅ |
| "Slept 7 hours" | Sleep (duration, hours, goal: 8h/day) | ✅ |
| "Feeling happy today" | Daily Mood (scale, 1-10, no goal) | ✅ |
| "Spent $50 on groceries" | Expenses (number, USD, no goal) | ✅ |
| "Read 20 pages" | Reading (number, pages, goal: 30/day) | ✅ |
| "Meditated for 10 minutes" | Meditation (duration, minutes, goal: 15/day) | ✅ |

### 📋 Example Flow

**Auto-Creation Enabled:**
```
User: "I drank 3 glasses of water"
Assistant: ✅ Created Water Intake skill and logged: 750ml

💧 I detected you wanted to track water intake (goal: 2000ml/day)

Next time just say: "water [amount]"
```

**Confirmation Mode:**
```
User: "I drank 3 glasses of water"
Assistant: 🤔 I don't have a Water Intake skill yet.

I detected you wanted to log: 750ml (suggested goal: 2000ml/day)

Want me to create this skill? (say "yes" or "no")

User: "yes"
Assistant: ✅ Created Water Intake skill and logged: 750ml

💧 I detected you wanted to track water intake (goal: 2000ml/day)

Next time just say: "water [amount]"
```

## Configuration

### Enable/Disable Auto-Creation

```javascript
// Enable automatic skill creation (no confirmation needed)
await setAutoCreateSkills(true);

// Disable automatic creation (ask for confirmation)
await setAutoCreateSkills(false);

// Check current status
const status = getAutoSkillStatus();
console.log(status.description);
```

### Set Confidence Threshold

```javascript
// Only auto-create skills with 90%+ confidence
await setAutoSkillThreshold(0.9);

// Auto-create with 70%+ confidence (more permissive)
await setAutoSkillThreshold(0.7);
```

### Environment Variables

```bash
# Enable auto-creation by default
export AUTO_CREATE_SKILLS=true

# Enable debug logging
export DEBUG_CHAT=true
```

## Smart Features

### 🔍 **Duplicate Detection**

The system detects similar existing skills to avoid duplicates:

- **Exact matches:** "water" vs existing "Water Intake" skill
- **Semantic matches:** "hydration" vs existing "Water Intake" skill  
- **Trigger matches:** "drank" vs existing skill with "drink" trigger

### 🧠 **Intelligent Inference**

**Units & Conversions:**
- "2 glasses" → 500ml (250ml per glass)
- "1 bottle" → 500ml  
- "3 cups" → 750ml (250ml per cup)
- "30 minutes" → duration type
- "5k steps" → 5000 steps

**Skill Types:**
- **Number:** water, steps, calories, expenses, reading
- **Duration:** sleep, meditation, exercise  
- **Scale:** mood (1-10), energy level
- **Counter:** habits, daily tasks

**Goals:**
- Water: 2000ml/day (8 glasses)
- Steps: 10000/day
- Sleep: 8 hours/day  
- Exercise: 30 minutes/day
- Reading: 30 pages/day

### 🚫 **False Positive Prevention**

Won't trigger on non-tracking statements:
- "How big is the moon?" ❌
- "I love pizza" ❌  
- "What's 2 + 2?" ❌
- "The weather is nice" ❌

## Edge Cases

### Similar Skills

```
Existing: "Water Intake" skill
User: "I drank water"
Result: Uses existing skill (no duplicate created)
```

### Ambiguous Input

```
User: "I had something"
Assistant: Could you be more specific about what you want to track?
```

### Multiple Things

```
User: "I drank water and did pushups"
Assistant: I detected multiple activities:
1. Water Intake (750ml)
2. Push-ups (estimated 20 reps)

Want me to create both skills?
```

## API Integration

### Direct Integration

```javascript
import { getAutoSkillCreator } from './lib/skills/auto-skill-creator.js';

const creator = await getAutoSkillCreator();
const result = await creator.handleTrackingWithAutoCreation(
  "I drank 2 glasses of water", 
  chatId
);

if (result.success && result.autoCreated) {
  console.log(`Created: ${result.skill.name}`);
  console.log(`Logged: ${result.logEntry.value}${result.skill.unit}`);
}
```

### Chat Handler Integration

```javascript
import { handleChat } from './lib/chatHandler.js';

const result = await handleChat("I did 30 pushups", {
  source: 'api',
  context: { chatId: 'user123' }
});

console.log(result.response);
```

## Testing

Run the comprehensive test suite:

```bash
node test-auto-skill-creation.js
```

This tests:
- ✅ Skill detection and inference
- ✅ Auto-creation and logging  
- ✅ Configuration management
- ✅ Edge case handling
- ✅ Chat handler integration

## Troubleshooting

### Common Issues

**"No tracking attempt detected"**
- Make sure your input sounds like logging data
- Include numbers or action words: "did", "drank", "walked"
- Example: "I walked" → "I walked 5000 steps"

**"Created wrong skill type"**  
- Be more specific with units: "steps", "glasses", "minutes"
- Example: "I walked 5000" → "I walked 5000 steps"

**"Skill creation failed"**
- Check file permissions in `~/.static-rebel/skills/`
- Ensure skill name doesn't already exist
- Check available disk space

### Debug Mode

```bash
export DEBUG_CHAT=true
node your-app.js
```

Shows detailed logging:
```
[ChatHandler] Processing from api: "I drank water"
[AutoSkillCreator] Detected tracking attempt: water
[AutoSkillCreator] Inference: water skill, 250ml, confidence: 85%
[AutoSkillCreator] Creating skill: Water Intake
[AutoSkillCreator] Logged entry: 250ml
```

## Benefits

🚀 **Zero Friction:** Start tracking anything immediately  
🧠 **Smart Detection:** Understands natural language patterns  
⚡ **Auto-Logging:** No need to repeat yourself  
🎯 **Sensible Defaults:** Appropriate goals and units  
🔧 **Configurable:** Auto-create or confirm as preferred  
🛡️ **Safe:** Prevents duplicates and false positives

---

*Happy tracking! 📊*