import { ScorerService } from '../services/scorer.service';
import { Connection } from 'mysql2/promise';

describe('ScorerService', () => {
  let mockConnection: jest.Mocked<Connection>;

  beforeEach(() => {
    mockConnection = {
      query: jest.fn(),
    } as unknown as jest.Mocked<Connection>;
  });

  // ---------------------------------------------------------------------------
  // Valid-request helpers
  // ---------------------------------------------------------------------------

  function stubAttempt(skillType: 'LR' | 'SW', extra?: Record<string, unknown>) {
    (mockConnection.query as jest.Mock).mockResolvedValueOnce([
      [{ id: 1, user_id: 'user1', exam_id: 1, skill_type: skillType, ...extra }],
    ]);
  }

  function stubQuestions(data: Array<{ question_id: number; section_order: number }>) {
    (mockConnection.query as jest.Mock).mockResolvedValueOnce([data]);
  }

  function stubCorrectOptions(data: Array<{ question_id: number; correct_option_id: number | null }>) {
    (mockConnection.query as jest.Mock).mockResolvedValueOnce([data]);
  }

  function stubResponses(data: Array<{ question_id: number; selected_option_id?: number | null }>) {
    (mockConnection.query as jest.Mock).mockResolvedValueOnce([data]);
  }

  // ---------------------------------------------------------------------------
  // Error guards
  // ---------------------------------------------------------------------------

  it('should throw an error if the attempt is not found', async () => {
    (mockConnection.query as jest.Mock).mockResolvedValueOnce([[]]);
    await expect(ScorerService.scoreLR(1, 'user1', mockConnection)).rejects.toThrow('Attempt not found');
  });

  it('should throw an error if the exam is not LR', async () => {
    (mockConnection.query as jest.Mock).mockResolvedValueOnce([[{ id: 1, user_id: 'user1', exam_id: 1, skill_type: 'SW' }]]);
    await expect(ScorerService.scoreLR(1, 'user1', mockConnection)).rejects.toThrow('Exam is not LR');
  });

  // ---------------------------------------------------------------------------
  // Deterministic correctness
  // ---------------------------------------------------------------------------

  it('should score zero when no responses exist', async () => {
    stubAttempt('LR');
    stubQuestions([
      { question_id: 101, section_order: 1 },
      { question_id: 102, section_order: 5 },
    ]);
    stubCorrectOptions([
      { question_id: 101, correct_option_id: 201 },
      { question_id: 102, correct_option_id: 202 },
    ]);
    stubResponses([]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    expect(result).toEqual({ listeningScore: 0, readingScore: 0, totalScore: 0 });

    // No INSERT into question_scores (empty batch)
    const scoreInsert = (mockConnection.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO toeic_question_scores')
    );
    expect(scoreInsert).toBeUndefined();

    // Result still written
    const resultInsert = (mockConnection.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO toeic_attempt_results')
    );
    expect(resultInsert).toBeDefined();
    expect(resultInsert[1]).toEqual([1, 0, 0, 0, 'FINAL']);
  });

  it('should score all incorrect when every selected_option_id mismatches', async () => {
    stubAttempt('LR');
    stubQuestions([
      { question_id: 1, section_order: 1 },
      { question_id: 2, section_order: 3 },
      { question_id: 3, section_order: 5 },
      { question_id: 4, section_order: 7 },
    ]);
    stubCorrectOptions([
      { question_id: 1, correct_option_id: 10 },
      { question_id: 2, correct_option_id: 20 },
      { question_id: 3, correct_option_id: 30 },
      { question_id: 4, correct_option_id: 40 },
    ]);
    stubResponses([
      { question_id: 1, selected_option_id: 99 },
      { question_id: 2, selected_option_id: 98 },
      { question_id: 3, selected_option_id: 97 },
      { question_id: 4, selected_option_id: 96 },
    ]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    expect(result).toEqual({ listeningScore: 0, readingScore: 0, totalScore: 0 });
  });

  it('should score all correct when every selected_option_id matches', async () => {
    stubAttempt('LR');
    stubQuestions([
      { question_id: 1, section_order: 1 }, // Listening
      { question_id: 2, section_order: 4 }, // Listening boundary
      { question_id: 3, section_order: 5 }, // Reading boundary
      { question_id: 4, section_order: 7 }, // Reading
    ]);
    stubCorrectOptions([
      { question_id: 1, correct_option_id: 10 },
      { question_id: 2, correct_option_id: 20 },
      { question_id: 3, correct_option_id: 30 },
      { question_id: 4, correct_option_id: 40 },
    ]);
    stubResponses([
      { question_id: 1, selected_option_id: 10 },
      { question_id: 2, selected_option_id: 20 },
      { question_id: 3, selected_option_id: 30 },
      { question_id: 4, selected_option_id: 40 },
    ]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    expect(result.listeningScore).toBe(2);
    expect(result.readingScore).toBe(2);
    expect(result.totalScore).toBe(4);
  });

  it('should correctly classify by section order boundary (4 → Listening, 5 → Reading)', async () => {
    stubAttempt('LR');
    stubQuestions([
      { question_id: 1, section_order: 4 }, // Listening Part 4
      { question_id: 2, section_order: 5 }, // Reading Part 5
    ]);
    stubCorrectOptions([
      { question_id: 1, correct_option_id: 100 },
      { question_id: 2, correct_option_id: 200 },
    ]);
    stubResponses([
      { question_id: 1, selected_option_id: 100 },
      { question_id: 2, selected_option_id: 200 },
    ]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    expect(result.listeningScore).toBe(1);
    expect(result.readingScore).toBe(1);
    expect(result.totalScore).toBe(2);
  });

  it('should count totalScore correctly even when section_order is missing for a correct answer', async () => {
    stubAttempt('LR');
    stubQuestions([
      { question_id: 5, section_order: 1 },
      // question_id 6 is intentionally absent from section map
    ]);
    stubCorrectOptions([
      { question_id: 5, correct_option_id: 50 },
      { question_id: 6, correct_option_id: 60 },
    ]);
    stubResponses([
      { question_id: 5, selected_option_id: 50 },
      { question_id: 6, selected_option_id: 60 },
    ]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    // q5 → Listening; q6 → correct but unclassified
    expect(result.listeningScore).toBe(1);
    expect(result.readingScore).toBe(0);
    expect(result.totalScore).toBe(2);
  });

  it('should treat null selected_option_id as incorrect', async () => {
    stubAttempt('LR');
    stubQuestions([{ question_id: 1, section_order: 1 }]);
    stubCorrectOptions([{ question_id: 1, correct_option_id: 10 }]);
    stubResponses([{ question_id: 1, selected_option_id: null }]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    expect(result).toEqual({ listeningScore: 0, readingScore: 0, totalScore: 0 });
  });

  it('should treat undefined selected_option_id as incorrect', async () => {
    stubAttempt('LR');
    stubQuestions([{ question_id: 1, section_order: 5 }]);
    stubCorrectOptions([{ question_id: 1, correct_option_id: 10 }]);
    stubResponses([{ question_id: 1 }]); // no selected_option_id field

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    expect(result).toEqual({ listeningScore: 0, readingScore: 0, totalScore: 0 });
  });

  it('should treat a null correct_option_id as always incorrect', async () => {
    stubAttempt('LR');
    stubQuestions([{ question_id: 1, section_order: 1 }]);
    stubCorrectOptions([{ question_id: 1, correct_option_id: null }]);
    stubResponses([{ question_id: 1, selected_option_id: 10 }]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    // selected_option_id !== null but correct_option_id is null → never matches
    expect(result).toEqual({ listeningScore: 0, readingScore: 0, totalScore: 0 });
  });

  it('should treat null selected and null correct as incorrect (null ≠ null in our strict check)', async () => {
    // Implementation uses `===` — null !== null would be true normally, but the
    // isCorrect check guards against null selected separately.
    stubAttempt('LR');
    stubQuestions([{ question_id: 1, section_order: 3 }]);
    stubCorrectOptions([{ question_id: 1, correct_option_id: null }]);
    stubResponses([{ question_id: 1, selected_option_id: null }]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    // selected_id is null → first guard fails → isCorrect = false
    expect(result).toEqual({ listeningScore: 0, readingScore: 0, totalScore: 0 });
  });

  // ---------------------------------------------------------------------------
  // Mixed accuracy
  // ---------------------------------------------------------------------------

  it('should correctly score a mixed Listening and Reading exam', async () => {
    stubAttempt('LR');
    stubQuestions([
      { question_id: 1, section_order: 1 },  // Part 1
      { question_id: 2, section_order: 2 },  // Part 2
      { question_id: 3, section_order: 3 },  // Part 3
      { question_id: 4, section_order: 4 },  // Part 4
      { question_id: 5, section_order: 5 },  // Part 5
      { question_id: 6, section_order: 6 },  // Part 6
      { question_id: 7, section_order: 7 },  // Part 7
    ]);
    stubCorrectOptions([
      { question_id: 1, correct_option_id: 10 },
      { question_id: 2, correct_option_id: 20 },
      { question_id: 3, correct_option_id: 30 },
      { question_id: 4, correct_option_id: 40 },
      { question_id: 5, correct_option_id: 50 },
      { question_id: 6, correct_option_id: 60 },
      { question_id: 7, correct_option_id: 70 },
    ]);
    stubResponses([
      { question_id: 1, selected_option_id: 10 },  // L ✓
      { question_id: 2, selected_option_id: 99 },  // L ✗
      { question_id: 3, selected_option_id: 30 },  // L ✓
      { question_id: 4, selected_option_id: 40 },  // L ✓
      { question_id: 5, selected_option_id: 99 },  // R ✗
      { question_id: 6, selected_option_id: 60 },  // R ✓
      { question_id: 7, selected_option_id: 99 },  // R ✗
    ]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    expect(result.listeningScore).toBe(3); // q1, q3, q4
    expect(result.readingScore).toBe(1);   // q6
    expect(result.totalScore).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // Idempotency via ON DUPLICATE KEY
  // ---------------------------------------------------------------------------

  it('should INSERT ... ON DUPLICATE KEY UPDATE so re-scoring is idempotent', async () => {
    stubAttempt('LR');
    stubQuestions([{ question_id: 1, section_order: 1 }]);
    stubCorrectOptions([{ question_id: 1, correct_option_id: 10 }]);
    stubResponses([{ question_id: 1, selected_option_id: 10 }]);

    // First score
    const r1 = await ScorerService.scoreLR(1, 'user1', mockConnection);
    expect(r1.totalScore).toBe(1);

    // Reset mock and score again
    (mockConnection.query as jest.Mock).mockReset();
    stubAttempt('LR');
    stubQuestions([{ question_id: 1, section_order: 1 }]);
    stubCorrectOptions([{ question_id: 1, correct_option_id: 10 }]);
    stubResponses([{ question_id: 1, selected_option_id: 10 }]);

    const r2 = await ScorerService.scoreLR(1, 'user1', mockConnection);
    expect(r2.totalScore).toBe(1);

    // Verify both INSERTs use ON DUPLICATE KEY UPDATE
    const scoreCalls = (mockConnection.query as jest.Mock).mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('ON DUPLICATE KEY UPDATE')
    );
    expect(scoreCalls.length).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // Database write assertions
  // ---------------------------------------------------------------------------

  it('should write per-question scores with correct is_correct flags', async () => {
    stubAttempt('LR');
    stubQuestions([
      { question_id: 1, section_order: 1 },
      { question_id: 2, section_order: 5 },
    ]);
    stubCorrectOptions([
      { question_id: 1, correct_option_id: 10 },
      { question_id: 2, correct_option_id: 20 },
    ]);
    stubResponses([
      { question_id: 1, selected_option_id: 10 },  // correct
      { question_id: 2, selected_option_id: 99 },  // incorrect
    ]);

    await ScorerService.scoreLR(1, 'user1', mockConnection);

    const scoreCall = (mockConnection.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO toeic_question_scores')
    );
    expect(scoreCall).toBeDefined();
    // scoreCall[1] is the params array: [questionScores]
    // questionScores is an array of [attemptId, questionId, score, isCorrect] tuples
    const rows: Array<[number, number, number, boolean]> = scoreCall[1][0];
    expect(rows).toEqual(
      expect.arrayContaining([
        [1, 1, 1, true],
        [1, 2, 0, false],
      ])
    );
  });

  it('should write attempt result with FINAL status', async () => {
    stubAttempt('LR');
    stubQuestions([{ question_id: 1, section_order: 1 }]);
    stubCorrectOptions([{ question_id: 1, correct_option_id: 10 }]);
    stubResponses([{ question_id: 1, selected_option_id: 10 }]);

    await ScorerService.scoreLR(1, 'user1', mockConnection);

    const resultCall = (mockConnection.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO toeic_attempt_results')
    );
    expect(resultCall).toBeDefined();
    expect(resultCall[1]).toEqual([1, 1, 0, 1, 'FINAL']);
  });

  // ---------------------------------------------------------------------------
  // Large-exam stress
  // ---------------------------------------------------------------------------

  it('should handle 200 questions without error', async () => {
    const questionCount = 200;
    const questions = Array.from({ length: questionCount }, (_, i) => ({
      question_id: i + 1,
      section_order: i < 100 ? (i % 4) + 1 : ((i % 3) + 5), // 100 Listening, 100 Reading
    }));
    const correctOptions = questions.map((q) => ({
      question_id: q.question_id,
      correct_option_id: q.question_id * 10 + 1,
    }));
    const responses = questions.map((q, i) => ({
      question_id: q.question_id,
      selected_option_id: i % 2 === 0 ? q.question_id * 10 + 1 : null, // every other correct
    }));

    stubAttempt('LR');
    stubQuestions(questions);
    stubCorrectOptions(correctOptions);
    stubResponses(responses);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    // Half correct (100): 50 Listening + 50 Reading
    expect(result.totalScore).toBe(100);
    expect(result.listeningScore + result.readingScore).toBe(100);

    // Verify write batch size
    const scoreCall = (mockConnection.query as jest.Mock).mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO toeic_question_scores')
    );
    expect(scoreCall).toBeDefined();
    // scoreCall[1][0] is the questionScores array
    expect((scoreCall[1][0] as unknown[]).length).toBe(questionCount);
  });
});
