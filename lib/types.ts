// Common types
export type QuestionStatus = 'not-started' | 'in-progress' | 'completed';

// Speaking Test Types
export interface SpeakingAnswer {
  questionId: string;
  questionType: number;
  questionText: string;
  audioBlob: Blob;
  audioBase64: string;
  recordedAt: Date;
}

export interface SpeakingExamState {
  currentQuestionIndex: number;
  answers: SpeakingAnswer[];
  isRecording: boolean;
  isFinished: boolean;
  startTime?: Date;
  results?: SpeakingGradingResponse;
}

export interface SpeakingGradingResponse {
  overallScore: number;
  scores: {
    pronunciation: number;
    intonationAndStress: number;
    grammar: number;
    vocabulary: number;
    cohesion: number;
  };
  feedback: {
    pronunciation: string;
    intonationAndStress: string;
    grammar: string;
    vocabulary: string;
    cohesion: string;
  };
  questionScores: Array<{
    questionId: string;
    score: number;
    feedback: string;
  }>;
}

// Writing Test Types
export interface WritingAnswer {
  questionId: string;
  questionType: number;
  questionText: string;
  text: string;
  wordCount: number;
  savedAt?: Date;
}

export interface WritingExamState {
  currentQuestionIndex: number;
  answers: WritingAnswer[];
  isFinished: boolean;
  timeRemaining: number;
  startTime?: Date;
  results?: WritingGradingResponse;
}

export interface WritingGradingResponse {
  overallScore: number;
  scores: {
    grammar: number;
    vocabulary: number;
    organization: number;
  };
  feedback: {
    grammar: string;
    vocabulary: string;
    organization: string;
  };
  questionScores: Array<{
    questionId: string;
    score: number;
    feedback: string;
  }>;
}

// Question Types
export interface SpeakingQuestion {
  id: string;
  part: number;
  questionNumber: number;
  questionText: string;
  instructions: string;
  preparationTime?: number;
  responseTime: number;
  imageUrl?: string;
}

export interface WritingQuestion {
  id: string;
  part: number;
  questionNumber: number;
  questionText: string;
  instructions: string;
  minWords: number;
  imageUrl?: string;
}

// API Response Types
export interface TranscriptionResponse {
  text: string;
  confidence: number;
}

export interface GradingRequest {
  examType: 'speaking' | 'writing';
  answers: SpeakingAnswer[] | WritingAnswer[];
}

// Component Props Types
export interface ProgressBarProps {
  value: number;
  showLabel?: boolean;
  accent?: 'blue' | 'indigo';
  className?: string;
}

export interface TimerProps {
  initialSeconds: number;
  onComplete?: () => void;
  showWarning?: boolean;
  warningThreshold?: number;
  className?: string;
}