# Notion Integration for StaticRebel

The Notion integration allows you to sync your StaticRebel tracker data with Notion databases, creating a powerful workflow for personal analytics and data management.

## 🚀 Quick Start

### 1. Setup Notion Integration

First, create a new integration in your Notion workspace:

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Click **"+ New integration"**
3. Name it (e.g., "StaticRebel Sync")
4. Select your workspace
5. Copy the **"Internal Integration Token"**

### 2. Configure StaticRebel

```bash
# Setup with your API key
sr notion setup api-key secret_abc123xyz

# Verify connection
sr notion setup verify

# Check status
sr notion status
```

### 3. Share Databases with Integration

In Notion, for each database you want to sync:

1. Open the database
2. Click **"•••"** menu → **"Add connections"**
3. Select your StaticRebel integration
4. Click **"Confirm"**

### 4. Map Trackers to Databases

```bash
# List available databases
sr notion databases

# Map a tracker to a database
sr notion map water-tracker abc123def title=Entry date=Date value=Amount

# Sync data
sr notion sync water-tracker
```

## 📊 Features

### Data Synchronization

- **One-way sync**: StaticRebel → Notion
- **Incremental sync**: Only new data since last sync
- **Bulk sync**: All historical data
- **Custom property mapping**: Map tracker fields to database properties

### Summary Pages

- **Daily summaries**: Aggregate all tracker data for a specific day
- **Weekly rollups**: Statistical summaries for the week
- **Monthly rollups**: Monthly analytics and insights

### Flexible Mapping

Map StaticRebel tracker fields to any Notion database properties:

```bash
# Basic mapping
sr notion map workout-tracker def456 title=Workout date=Date

# Advanced mapping with custom properties
sr notion map nutrition-tracker ghi789 \
  title=Meal \
  date=Date \
  value=Calories \
  notes=Description \
  category=MealType
```

## 📚 Commands Reference

### Setup Commands

```bash
# Setup with API key
sr notion setup api-key <your-integration-token>

# Verify connection (optional)
sr notion setup verify

# Show current status
sr notion status

# Reset configuration
sr notion reset
```

### Database Management

```bash
# List all accessible databases
sr notion databases

# Search databases by name
sr notion databases "tracking"

# Map tracker to database
sr notion map <trackerId> <databaseId> [property=mapping...]
```

### Data Synchronization

```bash
# Sync all data for a tracker
sr notion sync <trackerId>

# Incremental sync (only new data)
sr notion sync <trackerId> --incremental

# Force sync (even if no changes)
sr notion sync <trackerId> --force
```

### Summary Creation

```bash
# Create daily summary
sr notion daily --database <summaryDatabaseId>

# Create daily summary for specific date
sr notion daily 2024-01-15 --database <summaryDatabaseId>

# Create weekly rollup
sr notion rollup weekly --database <rollupDatabaseId>

# Create monthly rollup
sr notion rollup monthly --database <rollupDatabaseId>

# Rollup for specific date
sr notion rollup weekly --database <rollupDatabaseId> 2024-01-15
```

## 🎯 Use Cases

### Personal Analytics Dashboard

Create a comprehensive analytics dashboard by syncing multiple trackers:

```bash
# Setup multiple tracker mappings
sr notion map water-intake water-db title=Entry date=Date value=Volume
sr notion map workout fitness-db title=Workout date=Date value=Duration
sr notion map mood-tracker mood-db title=MoodEntry date=Date value=Rating

# Schedule daily syncs
sr notion sync water-intake --incremental
sr notion sync workout --incremental  
sr notion sync mood-tracker --incremental

# Generate daily summary
sr notion daily --database daily-summary-db
```

### Health & Fitness Tracking

Track health metrics with rich Notion pages:

```bash
# Map health tracker with custom properties
sr notion map health-vitals health-db \
  title=VitalCheck \
  date=Date \
  weight=Weight \
  bloodPressure=BloodPressure \
  heartRate=RestingHR \
  notes=Notes

# Create weekly health reports
sr notion rollup weekly --database weekly-health-db
```

### Habit Formation

Monitor habit streaks and patterns:

```bash
# Setup habit trackers
sr notion map reading-habit habits-db title=Habit date=Date completed=Done
sr notion map exercise-habit habits-db title=Habit date=Date completed=Done

# Generate monthly habit analysis
sr notion rollup monthly --database habit-analysis-db
```

## 🛠 Database Schema Requirements

### Minimum Required Properties

For basic sync functionality, your Notion database needs:

- **Title property** (any name): For entry descriptions
- **Date property**: For timestamps
- **Number property**: For numeric values (optional)

### Recommended Properties

For full feature support:

```
Entry (Title) - The main entry description
Date (Date) - When the data was recorded
Value (Number) - Primary numeric value
Notes (Text) - Additional notes or context
Tracker (Select) - Which tracker this came from
Category (Select) - Data category (optional)
Tags (Multi-select) - Custom tags (optional)
```

### Property Mapping Examples

```bash
# Simple mapping (uses defaults)
sr notion map step-counter steps-db

# Custom mapping
sr notion map step-counter steps-db \
  title=Activity \
  date=RecordDate \
  value=StepCount \
  notes=ActivityNotes
```

## 📈 Advanced Configuration

### Custom Property Types

The integration automatically handles different Notion property types:

- **Title/Text**: Used for entry names and notes
- **Number**: For numeric values and calculations
- **Date**: For timestamps and date ranges
- **Select**: For categories and tracker types
- **Multi-select**: For tags and multiple categories
- **Checkbox**: For boolean values

### Sync Strategies

#### Full Sync
```bash
# Syncs all historical data
sr notion sync water-tracker
```

#### Incremental Sync
```bash
# Only syncs data newer than last sync
sr notion sync water-tracker --incremental
```

#### Scheduled Sync
You can automate syncing using cron jobs:

```bash
# Setup daily incremental sync at 9 AM
sr cron add "daily-notion-sync" "0 9 * * *" "sr notion sync water-tracker --incremental"
```

## 🔧 Troubleshooting

### Common Issues

#### "Integration not found" Error
- Verify your API key is correct
- Check that the integration exists in your Notion workspace
- Ensure the workspace matches your databases

#### "Database not accessible" Error
- Make sure you've shared the database with your integration
- Verify the database ID is correct
- Check that the database hasn't been deleted or moved

#### Property Mapping Errors
- Ensure property names match exactly (case-sensitive)
- Verify property types are compatible
- Check that required properties exist

#### Network/Connection Issues
- Check your internet connection
- Verify Notion API status
- Try the verify command: `sr notion setup verify`

### Debug Commands

```bash
# Check integration status
sr notion status

# Verify connection
sr notion setup verify

# List accessible databases
sr notion databases

# Show detailed error logs
sr notion sync tracker-name --verbose
```

### Getting Help

- Check the [StaticRebel Documentation](../README.md)
- Review [Notion API Documentation](https://developers.notion.com/)
- File issues on the [GitHub repository](https://github.com/your-repo/StaticRebel)

## 🔒 Security & Privacy

- API keys are stored locally in `~/.static-rebel/integrations/notion-config.json`
- No data is sent to third parties except Notion
- You control which databases the integration can access
- Sync history is kept locally for debugging

## 📝 Data Format

### Sync State File
Located at `~/.static-rebel/integrations/notion-sync-state.json`:

```json
{
  "lastSync": "2024-01-15T09:30:00.000Z",
  "trackerMappings": {
    "water-tracker": {
      "databaseId": "abc123def",
      "databaseTitle": "Water Tracking",
      "propertyMapping": {
        "title": "Entry",
        "date": "Date", 
        "value": "Amount"
      },
      "createdAt": "2024-01-01T10:00:00.000Z"
    }
  },
  "syncHistory": [...]
}
```

This file tracks:
- When each tracker was last synced
- Database mappings and property mappings
- Sync history for debugging

## 🎉 Tips & Best Practices

### Database Design

1. **Use consistent naming**: Keep property names simple and consistent across databases
2. **Add formulas**: Create calculated properties for averages, streaks, etc.
3. **Use templates**: Set up page templates for consistent data entry
4. **Add filters and views**: Create custom views for different time periods

### Sync Workflow

1. **Start with incremental**: Use `--incremental` for daily syncs to avoid duplicates
2. **Schedule regular syncs**: Set up cron jobs for automatic data sync
3. **Monitor sync status**: Regularly check `sr notion status` for any issues
4. **Backup mappings**: Document your property mappings for easier setup

### Performance

1. **Limit large syncs**: For trackers with thousands of records, consider date ranges
2. **Use appropriate databases**: Don't sync everything to one massive database
3. **Regular cleanup**: Archive old data that's no longer needed

### Integration Patterns

1. **Daily workflow**: Incremental sync → daily summary → review in Notion
2. **Weekly analysis**: Weekly rollup → charts and analysis in Notion
3. **Monthly reporting**: Monthly rollup → comprehensive reports and goals

---

## 🔄 Changelog

### v1.0.0 (Initial Release)
- API key authentication
- Basic tracker to database mapping
- One-way data synchronization
- Daily and weekly summary generation
- Property mapping customization

### Planned Features
- OAuth authentication
- Two-way synchronization
- Real-time sync via webhooks
- Advanced analytics and charts
- Notion template marketplace