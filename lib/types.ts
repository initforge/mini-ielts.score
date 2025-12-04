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
export interface CriteriaScore {
  name: string;
  score: number; // 0-200
  maxScore: number;
  explanation: string;
}

export interface SpeakingGradingResponse {
  overallScore: number; // 0-200
  criteria: {
    pronunciation: CriteriaScore;
    intonation: CriteriaScore;
    grammar: CriteriaScore;
    vocabulary: CriteriaScore;
    content: CriteriaScore;
    fluency: CriteriaScore;
  };
  strengths: string[];
  weaknesses: string[];
  improvementTips: string[];
  perQuestionFeedback: Array<{
    questionId: string;
    transcript: string;
    feedback: string;
    score: number;
  }>;
}

export interface WritingGradingResponse {
  overallScore: number; // 0-200
  part1?: {
    scores: Array<{
      questionId: string;
      score: number;
      feedback: string;
    }>;
    overallScore: number;
  };
  part2?: {
    scores: Array<{
      questionId: string;
      score: number;
      feedback: string;
    }>;
    overallScore: number;
  };
  part3?: {
    score: number;
    feedback: string;
  };
  criteria: {
    grammar: CriteriaScore;
    vocabularyRange: CriteriaScore;
    organization: CriteriaScore;
    taskFulfillment: CriteriaScore;
  };
  strengths: string[];
  weaknesses: string[];
  improvementTips: string[];
  perPartFeedback: Array<{
    part: WritingPart;
    feedback: string;
    score: number;
  }>;
  highlightedAnswers: Array<{
    questionId: string;
    text: string;
    errors: Array<{
      start: number;
      end: number;
      type: string;
      explanation: string;
    }>;
  }>;
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
  images?: Record<number, string>; // part -> imageData (base64)
  isTimerRunning?: boolean;
  timerStartedAt?: Date;
  isLocked?: boolean; // Lock answers when time is up
}

// UI State Types
export type QuestionStatus = "not-started" | "in-progress" | "completed";

export interface QuestionStatusMap {
  [questionId: string]: QuestionStatus;
}
