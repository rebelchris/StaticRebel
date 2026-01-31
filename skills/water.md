# Water Tracking

Track daily water intake to stay hydrated.

## Triggers
- water
- hydration
- drink
- glasses
- ml
- liters

## Data Schema
```json
{
  "type": "numeric",
  "unit": "ml",
  "defaultAmount": 250,
  "dailyGoal": 2000
}
```

## Actions
- log: Record water intake (default 250ml per glass)
- history: Show recent water entries
- today: Show today's total
- summary: Weekly/monthly stats
- goal: Check progress toward daily goal

## Examples
- "drank water"
- "log 500ml water"
- "water today"
- "how much water this week"
- "water goal progress"
