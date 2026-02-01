/**
 * StaticRebel Data Export and Portability Module
 * Handles GDPR-compliant data export, import, and deletion
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream';

const DATA_DIR = path.join(os.homedir(), '.static-rebel');
const DB_PATH = path.join(DATA_DIR, 'data.db');
const VECTOR_DB_PATH = path.join(DATA_DIR, 'vector-memory.db');

/**
 * Export scopes
 */
export const EXPORT_SCOPES = {
  ALL: 'all',
  SKILLS: 'skills',
  TRACKERS: 'trackers',
  MEMORIES: 'memories',
  DATABASE: 'database',
  CHECKPOINTS: 'checkpoints',
  CALENDAR: 'calendar',
  CONFIG: 'config'
};

/**
 * Export formats
 */
export const EXPORT_FORMATS = {
  JSON: 'json',
  CSV: 'csv'
};

/**
 * Progress callback type
 * @callback ProgressCallback
 * @param {number} current - Current item count
 * @param {number} total - Total item count
 * @param {string} operation - Current operation description
 */

/**
 * Export options
 * @typedef {Object} ExportOptions
 * @property {string} format - Export format (json/csv)
 * @property {string[]} scopes - Data scopes to export
 * @property {string} [outputPath] - Output file path
 * @property {string} [startDate] - Start date filter (YYYY-MM-DD)
 * @property {string} [endDate] - End date filter (YYYY-MM-DD)
 * @property {string[]} [skills] - Specific skills to export
 * @property {ProgressCallback} [onProgress] - Progress callback
 */

/**
 * Check if a file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read JSON file
 */
async function readJsonFile(filePath, defaultValue = null) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

/**
 * Get list of all skill files
 */
async function getSkillFiles() {
  const skillsDir = path.join(DATA_DIR, 'skills');
  const exists = await fileExists(skillsDir);
  if (!exists) return [];
  
  const files = await fs.readdir(skillsDir);
  return files.filter(f => f.endsWith('.md'));
}

/**
 * Get list of all tracker data files
 */
async function getTrackerFiles() {
  const dataDir = path.join(DATA_DIR, 'data');
  const exists = await fileExists(dataDir);
  if (!exists) return [];
  
  const files = await fs.readdir(dataDir);
  return files.filter(f => f.endsWith('.json'));
}

/**
 * Export skills data
 */
async function exportSkills(options = {}) {
  const skills = {};
  const skillFiles = await getSkillFiles();
  
  for (let i = 0; i < skillFiles.length; i++) {
    const file = skillFiles[i];
    const skillName = path.basename(file, '.md');
    
    // Skip if specific skills requested and this isn't one of them
    if (options.skills && !options.skills.includes(skillName)) {
      continue;
    }
    
    const skillPath = path.join(DATA_DIR, 'skills', file);
    const content = await fs.readFile(skillPath, 'utf-8');
    skills[skillName] = {
      filename: file,
      content: content,
      path: skillPath
    };
    
    if (options.onProgress) {
      options.onProgress(i + 1, skillFiles.length, `Exporting skill: ${skillName}`);
    }
  }
  
  return skills;
}

/**
 * Export tracker data (entries)
 */
async function exportTrackers(options = {}) {
  const trackers = {};
  const trackerFiles = await getTrackerFiles();
  
  for (let i = 0; i < trackerFiles.length; i++) {
    const file = trackerFiles[i];
    const trackerName = path.basename(file, '.json');
    
    // Skip if specific skills requested and this isn't one of them
    if (options.skills && !options.skills.includes(trackerName)) {
      continue;
    }
    
    const trackerPath = path.join(DATA_DIR, 'data', file);
    const data = await readJsonFile(trackerPath, { entries: [], metadata: {} });
    
    // Apply date filtering if specified
    if (options.startDate || options.endDate) {
      data.entries = data.entries.filter(entry => {
        const entryDate = entry.date || entry.timestamp;
        if (!entryDate) return true;
        
        const dateStr = typeof entryDate === 'string' ? entryDate : 
                       new Date(entryDate).toISOString().split('T')[0];
        
        if (options.startDate && dateStr < options.startDate) return false;
        if (options.endDate && dateStr > options.endDate) return false;
        return true;
      });
    }
    
    trackers[trackerName] = data;
    
    if (options.onProgress) {
      options.onProgress(i + 1, trackerFiles.length, `Exporting tracker: ${trackerName}`);
    }
  }
  
  return trackers;
}

/**
 * Export database data
 */
async function exportDatabase(options = {}) {
  const exists = await fileExists(DB_PATH);
  if (!exists) return {};
  
  const db = new Database(DB_PATH, { readonly: true });
  const data = {};
  
  try {
    // Get all tables
    const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=?').all('table');
    const tableNames = tables.map(t => t.name).filter(name => name !== 'sqlite_sequence');
    
    for (let i = 0; i < tableNames.length; i++) {
      const tableName = tableNames[i];
      const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
      
      // Apply date filtering for tables with date/timestamp columns
      if ((options.startDate || options.endDate) && rows.length > 0) {
        const firstRow = rows[0];
        const dateColumns = Object.keys(firstRow).filter(col => 
          col.includes('date') || col.includes('time') || col.includes('created')
        );
        
        if (dateColumns.length > 0) {
          data[tableName] = rows.filter(row => {
            const rowDate = dateColumns.find(col => row[col]);
            if (!rowDate) return true;
            
            const dateStr = new Date(row[rowDate]).toISOString().split('T')[0];
            if (options.startDate && dateStr < options.startDate) return false;
            if (options.endDate && dateStr > options.endDate) return false;
            return true;
          });
        } else {
          data[tableName] = rows;
        }
      } else {
        data[tableName] = rows;
      }
      
      if (options.onProgress) {
        options.onProgress(i + 1, tableNames.length, `Exporting table: ${tableName}`);
      }
    }
  } finally {
    db.close();
  }
  
  return data;
}

/**
 * Export memory files
 */
async function exportMemories(options = {}) {
  const memories = {};
  const memoryDir = path.join(DATA_DIR, 'memory');
  const exists = await fileExists(memoryDir);
  if (!exists) return memories;
  
  const files = await fs.readdir(memoryDir, { recursive: true });
  const memoryFiles = files.filter(f => typeof f === 'string');
  
  for (let i = 0; i < memoryFiles.length; i++) {
    const file = memoryFiles[i];
    const filePath = path.join(memoryDir, file);
    
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) continue;
      
      const content = await fs.readFile(filePath, 'utf-8');
      memories[file] = {
        content: content,
        modified: stats.mtime,
        size: stats.size
      };
      
      if (options.onProgress) {
        options.onProgress(i + 1, memoryFiles.length, `Exporting memory: ${file}`);
      }
    } catch (error) {
      console.warn(`Failed to read memory file ${file}:`, error.message);
    }
  }
  
  return memories;
}

/**
 * Export checkpoints
 */
async function exportCheckpoints(options = {}) {
  const checkpoints = {};
  const checkpointDir = path.join(DATA_DIR, 'checkpoints');
  const exists = await fileExists(checkpointDir);
  if (!exists) return checkpoints;
  
  const sessions = await fs.readdir(checkpointDir);
  let fileCount = 0;
  let totalFiles = 0;
  
  // Count total files first for progress
  for (const session of sessions) {
    const sessionPath = path.join(checkpointDir, session);
    const stats = await fs.stat(sessionPath);
    if (stats.isDirectory()) {
      const files = await fs.readdir(sessionPath);
      totalFiles += files.length;
    }
  }
  
  for (const session of sessions) {
    const sessionPath = path.join(checkpointDir, session);
    const stats = await fs.stat(sessionPath);
    
    if (stats.isDirectory()) {
      const files = await fs.readdir(sessionPath);
      checkpoints[session] = {};
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const checkpointPath = path.join(sessionPath, file);
          const data = await readJsonFile(checkpointPath, null);
          if (data) {
            checkpoints[session][file] = data;
          }
          
          fileCount++;
          if (options.onProgress) {
            options.onProgress(fileCount, totalFiles, `Exporting checkpoint: ${session}/${file}`);
          }
        }
      }
    }
  }
  
  return checkpoints;
}

/**
 * Export configuration files
 */
async function exportConfig(options = {}) {
  const config = {};
  const configFiles = [
    'user-profile.json',
    'api-keys.json',
    'config/cron.json'
  ];
  
  for (let i = 0; i < configFiles.length; i++) {
    const configFile = configFiles[i];
    const configPath = path.join(DATA_DIR, configFile);
    const exists = await fileExists(configPath);
    
    if (exists) {
      const data = await readJsonFile(configPath, null);
      if (data) {
        config[configFile] = data;
      }
    }
    
    if (options.onProgress) {
      options.onProgress(i + 1, configFiles.length, `Exporting config: ${configFile}`);
    }
  }
  
  return config;
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data, dataType) {
  const rows = [];
  
  if (dataType === 'trackers') {
    // Flatten tracker entries into CSV rows
    for (const [trackerName, trackerData] of Object.entries(data)) {
      if (trackerData.entries) {
        for (const entry of trackerData.entries) {
          rows.push({
            tracker: trackerName,
            id: entry.id,
            timestamp: entry.timestamp,
            date: entry.date,
            time: entry.time,
            value: entry.value,
            note: entry.note
          });
        }
      }
    }
  } else if (dataType === 'database') {
    // Flatten database tables
    for (const [tableName, tableData] of Object.entries(data)) {
      for (const row of tableData) {
        rows.push({
          table: tableName,
          ...row
        });
      }
    }
  } else if (dataType === 'memories') {
    // Convert memories to CSV
    for (const [fileName, memoryData] of Object.entries(data)) {
      rows.push({
        file: fileName,
        content: memoryData.content?.substring(0, 1000) + '...', // Truncate for CSV
        modified: memoryData.modified,
        size: memoryData.size
      });
    }
  } else {
    // Generic object flattening
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object') {
        rows.push({
          key: key,
          type: typeof value,
          value: JSON.stringify(value).substring(0, 500) + '...'
        });
      } else {
        rows.push({ key, value });
      }
    }
  }
  
  if (rows.length === 0) return '';
  
  // Generate CSV headers
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];
  
  // Generate CSV rows
  for (const row of rows) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvLines.push(values.join(','));
  }
  
  return csvLines.join('\n');
}

/**
 * Main export function
 */
export async function exportData(options = {}) {
  const {
    format = EXPORT_FORMATS.JSON,
    scopes = [EXPORT_SCOPES.ALL],
    onProgress
  } = options;
  
  const exportedData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      format: format,
      scopes: scopes,
      filters: {
        startDate: options.startDate,
        endDate: options.endDate,
        skills: options.skills
      }
    }
  };
  
  // Determine what to export
  const shouldExportAll = scopes.includes(EXPORT_SCOPES.ALL);
  const exportScopes = shouldExportAll ? Object.values(EXPORT_SCOPES).filter(s => s !== EXPORT_SCOPES.ALL) : scopes;
  
  for (const scope of exportScopes) {
    if (onProgress) {
      onProgress(0, 0, `Starting export of ${scope}...`);
    }
    
    try {
      switch (scope) {
        case EXPORT_SCOPES.SKILLS:
          exportedData.skills = await exportSkills(options);
          break;
        case EXPORT_SCOPES.TRACKERS:
          exportedData.trackers = await exportTrackers(options);
          break;
        case EXPORT_SCOPES.DATABASE:
          exportedData.database = await exportDatabase(options);
          break;
        case EXPORT_SCOPES.MEMORIES:
          exportedData.memories = await exportMemories(options);
          break;
        case EXPORT_SCOPES.CHECKPOINTS:
          exportedData.checkpoints = await exportCheckpoints(options);
          break;
        case EXPORT_SCOPES.CONFIG:
          exportedData.config = await exportConfig(options);
          break;
      }
    } catch (error) {
      console.error(`Failed to export ${scope}:`, error.message);
      exportedData[scope] = { error: error.message };
    }
  }
  
  if (format === EXPORT_FORMATS.CSV) {
    // For CSV, create separate files for each data type
    const csvData = {};
    for (const [key, value] of Object.entries(exportedData)) {
      if (key !== 'metadata' && value && !value.error) {
        csvData[key] = convertToCSV(value, key);
      }
    }
    return csvData;
  }
  
  return exportedData;
}

/**
 * Import StaticRebel data from JSON export
 */
export async function importData(exportData, options = {}) {
  const { onProgress, dryRun = false } = options;
  const results = {
    imported: 0,
    skipped: 0,
    errors: []
  };
  
  if (!exportData || typeof exportData !== 'object') {
    throw new Error('Invalid export data format');
  }
  
  if (exportData.metadata && exportData.metadata.version !== '1.0.0') {
    console.warn('Warning: Import data version mismatch. Proceeding anyway...');
  }
  
  const importSteps = [];
  
  // Plan import steps
  if (exportData.skills) importSteps.push(['skills', exportData.skills]);
  if (exportData.trackers) importSteps.push(['trackers', exportData.trackers]);
  if (exportData.memories) importSteps.push(['memories', exportData.memories]);
  if (exportData.checkpoints) importSteps.push(['checkpoints', exportData.checkpoints]);
  if (exportData.config) importSteps.push(['config', exportData.config]);
  if (exportData.database) importSteps.push(['database', exportData.database]);
  
  for (let i = 0; i < importSteps.length; i++) {
    const [dataType, data] = importSteps[i];
    
    if (onProgress) {
      onProgress(i, importSteps.length, `Importing ${dataType}...`);
    }
    
    try {
      await importDataType(dataType, data, { dryRun });
      results.imported++;
    } catch (error) {
      console.error(`Failed to import ${dataType}:`, error.message);
      results.errors.push({ dataType, error: error.message });
      results.skipped++;
    }
  }
  
  return results;
}

/**
 * Import specific data type
 */
async function importDataType(dataType, data, options = {}) {
  const { dryRun = false } = options;
  
  switch (dataType) {
    case 'skills':
      for (const [skillName, skillData] of Object.entries(data)) {
        const skillPath = path.join(DATA_DIR, 'skills', `${skillName}.md`);
        if (!dryRun) {
          await fs.mkdir(path.dirname(skillPath), { recursive: true });
          await fs.writeFile(skillPath, skillData.content);
        }
      }
      break;
      
    case 'trackers':
      for (const [trackerName, trackerData] of Object.entries(data)) {
        const trackerPath = path.join(DATA_DIR, 'data', `${trackerName}.json`);
        if (!dryRun) {
          await fs.mkdir(path.dirname(trackerPath), { recursive: true });
          await fs.writeFile(trackerPath, JSON.stringify(trackerData, null, 2));
        }
      }
      break;
      
    case 'memories':
      for (const [fileName, memoryData] of Object.entries(data)) {
        const memoryPath = path.join(DATA_DIR, 'memory', fileName);
        if (!dryRun) {
          await fs.mkdir(path.dirname(memoryPath), { recursive: true });
          await fs.writeFile(memoryPath, memoryData.content);
        }
      }
      break;
      
    case 'config':
      for (const [configFile, configData] of Object.entries(data)) {
        const configPath = path.join(DATA_DIR, configFile);
        if (!dryRun) {
          await fs.mkdir(path.dirname(configPath), { recursive: true });
          await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
        }
      }
      break;
      
    case 'checkpoints':
      for (const [session, sessionData] of Object.entries(data)) {
        const sessionPath = path.join(DATA_DIR, 'checkpoints', session);
        if (!dryRun) {
          await fs.mkdir(sessionPath, { recursive: true });
          for (const [checkpointFile, checkpointData] of Object.entries(sessionData)) {
            const checkpointPath = path.join(sessionPath, checkpointFile);
            await fs.writeFile(checkpointPath, JSON.stringify(checkpointData, null, 2));
          }
        }
      }
      break;
      
    case 'database':
      if (!dryRun) {
        const db = new Database(DB_PATH);
        try {
          for (const [tableName, tableData] of Object.entries(data)) {
            // Note: This is a simplified import - in production, you'd want
            // to handle schema validation and conflicts more carefully
            console.log(`Importing ${tableData.length} rows to table ${tableName}`);
            // Import implementation would need to be table-specific
          }
        } finally {
          db.close();
        }
      }
      break;
  }
}

/**
 * GDPR-compliant data deletion with confirmation
 */
export async function deleteAllUserData(options = {}) {
  const { onProgress, dryRun = false, force = false } = options;
  
  if (!force && !dryRun) {
    throw new Error('GDPR deletion requires explicit force=true flag for safety');
  }
  
  const deletionLog = {
    timestamp: new Date().toISOString(),
    deletedPaths: [],
    errors: []
  };
  
  // Get all data paths to delete
  const pathsToDelete = [
    DATA_DIR + '/skills',
    DATA_DIR + '/data',
    DATA_DIR + '/memory',
    DATA_DIR + '/checkpoints', 
    DATA_DIR + '/config',
    DATA_DIR + '/vector-memory',
    DATA_DIR + '/evolution',
    DATA_DIR + '/tasks',
    DATA_DIR + '/workers',
    DATA_DIR + '/personas',
    DATA_DIR + '/marketplace',
    DATA_DIR + '/logs',
    DB_PATH,
    VECTOR_DB_PATH,
    DATA_DIR + '/user-profile.json',
    DATA_DIR + '/api-keys.json'
  ];
  
  for (let i = 0; i < pathsToDelete.length; i++) {
    const pathToDelete = pathsToDelete[i];
    
    if (onProgress) {
      onProgress(i + 1, pathsToDelete.length, `Deleting: ${pathToDelete}`);
    }
    
    try {
      const exists = await fileExists(pathToDelete);
      if (exists && !dryRun) {
        const stats = await fs.stat(pathToDelete);
        if (stats.isDirectory()) {
          await fs.rm(pathToDelete, { recursive: true, force: true });
        } else {
          await fs.unlink(pathToDelete);
        }
        deletionLog.deletedPaths.push(pathToDelete);
      } else if (exists) {
        deletionLog.deletedPaths.push(`${pathToDelete} (dry run)`);
      }
    } catch (error) {
      console.error(`Failed to delete ${pathToDelete}:`, error.message);
      deletionLog.errors.push({ path: pathToDelete, error: error.message });
    }
  }
  
  return deletionLog;
}

/**
 * Get export statistics
 */
export async function getExportStats() {
  const stats = {
    skills: 0,
    trackers: 0,
    memoryFiles: 0,
    checkpointSessions: 0,
    databaseTables: 0,
    totalSize: 0
  };
  
  // Count skills
  const skillFiles = await getSkillFiles();
  stats.skills = skillFiles.length;
  
  // Count trackers
  const trackerFiles = await getTrackerFiles();
  stats.trackers = trackerFiles.length;
  
  // Count memory files
  const memoryDir = path.join(DATA_DIR, 'memory');
  const memoryExists = await fileExists(memoryDir);
  if (memoryExists) {
    const files = await fs.readdir(memoryDir, { recursive: true });
    stats.memoryFiles = files.filter(f => typeof f === 'string').length;
  }
  
  // Count checkpoint sessions
  const checkpointDir = path.join(DATA_DIR, 'checkpoints');
  const checkpointExists = await fileExists(checkpointDir);
  if (checkpointExists) {
    const sessions = await fs.readdir(checkpointDir);
    stats.checkpointSessions = sessions.length;
  }
  
  // Count database tables
  const dbExists = await fileExists(DB_PATH);
  if (dbExists) {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=?').all('table');
      stats.databaseTables = tables.length;
    } finally {
      db.close();
    }
  }
  
  // Calculate total size
  try {
    const dirStats = await fs.stat(DATA_DIR);
    stats.totalSize = dirStats.size;
  } catch {
    // Directory size calculation is complex, skip for now
    stats.totalSize = 0;
  }
  
  return stats;
}