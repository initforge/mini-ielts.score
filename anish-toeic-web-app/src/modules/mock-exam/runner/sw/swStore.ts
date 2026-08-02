/**
 * S&W Runner store — Zustand store for SWAttempt lifecycle, microphone,
 * recording state, writing responses, uploads, autosave and submission.
 */
import { create } from 'zustand';
import api from '../../../../api';
import {
  SWPhase,
  SWQuestion,
  MicStatus,
  SpeakingResponse,
} from './types';

// ── helpers ──────────────────────────────────────────────────────────────

const EMPTY_MIC: MicStatus = { state: 'idle', codec: null, error: null };

function isConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    (err.response as { status?: number } | undefined)?.status === 409
  );
}

const AUTOSAVE_DELAY_MS = 900;
// Payload mirrors GET /api/toeic-attempts/:id → attempt.session.questions.
type SWQuestionPayload = {
  id: number;
  type?: string;
  section_id?: number;
  order_index?: number;
  content?: string;
  image_url?: string | null;
  prep_time_seconds?: number;
  record_time_seconds?: number;
  min_words?: number;
};

// ── store state shape ────────────────────────────────────────────────────

interface SWStore {
  // ── attempt ──
  attemptId: number | null;
  questions: SWQuestion[];
  currentQuestionIndex: number;
  phase: SWPhase;
  loading: boolean;
  error: string | null;
  submitting: boolean;
  submitted: boolean;

  // ── speaking ──
  micStatus: MicStatus;
  prepSecondsLeft: number;
  recordSecondsLeft: number;
  /** Whether prep timer is running */
  prepActive: boolean;
  /** Whether recording timer is running */
  recordActive: boolean;
  /** Whether the recording has been auto-stopped (lock) */
  recordingLocked: boolean;
  /** Responses keyed by questionId */
  speakingResponses: Record<number, SpeakingResponse>;

  // ── writing ──
  writingTexts: Record<number, string>;
  writingRevisions: Record<number, number>;
  /** True when text is dirty and not yet saved to server */
  writingDirty: Record<number, boolean>;

  // ── upload ──
  uploadQueue: Array<{
    questionId: number;
    retries: number;
    lastError: string | null;
  }>;
  uploadErrors: Record<number, string | null>;

  // ── actions ──
  loadAttempt: (attemptId: string) => Promise<void>;
  setPhase: (phase: SWPhase) => void;
  goToQuestion: (index: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;

  // mic
  setMicStatus: (status: MicStatus) => void;
  requestMic: () => Promise<boolean>;

  // prep timer
  startPrep: () => void;
  tickPrep: () => void;
  finishPrep: () => void;

  // recording
  startRecording: () => void;
  tickRecording: () => void;
  finishRecording: (blob: Blob | null, duration: number) => void;
  lockRecording: () => void;

  // writing
  setWritingText: (questionId: number, text: string) => void;
  flushWritingAutosave: (questionId: number) => Promise<void>;
  flushAllAutosaves: () => Promise<void>;

  // upload
  enqueueUpload: (questionId: number) => void;
  processUploadQueue: () => Promise<void>;
  retryUpload: (questionId: number) => Promise<void>;

  // lifecycle
  submit: () => Promise<void>;
  reset: () => void;
}

// ── autosave internals ───────────────────────────────────────────────────

const autosaveTimers: Record<number, ReturnType<typeof setTimeout>> = {};

// ── store ────────────────────────────────────────────────────────────────

export const useSWStore = create<SWStore>((set, get) => {
  // ── server write helpers ──────────────────────────────────────────

  const doWritingAutosave = async (questionId: number) => {
    const { attemptId, writingTexts, writingRevisions } = get();
    if (attemptId === null) return;
    const text = writingTexts[questionId] ?? '';
    const rev = writingRevisions[questionId] ?? 0;
    try {
      await api.patch(`/toeic-attempts/${attemptId}/responses/${questionId}`, {
        textResponse: text,
        clientRevision: rev,
      });
      set((s) => ({
        writingDirty: { ...s.writingDirty, [questionId]: false },
        writingRevisions: { ...s.writingRevisions, [questionId]: rev + 1 },
      }));
    } catch (err: unknown) {
      if (isConflict(err)) {
        // Server revision ahead — reconcile: adopt server revision as the new
        // base (+1 so the next save is strictly newer) and keep local text.
        console.warn('[SWStore] conflict on autosave q', questionId, '— reconciling revision');
        try {
          const res = await api.get(`/toeic-attempts/${attemptId}`);
          const resp = (res.data.responses ?? []).find(
            (r: { question_id: number }) => r.question_id === questionId
          );
          const serverRev: number = resp?.client_revision ?? 0;
          set((s) => ({
            writingRevisions: { ...s.writingRevisions, [questionId]: serverRev + 1 },
            writingDirty: { ...s.writingDirty, [questionId]: true },
          }));
          // Retry immediately with the reconciled revision.
          void doWritingAutosave(questionId);
        } catch {
          // Keep dirty; next keystroke/exit will retry.
        }
      }
    }
  };

  const scheduleAutosave = (questionId: number) => {
    if (autosaveTimers[questionId]) clearTimeout(autosaveTimers[questionId]);
    autosaveTimers[questionId] = setTimeout(() => {
      delete autosaveTimers[questionId];
      void doWritingAutosave(questionId);
    }, AUTOSAVE_DELAY_MS);
  };

  // ── presigned upload ──────────────────────────────────────────────────

  async function uploadAudio(questionId: number): Promise<boolean> {
    const { attemptId, speakingResponses } = get();
    const resp = speakingResponses[questionId];
    if (!attemptId || !resp?.blob) return false;

    try {
      // 1. Request presigned URL (POST /api/toeic-attempts/:id/media/presign).
      //    No audio bytes in the JSON body — the blob travels via PUT to the URL.
      const presignRes = await api.post(`/toeic-attempts/${attemptId}/media/presign`, {
        questionId,
        fileName: `q${questionId}.webm`,
        fileType: resp.blob.type || 'audio/webm',
        fileSize: resp.blob.size,
      });
      const { uploadUrl, s3Key } = presignRes.data;

      // 2. Upload directly to S3
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: resp.blob,
        headers: { 'Content-Type': resp.blob.type || 'audio/webm' },
      });
      if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.status}`);

      // 3. Update local state
      set((s) => ({
        speakingResponses: {
          ...s.speakingResponses,
          [questionId]: { ...resp, uploaded: true, s3Key, uploadError: null },
        },
        uploadErrors: { ...s.uploadErrors, [questionId]: null },
      }));
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      set((s) => ({
        speakingResponses: {
          ...s.speakingResponses,
          [questionId]: { ...resp, uploadError: msg },
        },
        uploadErrors: { ...s.uploadErrors, [questionId]: msg },
      }));
      return false;
    }
  }

  // ── actual store ───────────────────────────────────────────────────

  return {
    attemptId: null,
    questions: [],
    currentQuestionIndex: 0,
    phase: 'mic_check',
    loading: false,
    error: null,
    submitting: false,
    submitted: false,

    micStatus: EMPTY_MIC,
    prepSecondsLeft: 0,
    recordSecondsLeft: 0,
    prepActive: false,
    recordActive: false,
    recordingLocked: false,
    speakingResponses: {},

    writingTexts: {},
    writingRevisions: {},
    writingDirty: {},

    uploadQueue: [],
    uploadErrors: {},

    // ── attempt ─────────────────────────────────────────────────────

    loadAttempt: async (attemptId) => {
      const id = Number(attemptId);
      set({ loading: true, error: null, attemptId: id });
      try {
        const res = await api.get(`/toeic-attempts/${id}`);
        const attempt = res.data;
        const rawQuestions: Array<SWQuestionPayload> = attempt.session?.questions ?? [];
        const questions: SWQuestion[] = rawQuestions
          .map((q: SWQuestionPayload, i: number): SWQuestion => ({
            id: q.id,
            // Backend question rows carry `type` ('SPEAKING' | 'WRITING'),
            // not `skill_type`.
            skill: q.type === 'SPEAKING' ? 'speaking' : 'writing',
            part: 1,
            questionNumber: q.order_index ?? i + 1,
            content: q.content ?? '',
            imageUrl: q.image_url ?? null,
            prepTimeSeconds: q.prep_time_seconds ?? 45,
            recordTimeSeconds: q.record_time_seconds ?? 45,
            minWords: q.min_words ?? undefined,
          }))
          // TOEIC S&W order: all Speaking questions first, then Writing.
          .sort((a, b) =>
            a.skill === b.skill ? a.questionNumber - b.questionNumber : a.skill === 'speaking' ? -1 : 1
          );

        // Restore existing responses from server
        const existingResponses = attempt.responses ?? [];
        const speakingMap: Record<number, SpeakingResponse> = {};
        const writingMap: Record<number, string> = {};
        const writingRevMap: Record<number, number> = {};

        for (const r of existingResponses) {
          if (r.text_response) {
            writingMap[r.question_id] = r.text_response;
            // Base revision one ahead of the server so the next autosave is
            // strictly newer (backend 409s when clientRevision <= current).
            writingRevMap[r.question_id] = (r.client_revision ?? 0) + 1;
          }
          // Audio responses come back as S3 keys (no blob on refresh)
          if (r.audio_s3_key) {
            speakingMap[r.question_id] = {
              questionId: r.question_id,
              blobUrl: null,
              blob: null,
              duration: r.audio_duration ?? 0,
              uploaded: true,
              uploadError: null,
              s3Key: r.audio_s3_key,
            };
          }
        }

        // Resume: an attempt with saved writing answers skips the mic check
        // and lands directly on the first writing question.
        const firstWrittenId = existingResponses.find((r: { text_response?: string | null }) => !!r.text_response)
          ?.question_id;
        const resumeIndex = firstWrittenId
          ? questions.findIndex((q) => q.id === firstWrittenId)
          : -1;

        set({
          questions,
          currentQuestionIndex: resumeIndex >= 0 ? resumeIndex : 0,
          phase: resumeIndex >= 0 ? 'writing' : 'mic_check',
          loading: false,
          speakingResponses: speakingMap,
          writingTexts: writingMap,
          writingRevisions: writingRevMap,
          writingDirty: {},
          recordingLocked: false,
          prepActive: false,
          recordActive: false,
          uploadQueue: [],
          uploadErrors: {},
        });
      } catch (err: unknown) {
        set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load attempt' });
      }
    },

    setPhase: (phase) => set({ phase }),

    goToQuestion: (index) => {
      const { questions } = get();
      if (index >= 0 && index < questions.length) {
        const q = questions[index];
        const phase: SWPhase = q.skill === 'speaking' ? 'speaking_prep' : 'writing';
        set({
          currentQuestionIndex: index,
          phase,
          prepActive: false,
          recordActive: false,
          recordingLocked: false,
          prepSecondsLeft: q.prepTimeSeconds,
          recordSecondsLeft: q.recordTimeSeconds,
        });
      }
    },

    nextQuestion: () => {
      const { currentQuestionIndex } = get();
      get().goToQuestion(currentQuestionIndex + 1);
    },

    prevQuestion: () => {
      const { currentQuestionIndex } = get();
      get().goToQuestion(currentQuestionIndex - 1);
    },

    // ── mic ──────────────────────────────────────────────────────────

    setMicStatus: (status) => set({ micStatus: status }),

    requestMic: async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        set({ micStatus: { state: 'unsupported', codec: null, error: 'Browser does not support microphone' } });
        return false;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release immediately — we just wanted to check permission
        stream.getTracks().forEach((t) => t.stop());
        set({ micStatus: { state: 'granted', codec: null, error: null } });
        return true;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        const name = error.name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          set({ micStatus: { state: 'denied', codec: null, error: 'Microphone permission denied' } });
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          set({ micStatus: { state: 'disconnected', codec: null, error: 'No microphone found' } });
        } else {
          set({ micStatus: { state: 'disconnected', codec: null, error: error.message } });
        }
        return false;
      }
    },

    // ── prep ─────────────────────────────────────────────────────────

    startPrep: () => {
      const { questions, currentQuestionIndex } = get();
      const q = questions[currentQuestionIndex];
      if (!q) return;
      set({ prepActive: true, prepSecondsLeft: q.prepTimeSeconds, phase: 'speaking_prep' });
    },

    tickPrep: () => {
      const { prepActive, prepSecondsLeft } = get();
      if (!prepActive) return;
      const next = prepSecondsLeft - 1;
      if (next <= 0) {
        get().finishPrep();
      } else {
        set({ prepSecondsLeft: next });
      }
    },

    finishPrep: () => {
      set({ prepActive: false, prepSecondsLeft: 0, phase: 'speaking_recording' });
    },

    // ── recording ────────────────────────────────────────────────────

    startRecording: () => {
      const { questions, currentQuestionIndex, speakingResponses } = get();
      const q = questions[currentQuestionIndex];
      if (!q) return;

      // If already recorded, switch to playback
      if (speakingResponses[q.id]?.blobUrl) {
        set({ phase: 'speaking_playback' });
        return;
      }

      set({
        recordActive: true,
        recordSecondsLeft: q.recordTimeSeconds,
        recordingLocked: false,
        phase: 'speaking_recording',
      });
    },

    tickRecording: () => {
      const { recordActive, recordSecondsLeft } = get();
      if (!recordActive) return;
      const next = recordSecondsLeft - 1;
      if (next <= 0) {
        get().lockRecording();
      } else {
        set({ recordSecondsLeft: next });
      }
    },

    finishRecording: (blob, duration) => {
      const { questions, currentQuestionIndex } = get();
      const q = questions[currentQuestionIndex];
      if (!q || !blob) return;

      const blobUrl = URL.createObjectURL(blob);
      const resp: SpeakingResponse = {
        questionId: q.id,
        blobUrl,
        blob,
        duration,
        uploaded: false,
        uploadError: null,
        s3Key: null,
      };
      set((s) => ({
        speakingResponses: { ...s.speakingResponses, [q.id]: resp },
        recordActive: false,
        recordSecondsLeft: 0,
        recordingLocked: true,
        phase: 'speaking_playback',
      }));
      // Enqueue for upload
      get().enqueueUpload(q.id);
    },

    lockRecording: () => {
      // Recording time expired — stop will be handled by the component
      set({ recordingLocked: true, recordActive: false });
    },

    // ── writing ──────────────────────────────────────────────────────

    setWritingText: (questionId, text) => {
      set((s) => ({
        writingTexts: { ...s.writingTexts, [questionId]: text },
        writingDirty: { ...s.writingDirty, [questionId]: true },
      }));
      scheduleAutosave(questionId);
    },

    flushWritingAutosave: async (questionId) => {
      if (autosaveTimers[questionId]) {
        clearTimeout(autosaveTimers[questionId]);
        delete autosaveTimers[questionId];
      }
      await doWritingAutosave(questionId);
    },

    flushAllAutosaves: async () => {
      const dirtyIds = Object.keys(get().writingDirty)
        .map(Number)
        .filter((id) => get().writingDirty[id]);
      for (const key of Object.keys(autosaveTimers)) {
        clearTimeout(autosaveTimers[Number(key)]);
        delete autosaveTimers[Number(key)];
      }
      for (const id of dirtyIds) {
        await doWritingAutosave(id);
      }
    },

    // ── upload ────────────────────────────────────────────────────────

    enqueueUpload: (questionId) => {
      set((s) => ({
        uploadQueue: [...s.uploadQueue, { questionId, retries: 0, lastError: null }],
      }));
      // Fire-and-forget processing
      void get().processUploadQueue();
    },

    processUploadQueue: async () => {
      const { uploadQueue } = get();
      if (uploadQueue.length === 0) return;
      // Take the first pending item
      const [item, ...rest] = uploadQueue;
      set({ uploadQueue: rest });
      const ok = await uploadAudio(item.questionId);
      if (!ok && item.retries < 2) {
        // Retry after backoff
        setTimeout(() => {
          set((s) => ({
            uploadQueue: [
              ...s.uploadQueue,
              { questionId: item.questionId, retries: item.retries + 1, lastError: item.lastError },
            ],
          }));
          void get().processUploadQueue();
        }, 2000 * (item.retries + 1));
      }
      // Continue processing
      if (rest.length > 0) void get().processUploadQueue();
    },

    retryUpload: async (questionId) => {
      set((s) => ({
        uploadQueue: [...s.uploadQueue, { questionId, retries: 0, lastError: null }],
      }));
      void get().processUploadQueue();
    },

    // ── submit ────────────────────────────────────────────────────────

    submit: async () => {
      const { attemptId, submitted, submitting } = get();
      if (attemptId === null || submitted || submitting) return;
      set({ submitting: true });

      try {
        // Flush all pending autosaves and uploads
        await get().flushAllAutosaves();
        // Wait for uploads to complete (max 30s)
        const start = Date.now();
        while (get().uploadQueue.length > 0 && Date.now() - start < 30_000) {
          await new Promise((r) => setTimeout(r, 500));
        }
        await api.post(`/toeic-attempts/${attemptId}/submit`);
        set({ submitted: true, submitting: false, phase: 'complete' });
      } catch (err: unknown) {
        set({ submitting: false, error: err instanceof Error ? err.message : 'Submission failed' });
        throw err;
      }
    },

    reset: () => {
      for (const key of Object.keys(autosaveTimers)) {
        clearTimeout(autosaveTimers[Number(key)]);
        delete autosaveTimers[Number(key)];
      }
      set({
        attemptId: null,
        questions: [],
        currentQuestionIndex: 0,
        phase: 'mic_check',
        loading: false,
        error: null,
        submitting: false,
        submitted: false,
        micStatus: EMPTY_MIC,
        prepSecondsLeft: 0,
        recordSecondsLeft: 0,
        prepActive: false,
        recordActive: false,
        recordingLocked: false,
        speakingResponses: {},
        writingTexts: {},
        writingRevisions: {},
        writingDirty: {},
        uploadQueue: [],
        uploadErrors: {},
      });
    },
  };
});
