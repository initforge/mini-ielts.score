import { pool } from '../services/db.service';
import { Redis } from 'ioredis';
import { GradingService } from '../services/grading.service';
import { RowDataPacket } from 'mysql2';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

async function pollJobs() {
  if (isRunning) return;
  isRunning = true;
  
  try {
    const [jobs] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM toeic_grading_jobs WHERE status = ? ORDER BY created_at ASC LIMIT 5',
      ['QUEUED']
    );

    for (const job of jobs) {
      const lockKey = `grading_job_lock:${job.id}`;
      // Try to acquire lock for 3 minutes
      const lockAcquired = await redis.set(lockKey, '1', 'NX', 'EX', 180);
      
      if (lockAcquired) {
        console.log(`[Grading Worker] Processing job ${job.id}`);
        try {
          await GradingService.processJob(job.id);
          console.log(`[Grading Worker] Job ${job.id} completed`);
        } catch (error) {
          console.error(`[Grading Worker] Error processing job ${job.id}:`, error);
        } finally {
          await redis.del(lockKey);
        }
      }
    }
  } catch (error) {
    console.error('[Grading Worker] Polling error:', error);
  } finally {
    isRunning = false;
  }
}

export function startGradingWorker() {
  console.log('[Grading Worker] Started');
  // Poll every 5 seconds
  intervalId = setInterval(pollJobs, 5000);
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
