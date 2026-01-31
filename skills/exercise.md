# Exercise Tracking

Track workouts, runs, gym sessions, and physical activity.

## Triggers
- exercise
- workout
- run
- gym
- walk
- steps
- training
- fitness

## Data Schema
```json
{
  "type": "activity",
  "fields": ["type", "duration", "distance", "calories", "note"],
  "activityTypes": ["run", "walk", "gym", "bike", "swim", "other"]
}
```

## Actions
- log: Record a workout (type, duration, optional details)
- history: Show recent workouts
- summary: Weekly/monthly activity stats
- streak: Check workout streak

## Examples
- "ran 5k"
- "gym workout 45 minutes"
- "walked 3000 steps"
- "exercise this week"
- "workout streak"
