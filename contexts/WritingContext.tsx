"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { WritingExamState, WritingAnswer, WritingGradingResponse } from "@/lib/types";
import { writingQuestions } from "@/lib/mockData";

interface WritingContextType {
  state: WritingExamState;
  currentQuestion: typeof writingQuestions[0] | null;
  startExam: () => void;
  setCurrentQuestion: (index: number) => void;
  saveAnswer: (answer: WritingAnswer) => void;
  updateTimeRemaining: (seconds: number) => void;
  finishExam: () => void;
  setResults: (results: WritingGradingResponse) => void;
  resetExam: () => void;
}

const WritingContext = createContext<WritingContextType | undefined>(undefined);

const STORAGE_KEY = "toeic-writing-exam-state";
const WRITING_EXAM_DURATION = 60 * 60; // 60 minutes in seconds

export function WritingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WritingExamState>({
    currentQuestionIndex: 0,
    answers: [],
    isFinished: false,
    timeRemaining: WRITING_EXAM_DURATION,
  });

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.startTime) parsed.startTime = new Date(parsed.startTime);
        setState(parsed);
      } catch (e) {
        console.error("Failed to load writing exam state:", e);
      }
    }
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Timer effect
  useEffect(() => {
    if (state.isFinished || !state.startTime) return;

    const interval = setInterval(() => {
      setState((prev) => {
        if (prev.timeRemaining <= 1) {
          return { ...prev, isFinished: true, timeRemaining: 0 };
        }
        return { ...prev, timeRemaining: prev.timeRemaining - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isFinished, state.startTime]);

  const startExam = useCallback(() => {
    setState({
      currentQuestionIndex: 0,
      answers: [],
      isFinished: false,
      startTime: new Date(),
      timeRemaining: WRITING_EXAM_DURATION,
    });
  }, []);

  const setCurrentQuestion = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      currentQuestionIndex: Math.max(0, Math.min(index, writingQuestions.length - 1)),
    }));
  }, []);

  const saveAnswer = useCallback((answer: WritingAnswer) => {
    setState((prev) => {
      const existingIndex = prev.answers.findIndex((a) => a.questionId === answer.questionId);
      const newAnswers = [...prev.answers];
      
      if (existingIndex >= 0) {
        newAnswers[existingIndex] = { ...answer, savedAt: new Date() };
      } else {
        newAnswers.push({ ...answer, savedAt: new Date() });
      }

      return {
        ...prev,
        answers: newAnswers,
      };
    });
  }, []);

  const updateTimeRemaining = useCallback((seconds: number) => {
    setState((prev) => ({ ...prev, timeRemaining: seconds }));
  }, []);

  const finishExam = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isFinished: true,
    }));
  }, []);

  const setResults = useCallback((results: WritingGradingResponse) => {
    setState((prev) => ({
      ...prev,
      results,
    }));
  }, []);

  const resetExam = useCallback(() => {
    setState({
      currentQuestionIndex: 0,
      answers: [],
      isFinished: false,
      timeRemaining: WRITING_EXAM_DURATION,
    });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const currentQuestion = writingQuestions[state.currentQuestionIndex] || null;

  return (
    <WritingContext.Provider
      value={{
        state,
        currentQuestion,
        startExam,
        setCurrentQuestion,
        saveAnswer,
        updateTimeRemaining,
        finishExam,
        setResults,
        resetExam,
      }}
    >
      {children}
    </WritingContext.Provider>
  );
}

export function useWriting() {
  const context = useContext(WritingContext);
  if (context === undefined) {
    throw new Error("useWriting must be used within a WritingProvider");
  }
  return context;
}
