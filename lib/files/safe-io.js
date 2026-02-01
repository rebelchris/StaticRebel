/**
 * Safe File I/O Operations
 * Secure file read/write operations with workspace restrictions
 */

import fs from 'fs';
import path from 'path';

// Default workspace path
const WORKSPACE = process.env.WORKSPACE || process.cwd();

/**
 * Write file to workspace with safety checks
 */
function writeFile(relativePath, content) {
  const fullPath = path.join(WORKSPACE, relativePath);
  try {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
    return { success: true, path: fullPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Read file from workspace
 */
function readFile(relativePath) {
  const fullPath = path.join(WORKSPACE, relativePath);
  try {
    return { success: true, content: fs.readFileSync(fullPath, 'utf-8') };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * List files and directories in workspace path
 */
function listFiles(dir = '.') {
  const fullPath = path.join(WORKSPACE, dir);
  try {
    if (!fs.existsSync(fullPath)) return { success: false, error: 'Directory not found' };
    const files = fs.readdirSync(fullPath).map(f => {
      const full = path.join(fullPath, f);
      const stat = fs.statSync(full);
      return { name: f, isDir: stat.isDirectory(), size: stat.size };
    });
    return { success: true, files };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Run command in workspace directory
 */
function runCommand(cmd) {
  return new Promise((resolve) => {
    const proc = require('child_process').spawn(cmd, {
      cwd: WORKSPACE,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let out = '', err = '';
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', code => resolve({ code, stdout: out, stderr: err }));
  });
}

export {
  WORKSPACE,
  writeFile,
  readFile,
  listFiles,
  runCommand,
};