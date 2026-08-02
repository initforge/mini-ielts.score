/**
 * Grading Worker — polls grading_jobs for QUEUED, RETRY and stale PROCESSING.
 *
 * Safety:
 *  - Single isRunning guard prevents concurrent polling on same process.
 *  - Redis lock ownership lives in GradingService.processJob (NX): duplicate
 *    workers race for the same lock and only one processes. The worker must
 *    NOT pre-acquire the lock itself, or the service's own NX acquisition
 *    would fail (lock already held by the same process) and the job would
 *    never progress.
 *  - Stale PROCESSING recovery runs every 30s.
 */

import { pool } from '../services/db.service';
import { Redis } from 'ioredis';
import { GradingService, recoverStaleProcessingJobs } from '../services/grading.service';
import { validateWorkerEnv } from '../config/env';
import { RowDataPacket } from 'mysql2';

// R3-SECURITY: worker env validation (separate, minimal worker schema).
// Fail fast before polling/touching Redis/DB, with a message listing every
// missing/invalid variable so PM2 misconfiguration is obvious at boot.
try {
  validateWorkerEnv();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[Grading Worker] FATAL: invalid environment — refusing to start. ${msg}`);
  process.exit(1);
}

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

const POLL_INTERVAL_MS = 5000;
const STALE_RECOVERY_INTERVAL_MS = 30000;
const BATCH_SIZE = 5;

async function pollJobs() {
  if (isRunning) return;
  isRunning = true;

  try {
    // Process QUEUED and RETRY jobs
    const [jobs] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM toeic_grading_jobs
       WHERE status IN ('QUEUED', 'RETRY')
       ORDER BY created_at ASC
       LIMIT ?`,
      [BATCH_SIZE]
    );

    for (const job of jobs) {
      console.log(`[Grading Worker] Processing job ${job.id}`);
      try {
        // Lock ownership is inside GradingService.processJob (Redis NX + FOR
        // UPDATE). If another worker currently holds the lock, processJob
        // returns 'Lock not acquired' and this worker skips — the row stays
        // QUEUED and is retried on the next poll. No duplicate processing.
        await GradingService.processJob(job.id);
      } catch (error: unknown) {
        // Only log — GradingService handles its own state transitions
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[Grading Worker] Unhandled error for job ${job.id}:`, msg.substring(0, 200));
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Grading Worker] Polling error:', msg.substring(0, 200));
  } finally {
    isRunning = false;
  }
}

async function recoverStaleJobs() {
  try {
    const recovered = await recoverStaleProcessingJobs();
    if (recovered > 0) {
      console.log(`[Grading Worker] Recovered ${recovered} stale PROCESSING job(s)`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Grading Worker] Stale recovery error:', msg.substring(0, 200));
  }
}

export function startGradingWorker() {
  console.log('[Grading Worker] Started');
  // Poll for QUEUED/RETRY jobs every 5s
  intervalId = setInterval(pollJobs, POLL_INTERVAL_MS);
  // Recover stale PROCESSING jobs every 30s
  setInterval(recoverStaleJobs, STALE_RECOVERY_INTERVAL_MS).unref();
}

export function stopGradingWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log('[Grading Worker] Stopped');
}

// Allow running standalone
if (require.main === module) {
  startGradingWorker();

  process.on('SIGINT', () => {
    stopGradingWorker();
    redis.quit();
    process.exit(0);
  });
}
