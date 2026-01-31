# Mood

Track daily mood and emotional state.

## Triggers
- mood
- feeling
- feel
- emotions

## Data Schema
```json
{
  "type": "scale",
  "range": [1, 10],
  "fields": ["score", "note"]
}
```

## Actions
- log: Record current mood (1-10)
- today: Show today's entry
- history: Show mood trends
- summary: Weekly/monthly averages
