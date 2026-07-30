import { pool } from './db.service';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export class ToeicService {
  static async getExams(filters: any = {}) {
    const [rows] = await pool.query('SELECT * FROM toeic_exams');
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

  static async updateResponse(attemptId: number, userId: string, questionId: number, data: any) {
    // Verify ownership and status
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id, status FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1', [attemptId, userId]);
    if (!rows.length) throw new Error('Unauthorized or attempt not found');
    if (rows[0].status !== 'IN_PROGRESS') throw new Error('Conflict: Attempt is not IN_PROGRESS');

    const { selectedOptionId = null, textResponse = null, markedForReview = false, note = null, clientRevision = 0 } = data;
    
    await pool.query(
      `INSERT INTO toeic_attempt_responses (attempt_id, question_id, selected_option_id, text_response, marked_for_review, note, client_revision) 
       VALUES (?, ?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE 
       selected_option_id = IF(VALUES(client_revision) >= client_revision, VALUES(selected_option_id), selected_option_id),
       text_response = IF(VALUES(client_revision) >= client_revision, VALUES(text_response), text_response),
       marked_for_review = IF(VALUES(client_revision) >= client_revision, VALUES(marked_for_review), marked_for_review),
       note = IF(VALUES(client_revision) >= client_revision, VALUES(note), note),
       client_revision = IF(VALUES(client_revision) >= client_revision, VALUES(client_revision), client_revision)`,
      [attemptId, questionId, selectedOptionId, textResponse, markedForReview, note, clientRevision]
    );
    
    return { success: true };
  }

  static async presignMedia(attemptId: number, userId: string, questionId: number, fileName: string, fileType: string) {
    // Verify ownership
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1', [attemptId, userId]);
    if (!rows.length) throw new Error('Unauthorized or attempt not found');
    
    // In a real app, generate S3 presigned URL here
    const s3Key = `attempts/${attemptId}/q${questionId}/${fileName}`;
    const presignedUrl = `https://mock-s3-bucket.s3.amazonaws.com/${s3Key}?signature=mock`;

    return { uploadUrl: presignedUrl, s3Key };
  }

  static async submitAttempt(attemptId: number, userId: string) {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id, status FROM toeic_attempts WHERE id = ? AND user_id = ? LIMIT 1', [attemptId, userId]);
    if (!rows.length) throw new Error('Unauthorized or attempt not found');
    
    const status = rows[0].status;
    if (status === 'SUBMITTED' || status === 'COMPLETED' || status === 'GRADING') {
      // Idempotency: already submitted
      return { success: true, alreadySubmitted: true };
    }
    
    if (status !== 'IN_PROGRESS') {
      throw new Error('Conflict: Attempt cannot be submitted');
    }

    await pool.query(
      'UPDATE toeic_attempts SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['SUBMITTED', attemptId]
    );
    
    // Use INSERT IGNORE to prevent duplicate jobs if a concurrent submit happens
    await pool.query(
      'INSERT IGNORE INTO toeic_grading_jobs (attempt_id, status) VALUES (?, ?)',
      [attemptId, 'QUEUED']
    );

    return { success: true };
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
