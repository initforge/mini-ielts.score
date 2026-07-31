import { Connection, RowDataPacket } from 'mysql2/promise';

export interface LRScoreResult {
  listeningScore: number;
  readingScore: number;
  totalScore: number;
}

const LISTENING_SECTION_CUTOFF = 4; // Parts 1-4 are Listening, Parts 5-7 are Reading

export class ScorerService {
  /**
   * Deterministically scores an LR attempt by comparing each response against
   * the stored correct_option_id.  Every correct answer increments totalScore.
   * Answers are classified as Listening or Reading by the section order_index:
   *   section_order <= LISTENING_SECTION_CUTOFF → Listening
   *   section_order >  LISTENING_SECTION_CUTOFF → Reading
   *
   * If a question's section_order cannot be resolved the answer still
   * increments totalScore but is not assigned to either sub-score.
   */
  static async scoreLR(attemptId: number, userId: string, connection: Connection): Promise<LRScoreResult> {
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

    const correctOptionMap = new Map<number, number | null>();
    for (const rc of correctOptions) {
      correctOptionMap.set(rc.question_id, rc.correct_option_id);
    }

    const questionSectionMap = new Map<number, number>();
    for (const q of questions) {
      questionSectionMap.set(q.question_id, q.section_order);
    }

    let listeningCorrect = 0;
    let readingCorrect = 0;
    let totalCorrect = 0;

    const questionScores: Array<[number, number, number, boolean]> = [];

    for (const response of responses) {
      const qId: number = response.question_id;
      const selectedId: number | null | undefined = response.selected_option_id;
      const correctId = correctOptionMap.get(qId);
      const sectionOrder = questionSectionMap.get(qId);

      const isCorrect = selectedId !== null && selectedId !== undefined && selectedId === correctId;
      const score = isCorrect ? 1 : 0;

      questionScores.push([attemptId, qId, score, isCorrect]);

      if (!isCorrect) continue;

      totalCorrect += 1;

      if (sectionOrder === undefined) {
        // Question exists in the exam but section_order cannot be resolved.
        // Count it toward the total but do not misclassify.
        continue;
      }

      if (sectionOrder <= LISTENING_SECTION_CUTOFF) {
        listeningCorrect += 1;
      } else {
        readingCorrect += 1;
      }
    }

    // Guard: totalCorrect must equal listeningCorrect + readingCorrect when
    // every correct question has a mapped section.  The invariant is enforced
    // in tests but is not a runtime assertion to avoid rolling back a valid
    // exam submission over a classification mismatch.
    const totalScore = totalCorrect;

    if (questionScores.length > 0) {
      await connection.query(
        `INSERT INTO toeic_question_scores (attempt_id, question_id, score, is_correct) VALUES ?
         ON DUPLICATE KEY UPDATE score = VALUES(score), is_correct = VALUES(is_correct)`,
        [questionScores]
      );
    }

    await connection.query(
      `INSERT INTO toeic_attempt_results (attempt_id, listening_score, reading_score, total_score, status) 
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
       listening_score = VALUES(listening_score), 
       reading_score = VALUES(reading_score), 
       total_score = VALUES(total_score), 
       status = VALUES(status)`,
      [attemptId, listeningCorrect, readingCorrect, totalScore, 'FINAL']
    );

    return { listeningScore: listeningCorrect, readingScore: readingCorrect, totalScore };
  }
}
