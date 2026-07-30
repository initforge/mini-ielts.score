import { Connection, RowDataPacket } from 'mysql2/promise';

export class ScorerService {
  static async scoreLR(attemptId: number, userId: string, connection: Connection) {
    // 1. Fetch attempt and verify it's LR
    const [attemptRows] = await connection.query<RowDataPacket[]>(
      'SELECT a.*, e.skill_type FROM toeic_attempts a JOIN toeic_exams e ON a.exam_id = e.id WHERE a.id = ? AND a.user_id = ?',
      [attemptId, userId]
    );
    if (!attemptRows.length) throw new Error('Attempt not found');
    const attempt = attemptRows[0];
    if (attempt.skill_type !== 'LR') throw new Error('Exam is not LR');

    // 2. Fetch all questions and sections for this exam
    const [questions] = await connection.query<RowDataPacket[]>(
      `SELECT q.id as question_id, s.order_index as section_order 
       FROM toeic_questions q 
       JOIN toeic_exam_sections s ON q.section_id = s.id 
       WHERE s.exam_id = ?`,
      [attempt.exam_id]
    );

    // 3. Fetch correct options
    const [correctOptions] = await connection.query<RowDataPacket[]>(
      `SELECT rc.question_id, rc.correct_option_id 
       FROM toeic_question_review_content rc 
       JOIN toeic_questions q ON rc.question_id = q.id 
       JOIN toeic_exam_sections s ON q.section_id = s.id 
       WHERE s.exam_id = ?`,
      [attempt.exam_id]
    );

    // 4. Fetch attempt responses
    const [responses] = await connection.query<RowDataPacket[]>(
      `SELECT question_id, selected_option_id 
       FROM toeic_attempt_responses 
       WHERE attempt_id = ?`,
      [attemptId]
    );

    let listeningScore = 0;
    let readingScore = 0;

    const correctOptionMap = new Map<number, number | null>();
    for (const rc of correctOptions) {
      correctOptionMap.set(rc.question_id, rc.correct_option_id);
    }

    const questionSectionMap = new Map<number, number>();
    for (const q of questions) {
      questionSectionMap.set(q.question_id, q.section_order);
    }

    const questionScores = [];

    for (const response of responses) {
      const qId = response.question_id;
      const selectedId = response.selected_option_id;
      const correctId = correctOptionMap.get(qId);
      const sectionOrder = questionSectionMap.get(qId);

      const isCorrect = selectedId !== null && selectedId !== undefined && selectedId === correctId;
      const score = isCorrect ? 1 : 0;

      questionScores.push([attemptId, qId, score, isCorrect]);

      if (isCorrect && sectionOrder !== undefined) {
        // Listening parts are usually Part 1-4, Reading parts are 5-7
        if (sectionOrder <= 4) {
          listeningScore += 1;
        } else {
          readingScore += 1;
        }
      }
    }

    if (questionScores.length > 0) {
      await connection.query(
        `INSERT INTO toeic_question_scores (attempt_id, question_id, score, is_correct) VALUES ?
         ON DUPLICATE KEY UPDATE score = VALUES(score), is_correct = VALUES(is_correct)`,
        [questionScores]
      );
    }

    const totalScore = listeningScore + readingScore;

    await connection.query(
      `INSERT INTO toeic_attempt_results (attempt_id, listening_score, reading_score, total_score, status) 
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
       listening_score = VALUES(listening_score), 
       reading_score = VALUES(reading_score), 
       total_score = VALUES(total_score), 
       status = VALUES(status)`,
      [attemptId, listeningScore, readingScore, totalScore, 'FINAL']
    );

    return { listeningScore, readingScore, totalScore };
  }
}
