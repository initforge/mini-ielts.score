/**
 * S&W Runner types — shared across Speaking and Writing views.
 */
export type SWPhase =
  | 'mic_check'
  | 'directions'
  | 'speaking_prep'
  | 'speaking_recording'
  | 'speaking_playback'
  | 'writing'
  | 'complete';

export type MicState =
  | 'idle'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'disconnected'
  | 'empty';

export interface MicStatus {
  state: MicState;
  codec: string | null;
  error: string | null;
}

export interface SWQuestion {
  id: number;
  /** 'speaking' or 'writing' */
  skill: 'speaking' | 'writing';
  part: number;
  questionNumber: number;
  /** Read-aloud text, essay prompt, etc. */
  content: string;
  /** URL to an optional image for the question */
  imageUrl: string | null;
  prepTimeSeconds: number;
  recordTimeSeconds: number;
  minWords?: number;
}

export interface SWAttempt {
  id: number;
  examId: number;
  status: string;
  startedAt: string;
  questions: SWQuestion[];
}

export interface SpeakingResponse {
  questionId: number;
  /** Object URL (blob:) for local playback */
  blobUrl: string | null;
  /** Raw blob for upload */
  blob: Blob | null;
  /** Duration of recording in seconds */
  duration: number;
  /** Whether the upload completed */
  uploaded: boolean;
  /** Upload error if any */
  uploadError: string | null;
  /** Presigned S3 key once uploaded */
  s3Key: string | null;
}

export interface WritingResponse {
  questionId: number;
  text: string;
  wordCount: number;
  /** Server-saved revision for conflict detection */
  clientRevision: number;
  dirty: boolean;
}
