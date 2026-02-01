# StaticRebel Data Export and Portability Guide

StaticRebel provides comprehensive data export and import functionality to give users full control over their data. This includes GDPR-compliant data deletion capabilities.

## Quick Start

```bash
# Export all data as JSON
sr export

# Export all data as CSV
sr export --csv

# Export specific data types
sr export --scope skills --scope trackers

# Import from previous export
sr import backup.json

# GDPR data deletion (with safety confirmation)
sr delete-all-data --force
```

## Export Commands

### Basic Export

```bash
sr export [options]
```

**Options:**
- `--format, -f <format>` - Export format: `json` (default) or `csv`
- `--scope, -s <scope>` - Data scope to export (can be repeated)
- `--output, -o <path>` - Custom output file path
- `--csv` - Shortcut for `--format csv`
- `--json` - Shortcut for `--format json`

**Available scopes:**
- `all` (default) - Export everything
- `skills` - Skill definitions and tracking rules
- `trackers` - All tracker data and entries
- `memories` - Memory files and conversation history
- `database` - SQLite database tables
- `checkpoints` - Session checkpoints and state
- `config` - Configuration files and preferences

### Filtering Options

```bash
# Export data from specific date range
sr export --start-date 2024-01-01 --end-date 2024-12-31

# Export specific skills only
sr export --skills water --skills pushups --skills steps

# Combine filters
sr export --scope trackers --start-date 2024-01-01 --skills water
```

### Export Examples

```bash
# Full backup as JSON
sr export --output ~/backups/staticrebel-full-backup

# CSV export for data analysis
sr export --csv --scope trackers --scope memories

# Export specific skills for sharing
sr export --skills workout --skills nutrition --output ~/shared/fitness-skills

# Export recent data only
sr export --start-date 2024-01-01 --scope trackers
```

## Import Commands

### Basic Import

```bash
sr import <file> [options]
```

**Options:**
- `--dry-run` - Preview import without making changes

**Examples:**
```bash
# Import from backup
sr import ~/backups/staticrebel-backup-2024-01-01.json

# Preview import first
sr import backup.json --dry-run

# Import and see detailed output
sr import shared-skills.json
```

## GDPR Data Deletion

### Complete Data Removal

```bash
sr delete-all-data [options]
```

**Options:**
- `--force` - Required flag to actually delete data
- `--dry-run` - Show what would be deleted

**Safety Features:**
- Requires explicit `--force` flag
- Shows comprehensive warning before deletion
- Supports dry-run to preview deletion
- Logs all deleted paths and any errors

**Examples:**
```bash
# Preview what would be deleted (safe)
sr delete-all-data

# Actually delete all data (permanent!)
sr delete-all-data --force

# Show deletion plan without executing
sr delete-all-data --force --dry-run
```

**What gets deleted:**
- All skills and tracker data
- Memory files and conversation history
- Configuration and user preferences
- Checkpoints and session state
- Database files and vector memory
- API keys and personal data

## Export File Formats

### JSON Format

The JSON export creates a single file with structured data:

```json
{
  "metadata": {
    "exportedAt": "2024-01-01T12:00:00Z",
    "version": "1.0.0",
    "format": "json",
    "scopes": ["skills", "trackers"],
    "filters": {
      "startDate": "2024-01-01",
      "endDate": null,
      "skills": ["water", "pushups"]
    }
  },
  "skills": {
    "water": {
      "filename": "water.md",
      "content": "# Water Intake\n...",
      "path": "/path/to/water.md"
    }
  },
  "trackers": {
    "water": {
      "entries": [
        {
          "id": "ml2nnebypfzc",
          "timestamp": 1769884694351,
          "date": "2026-01-31",
          "value": 500,
          "note": "test"
        }
      ],
      "metadata": {
        "created": 1769884694350,
        "lastUpdated": 1769884694352
      }
    }
  }
}
```

### CSV Format

CSV exports create separate files for each data type:

- `export-2024-01-01-skills.csv` - Skills data
- `export-2024-01-01-trackers.csv` - Tracker entries
- `export-2024-01-01-memories.csv` - Memory files
- `export-2024-01-01-database.csv` - Database tables

Example tracker CSV:
```csv
tracker,id,timestamp,date,time,value,note
"water","ml2nnebypfzc","1769884694351","2026-01-31","18:38","500","test"
"pushups","ml2o0gx1ecgq","1769885304229","2026-01-31","18:48","20",""
```

## Data Privacy and Security

### GDPR Compliance

StaticRebel's data export system is designed with GDPR compliance in mind:

1. **Right to Export**: Complete data portability in standard formats
2. **Right to Deletion**: Comprehensive data removal with confirmation
3. **Data Transparency**: Clear documentation of what data is stored
4. **User Control**: Granular control over what gets exported/deleted

### Security Features

- **Atomic Operations**: File operations are atomic to prevent corruption
- **Progress Reporting**: Real-time feedback for large operations
- **Error Handling**: Comprehensive error logging and recovery
- **Safety Confirmations**: Multiple confirmations for destructive operations

### Local Storage

All StaticRebel data is stored locally in `~/.static-rebel/`:

```
~/.static-rebel/
├── skills/           # Skill definitions (.md files)
├── data/            # Tracker data (.json files)
├── memory/          # Conversation history (.md files)
├── checkpoints/     # Session state (.json files)
├── config/          # Configuration files
├── data.db          # Main SQLite database
├── vector-memory.db # Vector embeddings database
└── user-profile.json # User preferences
```

## Troubleshooting

### Common Issues

**Export fails with "Permission denied"**
- Check write permissions on output directory
- Use a different output path with `--output`

**Import fails with "Invalid JSON"**
- Verify the import file wasn't corrupted
- Check file encoding (should be UTF-8)

**Large exports are slow**
- Use specific scopes to limit data: `--scope trackers`
- Filter by date range: `--start-date 2024-01-01`

**Database export is empty**
- Ensure StaticRebel has been used to create data
- Check that the database file exists: `~/.static-rebel/data.db`

### Getting Help

```bash
# General export help
sr export --help

# Import help  
sr import --help

# Deletion help
sr delete-all-data --help
```

## Migration Use Cases

### Moving to New Computer

```bash
# On old computer
sr export --output ~/migration/staticrebel-backup

# Transfer file to new computer
# On new computer (after installing StaticRebel)
sr import ~/migration/staticrebel-backup.json
```

### Sharing Skills

```bash
# Export specific skills to share
sr export --scope skills --skills workout --skills nutrition --output shared-skills

# Recipient imports shared skills
sr import shared-skills.json
```

### Data Analysis

```bash
# Export tracker data as CSV for analysis
sr export --scope trackers --csv --start-date 2024-01-01

# Import into Excel, Python pandas, R, etc.
```

### Privacy Cleanup

```bash
# Before selling/disposing of computer
sr delete-all-data --force

# Verify deletion
ls ~/.static-rebel/  # Should not exist
```

This comprehensive export system ensures you maintain full control over your StaticRebel data while providing powerful tools for backup, migration, sharing, and privacy compliance.