import { pool } from './db.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { ScorerService } from './scorer.service';

export class ToeicService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async getExams(filters: Record<string, any> = {}) {
    let query = 'SELECT * FROM toeic_exams';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.search) {
      conditions.push('(title LIKE ? OR slug LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.skillType) {
      conditions.push('skill_type = ?');
      params.push(filters.skillType);
    }
    if (filters.collectionId) {
      conditions.push('collection_id = ?');
      params.push(filters.collectionId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const [rows] = await pool.query(query, params);
    return rows;
  }

  static async getExamBySlug(slug: string) {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM toeic_exams WHERE slug = ? LIMIT 1', [slug]);
    if (!rows.length) return null;
    
    const exam = rows[0];
    const [sections] = await pool.query('SELECT * FROM toeic_exam_sections WHERE exam_id = ? ORDER BY order_index', [exam.id]);
    
    return { ...exam, sections };
  }

  static async createAttempt(userId: string, examId: number, mode: string) {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO toeic_attempts (user_id, exam_id, status, mode) VALUES (?, ?, ?, ?)',
      [userId, examId, 'IN_PROGRESS', mode]
    );
    
    return {
      attemptId: result.insertId,
      status: 'IN_PROGRESS',
      mode
    };
  }

  static async getAttempt(attemptId: number, userId: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1',
      [attemptId, userId]
    );
    if (!rows.length) return null;
    
    const attempt = rows[0];
    
    const [responses] = await pool.query(
      'SELECT question_id, selected_option_id, text_response, marked_for_review, note, client_revision FROM toeic_attempt_responses WHERE attempt_id = ?',
      [attemptId]
    );

    const [sections] = await pool.query('SELECT * FROM toeic_exam_sections WHERE exam_id = ? ORDER BY order_index', [attempt.exam_id]);
    const [questions] = await pool.query(
      `SELECT q.id, q.section_id, q.type, q.order_index, q.content, q.audio_url, q.image_url 
       FROM toeic_questions q 
       JOIN toeic_exam_sections s ON q.section_id = s.id 
       WHERE s.exam_id = ? ORDER BY q.order_index`,
      [attempt.exam_id]
    );
    const [options] = await pool.query(
      `SELECT o.id, o.question_id, o.label, o.content, o.order_index 
       FROM toeic_question_options o 
       JOIN toeic_questions q ON o.question_id = q.id 
       JOIN toeic_exam_sections s ON q.section_id = s.id 
       WHERE s.exam_id = ? ORDER BY o.order_index`,
      [attempt.exam_id]
    );
    
    return { ...attempt, responses, session: { sections, questions, options } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async updateResponse(attemptId: number, userId: string, questionId: number, data: Record<string, any>) {
    // Verify ownership and status
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id, status, exam_id FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1', [attemptId, userId]);
    if (!rows.length) throw new Error('Unauthorized or attempt not found');
    if (rows[0].status !== 'IN_PROGRESS') throw new Error('Conflict: Attempt is not IN_PROGRESS');

    const attempt = rows[0];

    // Verify question ownership
    const [qRows] = await pool.query<RowDataPacket[]>(
      `SELECT q.id FROM toeic_questions q 
       JOIN toeic_exam_sections s ON q.section_id = s.id 
       WHERE q.id = ? AND s.exam_id = ? LIMIT 1`,
      [questionId, attempt.exam_id]
    );
    if (!qRows.length) throw new Error('Conflict: Question does not belong to this exam');

    const { selectedOptionId = null, textResponse = null, markedForReview = false, note = null, clientRevision = 0 } = data;
    
    // Check stale revision
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT client_revision FROM toeic_attempt_responses WHERE attempt_id = ? AND question_id = ? LIMIT 1',
      [attemptId, questionId]
    );
    if (existing.length > 0 && clientRevision <= existing[0].client_revision) {
      throw new Error('Conflict: Stale client_revision');
    }

    await pool.query(
      `INSERT INTO toeic_attempt_responses (attempt_id, question_id, selected_option_id, text_response, marked_for_review, note, client_revision) 
       VALUES (?, ?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE 
       selected_option_id = VALUES(selected_option_id),
       text_response = VALUES(text_response),
       marked_for_review = VALUES(marked_for_review),
       note = VALUES(note),
       client_revision = VALUES(client_revision)`,
      [attemptId, questionId, selectedOptionId, textResponse, markedForReview, note, clientRevision]
    );
    
    return { success: true };
  }

  static async presignMedia(attemptId: number, userId: string, questionId: number, fileName: string) {
    // Verify ownership
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1', [attemptId, userId]);
    if (!rows.length) throw new Error('Unauthorized or attempt not found');
    
    // In a real app, generate S3 presigned URL here
    const s3Key = `attempts/${attemptId}/q${questionId}/${fileName}`;
    const presignedUrl = `https://mock-s3-bucket.s3.amazonaws.com/${s3Key}?signature=mock`;

    return { uploadUrl: presignedUrl, s3Key };
  }

  static async submitAttempt(attemptId: number, userId: string) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<RowDataPacket[]>('SELECT a.id, a.status, e.skill_type FROM toeic_attempts a JOIN toeic_exams e ON a.exam_id = e.id WHERE a.id = ? AND a.user_id = ? FOR UPDATE', [attemptId, userId]);
      if (!rows.length) throw new Error('Unauthorized or attempt not found');
      
      const status = rows[0].status;
      const skillType = rows[0].skill_type;
      
      if (status === 'SUBMITTED' || status === 'COMPLETED' || status === 'GRADING') {
        // Idempotency: already submitted
        await connection.rollback();
        return { success: true, alreadySubmitted: true };
      }
      
      if (status !== 'IN_PROGRESS') {
        throw new Error('Conflict: Attempt cannot be submitted');
      }

      await connection.query(
        'UPDATE toeic_attempts SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['SUBMITTED', attemptId]
      );
      
      if (skillType === 'LR') {
        await ScorerService.scoreLR(attemptId, userId, connection);
        await connection.query('UPDATE toeic_attempts SET status = ? WHERE id = ?', ['COMPLETED', attemptId]);
      } else {
        // Use INSERT IGNORE to prevent duplicate jobs if a concurrent submit happens
        await connection.query(
          'INSERT IGNORE INTO toeic_grading_jobs (attempt_id, status) VALUES (?, ?)',
          [attemptId, 'QUEUED']
        );
      }

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getGradingStatus(attemptId: number, userId: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT j.* FROM toeic_grading_jobs j JOIN toeic_attempts a ON j.attempt_id = a.id WHERE a.id = ? AND a.user_id = ? ORDER BY j.created_at DESC LIMIT 1',
      [attemptId, userId]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  static async getResult(attemptId: number, userId: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT r.* FROM toeic_attempt_results r JOIN toeic_attempts a ON r.attempt_id = a.id WHERE a.id = ? AND a.user_id = ? LIMIT 1',
      [attemptId, userId]
    );
    if (!rows.length) return null;
    return rows[0];
  }

  static async getReview(attemptId: number, userId: string) {
    const [attemptRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, status, exam_id FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1',
      [attemptId, userId]
    );
    if (!attemptRows.length) return null;
    
    const attempt = attemptRows[0];
    if (attempt.status !== 'COMPLETED') throw new Error('Review not available yet');
    
    const [reviewRows] = await pool.query(
      `SELECT q.id as question_id, rc.correct_option_id, rc.explanation, rc.sample_response, rc.rubric 
       FROM toeic_questions q 
       JOIN toeic_exam_sections s ON q.section_id = s.id 
       LEFT JOIN toeic_question_review_content rc ON q.id = rc.question_id 
       WHERE s.exam_id = ?`,
      [attempt.exam_id]
    );
    
    return reviewRows;
  }

  static async getAttemptHistory(userId: string) {
    const [rows] = await pool.query(
      'SELECT * FROM toeic_attempts WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }
}
