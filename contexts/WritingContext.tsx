"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
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
  canNavigateToQuestion: (index: number) => boolean;
  getQuestionTimeRemaining: (questionIndex: number) => number | null;
}

const WritingContext = createContext<WritingContextType | undefined>(undefined);

const STORAGE_KEY = "toeic-writing-exam-state";
const PART1_TOTAL_TIME = 5 * 60; // 5 minutes for questions 1-5
const QUESTION6_TIME = 10 * 60; // 10 minutes for question 6
const QUESTION7_TIME = 10 * 60; // 10 minutes for question 7
const QUESTION8_TIME = 30 * 60; // 30 minutes for question 8

export function WritingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WritingExamState>({
    currentQuestionIndex: 0,
    answers: [],
    isFinished: false,
    timeRemaining: PART1_TOTAL_TIME, // Start with Part 1 time
  });
  
  // Track individual question timers
  const [questionTimers, setQuestionTimers] = useState<Record<number, number>>({});
  const questionTimersRef = useRef<Record<number, number>>({});
  
  // Sync ref with state
  useEffect(() => {
    questionTimersRef.current = questionTimers;
  }, [questionTimers]);

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
        if (parsed.startTime) parsed.startTime = new Date(parsed.startTime);
        setState(parsed);
      } catch (e) {
        console.error("Failed to load writing exam state:", e);
      }
    }
  }, []);

  // Save to sessionStorage whenever state changes
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Timer effect - handles both overall timer and individual question timers
  useEffect(() => {
    if (state.isFinished || !state.startTime) return;

    const interval = setInterval(() => {
      setState((prev) => {
        const currentQ = writingQuestions[prev.currentQuestionIndex];
        if (!currentQ) return prev;
        
        // For questions 1-5, use shared Part 1 timer
        if (currentQ.questionNumber <= 5) {
          if (prev.timeRemaining <= 1) {
            return { ...prev, isFinished: true, timeRemaining: 0 };
          }
          return { ...prev, timeRemaining: prev.timeRemaining - 1 };
        }
        
        // For questions 6, 7, 8, use individual timers
        if (currentQ.timeLimit) {
          const currentTimer = questionTimersRef.current[prev.currentQuestionIndex] ?? currentQ.timeLimit;
          const newTime = currentTimer - 1;
          
          if (newTime <= 0) {
            // Auto move to next question or finish
            if (currentQ.questionNumber === 6 && prev.currentQuestionIndex < writingQuestions.length - 1) {
              // Auto move to question 7
              const nextQ = writingQuestions[prev.currentQuestionIndex + 1];
              const newTimers = { ...questionTimersRef.current };
              if (nextQ?.timeLimit) {
                newTimers[prev.currentQuestionIndex + 1] = nextQ.timeLimit;
              }
              setQuestionTimers(newTimers);
              return {
                ...prev,
                currentQuestionIndex: prev.currentQuestionIndex + 1,
                timeRemaining: nextQ?.timeLimit || 0,
              };
            } else {
              return { ...prev, isFinished: true, timeRemaining: 0 };
            }
          }
          
          // Update timer
          const newTimers = {
            ...questionTimersRef.current,
            [prev.currentQuestionIndex]: newTime,
          };
          setQuestionTimers(newTimers);
          
          return { ...prev, timeRemaining: newTime };
        }
        
        return prev;
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
      timeRemaining: PART1_TOTAL_TIME, // Start with Part 1 time
    });
    setQuestionTimers({});
  }, []);

  const setCurrentQuestion = useCallback((index: number) => {
    const targetQ = writingQuestions[index];
    if (!targetQ) return;
    
    // Initialize timer for questions 6, 7, 8 if not already set
    if (targetQ.timeLimit && !questionTimersRef.current[index]) {
      const newTimers = {
        ...questionTimersRef.current,
        [index]: targetQ.timeLimit,
      };
      setQuestionTimers(newTimers);
    }
    
    setState((prev) => {
      const timerValue = targetQ.timeLimit 
        ? (questionTimersRef.current[index] ?? targetQ.timeLimit)
        : prev.timeRemaining;
      
      return {
        ...prev,
        currentQuestionIndex: Math.max(0, Math.min(index, writingQuestions.length - 1)),
        timeRemaining: timerValue,
      };
    });
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
      timeRemaining: PART1_TOTAL_TIME,
    });
    setQuestionTimers({});
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  // Check if can navigate to a question
  const canNavigateToQuestion = useCallback((index: number): boolean => {
    const targetQ = writingQuestions[index];
    if (!targetQ) return false;
    
    // Questions 1-5: can navigate freely
    if (targetQ.questionNumber <= 5) return true;
    
    // Question 6: can always access
    if (targetQ.questionNumber === 6) return true;
    
    // Question 7: can only access if question 6 is completed
    if (targetQ.questionNumber === 7) {
      const q6Answer = state.answers.find(a => a.questionId === "w6");
      return !!(q6Answer && q6Answer.text.trim().length > 0);
    }
    
    // Question 8: can access if question 7 is completed
    if (targetQ.questionNumber === 8) {
      const q7Answer = state.answers.find(a => a.questionId === "w7");
      return !!(q7Answer && q7Answer.text.trim().length > 0);
    }
    
    return false;
  }, [state.answers]);

  // Get time remaining for a specific question
  const getQuestionTimeRemaining = useCallback((questionIndex: number) => {
    const question = writingQuestions[questionIndex];
    if (!question) return null;
    
    // Questions 1-5: use shared Part 1 timer
    if (question.questionNumber <= 5) {
      return state.timeRemaining;
    }
    
    // Questions 6, 7, 8: use individual timer
    if (question.timeLimit) {
      return questionTimersRef.current[questionIndex] ?? question.timeLimit;
    }
    
    return null;
  }, [state.timeRemaining]);

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
        canNavigateToQuestion,
        getQuestionTimeRemaining,
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
