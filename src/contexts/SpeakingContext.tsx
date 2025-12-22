import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { SpeakingExamState, SpeakingAnswer, SpeakingGradingResponse } from "@/lib/types";
import { speakingQuestions } from "@/lib/mockData";
import { clearAllAudio } from "@/lib/audioStorage";

interface SpeakingContextType {
  state: SpeakingExamState;
  currentQuestion: typeof speakingQuestions[0] | null;
  startExam: () => void;
  setCurrentQuestion: (index: number | null) => void;
  clearQuestionSelection: () => void;
  saveAnswer: (answer: SpeakingAnswer) => void;
  finishExam: () => void;
  setResults: (results: SpeakingGradingResponse) => void;
  resetExam: () => void;
  // New functions for user input
  setQuestionText: (questionId: string, text: string) => void;
  setQuestionImage: (questionId: string, imageData: string | null) => void;
  startPreparationTimer: () => void;
  startResponseTimer: () => void;
  lockRecording: () => void;
  setStartTime: () => void;
  resetTimerState: () => void;
}

const SpeakingContext = createContext<SpeakingContextType | undefined>(undefined);

const STORAGE_KEY = "toeic-speaking-exam-state";

export function SpeakingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SpeakingExamState>({
    currentQuestionIndex: null, // Start with no question selected
    answers: [],
    isRecording: false,
    isFinished: false,
    questions: {},
    images: {},
    isLocked: false,
    preparationTimerStarted: false,
    responseTimerStarted: false,
    audioUrls: {}, // Store audio URLs for playback
  });

  // On fresh load we ALWAYS treat it as a new session:
  // - clear any persisted speaking state
  // - clear all stored audio recordings
  useEffect(() => {
    (async () => {
      sessionStorage.removeItem(STORAGE_KEY);
      try {
        await clearAllAudio();
      } catch (error) {
        console.error("Failed to clear audio from IndexedDB on app load:", error);
      }
    })();
  }, []);

  const startExam = useCallback(() => {
    setState({
      currentQuestionIndex: null, // Don't auto-select question
      answers: [],
      isRecording: false,
      isFinished: false,
      startTime: undefined, // Don't set startTime yet - wait for instruction modal
      questions: {},
      images: {},
      isLocked: false,
      preparationTimerStarted: false,
      responseTimerStarted: false,
    });
  }, []);

  const setCurrentQuestion = useCallback((index: number | null) => {
    if (index === null) {
      setState((prev) => ({
        ...prev,
        currentQuestionIndex: null,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        currentQuestionIndex: Math.max(0, Math.min(index, speakingQuestions.length - 1)),
      }));
    }
  }, []);

  // Clear question selection (sets to null)
  const clearQuestionSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentQuestionIndex: null,
      preparationTimerStarted: false,
      responseTimerStarted: false,
      isLocked: false,
    }));
  }, []);

  const saveAnswer = useCallback((answer: SpeakingAnswer) => {
    setState((prev) => {
      const existingIndex = prev.answers.findIndex((a) => a.questionId === answer.questionId);
      const newAnswers = [...prev.answers];
      
      if (existingIndex >= 0) {
        newAnswers[existingIndex] = answer;
      } else {
        newAnswers.push(answer);
      }

      // Store audio URL for playback if available
      let audioUrls = prev.audioUrls || {};
      if (answer.audioBlob) {
        const audioUrl = URL.createObjectURL(answer.audioBlob);
        audioUrls = {
          ...audioUrls,
          [answer.questionId]: audioUrl,
        };
      }

      return {
        ...prev,
        answers: newAnswers,
        audioUrls,
      };
    });
  }, []);

  const finishExam = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isFinished: true,
      isRecording: false,
    }));
  }, []);

  const setResults = useCallback((results: SpeakingGradingResponse) => {
    setState((prev) => ({
      ...prev,
      results,
    }));
  }, []);

  const resetExam = useCallback(async () => {
    // Clean up audio URLs
    if (state.audioUrls) {
      Object.values(state.audioUrls).forEach(url => {
        URL.revokeObjectURL(url);
      });
    }
    
    // Clear all audio from IndexedDB
    try {
      await clearAllAudio();
    } catch (error) {
      console.error("Failed to clear audio from IndexedDB:", error);
    }
    
    setState({
      currentQuestionIndex: null,
      answers: [],
      isRecording: false,
      isFinished: false,
      questions: {},
      images: {},
      isLocked: false,
      preparationTimerStarted: false,
      responseTimerStarted: false,
      audioUrls: {},
    });
    sessionStorage.removeItem(STORAGE_KEY);
  }, [state.audioUrls]);

  // Set question text (user input)
  const setQuestionText = useCallback((questionId: string, text: string) => {
    setState((prev) => ({
      ...prev,
      questions: {
        ...prev.questions,
        [questionId]: text,
      },
    }));
  }, []);

  // Set question image
  const setQuestionImage = useCallback((questionId: string, imageData: string | null) => {
    setState((prev) => {
      const newImages = { ...prev.images };
      if (imageData) {
        newImages[questionId] = imageData;
      } else {
        delete newImages[questionId];
      }
      return {
        ...prev,
        images: newImages,
      };
    });
  }, []);

  // Start preparation timer
  const startPreparationTimer = useCallback(() => {
    setState((prev) => ({
      ...prev,
      preparationTimerStarted: true,
    }));
  }, []);

  // Start response timer
  const startResponseTimer = useCallback(() => {
    setState((prev) => ({
      ...prev,
      preparationTimerStarted: false,
      responseTimerStarted: true,
    }));
  }, []);

  // Lock recording when time expires
  const lockRecording = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLocked: true,
      isRecording: false,
      responseTimerStarted: false,
    }));
  }, []);

  // Set startTime when user clicks "Bắt đầu" in instruction modal
  const setStartTime = useCallback(() => {
    setState((prev) => {
      // Only set if not already set
      if (prev.startTime) return prev;
      return {
        ...prev,
        startTime: new Date(),
      };
    });
  }, []);

  // Reset timer state (used when navigating between questions)
  const resetTimerState = useCallback(() => {
    setState((prev) => ({
      ...prev,
      preparationTimerStarted: false,
      responseTimerStarted: false,
      isLocked: false,
    }));
  }, []);

  const currentQuestion = 
    state.currentQuestionIndex !== null 
      ? speakingQuestions[state.currentQuestionIndex] || null
      : null;

  return (
    <SpeakingContext.Provider
      value={{
        state,
        currentQuestion,
        startExam,
        setCurrentQuestion,
        clearQuestionSelection,
        saveAnswer,
        finishExam,
        setResults,
        resetExam,
        setQuestionText,
        setQuestionImage,
        startPreparationTimer,
        startResponseTimer,
        lockRecording,
        setStartTime,
        resetTimerState,
      }}
    >
      {children}
    </SpeakingContext.Provider>
  );
}

export function useSpeaking() {
  const context = useContext(SpeakingContext);
  if (context === undefined) {
    throw new Error("useSpeaking must be used within a SpeakingProvider");
  }
  return context;
}
