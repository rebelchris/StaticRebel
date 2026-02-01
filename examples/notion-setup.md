# Notion Integration Setup Example

This example walks through setting up the Notion integration for a complete personal tracking workflow.

## Prerequisites

1. Active StaticRebel installation with some trackers
2. Notion workspace with admin access
3. Internet connection

## Step 1: Create Notion Integration

1. Visit [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"+ New integration"**
3. Fill in the form:
   - **Name**: "StaticRebel Data Sync"
   - **Associated workspace**: Select your workspace
   - **Type**: Internal integration
4. Click **"Submit"**
5. Copy the **"Internal Integration Token"** (starts with `secret_`)

## Step 2: Setup StaticRebel

```bash
# Configure the integration
sr notion setup api-key secret_abc123xyz456...

# Verify it works
sr notion setup verify
# ✅ Notion connection verified successfully!
```

## Step 3: Create Notion Databases

### Water Tracking Database

1. In Notion, create a new page
2. Add a database with these properties:
   - **Entry** (Title) - The main entry description
   - **Date** (Date) - When water was consumed  
   - **Amount** (Number) - Volume in ml
   - **Notes** (Text) - Optional notes
   - **Tracker** (Select) - Source tracker name

3. Share the database with your integration:
   - Click the database **"•••"** menu
   - Select **"Add connections"**
   - Choose your StaticRebel integration
   - Click **"Confirm"**

### Workout Database

1. Create another database with properties:
   - **Workout** (Title) - Workout description
   - **Date** (Date) - Workout date
   - **Duration** (Number) - Duration in minutes
   - **Type** (Select) - Workout type (Cardio, Strength, etc.)
   - **Notes** (Text) - Workout notes
   - **Tracker** (Select) - Source tracker

### Daily Summary Database

1. Create a summary database:
   - **Date** (Date) - Summary date
   - **Title** (Title) - Summary title
   - **Water Total** (Number) - Total water intake
   - **Workout Count** (Number) - Number of workouts
   - **Summary** (Text) - Generated summary text

## Step 4: Map Trackers to Databases

```bash
# List your existing trackers
sr list
# Example output:
# Available trackers:
# • water-intake (hydration tracker)
# • workout-log (fitness tracker)

# List available Notion databases
sr notion databases
# Available Databases:
# ▶ Water Tracking
#   ID: a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6
#   Properties: Entry, Date, Amount, Notes, Tracker
# ▶ Workout Log
#   ID: b2c3d4e5-f6g7-h8i9-j0k1-l2m3n4o5p6q7
#   Properties: Workout, Date, Duration, Type, Notes, Tracker

# Map water tracker
sr notion map water-intake a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6 \
  title=Entry \
  date=Date \
  value=Amount \
  notes=Notes \
  tracker=Tracker

# Map workout tracker  
sr notion map workout-log b2c3d4e5-f6g7-h8i9-j0k1-l2m3n4o5p6q7 \
  title=Workout \
  date=Date \
  value=Duration \
  notes=Notes \
  tracker=Tracker
```

## Step 5: Initial Data Sync

```bash
# Sync all historical water data
sr notion sync water-intake
# ✅ Synced 47 records to Notion

# Sync workout data
sr notion sync workout-log  
# ✅ Synced 23 records to Notion

# Check sync status
sr notion status
# 📊 Notion Integration Status
# Configuration: ✅ Configured
# Last Sync: 1/15/2024, 2:30:45 PM
# Mapped Trackers: 2
#   • water-intake
#   • workout-log
```

## Step 6: Create Summary Page

```bash
# Create daily summary for today
sr notion daily --database c3d4e5f6-g7h8-i9j0-k1l2-m3n4o5p6q7r8
# ✅ Daily summary created!
# Date: 1/15/2024
# Page ID: d4e5f6g7-h8i9-j0k1-l2m3-n4o5p6q7r8s9

# Create weekly rollup
sr notion rollup weekly --database c3d4e5f6-g7h8-i9j0-k1l2-m3n4o5p6q7r8
# ✅ weekly rollup created!
# Period: weekly
# Date: 1/15/2024
```

## Step 7: Setup Automated Sync

```bash
# Add daily incremental sync at 9 AM
sr cron add "daily-water-sync" "0 9 * * *" "sr notion sync water-intake --incremental"
sr cron add "daily-workout-sync" "5 9 * * *" "sr notion sync workout-log --incremental"

# Add weekly summary generation (Sundays at 10 PM)
sr cron add "weekly-summary" "0 22 * * 0" "sr notion rollup weekly --database c3d4e5f6-g7h8-i9j0-k1l2-m3n4o5p6q7r8"

# List scheduled jobs
sr cron list
```

## Sample Data Flow

### Daily Usage Pattern

1. **Morning**: Track water intake
   ```bash
   # This data gets logged to StaticRebel
   "I drank 250ml water"
   ```

2. **Afternoon**: Log workout
   ```bash
   "30 minute run at the park"
   ```

3. **Evening**: Automatic sync happens
   - Cron job runs: `sr notion sync water-intake --incremental`
   - Cron job runs: `sr notion sync workout-log --incremental`
   - New entries appear in Notion databases

4. **Weekly**: Sunday evening summary
   - Cron job creates weekly rollup page with statistics

### Manual Workflow

For immediate sync after important entries:

```bash
# Log important workout
"Completed 5K personal best in 24:30"

# Immediately sync to Notion
sr notion sync workout-log --incremental

# Optionally create daily summary
sr notion daily --database summary-db-id
```

## Advanced Setup

### Multiple Workspaces

If you have multiple Notion workspaces:

1. Create separate integrations for each workspace
2. Use different config profiles (future feature)
3. Or manage multiple API keys manually

### Custom Property Mapping

For complex data structures:

```bash
# Advanced nutrition tracker mapping
sr notion map nutrition-tracker nutrition-db-id \
  title=MealEntry \
  date=Date \
  calories=Calories \
  protein=Protein \
  carbs=Carbohydrates \
  fat=Fat \
  meal_type=MealType \
  notes=Description
```

### Template Databases

Create template databases for consistent structure:

1. **Template Properties**: Set up standard property names across all tracking databases
2. **Default Values**: Use Notion formulas for calculated fields
3. **Views and Filters**: Create views for different time periods
4. **Relations**: Link related databases (meals → ingredients, workouts → exercises)

## Troubleshooting Example Issues

### Issue: Database Not Found

```bash
sr notion databases
# No databases found.
```

**Solution**: Make sure you've shared databases with your integration.

### Issue: Property Mapping Error  

```bash
sr notion map water-intake db-id title=Entry date=Date value=Volume
# Mapping failed: Invalid property mappings: Volume
```

**Solution**: Check the actual property name in your database (case-sensitive).

### Issue: Sync Errors

```bash
sr notion sync water-intake
# ⚠️ Errors encountered:
#   • Record abc123: Property 'Amount' is required
```

**Solution**: Ensure your database schema matches the mapped properties.

## Integration Results

After completing this setup, you'll have:

- ✅ Automatic daily sync of tracking data
- ✅ Rich Notion databases with your health data  
- ✅ Weekly summary pages with statistics
- ✅ Historical data accessible in Notion's powerful interface
- ✅ Ability to add charts, formulas, and advanced analytics

Your Notion workspace becomes a comprehensive personal analytics dashboard powered by StaticRebel's natural language tracking.