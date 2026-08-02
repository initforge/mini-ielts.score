import { create } from 'zustand';
import api from '../../../api';
import { Attempt, Option, Question, Section } from '../../../types/exam';
import {
  clearPending,
  clearSnapshot,
  getPending,
  loadSnapshot,
  queuePending,
  saveSnapshot,
} from '../lib/attemptStorage';

export interface ResponseDraft {
  selected_option_id: number | null;
  marked_for_review: boolean;
  note: string | null;
  client_revision: number;
  dirty: boolean;
}

export type RunnerStage = 'loading' | 'ready' | 'offline' | 'error';

/** Snapshot shape persisted to IndexedDB for offline resume (AC11). */
export interface AttemptSnapshotData {
  attempt: Attempt | null;
  questions: Question[];
  options: Record<number, Option[]>;
  sections: Section[];
  responses: Record<number, ResponseDraft>;
  currentQuestionIndex: number;
  deadline: number | null;
  directionsForSection: number | null;
  seenDirectionSections: number[];
}

interface AttemptState {
  attemptId: number | null;
  attempt: Attempt | null;
  questions: Question[];
  options: Record<number, Option[]>;
  sections: Section[];
  responses: Record<number, ResponseDraft>;
  currentQuestionIndex: number;
  deadline: number | null; // epoch ms; null in PRACTICE mode (no countdown)
  remainingSeconds: number;
  stage: RunnerStage;
  resumed: boolean; // true when a local snapshot restored the attempt (AC11 resume)
  error: string | null;
  isSubmitting: boolean;
  submitted: boolean;
  online: boolean;
  pendingCount: number;
  paletteOpen: boolean;
  bilingualOn: boolean;
  annotationOpen: boolean;
  directionsForSection: number | null;
  seenDirectionSections: number[];

  loadAttempt: (attemptId: string) => Promise<void>;
  refreshFromServer: () => Promise<void>;
  tick: () => void;
  selectOption: (questionId: number, optionId: number | null) => void;
  toggleReview: (questionId: number) => void;
  markCurrentReviewed: () => void;
  flushAutosaves: () => Promise<void>;
  flushOfflineQueue: () => Promise<void>;
  jumpTo: (index: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  jumpToNextReview: () => void;
  skipToReading: () => boolean;
  maybeShowDirections: (index: number) => void;
  dismissDirections: () => void;
  setPaletteOpen: (open: boolean) => void;
  setBilingual: (on: boolean) => void;
  setAnnotationOpen: (open: boolean) => void;
  setOnline: (online: boolean) => void;
  submit: () => Promise<{ alreadySubmitted: boolean } | null>;
  reset: () => void;
}

const AUTOSAVE_DELAY_MS = 900;
const EMPTY_DRAFT: ResponseDraft = {
  selected_option_id: null,
  marked_for_review: false,
  note: null,
  client_revision: 0,
  dirty: false,
};

function isHttpStatus(err: unknown, status: number): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const response = (err as { response?: { status?: number } }).response;
  return response?.status === status;
}

function draftFromServer(r: {
  question_id: number;
  selected_option_id: number | null;
  text_response: string | null;
  marked_for_review: boolean;
  note: string | null;
  client_revision: number;
}): ResponseDraft {
  return {
    selected_option_id: r.selected_option_id ?? null,
    marked_for_review: Boolean(r.marked_for_review),
    note: r.note ?? null,
    client_revision: r.client_revision ?? 0,
    dirty: false,
  };
}

/** Exam order: section order_index, then per-question order_index.
 *  The backend returns questions ordered by q.order_index alone, which
 *  restarts per section — without this sort the cross-section order (and
 *  every displayNumber) is undefined. */
export function sortSessionQuestions(sections: Section[], questions: Question[]): Question[] {
  const sectionOrder = new Map<number, number>(sections.map((s) => [s.id, s.order_index]));
  return [...questions].sort((a, b) => {
    const sa = sectionOrder.get(a.section_id) ?? Number.MAX_SAFE_INTEGER;
    const sb = sectionOrder.get(b.section_id) ?? Number.MAX_SAFE_INTEGER;
    return sa - sb || a.order_index - b.order_index;
  });
}

function normalizeAttempt(attempt: Attempt): {
  questions: Question[];
  options: Record<number, Option[]>;
  sections: Section[];
  responses: Record<number, ResponseDraft>;
} {
  const questions = sortSessionQuestions(attempt.session.sections, attempt.session.questions).map((q, i) => ({
    ...q,
    displayNumber: i + 1,
  }));
  const options: Record<number, Option[]> = {};
  for (const o of attempt.session.options) {
    if (!options[o.question_id]) options[o.question_id] = [];
    options[o.question_id].push(o);
  }
  const sections = [...attempt.session.sections].sort((a, b) => a.order_index - b.order_index);
  const responses: Record<number, ResponseDraft> = {};
  for (const r of attempt.responses) responses[r.question_id] = draftFromServer(r);
  return { questions, options, sections, responses };
}

/** Server wins for clean drafts; local dirty drafts win and get a bumped revision. */
function mergeResponses(
  local: Record<number, ResponseDraft>,
  server: Record<number, ResponseDraft>,
): Record<number, ResponseDraft> {
  const merged: Record<number, ResponseDraft> = {};
  const ids = new Set<number>([
    ...Object.keys(local).map(Number),
    ...Object.keys(server).map(Number),
  ]);
  for (const id of ids) {
    const l = local[id];
    const srv = server[id];
    if (l && l.dirty) {
      merged[id] = { ...l, client_revision: Math.max(l.client_revision, (srv?.client_revision ?? 0) + 1) };
    } else {
      merged[id] = srv ?? l ?? { ...EMPTY_DRAFT };
    }
  }
  return merged;
}

function getExamMode(attempt: Attempt): string {
  return String((attempt as unknown as Record<string, unknown>).mode ?? 'EXAM');
}

function getDurationMinutes(attempt: Attempt): number {
  const duration = (attempt as unknown as Record<string, unknown>).duration_minutes;
  return typeof duration === 'number' && duration > 0 ? duration : 120;
}

function buildSnapshot(state: AttemptState): Record<string, unknown> {
  return {
    attempt: state.attempt,
    questions: state.questions,
    options: state.options,
    sections: state.sections,
    responses: state.responses,
    currentQuestionIndex: state.currentQuestionIndex,
    deadline: state.deadline,
    directionsForSection: state.directionsForSection,
    seenDirectionSections: state.seenDirectionSections,
  };
}

function applySnapshotData(set: (fn: (state: AttemptState) => Partial<AttemptState>) => void, data: AttemptSnapshotData, stage: RunnerStage) {
  set(() => ({
    attempt: data.attempt,
    questions: data.questions ?? [],
    options: data.options ?? {},
    sections: data.sections ?? [],
    responses: data.responses ?? {},
    currentQuestionIndex:
      typeof data.currentQuestionIndex === 'number' ? data.currentQuestionIndex : 0,
    deadline: data.deadline ?? null,
    remainingSeconds: data.deadline ? Math.max(0, Math.floor((data.deadline - Date.now()) / 1000)) : 0,
    directionsForSection: data.directionsForSection ?? null,
    seenDirectionSections: data.seenDirectionSections ?? [],
    resumed: true,
    stage,
  }));
}

export const useAttemptStore = create<AttemptState>((set, get) => {
  const autosaveTimers: Record<number, number> = {};

  const scheduleAutosave = (questionId: number) => {
    if (autosaveTimers[questionId]) window.clearTimeout(autosaveTimers[questionId]);
    autosaveTimers[questionId] = window.setTimeout(() => {
      delete autosaveTimers[questionId];
      void doSave(questionId);
    }, AUTOSAVE_DELAY_MS);
  };

  const doSave = async (questionId: number) => {
    const { attemptId, responses } = get();
    if (attemptId === null) return;
    const draft = responses[questionId];
    if (!draft || !draft.dirty) return;
    const payload = {
      selectedOptionId: draft.selected_option_id,
      markedForReview: draft.marked_for_review,
      note: draft.note,
      clientRevision: draft.client_revision,
    };
    try {
      await api.patch(`/toeic-attempts/${attemptId}/responses/${questionId}`, payload);
      set((s) => ({
        responses: {
          ...s.responses,
          [questionId]: { ...s.responses[questionId], dirty: false },
        },
        online: true,
      }));
    } catch (err) {
      if (isHttpStatus(err, 409)) {
        // Server revision ahead of the client -> reconcile (AC11 revisions).
        await get().refreshFromServer();
        return;
      }
      // Offline or transient failure -> durable queue (AC11 offline).
      await queuePending(attemptId, questionId, payload);
      set((s) => ({ online: false, pendingCount: s.pendingCount + 1 }));
    }
  };

  const persistSnapshot = () => {
    const { attemptId } = get();
    if (attemptId === null) return;
    void saveSnapshot(attemptId, buildSnapshot(get()));
  };

  return {
    attemptId: null,
    attempt: null,
    questions: [],
    options: {},
    sections: [],
    responses: {},
    currentQuestionIndex: 0,
    deadline: null,
    remainingSeconds: 0,
    stage: 'loading',
    resumed: false,
    error: null,
    isSubmitting: false,
    submitted: false,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pendingCount: 0,
    paletteOpen: false,
    bilingualOn: false,
    annotationOpen: false,
    directionsForSection: null,
    seenDirectionSections: [],

    loadAttempt: async (attemptId) => {
      const id = Number(attemptId);
      set({ stage: 'loading', error: null, attemptId: id });

      // Render a locally-saved snapshot first so reload/resume never blocks
      // on the network and offline reopen keeps acknowledged answers (AC11).
      const snapshot = await loadSnapshot(id);
      if (snapshot) {
        const data = snapshot as unknown as AttemptSnapshotData;
        if (data && data.attempt) applySnapshotData(set, data, 'ready');
      }

      try {
        const res = await api.get<Attempt>(`/toeic-attempts/${id}`);
        const attempt = res.data;
        const normalized = normalizeAttempt(attempt);
        const mode = getExamMode(attempt);
        const durationMinutes = getDurationMinutes(attempt);
        const startedAt = new Date(attempt.started_at).getTime();
        const deadline = mode === 'PRACTICE' ? null : startedAt + durationMinutes * 60000;
        const remainingSeconds = deadline ? Math.max(0, Math.floor((deadline - Date.now()) / 1000)) : 0;

        set((s) => ({
          attempt,
          questions: normalized.questions,
          options: normalized.options,
          sections: normalized.sections,
          responses: mergeResponses(s.responses, normalized.responses),
          deadline,
          remainingSeconds,
          stage: 'ready',
          online: true,
        }));

        // Re-save any offline-queued dirty drafts with the merged revision.
        const merged = get().responses;
        for (const [qidStr, draft] of Object.entries(merged)) {
          if (draft.dirty) scheduleAutosave(Number(qidStr));
        }
        if (attempt.status !== 'IN_PROGRESS') void clearSnapshot(id);
        persistSnapshot();
      } catch (err) {
        if (snapshot) {
          set({ stage: 'offline', online: false });
          return;
        }
        set({
          stage: 'error',
          error: err instanceof Error ? err.message : 'Không thể tải bài thi',
        });
      }
    },

    refreshFromServer: async () => {
      const { attemptId } = get();
      if (attemptId === null) return;
      const res = await api.get<Attempt>(`/toeic-attempts/${attemptId}`);
      const server = res.data;
      const normalized = normalizeAttempt(server);
      set((s) => ({
        attempt: server,
        responses: mergeResponses(s.responses, normalized.responses),
        options: normalized.options,
        sections: normalized.sections,
        online: true,
      }));
      const merged = get().responses;
      for (const [qidStr, draft] of Object.entries(merged)) {
        if (draft.dirty) scheduleAutosave(Number(qidStr));
      }
    },

    tick: () => {
      const { deadline } = get();
      if (!deadline) return;
      set({ remainingSeconds: Math.max(0, Math.floor((deadline - Date.now()) / 1000)) });
    },

    selectOption: (questionId, optionId) => {
      set((s) => {
        const prev = s.responses[questionId];
        return {
          responses: {
            ...s.responses,
            [questionId]: {
              selected_option_id: optionId,
              marked_for_review: prev?.marked_for_review ?? false,
              note: prev?.note ?? null,
              client_revision: (prev?.client_revision ?? 0) + 1,
              dirty: true,
            },
          },
        };
      });
      scheduleAutosave(questionId);
      persistSnapshot();
    },

    toggleReview: (questionId) => {
      set((s) => {
        const prev = s.responses[questionId];
        return {
          responses: {
            ...s.responses,
            [questionId]: {
              selected_option_id: prev?.selected_option_id ?? null,
              marked_for_review: !(prev?.marked_for_review ?? false),
              note: prev?.note ?? null,
              client_revision: (prev?.client_revision ?? 0) + 1,
              dirty: true,
            },
          },
        };
      });
      scheduleAutosave(questionId);
      persistSnapshot();
    },

    markCurrentReviewed: () => {
      const { questions, currentQuestionIndex } = get();
      const question = questions[currentQuestionIndex];
      if (question) get().toggleReview(question.id);
    },

    flushAutosaves: async () => {
      for (const key of Object.keys(autosaveTimers)) {
        window.clearTimeout(autosaveTimers[Number(key)]);
        delete autosaveTimers[Number(key)];
      }
      const { attemptId, responses } = get();
      if (attemptId === null) return;
      for (const [qidStr, draft] of Object.entries(responses)) {
        if (draft.dirty) await doSave(Number(qidStr));
      }
    },

    flushOfflineQueue: async () => {
      const { attemptId } = get();
      if (attemptId === null) return;
      const pending = await getPending(attemptId);
      let cleared = 0;
      for (const op of pending) {
        try {
          await api.patch(`/toeic-attempts/${attemptId}/responses/${op.questionId}`, op.body);
          await clearPending(attemptId, [op.questionId]);
          cleared += 1;
        } catch {
          // stays queued; retried on next reconnect / flush
        }
      }
      if (cleared > 0) {
        set((s) => ({ pendingCount: Math.max(0, s.pendingCount - cleared), online: true }));
      }
    },

    jumpTo: (index) => {
      const { questions } = get();
      if (index >= 0 && index < questions.length) {
        set({ currentQuestionIndex: index });
        get().maybeShowDirections(index);
      }
    },

    nextQuestion: () => {
      get().jumpTo(get().currentQuestionIndex + 1);
    },

    prevQuestion: () => {
      get().jumpTo(get().currentQuestionIndex - 1);
    },

    jumpToNextReview: () => {
      const { questions, responses, currentQuestionIndex } = get();
      if (questions.length === 0) return;
      for (let i = 1; i <= questions.length; i += 1) {
        const idx = (currentQuestionIndex + i) % questions.length;
        if (responses[questions[idx].id]?.marked_for_review) {
          set({ currentQuestionIndex: idx });
          get().maybeShowDirections(idx);
          return;
        }
      }
    },

    skipToReading: () => {
      const { questions, sections, currentQuestionIndex } = get();
      const idx = questions.findIndex((q) => {
        const section = sections.find((s) => s.id === q.section_id);
        return section !== undefined && section.order_index >= 5;
      });
      if (idx === -1) return false;
      if (idx !== currentQuestionIndex) {
        set({ currentQuestionIndex: idx });
        get().maybeShowDirections(idx);
      }
      return true;
    },

    maybeShowDirections: (index) => {
      const { questions, sections, seenDirectionSections } = get();
      const question = questions[index];
      if (!question) return;
      const section = sections.find((s) => s.id === question.section_id);
      if (!section || section.order_index >= 5) return;
      if (seenDirectionSections.includes(section.id)) return;
      const instructions = section.instructions ?? '';
      if (instructions.trim().length > 0) {
        set({
          directionsForSection: section.id,
          seenDirectionSections: [...seenDirectionSections, section.id],
        });
      } else {
        set({ seenDirectionSections: [...seenDirectionSections, section.id] });
      }
    },

    dismissDirections: () => set({ directionsForSection: null }),

    setPaletteOpen: (open) => set({ paletteOpen: open }),
    setBilingual: (on) => set({ bilingualOn: on }),
    setAnnotationOpen: (open) => set({ annotationOpen: open }),
    setOnline: (online) => set({ online }),

    submit: async () => {
      const { attemptId, submitted, isSubmitting } = get();
      if (attemptId === null || submitted || isSubmitting) return null;
      set({ isSubmitting: true });
      try {
        await get().flushAutosaves();
        await get().flushOfflineQueue();
        const res = await api.post(`/toeic-attempts/${attemptId}/submit`);
        const alreadySubmitted = Boolean(
          (res.data as { alreadySubmitted?: boolean } | null)?.alreadySubmitted,
        );
        set({ submitted: true, isSubmitting: false });
        void clearSnapshot(attemptId);
        return { alreadySubmitted };
      } catch (err) {
        set({
          isSubmitting: false,
          error: err instanceof Error ? err.message : 'Nộp bài thất bại',
        });
        throw err;
      }
    },

    reset: () => {
      for (const key of Object.keys(autosaveTimers)) {
        window.clearTimeout(autosaveTimers[Number(key)]);
        delete autosaveTimers[Number(key)];
      }
      set({
        attemptId: null,
        attempt: null,
        questions: [],
        options: {},
        sections: [],
        responses: {},
        currentQuestionIndex: 0,
        deadline: null,
        remainingSeconds: 0,
        stage: 'loading',
        resumed: false,
        error: null,
        isSubmitting: false,
        submitted: false,
        paletteOpen: false,
        bilingualOn: false,
        annotationOpen: false,
        directionsForSection: null,
        seenDirectionSections: [],
      });
    },
  };
});
