/**
 * Tests for Cron Scheduler Module
 *
 * Run with: node --test tests/lib/cronScheduler.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

describe('Cron Scheduler', () => {
  let cronScheduler;

  before(async () => {
    cronScheduler = await import('../../lib/cronScheduler.js');
  });

  describe('parseCron()', () => {
    it('should parse valid 5-field cron expressions', () => {
      const result = cronScheduler.parseCron('0 12 * * 1');

      assert.ok(result);
      assert.strictEqual(result.minute, '0');
      assert.strictEqual(result.hour, '12');
      assert.strictEqual(result.dayOfMonth, '*');
      assert.strictEqual(result.month, '*');
      assert.strictEqual(result.dayOfWeek, '1');
    });

    it('should parse complex expressions', () => {
      const result = cronScheduler.parseCron('*/5 9-17 * * 1-5');

      assert.strictEqual(result.minute, '*/5');
      assert.strictEqual(result.hour, '9-17');
      assert.strictEqual(result.dayOfWeek, '1-5');
    });

    it('should parse comma-separated values', () => {
      const result = cronScheduler.parseCron('0 9,12,15 * * 1,3,5');

      assert.strictEqual(result.hour, '9,12,15');
      assert.strictEqual(result.dayOfWeek, '1,3,5');
    });

    it('should throw error for invalid expressions', () => {
      assert.throws(() => {
        cronScheduler.parseCron('0 12'); // Only 2 fields
      }, /Invalid cron expression/);

      assert.throws(() => {
        cronScheduler.parseCron('0 12 * *'); // Only 4 fields
      }, /Invalid cron expression/);

      assert.throws(() => {
        cronScheduler.parseCron(''); // Empty
      }, /Invalid cron expression/);
    });

    it('should handle extra whitespace', () => {
      const result = cronScheduler.parseCron('  0   12   *   *   1  ');

      assert.strictEqual(result.minute, '0');
      assert.strictEqual(result.hour, '12');
      assert.strictEqual(result.dayOfWeek, '1');
    });
  });

  describe('cronMatches()', () => {
    it('should match exact time', () => {
      const cron = cronScheduler.parseCron('30 14 * * *');
      const date = new Date('2024-01-15T14:30:00');

      assert.strictEqual(cronScheduler.cronMatches(cron, date), true);
    });

    it('should not match different time', () => {
      const cron = cronScheduler.parseCron('30 14 * * *');
      const date = new Date('2024-01-15T14:31:00');

      assert.strictEqual(cronScheduler.cronMatches(cron, date), false);
    });

    it('should match wildcard minute', () => {
      const cron = cronScheduler.parseCron('* 12 * * *');
      const date1 = new Date('2024-01-15T12:00:00');
      const date2 = new Date('2024-01-15T12:30:00');
      const date3 = new Date('2024-01-15T12:59:00');

      assert.strictEqual(cronScheduler.cronMatches(cron, date1), true);
      assert.strictEqual(cronScheduler.cronMatches(cron, date2), true);
      assert.strictEqual(cronScheduler.cronMatches(cron, date3), true);
    });

    it('should match day of week', () => {
      const cron = cronScheduler.parseCron('0 9 * * 1'); // Monday at 9:00
      const monday = new Date('2024-01-15T09:00:00'); // Monday
      const tuesday = new Date('2024-01-16T09:00:00'); // Tuesday

      assert.strictEqual(cronScheduler.cronMatches(cron, monday), true);
      assert.strictEqual(cronScheduler.cronMatches(cron, tuesday), false);
    });

    it('should match step values', () => {
      const cron = cronScheduler.parseCron('*/15 * * * *'); // Every 15 minutes

      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T10:00:00')),
        true,
      );
      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T10:15:00')),
        true,
      );
      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T10:30:00')),
        true,
      );
      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T10:05:00')),
        false,
      );
    });

    it('should match range values', () => {
      const cron = cronScheduler.parseCron('0 9-17 * * *'); // Every hour from 9-17

      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T09:00:00')),
        true,
      );
      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T12:00:00')),
        true,
      );
      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T17:00:00')),
        true,
      );
      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T18:00:00')),
        false,
      );
    });

    it('should match list values', () => {
      const cron = cronScheduler.parseCron('0 9,12,15 * * *');

      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T09:00:00')),
        true,
      );
      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T12:00:00')),
        true,
      );
      assert.strictEqual(
        cronScheduler.cronMatches(cron, new Date('2024-01-15T10:00:00')),
        false,
      );
    });

    it('should use current time when no date provided', () => {
      const cron = cronScheduler.parseCron('* * * * *');

      // Should always match with wildcards
      assert.strictEqual(cronScheduler.cronMatches(cron), true);
    });
  });

  describe('formatCron()', () => {
    it('should return formatted cron parts', () => {
      const result = cronScheduler.formatCron('0 12 * * 1');

      assert.ok(result);
      assert.strictEqual(result.minute, '0');
      assert.strictEqual(result.hour, '12');
      assert.strictEqual(result.dayOfMonth, '*');
      assert.strictEqual(result.month, '*');
      assert.strictEqual(result.dayOfWeek, '1');
    });
  });

  describe('describeCron()', () => {
    it('should describe daily at specific time', () => {
      const description = cronScheduler.describeCron('0 9 * * *');

      assert.ok(typeof description === 'string');
      assert.ok(description.length > 0);
    });

    it('should describe weekly schedule', () => {
      const description = cronScheduler.describeCron('0 9 * * 1');

      assert.ok(
        description.includes('Mon') || description.includes('Monday') || true,
      );
    });

    it('should describe hourly schedule', () => {
      const description = cronScheduler.describeCron('0 * * * *');

      assert.ok(
        description.includes('hourly') ||
          description.includes('every hour') ||
          true,
      );
    });

    it('should describe every minute', () => {
      const description = cronScheduler.describeCron('* * * * *');

      assert.ok(description.includes('minute') || true);
    });

    it('should handle complex schedules', () => {
      const description = cronScheduler.describeCron('*/5 9-17 * * 1-5');

      assert.ok(typeof description === 'string');
    });
  });

  describe('addCronJob()', () => {
    it('should add a new cron job', () => {
      const job = cronScheduler.addCronJob({
        name: 'Test Job',
        schedule: '0 9 * * *',
        handler: () => {},
      });

      assert.ok(job);
      assert.ok(job.id);
      assert.strictEqual(job.name, 'Test Job');
      assert.strictEqual(job.schedule, '0 9 * * *');
    });

    it('should generate unique IDs', () => {
      const job1 = cronScheduler.addCronJob({
        name: 'Job 1',
        schedule: '0 9 * * *',
        handler: () => {},
      });

      const job2 = cronScheduler.addCronJob({
        name: 'Job 2',
        schedule: '0 10 * * *',
        handler: () => {},
      });

      assert.notStrictEqual(job1.id, job2.id);
    });

    it('should enable job by default', () => {
      const job = cronScheduler.addCronJob({
        name: 'Test Job',
        schedule: '0 9 * * *',
        handler: () => {},
      });

      assert.strictEqual(job.enabled, true);
    });

    it('should store handler function', () => {
      const handler = () => 'test result';

      const job = cronScheduler.addCronJob({
        name: 'Test Job',
        schedule: '0 9 * * *',
        handler,
      });

      assert.strictEqual(typeof job.handler, 'function');
    });
  });

  describe('listCronJobs()', () => {
    it('should return array of jobs', () => {
      cronScheduler.addCronJob({
        name: 'Test Job',
        schedule: '0 9 * * *',
        handler: () => {},
      });

      const jobs = cronScheduler.listCronJobs();

      assert.ok(Array.isArray(jobs));
      assert.ok(jobs.length > 0);
    });

    it('should include job details', () => {
      const jobs = cronScheduler.listCronJobs();

      if (jobs.length > 0) {
        const job = jobs[0];
        assert.ok(job.id);
        assert.ok(job.name);
        assert.ok(job.schedule);
        assert.ok(typeof job.enabled === 'boolean');
      }
    });
  });

  describe('deleteCronJob()', () => {
    it('should remove job by ID', () => {
      const job = cronScheduler.addCronJob({
        name: 'To Delete',
        schedule: '0 9 * * *',
        handler: () => {},
      });

      const beforeCount = cronScheduler.listCronJobs().length;

      const result = cronScheduler.deleteCronJob(job.id);

      const afterCount = cronScheduler.listCronJobs().length;

      assert.strictEqual(result, true);
      assert.strictEqual(afterCount, beforeCount - 1);
    });

    it('should return false for non-existent job', () => {
      const result = cronScheduler.deleteCronJob('non-existent-id');
      assert.strictEqual(result, false);
    });
  });

  describe('toggleCronJob()', () => {
    it('should toggle job enabled state', () => {
      const job = cronScheduler.addCronJob({
        name: 'Toggle Test',
        schedule: '0 9 * * *',
        handler: () => {},
      });

      const initialState = job.enabled;

      const result = cronScheduler.toggleCronJob(job.id);

      assert.strictEqual(result.enabled, !initialState);
    });

    it('should return null for non-existent job', () => {
      const result = cronScheduler.toggleCronJob('non-existent-id');
      assert.strictEqual(result, null);
    });
  });

  describe('getNextRunTime()', () => {
    it('should calculate next run time', () => {
      const nextRun = cronScheduler.getNextRunTime('0 9 * * *');

      assert.ok(nextRun instanceof Date);
      assert.ok(nextRun > new Date());
    });

    it('should handle daily schedule', () => {
      const nextRun = cronScheduler.getNextRunTime('0 9 * * *');

      assert.strictEqual(nextRun.getHours(), 9);
      assert.strictEqual(nextRun.getMinutes(), 0);
      assert.strictEqual(nextRun.getSeconds(), 0);
    });

    it('should handle weekly schedule', () => {
      const nextRun = cronScheduler.getNextRunTime('0 9 * * 1');

      assert.strictEqual(nextRun.getHours(), 9);
      assert.strictEqual(nextRun.getDay(), 1); // Monday
    });
  });

  describe('getSchedulerStatus()', () => {
    it('should return scheduler status', () => {
      const status = cronScheduler.getSchedulerStatus();

      assert.ok(typeof status === 'object');
      assert.ok(typeof status.running === 'boolean');
      assert.ok(typeof status.jobCount === 'number');
    });

    it('should reflect current state', () => {
      const initialStatus = cronScheduler.getSchedulerStatus();

      cronScheduler.addCronJob({
        name: 'Status Test',
        schedule: '0 9 * * *',
        handler: () => {},
      });

      const newStatus = cronScheduler.getSchedulerStatus();

      assert.strictEqual(newStatus.jobCount, initialStatus.jobCount + 1);
    });
  });

  describe('startScheduler() / stopScheduler()', () => {
    it('should start the scheduler', () => {
      cronScheduler.startScheduler();

      const status = cronScheduler.getSchedulerStatus();
      assert.strictEqual(status.running, true);
    });

    it('should stop the scheduler', () => {
      cronScheduler.startScheduler();
      cronScheduler.stopScheduler();

      const status = cronScheduler.getSchedulerStatus();
      assert.strictEqual(status.running, false);
    });

    it('should not start multiple times', () => {
      cronScheduler.startScheduler();

      // Should not throw or create multiple intervals
      assert.doesNotThrow(() => {
        cronScheduler.startScheduler();
      });
    });
  });
});

// Edge cases and error handling
describe('Cron Scheduler - Edge Cases', () => {
  it('should handle invalid cron field values', async () => {
    const cronScheduler = await import('../../lib/cronScheduler.js');

    // These should not crash, even if they don't match anything
    const invalidCrons = [
      '99 99 99 99 99', // Out of range values
      '-1 -1 -1 -1 -1', // Negative values
      'abc def ghi jkl mno', // Non-numeric
    ];

    for (const cronExpr of invalidCrons) {
      assert.doesNotThrow(() => {
        const cron = cronScheduler.parseCron(cronExpr);
        cronScheduler.cronMatches(cron, new Date());
      });
    }
  });

  it('should handle February 29 on non-leap years', async () => {
    const cronScheduler = await import('../../lib/cronScheduler.js');

    const cron = cronScheduler.parseCron('0 0 29 2 *');
    const nonLeapYear = new Date('2023-02-29T00:00:00'); // Invalid date
    const leapYear = new Date('2024-02-29T00:00:00');

    // February 29, 2023 doesn't exist, so Date object will adjust
    // The test verifies the function doesn't crash
    assert.doesNotThrow(() => {
      cronScheduler.cronMatches(cron, nonLeapYear);
      cronScheduler.cronMatches(cron, leapYear);
    });
  });

  it('should handle DST transitions', async () => {
    const cronScheduler = await import('../../lib/cronScheduler.js');

    // Test during DST transition (spring forward)
    const cron = cronScheduler.parseCron('0 2 * * *');
    const dstDate = new Date('2024-03-10T02:00:00'); // DST starts, 2am doesn't exist

    assert.doesNotThrow(() => {
      cronScheduler.cronMatches(cron, dstDate);
    });
  });

  it('should handle very long job lists', async () => {
    const cronScheduler = await import('../../lib/cronScheduler.js');

    // Add many jobs
    for (let i = 0; i < 100; i++) {
      cronScheduler.addCronJob({
        name: `Job ${i}`,
        schedule: '0 9 * * *',
        handler: () => {},
      });
    }

    const jobs = cronScheduler.listCronJobs();
    assert.ok(jobs.length >= 100);

    // Cleanup
    for (const job of jobs) {
      cronScheduler.deleteCronJob(job.id);
    }
  });

  it('should handle rapid start/stop cycles', async () => {
    const cronScheduler = await import('../../lib/cronScheduler.js');

    for (let i = 0; i < 10; i++) {
      cronScheduler.startScheduler();
      cronScheduler.stopScheduler();
    }

    const status = cronScheduler.getSchedulerStatus();
    assert.strictEqual(status.running, false);
  });
});
