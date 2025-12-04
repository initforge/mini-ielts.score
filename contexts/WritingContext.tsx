"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { WritingExamState, WritingAnswer, WritingGradingResponse } from "@/lib/types";
import { writingQuestions } from "@/lib/mockData";

interface WritingContextType {
  state: WritingExamState;
  currentQuestion: typeof writingQuestions[0] | null;
  startExam: () => void;
  setCurrentQuestion: (index: number | null) => void;
  clearQuestionSelection: () => void;
  saveAnswer: (answer: WritingAnswer) => void;
  updateTimeRemaining: (seconds: number) => void;
  finishExam: () => void;
  setResults: (results: WritingGradingResponse) => void;
  resetExam: () => void;
  canNavigateToQuestion: (index: number) => boolean;
  getQuestionTimeRemaining: (questionIndex: number) => number | null;
  setQuestionText: (questionId: string, text: string) => void;
  setPartImage: (part: number, imageData: string | null) => void;
  startTimer: () => void;
  lockAnswers: () => void;
}

const WritingContext = createContext<WritingContextType | undefined>(undefined);

const STORAGE_KEY = "toeic-writing-exam-state";
const PART1_TOTAL_TIME = 5 * 60; // 5 minutes for questions 1-5
const QUESTION6_TIME = 10 * 60; // 10 minutes for question 6
const QUESTION7_TIME = 10 * 60; // 10 minutes for question 7
const QUESTION8_TIME = 30 * 60; // 30 minutes for question 8

export function WritingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WritingExamState>({
    currentQuestionIndex: null, // Start with no question selected
    answers: [],
    isFinished: false,
    timeRemaining: PART1_TOTAL_TIME, // Start with Part 1 time
    questions: {},
    images: {},
    isTimerRunning: false,
    isLocked: false,
  });

  // Track individual question timers
  const [questionTimers, setQuestionTimers] = useState<Record<number, number>>({});
  const questionTimersRef = useRef<Record<number, number>>({});
  
  // Track when each part/question timer started
  const [partStartTimes, setPartStartTimes] = useState<Record<number, Date>>({});
  const partStartTimesRef = useRef<Record<number, Date>>({});
  
  // Global timer interval ref (runs even when switching tabs)
  const globalTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Sync refs with state
  useEffect(() => {
    questionTimersRef.current = questionTimers;
  }, [questionTimers]);

  useEffect(() => {
    partStartTimesRef.current = partStartTimes;
  }, [partStartTimes]);

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
            isFinished: false,
            timeRemaining: PART1_TOTAL_TIME,
          });
          setQuestionTimers({});
          sessionStorage.removeItem(STORAGE_KEY);
        } else {
        if (parsed.startTime) parsed.startTime = new Date(parsed.startTime);
          if (parsed.timerStartedAt) parsed.timerStartedAt = new Date(parsed.timerStartedAt);
        setState(parsed);
          
          // If timer is running, restore part start times based on current question
          if (parsed.isTimerRunning && parsed.timerStartedAt) {
            const currentQ = writingQuestions[parsed.currentQuestionIndex];
            if (currentQ) {
              const now = new Date();
              // For Q1-5, use main start time
              if (currentQ.questionNumber <= 5) {
                // Part 1 uses main timer, no need to set partStartTime
              } else if (currentQ.timeLimit) {
                // For Q6-8, estimate start time based on remaining time
                const remaining = parsed.timeRemaining;
                const estimatedStart = new Date(now.getTime() - (currentQ.timeLimit - remaining) * 1000);
                setPartStartTimes(prev => ({ ...prev, [parsed.currentQuestionIndex]: estimatedStart }));
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to load writing exam state:", e);
      }
    }
  }, []);

  // Save to sessionStorage whenever state changes
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Global timer that runs continuously (even when switching tabs)
  useEffect(() => {
    if (!state.isTimerRunning || !state.timerStartedAt || state.isFinished) {
      if (globalTimerIntervalRef.current) {
        clearInterval(globalTimerIntervalRef.current);
        globalTimerIntervalRef.current = null;
      }
      return;
    }

    // Calculate elapsed time and update remaining time
    const updateTimer = () => {
      setState((prev) => {
        if (!prev.timerStartedAt) return prev;
        
        if (prev.currentQuestionIndex === null) return prev;
        const currentQ = writingQuestions[prev.currentQuestionIndex];
        if (!currentQ) return prev;

        const now = new Date();
        const elapsed = Math.floor((now.getTime() - prev.timerStartedAt.getTime()) / 1000);

        // For questions 1-5, use shared Part 1 timer
        if (currentQ.questionNumber <= 5) {
          const remaining = PART1_TOTAL_TIME - elapsed;
          if (remaining <= 0) {
            return { ...prev, timeRemaining: 0, isLocked: true, isFinished: true };
          }
          return { ...prev, timeRemaining: remaining };
        }

        // For questions 6, 7, 8, use individual timers based on when that question started
        if (currentQ.timeLimit) {
          // Get when this question's timer started
          const questionStartTime = partStartTimesRef.current[prev.currentQuestionIndex];
          if (!questionStartTime) {
            // If no start time set, initialize it now
            setPartStartTimes(prevTimes => ({ ...prevTimes, [prev.currentQuestionIndex]: now }));
            return { ...prev, timeRemaining: currentQ.timeLimit };
          }
          
          const questionElapsed = Math.floor((now.getTime() - questionStartTime.getTime()) / 1000);
          const remaining = currentQ.timeLimit - questionElapsed;
          
          if (remaining <= 0) {
            // Auto move to next question or finish
            if (currentQ.questionNumber === 6 && prev.currentQuestionIndex < writingQuestions.length - 1) {
              const nextQ = writingQuestions[prev.currentQuestionIndex + 1];
              const newTimers = { ...questionTimersRef.current };
              if (nextQ?.timeLimit) {
                newTimers[prev.currentQuestionIndex + 1] = nextQ.timeLimit;
              }
              setQuestionTimers(newTimers);
              // Set start time for next question
              setPartStartTimes(prevTimes => ({ ...prevTimes, [prev.currentQuestionIndex + 1]: now }));
              return {
                ...prev,
                currentQuestionIndex: prev.currentQuestionIndex + 1,
                timeRemaining: nextQ?.timeLimit || 0,
              };
            } else {
              return { ...prev, timeRemaining: 0, isLocked: true, isFinished: true };
            }
          }

          const newTimers = {
            ...questionTimersRef.current,
            [prev.currentQuestionIndex]: remaining,
          };
          setQuestionTimers(newTimers);
          return { ...prev, timeRemaining: remaining };
        }

        return prev;
      });
    };

    // Update immediately
    updateTimer();

    // Then update every second
    globalTimerIntervalRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (globalTimerIntervalRef.current) {
        clearInterval(globalTimerIntervalRef.current);
        globalTimerIntervalRef.current = null;
      }
    };
  }, [state.isTimerRunning, state.timerStartedAt, state.isFinished, state.currentQuestionIndex]);

  // Stop timer if no question is selected
  useEffect(() => {
    if (state.currentQuestionIndex === null && state.isTimerRunning) {
      setState((prev) => ({
        ...prev,
        isTimerRunning: false,
      }));
    }
  }, [state.currentQuestionIndex, state.isTimerRunning]);

  // Legacy timer effect - kept for backward compatibility but will be replaced by global timer

  const startExam = useCallback(() => {
    setState({
      currentQuestionIndex: null, // Don't auto-select question
      answers: [],
      isFinished: false,
      startTime: undefined, // Don't set startTime yet - wait for instruction modal "Continue" button
      timeRemaining: PART1_TOTAL_TIME, // Start with Part 1 time
      isTimerRunning: false, // Reset timer flag
      timerStartedAt: undefined, // Reset timer start time
      isLocked: false, // Reset lock flag
      questions: {},
      images: {},
    });
    setQuestionTimers({});
    setPartStartTimes({});
  }, []);

  const setCurrentQuestion = useCallback((index: number | null) => {
    if (index === null) {
      setState((prev) => ({
        ...prev,
        currentQuestionIndex: null,
      }));
      return;
    }

    const targetQ = writingQuestions[index];
    if (!targetQ) return;
    
    setState((prev) => {
      const isNewPart = prev.currentQuestionIndex !== null && 
        prev.currentQuestionIndex !== index && 
        writingQuestions[prev.currentQuestionIndex]?.part !== targetQ.part;
      
      // If transitioning to a new part with timeLimit, initialize timer and start time
      if (targetQ.timeLimit) {
        // Initialize timer if not already set
        if (!questionTimersRef.current[index]) {
          const newTimers = {
            ...questionTimersRef.current,
            [index]: targetQ.timeLimit,
          };
          setQuestionTimers(newTimers);
        }
        
        // Set start time for this question if transitioning to new part and timer is running
        if (prev.isTimerRunning && isNewPart) {
          const now = new Date();
          setPartStartTimes(prevTimes => ({ ...prevTimes, [index]: now }));
        }
      }
      
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

  // Clear question selection (sets to null)
  const clearQuestionSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentQuestionIndex: null,
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
      currentQuestionIndex: null,
      answers: [],
      isFinished: false,
      timeRemaining: PART1_TOTAL_TIME,
      questions: {},
      images: {},
      isTimerRunning: false,
      isLocked: false,
    });
    setQuestionTimers({});
    setPartStartTimes({});
    if (globalTimerIntervalRef.current) {
      clearInterval(globalTimerIntervalRef.current);
      globalTimerIntervalRef.current = null;
    }
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

  // Set part image
  const setPartImage = useCallback((part: number, imageData: string | null) => {
    setState((prev) => {
      const newImages = { ...prev.images };
      if (imageData) {
        newImages[part] = imageData;
      } else {
        delete newImages[part];
      }
      return {
        ...prev,
        images: newImages,
      };
    });
  }, []);

  // Start timer when Continue is clicked
  const startTimer = useCallback(() => {
    const now = new Date();
    setState((prev) => {
      // Initialize start time for current question
      setPartStartTimes(prevTimes => ({ ...prevTimes, [prev.currentQuestionIndex]: now }));
      return {
        ...prev,
        isTimerRunning: true,
        timerStartedAt: now,
        startTime: now,
      };
    });
  }, []);

  // Lock answers when time is up
  const lockAnswers = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLocked: true,
    }));
  }, []);

  // Check if can navigate to a question
  const canNavigateToQuestion = useCallback((index: number): boolean => {
    const targetQ = writingQuestions[index];
    if (!targetQ) return false;
    const currentQ = state.currentQuestionIndex !== null 
      ? writingQuestions[state.currentQuestionIndex]
      : null;
    
    // Q1-5: Can navigate freely
    if (targetQ.questionNumber <= 5) {
      return true;
    }
    
    // Q6: Can navigate from Q1-5 or if already on Q6
    if (targetQ.questionNumber === 6) {
      if (currentQ && currentQ.questionNumber <= 5) {
        return true; // Can navigate from Q1-5 to Q6
      }
      return state.currentQuestionIndex === 5; // Only from Q1-5
    }
    
    // Q7: Only accessible if Q6 has an answer, and cannot go back from Q7 to Q6
    if (targetQ.questionNumber === 7) {
      // Cannot go back from Q7 to Q6
      if (currentQ && currentQ.questionNumber === 7 && targetQ.questionNumber === 6) {
        return false;
      }
      // Only accessible if Q6 has an answer
      const q6Answer = state.answers.find(a => a.questionId === "w6");
      if (!q6Answer || !q6Answer.text.trim()) {
        return false; // Q6 not answered yet
      }
      return true;
    }
    
    // Q8: Can navigate freely
    if (targetQ.questionNumber === 8) {
      return true;
    }
    
    return true;
  }, [state.currentQuestionIndex, state.answers]);

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

  const currentQuestion = 
    state.currentQuestionIndex !== null 
      ? writingQuestions[state.currentQuestionIndex] || null
      : null;

  return (
    <WritingContext.Provider
      value={{
        state,
        currentQuestion,
        startExam,
        setCurrentQuestion,
        clearQuestionSelection,
        saveAnswer,
        updateTimeRemaining,
        finishExam,
        setResults,
        resetExam,
        canNavigateToQuestion,
        getQuestionTimeRemaining,
        setQuestionText,
        setPartImage,
        startTimer,
        lockAnswers,
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
