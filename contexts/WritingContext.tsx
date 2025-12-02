"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { WritingExamState, WritingAnswer, WritingGradingResponse } from "@/lib/types";
import { writingQuestions } from "@/lib/mockData";

interface WritingContextType {
  state: WritingExamState;
  currentQuestion: typeof writingQuestions[0] | null;
  startExam: () => void;
  startPart: (part: WritingPart) => void;
  setCurrentQuestion: (index: number) => void;
  saveAnswer: (answer: WritingAnswer) => void;
  updateTimeRemaining: (seconds: number) => void;
  finishExam: () => void;
  setResults: (results: WritingGradingResponse) => void;
  resetExam: () => void;
  markDirectionPlayed: (part: WritingPart) => void;
}

const WritingContext = createContext<WritingContextType | undefined>(undefined);

const STORAGE_KEY = "toeic-writing-exam-state";
const PART1_DURATION = 5 * 60; // 5 minutes for questions 1-5
const PART2_Q6_DURATION = 10 * 60; // 10 minutes for question 6
const PART2_Q7_DURATION = 10 * 60; // 10 minutes for question 7
const PART3_Q8_DURATION = 30 * 60; // 30 minutes for question 8

export function WritingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WritingExamState>({
    currentQuestionIndex: 0,
    answers: [],
    isFinished: false,
    timeRemaining: 0,
    part1TimeRemaining: PART1_DURATION,
    part2Question6TimeRemaining: PART2_Q6_DURATION,
    part2Question7TimeRemaining: PART2_Q7_DURATION,
    part3Question8TimeRemaining: PART3_Q8_DURATION,
    partDirectionsPlayed: {
      1: false,
      2: false,
      3: false,
    },
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

  // Timer effect - handles different timers for different parts
  useEffect(() => {
    if (state.isFinished || !state.currentPartStarted) return;

    const interval = setInterval(() => {
      setState((prev) => {
        const currentQ = writingQuestions[prev.currentQuestionIndex];
        if (!currentQ) return prev;

        let updated = { ...prev };

        // Handle Part 1 timer (questions 1-5)
        if (currentQ.part === 1 && prev.part1TimeRemaining !== undefined) {
          if (prev.part1TimeRemaining <= 1) {
            return { ...prev, isFinished: true, part1TimeRemaining: 0 };
          }
          updated.part1TimeRemaining = prev.part1TimeRemaining - 1;
          updated.timeRemaining = updated.part1TimeRemaining;
        }
        // Handle Part 2 Question 6 timer
        else if (currentQ.id === "w6" && prev.part2Question6TimeRemaining !== undefined) {
          if (prev.part2Question6TimeRemaining <= 1) {
            return { ...prev, isFinished: true, part2Question6TimeRemaining: 0 };
          }
          updated.part2Question6TimeRemaining = prev.part2Question6TimeRemaining - 1;
          updated.timeRemaining = updated.part2Question6TimeRemaining;
        }
        // Handle Part 2 Question 7 timer
        else if (currentQ.id === "w7" && prev.part2Question7TimeRemaining !== undefined) {
          if (prev.part2Question7TimeRemaining <= 1) {
            return { ...prev, isFinished: true, part2Question7TimeRemaining: 0 };
          }
          updated.part2Question7TimeRemaining = prev.part2Question7TimeRemaining - 1;
          updated.timeRemaining = updated.part2Question7TimeRemaining;
        }
        // Handle Part 3 Question 8 timer
        else if (currentQ.id === "w8" && prev.part3Question8TimeRemaining !== undefined) {
          if (prev.part3Question8TimeRemaining <= 1) {
            return { ...prev, isFinished: true, part3Question8TimeRemaining: 0 };
          }
          updated.part3Question8TimeRemaining = prev.part3Question8TimeRemaining - 1;
          updated.timeRemaining = updated.part3Question8TimeRemaining;
        }

        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isFinished, state.currentPartStarted, state.currentQuestionIndex]);

  const startExam = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentQuestionIndex: 0,
      answers: [],
      isFinished: false,
      startTime: new Date(),
      timeRemaining: PART1_DURATION,
      part1TimeRemaining: PART1_DURATION,
      part2Question6TimeRemaining: PART2_Q6_DURATION,
      part2Question7TimeRemaining: PART2_Q7_DURATION,
      part3Question8TimeRemaining: PART3_Q8_DURATION,
      currentPartStarted: undefined,
      partDirectionsPlayed: {
        1: false,
        2: false,
        3: false,
      },
    }));
  }, []);

  const startPart = useCallback((part: WritingPart) => {
    setState((prev) => {
      const updated = { ...prev, currentPartStarted: part };
      const currentQ = writingQuestions[prev.currentQuestionIndex];
      
      if (part === 1) {
        updated.part1TimeRemaining = PART1_DURATION;
        updated.timeRemaining = PART1_DURATION;
      } else if (part === 2) {
        // Part 2 has two questions with separate timers
        if (currentQ?.id === "w6") {
          updated.part2Question6TimeRemaining = PART2_Q6_DURATION;
          updated.timeRemaining = PART2_Q6_DURATION;
        } else if (currentQ?.id === "w7") {
          updated.part2Question7TimeRemaining = PART2_Q7_DURATION;
          updated.timeRemaining = PART2_Q7_DURATION;
        }
      } else if (part === 3 && currentQ?.id === "w8") {
        updated.part3Question8TimeRemaining = PART3_Q8_DURATION;
        updated.timeRemaining = PART3_Q8_DURATION;
      }
      
      return updated;
    });
  }, []);

  const setCurrentQuestion = useCallback((index: number) => {
    setState((prev) => {
      const newIndex = Math.max(0, Math.min(index, writingQuestions.length - 1));
      const newQuestion = writingQuestions[newIndex];
      const currentQ = writingQuestions[prev.currentQuestionIndex];
      
      // Check if navigation is allowed
      // Questions 1-5 can navigate freely
      // Question 6-7 cannot go back, question 7 cannot go back to 6
      if (currentQ && newQuestion) {
        // If trying to go from question 7 back to 6, block it
        if (currentQ.id === "w7" && newQuestion.id === "w6") {
          return prev;
        }
        // If trying to go from question 6 back to previous questions, block it
        if (currentQ.id === "w6" && newQuestion.questionNumber < 6) {
          return prev;
        }
        // If trying to go from question 7 back to previous questions, block it
        if (currentQ.id === "w7" && newQuestion.questionNumber < 7) {
          return prev;
        }
      }
      
      // Update timer based on new question
      let updated = {
        ...prev,
        currentQuestionIndex: newIndex,
      };
      
      if (newQuestion.part === 1 && updated.part1TimeRemaining !== undefined) {
        updated.timeRemaining = updated.part1TimeRemaining;
      } else if (newQuestion.id === "w6" && updated.part2Question6TimeRemaining !== undefined) {
        updated.timeRemaining = updated.part2Question6TimeRemaining;
      } else if (newQuestion.id === "w7" && updated.part2Question7TimeRemaining !== undefined) {
        updated.timeRemaining = updated.part2Question7TimeRemaining;
      } else if (newQuestion.id === "w8" && updated.part3Question8TimeRemaining !== undefined) {
        updated.timeRemaining = updated.part3Question8TimeRemaining;
      }
      
      return updated;
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
      timeRemaining: 0,
      part1TimeRemaining: PART1_DURATION,
      part2Question6TimeRemaining: PART2_Q6_DURATION,
      part2Question7TimeRemaining: PART2_Q7_DURATION,
      part3Question8TimeRemaining: PART3_Q8_DURATION,
      partDirectionsPlayed: {
        1: false,
        2: false,
        3: false,
      },
    });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const markDirectionPlayed = useCallback((part: WritingPart) => {
    setState((prev) => ({
      ...prev,
      partDirectionsPlayed: {
        ...prev.partDirectionsPlayed,
        [part]: true,
      },
    }));
  }, []);

  const currentQuestion = writingQuestions[state.currentQuestionIndex] || null;

  return (
    <WritingContext.Provider
      value={{
        state,
        currentQuestion,
        startExam,
        startPart,
        setCurrentQuestion,
        saveAnswer,
        updateTimeRemaining,
        finishExam,
        setResults,
        resetExam,
        markDirectionPlayed,
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
