/**
 * Static Rebel Orchestrator - Unifies all automation modules
 *
 * Integrates:
 * - Computer Automation
 * - Task Queue
 * - Context Awareness
 * - Wake Word Detection
 * - Smart Notifications
 * - Proactive Suggestions
 */

import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';

const ORCHESTRATOR_VERSION = '1.0.0';

const DEFAULT_OPTIONS = {
  computerAutomation: true,
  taskQueue: true,
  contextAwareness: true,
  wakeWord: false,
  notifications: true,
  suggestions: true,
  autoStart: false,
  dataPath: path.join(os.homedir(), '.static-rebel'),
};

export class Orchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.isRunning = false;
    this.modules = {};
    this.initialized = false;

    this.commandPatterns = [
      { pattern: /launch\s+(.+)/i, action: 'launchApp', type: 'app' },
      { pattern: /open\s+(.+)/i, action: 'launchApp', type: 'app' },
      { pattern: /quit\s+(.+)/i, action: 'quitApp', type: 'app' },
      { pattern: /close\s+(.+)/i, action: 'quitApp', type: 'app' },
      { pattern: /write\s+(.+)/i, action: 'writeFile', type: 'file' },
      { pattern: /read\s+(.+)/i, action: 'readFile', type: 'file' },
      { pattern: /notify\s+(.+)/i, action: 'sendNotification', type: 'notification' },
      { pattern: /schedule\s+(.+)/i, action: 'scheduleJob', type: 'queue' },
      { pattern: /run\s+(.+)/i, action: 'runJob', type: 'queue' },
      { pattern: /status/i, action: 'getStatus', type: 'system' },
      { pattern: /help/i, action: 'showHelp', type: 'system' },
    ];

    this.stats = {
      commandsExecuted: 0,
      errors: 0,
      uptime: 0,
      startTime: Date.now(),
    };
  }

  async initialize() {
    console.log('[Orchestrator] Initializing modules...');

    if (this.options.computerAutomation) {
      try {
        const { createComputerAutomation } = await import('../computer-automation/index.js');
        this.modules.computerAutomation = createComputerAutomation();
        console.log('[Orchestrator] Computer Automation loaded');
      } catch (error) {
        console.warn('[Orchestrator] Computer Automation failed:', error.message);
      }
    }

    if (this.options.taskQueue) {
      try {
        const { createTaskQueue, createTaskScheduler } = await import('../task-queue/index.js');
        this.modules.taskQueue = createTaskQueue();
        this.modules.scheduler = createTaskScheduler({ taskQueue: this.modules.taskQueue });
        await this.modules.taskQueue.initialize();
        this.modules.scheduler.start();
        console.log('[Orchestrator] Task Queue loaded');
      } catch (error) {
        console.warn('[Orchestrator] Task Queue failed:', error.message);
      }
    }

    if (this.options.contextAwareness) {
      try {
        const { createContextAwareness } = await import('../context-awareness/index.js');
        this.modules.context = createContextAwareness();
        await this.modules.context.initialize();
        console.log('[Orchestrator] Context Awareness loaded');
      } catch (error) {
        console.warn('[Orchestrator] Context Awareness failed:', error.message);
      }
    }

    if (this.options.notifications) {
      try {
        const { createSmartNotifications } = await import('../context-awareness/smart-notifications.js');
        this.modules.notifications = createSmartNotifications();
        console.log('[Orchestrator] Smart Notifications loaded');
      } catch (error) {
        console.warn('[Orchestrator] Smart Notifications failed:', error.message);
      }
    }

    if (this.options.suggestions) {
      try {
        const { createProactiveSuggestions } = await import('../context-awareness/proactive-suggestions.js');
        this.modules.suggestions = createProactiveSuggestions();
        await this.modules.suggestions.initialize();
        console.log('[Orchestrator] Proactive Suggestions loaded');
      } catch (error) {
        console.warn('[Orchestrator] Proactive Suggestions failed:', error.message);
      }
    }

    if (this.options.wakeWord) {
      try {
        const { createContinuousListener } = await import('../voice/wake-word/continuous-listener.js');
        this.modules.listener = createContinuousListener({
          wakeWords: ['hey assistant', 'okay computer'],
          autoSend: false,
        });

        this.modules.listener.on('recording:complete', async ({ audio }) => {
          await this.handleVoiceCommand(audio);
        });

        await this.modules.listener.initialize();
        console.log('[Orchestrator] Wake Word Listener loaded');
      } catch (error) {
        console.warn('[Orchestrator] Wake Word Listener failed:', error.message);
      }
    }

    this.setupEventForwarding();
    this.initialized = true;

    this.emit('initialized', { version: ORCHESTRATOR_VERSION });
    console.log('[Orchestrator] Initialization complete');
  }

  setupEventForwarding() {
    if (this.modules.context) {
      this.modules.context.on('activity:idle', (data) => {
        this.modules.suggestions?.updateContext(data.context);
        this.emit('user:idle', data);
      });

      this.modules.context.on('activity:resumed', (data) => {
        this.emit('user:active', data);
      });

      this.modules.context.on('window:changed', (data) => {
        this.emit('window:changed', data);
      });
    }

    if (this.modules.suggestions) {
      this.modules.suggestions.on('suggestion:new', (suggestion) => {
        this.modules.notifications?.send({
          title: 'Suggestion',
          message: suggestion.message,
          priority: 'low',
          data: { suggestionId: suggestion.id },
        });
        this.emit('suggestion:new', suggestion);
      });
    }

    if (this.modules.taskQueue) {
      this.modules.taskQueue.on('job:completed', (data) => {
        this.modules.notifications?.send({
          title: 'Task Complete',
          message: `Job ${data.jobId.substring(0, 8)} completed`,
          priority: 'normal',
        });
        this.emit('job:completed', data);
      });

      this.modules.taskQueue.on('job:failed', (data) => {
        this.modules.notifications?.send({
          title: 'Task Failed',
          message: data.error,
          priority: 'high',
        });
        this.emit('job:failed', data);
      });
    }
  }

  async start() {
    if (this.isRunning) return;
    if (!this.initialized) await this.initialize();

    this.isRunning = true;
    this.stats.startTime = Date.now();

    if (this.modules.context) {
      this.modules.context.start();
    }

    if (this.modules.listener) {
      this.modules.listener.start();
    }

    if (this.modules.suggestions) {
      this.modules.suggestions.start();
    }

    this.emit('started');
    console.log('[Orchestrator] Started');
  }

  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.stats.uptime = Date.now() - this.stats.startTime;

    if (this.modules.context) {
      this.modules.context.stop();
    }

    if (this.modules.listener) {
      this.modules.listener.stop();
    }

    if (this.modules.suggestions) {
      this.modules.suggestions.stop();
    }

    if (this.modules.taskQueue) {
      await this.modules.taskQueue.shutdown();
    }

    this.emit('stopped');
    console.log('[Orchestrator] Stopped');
  }

  async processCommand(command, options = {}) {
    const startTime = Date.now();

    try {
      for (const { pattern, action, type } of this.commandPatterns) {
        const match = command.match(pattern);
        if (match) {
          const result = await this[action](match, options);
          this.stats.commandsExecuted++;

          this.emit('command:executed', {
            command,
            action,
            type,
            result,
            duration: Date.now() - startTime,
          });

          return { success: true, action, result, match };
        }
      }

      const nlpResult = await this.processNLP(command);
      if (nlpResult) {
        return nlpResult;
      }

      this.stats.errors++;
      return { success: false, error: 'Unknown command' };
    } catch (error) {
      this.stats.errors++;
      this.emit('command:error', { command, error: error.message });
      return { success: false, error: error.message };
    }
  }

  async processNLP(command) {
    if (this.modules.context) {
      const context = this.modules.context.getCurrentContext();
      const inferred = context.inferred;

      if (inferred?.confidence > 0.7) {
        const suggestedAction = this.suggestActionForContext(inferred.state);
        if (suggestedAction) {
          return await this.processCommand(suggestedAction);
        }
      }
    }

    return null;
  }

  suggestActionForContext(state) {
    const actions = {
      coding: 'run tests',
      terminal: 'check git status',
      browsing: 'bookmark page',
      emailing: 'check inbox',
      writing: 'save document',
    };
    return actions[state];
  }

  async launchApp(match) {
    const appName = match[1].trim();
    return this.modules.computerAutomation?.apps.launch(appName);
  }

  async quitApp(match) {
    const appName = match[1].trim();
    return this.modules.computerAutomation?.apps.quit(appName);
  }

  async writeFile(match) {
    const content = match[1].trim();
    return { message: 'Use writeFile with path and content' };
  }

  async readFile(match) {
    const filePath = match[1].trim();
    return this.modules.computerAutomation?.files.read(filePath);
  }

  async sendNotification(match) {
    const message = match[1].trim();
    return this.modules.notifications?.send({
      title: 'Command',
      message,
      priority: 'normal',
    });
  }

  async scheduleJob(match) {
    const jobSpec = match[1].trim();
    return { message: 'Scheduling not implemented' };
  }

  async runJob(match) {
    const jobSpec = match[1].trim();
    return this.modules.taskQueue?.enqueue('shell', { command: jobSpec });
  }

  async getStatus() {
    return this.getFullStatus();
  }

  async showHelp() {
    return {
      commands: [
        'launch <app> - Open an application',
        'quit <app> - Close an application',
        'write <text> - Write text',
        'read <file> - Read a file',
        'notify <message> - Send notification',
        'schedule <job> - Schedule a job',
        'run <command> - Run a shell command',
        'status - Show system status',
        'help - Show this help',
      ],
    };
  }

  async handleVoiceCommand(audioBuffer) {
    try {
      const { whisper } = await import('../voice/whisper.js');
      const transcription = await whisper.transcribe(audioBuffer);

      this.emit('voice:transcribed', { text: transcription.text });

      const result = await this.processCommand(transcription.text);

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeAction(action, params = {}) {
    const actionMap = {
      computer: () => this.modules.computerAutomation?.executeAction(params),
      queue: () => this.modules.taskQueue?.enqueue(params.type, params.payload, params.options),
      notification: () => this.modules.notifications?.send(params),
      context: () => this.modules.context?.getCurrentContext(),
      suggestions: () => this.modules.suggestions?.getSuggestions(params),
    };

    const handler = actionMap[action];
    if (!handler) {
      throw new Error(`Unknown action type: ${action}`);
    }

    return handler();
  }

  getModule(name) {
    const moduleMap = {
      automation: this.modules.computerAutomation,
      queue: this.modules.taskQueue,
      scheduler: this.modules.scheduler,
      context: this.modules.context,
      notifications: this.modules.notifications,
      suggestions: this.modules.suggestions,
      listener: this.modules.listener,
    };
    return moduleMap[name];
  }

  getFullStatus() {
    const status = {
      version: ORCHESTRATOR_VERSION,
      isRunning: this.isRunning,
      uptime: Date.now() - this.stats.startTime,
      modules: {},
      stats: {
        commandsExecuted: this.stats.commandsExecuted,
        errors: this.stats.errors,
      },
    };

    if (this.modules.computerAutomation) {
      status.modules.automation = this.modules.computerAutomation.getStatus();
    }

    if (this.modules.taskQueue) {
      status.modules.queue = this.modules.taskQueue.getStats();
    }

    if (this.modules.context) {
      status.modules.context = this.modules.context.getStats();
    }

    if (this.modules.notifications) {
      status.modules.notifications = this.modules.notifications.getStats();
    }

    if (this.modules.suggestions) {
      status.modules.suggestions = this.modules.suggestions.getStats();
    }

    if (this.modules.listener) {
      status.modules.listener = this.modules.listener.getStats();
    }

    return status;
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
    };
  }
}

export function createOrchestrator(options = {}) {
  return new Orchestrator(options);
}

export default Orchestrator;
