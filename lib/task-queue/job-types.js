/**
 * Job Types - Built-in job handlers for Task Queue
 *
 * Each handler receives:
 * - payload: The job data
 * - context: { updateProgress(progress), log(message) }
 *
 * Returns: result object or throws error
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

export const jobTypes = {
  /**
   * Send notification
   * payload: { title, message, type }
   */
  async notification(payload, context) {
    const script = `display notification "${payload.message}" with title "${payload.title}"`;
    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    return { sent: true, title: payload.title };
  },

  /**
   * Send email
   * payload: { to, subject, body, attachments }
   */
  async email(payload, context) {
    const { sendEmail } = await import('../integrations/email.js');
    const result = await sendEmail({
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
      attachments: payload.attachments,
    });
    return { sent: true, messageId: result.messageId };
  },

  /**
   * Make webhook call
   * payload: { url, method, headers, body }
   */
  async webhook(payload, context) {
    context.log(`Calling webhook: ${payload.url}`);

    const response = await fetch(payload.url, {
      method: payload.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...payload.headers,
      },
      body: payload.body ? JSON.stringify(payload.body) : undefined,
    });

    const result = await response.text();

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${result}`);
    }

    return { status: response.status, response: result };
  },

  /**
   * Run shell command
   * payload: { command, timeout, cwd }
   */
  async shell(payload, context) {
    context.log(`Running command: ${payload.command}`);

    const { stdout, stderr } = await execAsync(payload.command, {
      timeout: payload.timeout || 30000,
      cwd: payload.cwd || process.cwd(),
    });

    return { stdout, stderr, success: true };
  },

  /**
   * Download file
   * payload: { url, path, headers }
   */
  async download(payload, context) {
    context.log(`Downloading: ${payload.url} -> ${payload.path}`);

    const dir = path.dirname(payload.path);
    await fs.mkdir(dir, { recursive: true });

    const response = await fetch(payload.url, {
      headers: payload.headers || {},
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(payload.path, Buffer.from(buffer));

    const stats = await fs.stat(payload.path);

    return { path: payload.path, size: stats.size, success: true };
  },

  /**
   * Process file
   * payload: { path, operation, options }
   */
  async file_process(payload, context) {
    context.log(`Processing file: ${payload.path}`);

    const content = await fs.readFile(payload.path, 'utf-8');

    let result;
    switch (payload.operation) {
      case 'compress':
        const zlib = await import('zlib');
        result = zlib.gzipSync(Buffer.from(content));
        await fs.writeFile(payload.path, result);
        break;

      case 'minify_json':
        const parsed = JSON.parse(content);
        await fs.writeFile(payload.path, JSON.stringify(parsed));
        result = { sizeBefore: content.length, sizeAfter: JSON.stringify(parsed).length };
        break;

      case 'prettify_json':
        const pretty = JSON.parse(content);
        await fs.writeFile(payload.path, JSON.stringify(pretty, null, 2));
        result = { formatted: true };
        break;

      case 'hash':
        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        return { hash };

      default:
        throw new Error(`Unknown operation: ${payload.operation}`);
    }

    return result;
  },

  /**
   * Run backup
   * payload: { source, destination, exclude }
   */
  async backup(payload, context) {
    context.log(`Creating backup: ${payload.source} -> ${payload.destination}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = payload.destination
      .replace('{date}', timestamp)
      .replace('{name}', path.basename(payload.source));

    await fs.mkdir(path.dirname(backupPath), { recursive: true });

    const { stdout } = await execAsync(`cp -r ${payload.source} ${backupPath}`);

    return { backupPath, timestamp, success: true };
  },

  /**
   * Sync directory
   * payload: { source, destination, delete }
   */
  async sync(payload, context) {
    context.log(`Syncing: ${payload.source} -> ${payload.destination}`);

    const args = payload.delete ? 'rsync -av --delete' : 'rsync -av';
    const { stdout } = await execAsync(`${args} ${payload.source}/ ${payload.destination}/`);

    return { synced: true, output: stdout };
  },

  /**
   * AI model inference
   * payload: { model, prompt, options }
   */
  async ai_inference(payload, context) {
    context.log(`Running AI inference with model: ${payload.model}`);

    const { modelRegistry } = await import('./modelRegistry.js');
    const result = await modelRegistry.complete(payload.model, payload.prompt, {
      temperature: payload.temperature || 0.7,
      maxTokens: payload.maxTokens || 1024,
    });

    return {
      model: payload.model,
      response: result.response,
      tokens: result.tokens,
    };
  },

  /**
   * Generate report
   * payload: { type, data, outputPath }
   */
  async report(payload, context) {
    context.log(`Generating ${payload.type} report`);

    const reports = await import('../analytics/index.js');
    const generator = reports[`generate${payload.type}Report`];

    if (!generator) {
      throw new Error(`Unknown report type: ${payload.type}`);
    }

    const report = await generator(payload.data || {});

    if (payload.outputPath) {
      await fs.writeFile(payload.outputPath, report);
    }

    return { type: payload.type, length: report.length };
  },

  /**
   * Cleanup task
   * payload: { paths, patterns, olderThan }
   */
  async cleanup(payload, context) {
    context.log('Running cleanup task');

    let deleted = 0;

    for (const dir of payload.paths || []) {
      try {
        const entries = await fs.readdir(dir);

        for (const entry of entries) {
          const fullPath = path.join(dir, entry);

          if (payload.patterns) {
            const matches = payload.patterns.some(p => entry.includes(p));
            if (!matches) continue;
          }

          const stats = await fs.stat(fullPath);

          if (payload.olderThan) {
            const age = Date.now() - stats.mtimeMs;
            if (age < payload.olderThan) continue;
          }

          if (stats.isDirectory()) {
            await fs.rm(fullPath, { recursive: true });
          } else {
            await fs.unlink(fullPath);
          }

          deleted++;
          context.log(`Deleted: ${fullPath}`);
        }
      } catch (error) {
        context.log(`Error cleaning ${dir}: ${error.message}`);
      }
    }

    return { deleted };
  },

  /**
   * Health check
   * payload: { services, timeout }
   */
  async health_check(payload, context) {
    context.log('Running health check');

    const health = await import('../healthMonitor.js');
    const results = await health.checkAll(payload.services);

    return { checks: results, healthy: results.every(r => r.status === 'healthy') };
  },

  /**
   * Send Slack message
   * payload: { channel, message, blocks }
   */
  async slack(payload, context) {
    const { slack } = await import('../integrations/slack.js');
    const result = await slack.sendMessage(payload.channel, payload.message, {
      blocks: payload.blocks,
    });
    return { sent: true, ts: result.ts };
  },

  /**
   * Send Discord message
   * payload: { channel, message }
   */
  async discord(payload, context) {
    const { discord } = await import('../integrations/discord.js');
    const result = await discord.sendMessage(payload.channel, payload.message);
    return { sent: true, id: result.id };
  },

  /**
   * Generic HTTP request
   * payload: { method, url, headers, body }
   */
  async http_request(payload, context) {
    context.log(`${payload.method} ${payload.url}`);

    const response = await fetch(payload.url, {
      method: payload.method || 'GET',
      headers: payload.headers || {},
      body: payload.body ? JSON.stringify(payload.body) : undefined,
    });

    const text = await response.text();

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: text.substring(0, 10000),
    };
  },

  /**
   * Wait/sleep
   * payload: { duration }
   */
  async sleep(payload, context) {
    context.log(`Sleeping for ${payload.duration}ms`);

    await new Promise(resolve => setTimeout(resolve, payload.duration));

    return { slept: payload.duration };
  },

  /**
   * Compound job - runs multiple jobs sequentially
   * payload: { jobs: [{ type, payload }] }
   */
  async compound(payload, context) {
    const { createTaskQueue } = await import('./index.js');
    const queue = createTaskQueue();

    const results = [];

    for (const job of payload.jobs) {
      context.log(`Running sub-job: ${job.type}`);

      const jobId = await queue.enqueue(job.type, job.payload || {}, {
        priority: job.priority || 'normal',
      });

      results.push({ type: job.type, jobId, submitted: true });
    }

    return { submitted: results.length, jobs: results };
  },
};

export function registerJobType(name, handler) {
  if (jobTypes[name]) {
    console.warn(`Overwriting existing job type: ${name}`);
  }
  jobTypes[name] = handler;
}

export function unregisterJobType(name) {
  delete jobTypes[name];
}

export default jobTypes;
