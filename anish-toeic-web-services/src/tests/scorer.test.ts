import { ScorerService } from '../services/scorer.service';
import { Connection } from 'mysql2/promise';

describe('ScorerService', () => {
  let mockConnection: jest.Mocked<Connection>;

  beforeEach(() => {
    mockConnection = {
      query: jest.fn(),
    } as unknown as jest.Mocked<Connection>;
  });

  it('should throw an error if the attempt is not found', async () => {
    (mockConnection.query as jest.Mock).mockResolvedValueOnce([[]]);
    await expect(ScorerService.scoreLR(1, 'user1', mockConnection)).rejects.toThrow('Attempt not found');
  });

  it('should throw an error if the exam is not LR', async () => {
    (mockConnection.query as jest.Mock).mockResolvedValueOnce([[{ id: 1, user_id: 'user1', exam_id: 1, skill_type: 'SW' }]]);
    await expect(ScorerService.scoreLR(1, 'user1', mockConnection)).rejects.toThrow('Exam is not LR');
  });

  it('should correctly score an LR exam', async () => {
    (mockConnection.query as jest.Mock)
      // 1. Fetch attempt and exam
      .mockResolvedValueOnce([[{ id: 1, user_id: 'user1', exam_id: 1, skill_type: 'LR' }]])
      // 2. Fetch questions and sections
      .mockResolvedValueOnce([
        [
          { question_id: 101, section_order: 1 }, // Part 1 (Listening)
          { question_id: 102, section_order: 3 }, // Part 3 (Listening)
          { question_id: 103, section_order: 5 }, // Part 5 (Reading)
          { question_id: 104, section_order: 7 }, // Part 7 (Reading)
        ]
      ])
      // 3. Fetch correct options
      .mockResolvedValueOnce([
        [
          { question_id: 101, correct_option_id: 201 },
          { question_id: 102, correct_option_id: 202 },
          { question_id: 103, correct_option_id: 203 },
          { question_id: 104, correct_option_id: 204 },
        ]
      ])
      // 4. Fetch attempt responses
      .mockResolvedValueOnce([
        [
          { question_id: 101, selected_option_id: 201 }, // Correct (Listening)
          { question_id: 102, selected_option_id: 999 }, // Incorrect (Listening)
          { question_id: 103, selected_option_id: 203 }, // Correct (Reading)
          { question_id: 104, selected_option_id: 204 }, // Correct (Reading)
        ]
      ]);

    const result = await ScorerService.scoreLR(1, 'user1', mockConnection);

    expect(result.listeningScore).toBe(1);
    expect(result.readingScore).toBe(2);
    expect(result.totalScore).toBe(3);

    // Verify question scores insertion
    expect(mockConnection.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO toeic_question_scores'),
      expect.arrayContaining([
        expect.arrayContaining([
          [1, 101, 1, true],
          [1, 102, 0, false],
          [1, 103, 1, true],
          [1, 104, 1, true],
        ])
      ])
    );

    // Verify attempt result insertion
    expect(mockConnection.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO toeic_attempt_results'),
      expect.arrayContaining([1, 1, 2, 3, 'FINAL'])
    );
  });
});
