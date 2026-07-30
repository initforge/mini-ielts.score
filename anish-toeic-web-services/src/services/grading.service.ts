import { pool } from './db.service';
import { RowDataPacket } from 'mysql2';

export class GradingService {
  static async processJob(jobId: number) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock the job row
      const [jobs] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM toeic_grading_jobs WHERE id = ? FOR UPDATE',
        [jobId]
      );

      if (!jobs.length) {
        throw new Error(`Job ${jobId} not found`);
      }

      const job = jobs[0];

      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        // Idempotent: do nothing if already done
        await connection.rollback();
        return { success: true, message: 'Already processed' };
      }

      const attemptId = job.attempt_id;

      // Update job to PROCESSING
      await connection.query(
        'UPDATE toeic_grading_jobs SET status = ? WHERE id = ?',
        ['PROCESSING', jobId]
      );
      
      // Update attempt to GRADING
      await connection.query(
        'UPDATE toeic_attempts SET status = ? WHERE id = ?',
        ['GRADING', attemptId]
      );

      // Fetch attempt and exam
      const [attempts] = await connection.query<RowDataPacket[]>(
        'SELECT a.*, e.skill_type FROM toeic_attempts a JOIN toeic_exams e ON a.exam_id = e.id WHERE a.id = ?',
        [attemptId]
      );

      if (!attempts.length) {
        throw new Error(`Attempt ${attemptId} not found`);
      }

      const attempt = attempts[0];

      // Fetch responses
      const [responses] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM toeic_attempt_responses WHERE attempt_id = ?',
        [attemptId]
      );

      // Simulate AI processing delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Mock grading for questions
      for (const response of responses) {
        const score = Math.floor(Math.random() * 5); // Mock rubric score 0-4
        await connection.query(
          `INSERT INTO toeic_question_scores (attempt_id, question_id, score, is_correct) 
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE score = VALUES(score), is_correct = VALUES(is_correct)`,
          [attemptId, response.question_id, score, score > 0]
        );
      }

      // Generate final mock scores based on skill_type
      let totalScore = 0;
      let listeningScore = 0;
      let readingScore = 0;
      let metrics = {};

      if (attempt.skill_type === 'SW') {
        // Speaking and Writing mock scores 0-200
        const speakingScore = Math.floor(Math.random() * 201);
        const writingScore = Math.floor(Math.random() * 201);
        totalScore = speakingScore + writingScore;
        metrics = {
          speaking_score: speakingScore,
          writing_score: writingScore
        };
      } else {
        // LR or other
        listeningScore = Math.floor(Math.random() * 496);
        readingScore = Math.floor(Math.random() * 496);
        totalScore = listeningScore + readingScore;
      }

      // Insert result
      await connection.query(
        `INSERT INTO toeic_attempt_results (attempt_id, listening_score, reading_score, total_score, status, metrics)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         listening_score = VALUES(listening_score), 
         reading_score = VALUES(reading_score), 
         total_score = VALUES(total_score), 
         status = VALUES(status), 
         metrics = VALUES(metrics)`,
        [attemptId, listeningScore, readingScore, totalScore, 'FINAL', JSON.stringify(metrics)]
      );

      // Update job and attempt to COMPLETED
      await connection.query(
        'UPDATE toeic_grading_jobs SET status = ? WHERE id = ?',
        ['COMPLETED', jobId]
      );
      await connection.query(
        'UPDATE toeic_attempts SET status = ? WHERE id = ?',
        ['COMPLETED', attemptId]
      );

      await connection.commit();
      return { success: true, message: 'Grading completed' };
    } catch (error) {
      await connection.rollback();
      
      // Attempt to set job to FAILED
      try {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await pool.query(
          'UPDATE toeic_grading_jobs SET status = ?, error_message = ? WHERE id = ?',
          ['FAILED', errorMsg, jobId]
        );
        await pool.query(
          'UPDATE toeic_attempts SET status = ? WHERE id = (SELECT attempt_id FROM toeic_grading_jobs WHERE id = ?)',
          ['FAILED', jobId]
        );
      } catch (e) {
        // Ignore failure to update status
      }
      
      throw error;
    } finally {
      connection.release();
    }
  }
}
