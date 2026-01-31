# Skills System Roadmap

Leveling up the dynamic skills system from basic tracking to intelligent companion.

---

## Phase 1: Smarter Input (PR-ready)

### 1.1 Natural Language Parser
Parse natural sentences into structured skill entries.

```js
// Input: "ran 5k in 28 minutes this morning"
// Output: { skill: 'exercise', type: 'run', distance: 5, unit: 'km', duration: 28, note: 'this morning' }

// Input: "feeling pretty good today, maybe 7 out of 10"  
// Output: { skill: 'mood', score: 7, note: 'pretty good' }
```

**Implementation:**
- Pattern matching with regex + keyword extraction
- Number parsing with unit detection (5k, 30min, 2L)
- Time expression parsing (today, yesterday, this morning)

### 1.2 Fuzzy Skill Matching
Don't require exact triggers — understand intent.

```js
"logged some water" → water skill
"went for a jog" → exercise skill (even though 'jog' isn't a trigger)
"how am I doing emotionally" → mood skill
```

**Implementation:**
- Levenshtein distance for typo tolerance
- Synonym expansion (jog→run, hydrate→water)
- Context from recent conversation

---

## Phase 2: Intelligence Layer

### 2.1 Insights Engine
Find patterns and correlations across skills.

```
"I noticed you log higher mood scores (avg 7.2) on days you exercise 
compared to rest days (avg 5.8). Working out seems to boost your mood!"

"Your water intake drops 40% on weekends. Reminder to stay hydrated?"
```

**Implementation:**
- Cross-skill correlation analysis
- Day-of-week patterns
- Time-of-day patterns
- Streak detection

### 2.2 Proactive Nudges
Smart reminders based on behavior, not just timers.

```
- "You usually log water around now — staying hydrated?"
- "3-day exercise streak! Keep it going?"
- "Haven't logged mood today — how are you feeling?"
```

**Implementation:**
- Habit pattern detection (time, frequency)
- Streak tracking with gentle encouragement
- Gap detection (missed usual logging)

### 2.3 Goal Tracking
Set and track goals per skill.

```js
skill.setGoal('water', { daily: 2000, unit: 'ml' });
skill.setGoal('exercise', { weekly: 3, type: 'sessions' });

// "You're at 1500ml — 500ml to hit your water goal!"
// "2 of 3 workouts this week ✓"
```

---

## Phase 3: Gamification

### 3.1 Streaks & Achievements
Make tracking rewarding.

```
🔥 7-day water streak!
🏃 Ran 50km total this month
📈 Mood trending up this week
⭐ First week of consistent tracking
```

**Implementation:**
- Streak counter per skill
- Milestone achievements (totals, streaks, consistency)
- Personal bests tracking

### 3.2 Challenges
Self-set or suggested challenges.

```
"Challenge: Log mood every day this week"
"Challenge: Hit 2L water 5 days in a row"
"Challenge: Exercise 4 times this week"
```

---

## Phase 4: Social & Sharing

### 4.1 Skill Templates
Pre-built skill packs users can import.

```
📦 Fitness Pack: exercise, nutrition, sleep, weight
📦 Wellness Pack: mood, gratitude, meditation, water
📦 Productivity Pack: focus-time, tasks, breaks, energy
📦 Custom: share your skills with others
```

### 4.2 Export & Visualization
Get data out for analysis or sharing.

```js
await sm.export('water', { format: 'csv', range: 'month' });
await sm.export('mood', { format: 'json', range: 'all' });
```

ASCII charts for in-chat visualization:
```
Water (last 7 days):
Mon ████████░░ 1600ml
Tue ██████████ 2100ml
Wed ███████░░░ 1400ml
Thu █████████░ 1800ml
Fri ██████░░░░ 1200ml
```

---

## Phase 5: Advanced Features

### 5.1 Skill Chaining
Skills that trigger or inform other skills.

```
"Completed workout" → auto-prompt mood check
"Low mood logged" → suggest helpful skills (walk, meditation)
"Missed 3 days" → trigger check-in skill
```

### 5.2 Contextual Memory
Remember conversation context within skill interactions.

```
User: "log water"
Bot: "How much?"
User: "the usual"  ← remembers user's typical amount (250ml)
Bot: "Logged 250ml 💧"
```

### 5.3 External Integrations
Connect to real data sources.

```
- Apple Health / Google Fit (steps, exercise)
- Weather API (correlate mood with weather)
- Calendar (correlate with busy days)
```

---

## Implementation Priority

| Priority | Feature | Complexity | Impact |
|----------|---------|------------|--------|
| 🔴 High | Natural Language Parser | Medium | High |
| 🔴 High | Goal Tracking | Low | High |
| 🟡 Med | Insights Engine | High | High |
| 🟡 Med | Streaks & Achievements | Low | Medium |
| 🟡 Med | ASCII Visualizations | Low | Medium |
| 🟢 Low | Proactive Nudges | Medium | Medium |
| 🟢 Low | Skill Templates | Low | Low |
| 🟢 Low | Skill Chaining | High | Medium |

---

## Next PR Candidates

1. **Natural Language Parser** — Makes input feel magical
2. **Goal Tracking** — Users want to set targets
3. **Streaks** — Low effort, high engagement
4. **ASCII Charts** — Visual feedback in chat

---

*Last updated: 2026-01-31*
