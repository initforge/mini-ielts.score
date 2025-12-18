// Question Types
export type SpeakingPart = 1 | 2 | 3 | 4 | 5;
export type WritingPart = 1 | 2 | 3;

export interface SpeakingQuestion {
  id: string;
  part: SpeakingPart;
  questionNumber: number;
  questionText: string;
  imageUrl?: string;
  preparationTime?: number; // in seconds
  responseTime: number; // in seconds
  instructions?: string;
}

export interface WritingQuestion {
  id: string;
  part: WritingPart;
  questionNumber: number;
  questionText: string;
  imageUrl?: string;
  minWords: number;
  instructions?: string;
  timeLimit?: number; // in seconds, for individual question timer
}

// Answer Types
export interface SpeakingAnswer {
  questionId: string;
  questionType: SpeakingPart;
  questionText: string;
  audioBlob?: Blob;
  audioBase64?: string;
  transcript?: string;
  recordedAt?: Date;
}

export interface WritingAnswer {
  questionId: string;
  questionType: WritingPart;
  questionText: string; // User input question text
  text: string;
  wordCount: number;
  savedAt?: Date;
}

export interface WritingQuestionInput {
  questionId: string;
  questionText: string; // User input
  imageUrl?: string; // For Q1-5, Q6-7
}

// Grading Response Types
export interface CriteriaFeedback {
  name: string;
  explanation: string; // Không có score, chỉ feedback
}

// Speaking: Part-based scoring
export interface SpeakingPartScore {
  part: SpeakingPart;
  questionScores: Array<{
    questionId: string;
    questionNumber: number;
  score: number; // 0-200
    transcript?: string;
    feedback?: string;
    errors?: Array<{
      start: number;
      end: number;
      type: string;
  explanation: string;
    }>;
  }>;
  partScore: number; // Tổng điểm của part (0-200)
}

export interface SpeakingGradingResponse {
  overallScore: number; // 0-200 (tổng hợp từ các part)
  partScores: SpeakingPartScore[]; // Scores theo từng part
  criteria: {
    pronunciation: CriteriaFeedback; // Chỉ feedback, không có score
    intonation: CriteriaFeedback;
    grammar: CriteriaFeedback;
    vocabulary: CriteriaFeedback;
    coherence: CriteriaFeedback; // Thay "content" và "fluency" bằng "coherence" và "completeness"
    completeness: CriteriaFeedback;
  };
  strengths: string[]; // Tổng hợp từ các tiêu chí
  weaknesses: string[]; // Tổng hợp từ các tiêu chí
  improvementTips?: string[]; // Optional, chỉ có khi request riêng
}

// Writing: Part-based scoring với highlights tích hợp
export interface WritingPartScore {
  part: WritingPart;
  questionScores: Array<{
    questionId: string;
    questionNumber: number;
    score: number; // 0-200
    feedback: string;
    text: string; // Original answer text
    errors: Array<{
      start: number;
      end: number;
      type: string;
      explanation: string;
    }>;
  }>;
  partScore: number; // Tổng điểm của part (0-200)
}

export interface WritingGradingResponse {
  overallScore: number; // 0-200 (tổng hợp từ các part)
  partScores: WritingPartScore[]; // Scores theo từng part với highlights
  criteria: {
    // Part 1 criteria
    part1Grammar?: CriteriaFeedback;
    part1SentenceStructure?: CriteriaFeedback;
    part1Accuracy?: CriteriaFeedback;
    // Part 2 criteria
    part2TaskFulfillment?: CriteriaFeedback;
    part2Grammar?: CriteriaFeedback;
    part2Vocabulary?: CriteriaFeedback;
    part2Clarity?: CriteriaFeedback;
    // Part 3 criteria
    part3Organization?: CriteriaFeedback;
    part3Development?: CriteriaFeedback;
    part3Grammar?: CriteriaFeedback;
    part3Vocabulary?: CriteriaFeedback;
    part3Logic?: CriteriaFeedback;
  };
  strengths: string[]; // Tổng hợp từ các tiêu chí
  weaknesses: string[]; // Tổng hợp từ các tiêu chí
  improvementTips?: string[]; // Optional, chỉ có khi request riêng
}

// Exam State Types
export interface SpeakingExamState {
  currentQuestionIndex: number | null; // null means no question selected
  answers: SpeakingAnswer[];
  isRecording: boolean;
  isFinished: boolean;
  startTime?: Date;
  results?: SpeakingGradingResponse;
  // New fields for user input
  questions?: Record<string, string>; // questionId -> questionText
  images?: Record<string, string>; // questionId -> imageData (base64)
  isLocked?: boolean; // Lock recording when time expires
  preparationTimerStarted?: boolean;
  responseTimerStarted?: boolean;
  // Audio playback storage
  audioUrls?: Record<string, string>; // questionId -> audio URL (for playback)
}

export interface SpeakingQuestionInput {
  questionId: string;
  questionText: string; // User input
  imageUrl?: string; // For Q3, Q4, Q8-10
}

export interface WritingExamState {
  currentQuestionIndex: number | null; // null means no question selected
  answers: WritingAnswer[];
  isFinished: boolean;
  startTime?: Date;
  timeRemaining: number; // in seconds (60 minutes = 3600 seconds)
  results?: WritingGradingResponse;
  // New fields for user input
  questions?: Record<string, string>; // questionId -> questionText
  images?: Record<string | number, string>; // questionId/part -> imageData (base64)
  isTimerRunning?: boolean;
  timerStartedAt?: Date;
  isLocked?: boolean; // Lock answers when time is up
}

// UI State Types
export type QuestionStatus = "not-started" | "in-progress" | "completed";

export interface QuestionStatusMap {
  [questionId: string]: QuestionStatus;
}
