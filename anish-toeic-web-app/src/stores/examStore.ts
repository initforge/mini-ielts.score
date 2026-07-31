import { create } from 'zustand';
import api from '../api';
import { Attempt, Question, Option, Section } from '../types/exam';

interface ExamState {
  attempt: Attempt | null;
  questions: Question[];
  options: Record<number, Option[]>;
  sections: Section[];
  responses: Record<number, { selected_option_id: number | null; marked_for_review: boolean }>;
  currentQuestionIndex: number;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;

  fetchAttempt: (attemptId: string) => Promise<void>;
  updateResponse: (attemptId: string, questionId: number, selected_option_id: number | null) => Promise<void>;
  toggleReview: (attemptId: string, questionId: number) => Promise<void>;
  setCurrentQuestionIndex: (index: number) => void;
  submitAttempt: (attemptId: string) => Promise<void>;
}

// Debounce timer map
const autosaveTimers: Record<number, NodeJS.Timeout> = {};

export const useExamStore = create<ExamState>((set, get) => ({
  attempt: null,
  questions: [],
  options: {},
  sections: [],
  responses: {},
  currentQuestionIndex: 0,
  isLoading: false,
  isSubmitting: false,
  error: null,

  fetchAttempt: async (attemptId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get(`/toeic-attempts/${attemptId}`);
      const attempt: Attempt = res.data.data || res.data;

      const questions = attempt.session.questions;
      // map display number 1-100 or 1-200
      questions.forEach((q, i) => {
        q.displayNumber = i + 1;
      });

      const optionsMap: Record<number, Option[]> = {};
      attempt.session.options.forEach((opt) => {
        if (!optionsMap[opt.question_id]) {
          optionsMap[opt.question_id] = [];
        }
        optionsMap[opt.question_id].push(opt);
      });

      const responsesMap: Record<number, { selected_option_id: number | null; marked_for_review: boolean }> = {};
      attempt.responses.forEach((r) => {
        responsesMap[r.question_id] = {
          selected_option_id: r.selected_option_id,
          marked_for_review: r.marked_for_review,
        };
      });

      set({
        attempt,
        questions,
        options: optionsMap,
        sections: attempt.session.sections,
        responses: responsesMap,
        isLoading: false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch attempt', isLoading: false });
    }
  },

  updateResponse: async (attemptId: string, questionId: number, selected_option_id: number | null) => {
    // Optimistic update
    set((state) => ({
      responses: {
        ...state.responses,
        [questionId]: {
          ...state.responses[questionId],
          selected_option_id,
        },
      },
    }));

    // Debounced API call
    if (autosaveTimers[questionId]) {
      clearTimeout(autosaveTimers[questionId]);
    }
    autosaveTimers[questionId] = setTimeout(async () => {
      try {
        await api.patch(`/toeic-attempts/${attemptId}/responses/${questionId}`, {
          selected_option_id,
        });
      } catch (err) {
        console.error('Failed to autosave response for question', questionId, err);
      }
    }, 1000);
  },

  toggleReview: async (attemptId: string, questionId: number) => {
    const currentState = get().responses[questionId]?.marked_for_review || false;
    const newState = !currentState;
    
    set((state) => ({
      responses: {
        ...state.responses,
        [questionId]: {
          ...state.responses[questionId],
          marked_for_review: newState,
        },
      },
    }));

    if (autosaveTimers[questionId]) {
      clearTimeout(autosaveTimers[questionId]);
    }
    autosaveTimers[questionId] = setTimeout(async () => {
      try {
        await api.patch(`/toeic-attempts/${attemptId}/responses/${questionId}`, {
          marked_for_review: newState,
        });
      } catch (err) {
        console.error('Failed to autosave review state for question', questionId, err);
      }
    }, 1000);
  },

  setCurrentQuestionIndex: (index: number) => {
    const questions = get().questions;
    if (index >= 0 && index < questions.length) {
      set({ currentQuestionIndex: index });
    }
  },

  submitAttempt: async (attemptId: string) => {
    set({ isSubmitting: true, error: null });
    try {
      await api.post(`/toeic-attempts/${attemptId}/submit`);
      set({ isSubmitting: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to submit attempt', isSubmitting: false });
      throw err;
    }
  },
}));
