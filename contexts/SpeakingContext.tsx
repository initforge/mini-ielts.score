"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { SpeakingExamState, SpeakingAnswer, SpeakingGradingResponse } from "@/lib/types";
import { speakingQuestions } from "@/lib/mockData";

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
  });

  // Load from sessionStorage on mount, migrate from localStorage if needed
  useEffect(() => {
    let saved = sessionStorage.getItem(STORAGE_KEY);
    
    // Migration: Check localStorage and move to sessionStorage if exists
    if (!saved) {
      const oldData = localStorage.getItem(STORAGE_KEY);
      if (oldData) {
        sessionStorage.setItem(STORAGE_KEY, oldData);
        localStorage.removeItem(STORAGE_KEY);
        saved = oldData;
      }
    }
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Reset to default if exam was finished (new session)
        if (parsed.isFinished) {
          setState({
            currentQuestionIndex: null,
            answers: [],
            isRecording: false,
            isFinished: false,
          });
          sessionStorage.removeItem(STORAGE_KEY);
        } else {
        // Convert date strings back to Date objects
        if (parsed.startTime) parsed.startTime = new Date(parsed.startTime);
        setState(parsed);
        }
      } catch (e) {
        console.error("Failed to load speaking exam state:", e);
      }
    }
  }, []);

  // Save to sessionStorage whenever state changes
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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

      return {
        ...prev,
        answers: newAnswers,
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

  const resetExam = useCallback(() => {
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
    });
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

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
