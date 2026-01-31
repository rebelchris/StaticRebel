# Exercise

Track workouts and physical activity.

## Triggers
- exercise
- workout
- ran
- run
- gym
- walk

## Data Schema
```json
{
  "type": "activity",
  "fields": ["type", "duration", "distance", "note"]
}
```

## Actions
- log: Record a workout
- today: Show today's activity
- history: Show recent workouts
- summary: Weekly stats
