// Question Types
export type SpeakingPart = 1 | 2 | 3 | 4 | 5 | 6;
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
  timeLimit?: number; // in seconds, for individual question timing
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
  questionText: string;
  text: string;
  wordCount: number;
  savedAt?: Date;
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
  currentQuestionIndex: number;
  answers: SpeakingAnswer[];
  isRecording: boolean;
  isFinished: boolean;
  startTime?: Date;
  results?: SpeakingGradingResponse;
}

export interface WritingExamState {
  currentQuestionIndex: number;
  answers: WritingAnswer[];
  isFinished: boolean;
  startTime?: Date;
  timeRemaining: number; // in seconds
  part1TimeRemaining?: number; // Part 1: 5 minutes total for questions 1-5
  part2Question6TimeRemaining?: number; // Part 2 Question 6: 10 minutes
  part2Question7TimeRemaining?: number; // Part 2 Question 7: 10 minutes
  part3Question8TimeRemaining?: number; // Part 3 Question 8: 30 minutes
  currentPartStarted?: WritingPart; // Track which part has been started
  partDirectionsPlayed?: Record<WritingPart, boolean>; // Track if direction audio has been played
  results?: WritingGradingResponse;
}

// UI State Types
export type QuestionStatus = "not-started" | "in-progress" | "completed";

export interface QuestionStatusMap {
  [questionId: string]: QuestionStatus;
}
