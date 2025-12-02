"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { SpeakingExamState, SpeakingAnswer, SpeakingGradingResponse } from "@/lib/types";
import { speakingQuestions } from "@/lib/mockData";

interface SpeakingContextType {
  state: SpeakingExamState;
  currentQuestion: typeof speakingQuestions[0] | null;
  startExam: () => void;
  setCurrentQuestion: (index: number) => void;
  saveAnswer: (answer: SpeakingAnswer) => void;
  finishExam: () => void;
  setResults: (results: SpeakingGradingResponse) => void;
  resetExam: () => void;
}

const SpeakingContext = createContext<SpeakingContextType | undefined>(undefined);

const STORAGE_KEY = "toeic-speaking-exam-state";

export function SpeakingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SpeakingExamState>({
    currentQuestionIndex: 0,
    answers: [],
    isRecording: false,
    isFinished: false,
  });

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Convert date strings back to Date objects
        if (parsed.startTime) parsed.startTime = new Date(parsed.startTime);
        setState(parsed);
      } catch (e) {
        console.error("Failed to load speaking exam state:", e);
      }
    }
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const startExam = useCallback(() => {
    setState({
      currentQuestionIndex: 0,
      answers: [],
      isRecording: false,
      isFinished: false,
      startTime: new Date(),
    });
  }, []);

  const setCurrentQuestion = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      currentQuestionIndex: Math.max(0, Math.min(index, speakingQuestions.length - 1)),
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
      currentQuestionIndex: 0,
      answers: [],
      isRecording: false,
      isFinished: false,
    });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const currentQuestion = speakingQuestions[state.currentQuestionIndex] || null;

  return (
    <SpeakingContext.Provider
      value={{
        state,
        currentQuestion,
        startExam,
        setCurrentQuestion,
        saveAnswer,
        finishExam,
        setResults,
        resetExam,
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
