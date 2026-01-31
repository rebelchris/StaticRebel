/**
 * Command Allowlist with Safety Patterns
 * Per-agent allowlists and rejects dangerous patterns
 * 
 * Security patterns blocked:
 * - Command substitution: $(cat /etc/passwd)
 * - Redirection to system files: > /etc/hosts
 * - Chained dangerous commands: rm -rf / || echo
 * - Subshell execution: (sudo rm -rf /)
 */

import { EventEmitter } from 'events';

/**
 * Dangerous patterns that should be blocked
 */
export const DANGEROUS_PATTERNS = [
  // Command substitution
  { pattern: /\$\([^)]+\)/, name: 'command_substitution', severity: 'critical' },
  { pattern: /`[^`]+`/, name: 'backtick_substitution', severity: 'critical' },
  
  // Redirection to system files
  { pattern: />\s*\/etc\/\w+/, name: 'redirect_to_etc', severity: 'critical' },
  { pattern: />\s*\/dev\/sda/, name: 'redirect_to_disk', severity: 'critical' },
  { pattern: />\s*\/boot/, name: 'redirect_to_boot', severity: 'critical' },
  { pattern: />\s*\/proc/, name: 'redirect_to_proc', severity: 'critical' },
  { pattern: />\s*\/sys/, name: 'redirect_to_sys', severity: 'critical' },
  
  // Subshell execution
  { pattern: /\([^)]*\)/, name: 'subshell_execution', severity: 'high' },
  
  // Dangerous chains
  { pattern: /rm\s+-rf.*\|\|/, name: 'dangerous_chain_rm', severity: 'critical' },
  { pattern: /rm\s+-rf.*&&/, name: 'dangerous_chain_rm_and', severity: 'critical' },
  { pattern: /:\(\)\s*\{.*:\|:.*\}.*;/, name: 'fork_bomb', severity: 'critical' },
  
  // Privilege escalation
  { pattern: /sudo\s+.*rm\s+-rf/, name: 'sudo_rm_rf', severity: 'critical' },
  { pattern: /sudo\s+.*mkfs/, name: 'sudo_mkfs', severity: 'critical' },
  { pattern: /sudo\s+.*dd/, name: 'sudo_dd', severity: 'critical' },
  
  // Network pipe to shell
  { pattern: /curl\s+.*\|\s*(ba)?sh/i, name: 'curl_pipe_shell', severity: 'critical' },
  { pattern: /wget\s+.*\|\s*(ba)?sh/i, name: 'wget_pipe_shell', severity: 'critical' },
  { pattern: /fetch\s+.*\|\s*(ba)?sh/i, name: 'fetch_pipe_shell', severity: 'critical' },
  
  // Eval and exec
  { pattern: /\beval\s*\(/i, name: 'eval_function', severity: 'critical' },
  { pattern: /\bexec\s*\(/i, name: 'exec_function', severity: 'critical' },
  
  // Base64 obfuscation
  { pattern: /echo\s+['"][A-Za-z0-9+/]{50,}={0,2}['"]\s*\|/, name: 'base64_obfuscation', severity: 'high' },
  { pattern: /base64\s+.*\|/, name: 'base64_decode_pipe', severity: 'high' },
  
  // Path traversal
  { pattern: /\.\.\//, name: 'path_traversal', severity: 'high' },
  { pattern: /\.\.\\/, name: 'path_traversal_windows', severity: 'high' },
];

/**
 * Default safe commands
 */
export const SAFE_COMMANDS = new Set([
  'ls', 'll', 'dir',
  'pwd',
  'cat',
  'head', 'tail',
  'grep', 'rg',
  'find',
  'echo',
  'date',
  'whoami',
  'which', 'whereis',
  'uname',
  'git status', 'git log', 'git branch', 'git diff', 'git show',
  'npm', 'yarn', 'pnpm',
  'node', 'npx',
  'cd', 'pushd', 'popd',
  'mkdir', 'touch',
  'cp', 'mv',
  'clear', 'exit',
]);

/**
 * Commands requiring confirmation
 */
export const CONFIRMATION_COMMANDS = new Set([
  'rm', 'rmdir', 'del',
  'chmod', 'chown',
  'kill', 'pkill',
  'docker',
  'kubectl',
  'terraform',
  'aws', 'gcloud', 'azure',
  'ssh', 'scp',
  'curl', 'wget',
  'npm install -g', 'npm uninstall',
  'git push', 'git reset', 'git checkout -f', 'git clean',
]);

/**
 * Command Allowlist Manager
 */
export class CommandAllowlist extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.agentId = options.agentId || 'default';
    this.mode = options.mode || 'restrictive'; // 'permissive', 'restrictive', 'strict'
    
    // Allowlist for this agent
    this.allowlist = new Set(options.allowlist || []);
    
    // Blocklist for this agent
    this.blocklist = new Set(options.blocklist || []);
    
    // Custom patterns
    this.customPatterns = options.customPatterns || [];
    
    // Statistics
    this.stats = {
      totalChecked: 0,
      allowed: 0,
      blocked: 0,
      requiringConfirmation: 0,
    };
  }

  /**
   * Validate a command
   */
  validate(command) {
    this.stats.totalChecked++;
    
    const result = {
      allowed: true,
      command,
      agentId: this.agentId,
      requiresConfirmation: false,
      blockedPatterns: [],
      reason: null,
      riskLevel: 'low',
    };

    // Check against blocklist first
    if (this.isBlocklisted(command)) {
      result.allowed = false;
      result.reason = 'Command is in blocklist';
      result.riskLevel = 'critical';
      this.stats.blocked++;
      this.emit('command:blocked', result);
      return result;
    }

    // Check dangerous patterns
    const patternMatches = this.checkDangerousPatterns(command);
    if (patternMatches.length > 0) {
      result.blockedPatterns = patternMatches;
      
      // Critical patterns always block
      const critical = patternMatches.filter(p => p.severity === 'critical');
      if (critical.length > 0) {
        result.allowed = false;
        result.reason = `Dangerous patterns detected: ${critical.map(p => p.name).join(', ')}`;
        result.riskLevel = 'critical';
        this.stats.blocked++;
        this.emit('command:blocked', result);
        return result;
      }
      
      // High severity requires confirmation
      const high = patternMatches.filter(p => p.severity === 'high');
      if (high.length > 0) {
        result.requiresConfirmation = true;
        result.riskLevel = 'high';
      }
    }

    // Check allowlist in restrictive mode
    if (this.mode === 'restrictive' || this.mode === 'strict') {
      if (!this.isAllowlisted(command)) {
        result.allowed = false;
        result.reason = 'Command not in allowlist';
        result.riskLevel = 'medium';
        this.stats.blocked++;
        this.emit('command:blocked', result);
        return result;
      }
    }

    // Check if command requires confirmation
    if (this.requiresConfirmation(command)) {
      result.requiresConfirmation = true;
      result.riskLevel = 'medium';
    }

    // Update stats
    if (result.requiresConfirmation) {
      this.stats.requiringConfirmation++;
    } else {
      this.stats.allowed++;
    }

    if (result.allowed) {
      this.emit('command:allowed', result);
    }

    return result;
  }

  /**
   * Check if command is in allowlist
   */
  isAllowlisted(command) {
    const normalized = command.toLowerCase().trim();
    const baseCommand = normalized.split(' ')[0];
    
    // Check agent-specific allowlist
    if (this.allowlist.has(normalized)) return true;
    if (this.allowlist.has(baseCommand)) return true;
    
    // Check default safe commands
    if (SAFE_COMMANDS.has(normalized)) return true;
    if (SAFE_COMMANDS.has(baseCommand)) return true;
    
    // Check for git/npm commands with safe subcommands
    if (this.isSafeCompoundCommand(normalized)) return true;
    
    return false;
  }

  /**
   * Check if command is in blocklist
   */
  isBlocklisted(command) {
    const normalized = command.toLowerCase().trim();
    
    for (const blocked of this.blocklist) {
      if (normalized.includes(blocked.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check for dangerous patterns
   */
  checkDangerousPatterns(command) {
    const matches = [];
    const allPatterns = [...DANGEROUS_PATTERNS, ...this.customPatterns];
    
    for (const { pattern, name, severity } of allPatterns) {
      if (pattern.test(command)) {
        matches.push({ name, severity, pattern: pattern.toString() });
      }
    }
    
    return matches;
  }

  /**
   * Check if command requires confirmation
   */
  requiresConfirmation(command) {
    const normalized = command.toLowerCase().trim();
    
    for (const confirmCmd of CONFIRMATION_COMMANDS) {
      if (normalized.startsWith(confirmCmd.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if compound command is safe
   */
  isSafeCompoundCommand(command) {
    const safeCompounds = [
      { cmd: 'git', safe: ['status', 'log', 'branch', 'diff', 'show', 'remote', 'config --get'] },
      { cmd: 'npm', safe: ['list', 'config', 'run', 'start', 'test'] },
    ];
    
    for (const { cmd, safe } of safeCompounds) {
      if (command.startsWith(cmd)) {
        const subcommand = command.slice(cmd.length).trim().split(' ')[0];
        return safe.includes(subcommand);
      }
    }
    
    return false;
  }

  /**
   * Add command to allowlist
   */
  addToAllowlist(command) {
    this.allowlist.add(command.toLowerCase().trim());
    this.emit('allowlist:updated', { agentId: this.agentId, command });
  }

  /**
   * Remove command from allowlist
   */
  removeFromAllowlist(command) {
    this.allowlist.delete(command.toLowerCase().trim());
    this.emit('allowlist:updated', { agentId: this.agentId, command });
  }

  /**
   * Add command to blocklist
   */
  addToBlocklist(command) {
    this.blocklist.add(command.toLowerCase().trim());
    this.emit('blocklist:updated', { agentId: this.agentId, command });
  }

  /**
   * Set mode
   */
  setMode(mode) {
    if (['permissive', 'restrictive', 'strict'].includes(mode)) {
      this.mode = mode;
      this.emit('mode:changed', { agentId: this.agentId, mode });
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      allowlistSize: this.allowlist.size,
      blocklistSize: this.blocklist.size,
      mode: this.mode,
    };
  }

  /**
   * Get configuration
   */
  getConfig() {
    return {
      agentId: this.agentId,
      mode: this.mode,
      allowlist: Array.from(this.allowlist),
      blocklist: Array.from(this.blocklist),
      customPatterns: this.customPatterns,
    };
  }
}

/**
 * Global Command Registry
 * Manages allowlists for all agents
 */
export class CommandRegistry extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.globalBlocklist = new Set([
      'rm -rf /',
      'rm -rf /*',
      'mkfs',
      'dd if=/dev/zero',
      ':(){ :|:& };:',
    ]);
  }

  /**
   * Get or create agent allowlist
   */
  getAgentAllowlist(agentId, options = {}) {
    if (!this.agents.has(agentId)) {
      const allowlist = new CommandAllowlist({
        agentId,
        ...options,
        blocklist: [...(options.blocklist || []), ...Array.from(this.globalBlocklist)],
      });
      
      // Forward events
      allowlist.on('command:blocked', (data) => this.emit('command:blocked', data));
      allowlist.on('command:allowed', (data) => this.emit('command:allowed', data));
      
      this.agents.set(agentId, allowlist);
    }
    
    return this.agents.get(agentId);
  }

  /**
   * Validate command for specific agent
   */
  validateForAgent(agentId, command, options = {}) {
    const allowlist = this.getAgentAllowlist(agentId, options);
    return allowlist.validate(command);
  }

  /**
   * Add to global blocklist
   */
  addToGlobalBlocklist(command) {
    this.globalBlocklist.add(command);
    
    // Update all agents
    for (const agent of this.agents.values()) {
      agent.addToBlocklist(command);
    }
  }

  /**
   * Get all agent stats
   */
  getAllStats() {
    const stats = {};
    for (const [agentId, agent] of this.agents) {
      stats[agentId] = agent.getStats();
    }
    return stats;
  }
}

// Factory functions
export function createCommandAllowlist(options = {}) {
  return new CommandAllowlist(options);
}

export function createCommandRegistry() {
  return new CommandRegistry();
}

// Default export
export default CommandAllowlist;
