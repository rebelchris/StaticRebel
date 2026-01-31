# Mood Tracking

Track daily mood and emotional states.

## Triggers
- mood
- feeling
- emotions
- how i feel

## Data Schema
```json
{
  "type": "scale",
  "range": [1, 10],
  "labels": {
    "1-3": "low",
    "4-6": "neutral", 
    "7-10": "good"
  },
  "fields": ["score", "note", "tags"]
}
```

## Actions
- log: Record current mood (1-10 scale with optional note)
- history: Show recent mood entries
- trends: Analyze mood patterns over time
- summary: Weekly/monthly mood averages

## Examples
- "mood 7"
- "feeling 8 - great day at work"
- "mood history"
- "how was my mood this week"
- "mood trends"
