import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { WritingExamState, WritingAnswer, WritingGradingResponse } from "@/lib/types";
import { writingQuestions } from "@/lib/mockData";

interface WritingContextType {
  state: WritingExamState;
  currentQuestion: typeof writingQuestions[0] | null;
  selectedQuestionIds: string[];
  setSelectedQuestionIds: (ids: string[]) => void;
  filteredQuestions: typeof writingQuestions;
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
  setQuestionImage: (questionId: string, imageData: string | null) => void;
  startTimer: () => void;
  lockAnswers: () => void;
  finishPart: () => void;
  activePart: number | null;
  shouldShowInstruction: (part: number) => boolean;
  markInstructionShown: (part: number) => void;
}

const WritingContext = createContext<WritingContextType | undefined>(undefined);

const STORAGE_KEY = "toeic-writing-exam-state";
const INSTRUCTIONS_KEY = "toeic-writing-shown-instructions";
const PART1_TOTAL_TIME = 5 * 60; // 5 minutes for questions 1-5
const PART2_QUESTION_TIME = 10 * 60; // 10 minutes per question for Part 2 (Q6, Q7)
const PART3_TOTAL_TIME = 30 * 60; // 30 minutes for Part 3 (Q8)

export function WritingProvider({ children }: { children: React.ReactNode }) {
  const [selectedQuestionIds, setSelectedQuestionIdsState] = useState<string[]>(
    writingQuestions.map((q) => q.id)
  );

  const [state, setState] = useState<WritingExamState>({
    currentQuestionIndex: null,
    answers: [],
    isFinished: false,
    timeRemaining: PART1_TOTAL_TIME,
    questions: {},
    images: {},
    isTimerRunning: false,
    isLocked: false,
  });

  // Filter questions based on selected question IDs
  const filteredQuestions = writingQuestions.filter((q) => selectedQuestionIds.includes(q.id));

  const setSelectedQuestionIds = useCallback((ids: string[]) => {
    setSelectedQuestionIdsState(ids);
    // Reset exam state when questions change
    setState((prev) => ({
      ...prev,
      currentQuestionIndex: null,
      answers: [],
      isFinished: false,
      questions: {},
      images: {},
    }));
  }, []);

  // Track active part - lock navigation to other parts when active
  // IMPORTANT: activePart is ONLY set when user clicks Continue (in startTimer)
  // When activePart is null, users can select ANY question
  const [activePart, setActivePart] = useState<number | null>(null);

  // Track which instructions have been shown (persist across reloads)
  const [shownInstructions, setShownInstructions] = useState<Set<number>>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(INSTRUCTIONS_KEY);
      if (saved) {
        try {
          return new Set(JSON.parse(saved));
        } catch {
          return new Set();
        }
      }
    }
    return new Set();
  });

  // Track when each part/question timer started
  const partStartTimesRef = useRef<Record<number, Date>>({});
  const partTimerStartTimesRef = useRef<Record<number, Date>>({});
  
  // Global timer interval ref
  const globalTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Save shown instructions to sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(INSTRUCTIONS_KEY, JSON.stringify(Array.from(shownInstructions)));
    }
  }, [shownInstructions]);

  // On fresh load, always treat Writing as a new session:
  // - clear persisted exam state & instruction flags
  // - reset timers and navigation so instruction popups will show again.
  useEffect(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(INSTRUCTIONS_KEY);
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
        setActivePart(null);
    setShownInstructions(new Set());
    partStartTimesRef.current = {};
    partTimerStartTimesRef.current = {};
    if (globalTimerIntervalRef.current) {
      clearInterval(globalTimerIntervalRef.current);
      globalTimerIntervalRef.current = null;
    }
  }, []);

  // Save to sessionStorage whenever state changes
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Global timer that runs continuously
  useEffect(() => {
    if (!state.isTimerRunning || !state.timerStartedAt || state.isFinished || state.currentQuestionIndex === null) {
      if (globalTimerIntervalRef.current) {
        clearInterval(globalTimerIntervalRef.current);
        globalTimerIntervalRef.current = null;
      }
      return;
    }

    const updateTimer = () => {
      setState((prev) => {
        if (!prev.timerStartedAt || prev.currentQuestionIndex === null) return prev;
        
        const currentQ = writingQuestions[prev.currentQuestionIndex];
        if (!currentQ) return prev;

        const now = new Date();

        // Part 1 (Q1-5): Shared 5-minute timer
        if (currentQ.part === 1) {
          const part1StartTime = partTimerStartTimesRef.current[1];
          if (!part1StartTime) {
            partTimerStartTimesRef.current[1] = now;
            return { ...prev, timeRemaining: PART1_TOTAL_TIME };
          }
          
          const part1Elapsed = Math.floor((now.getTime() - part1StartTime.getTime()) / 1000);
          const remaining = PART1_TOTAL_TIME - part1Elapsed;
          if (remaining <= 0) {
            return { ...prev, timeRemaining: 0, isLocked: true, isFinished: true };
          }
          return { ...prev, timeRemaining: remaining };
        }

        // Part 2 (Q6, Q7): Each question has 10 minutes timer
        if (currentQ.part === 2) {
          const questionStartTime = partStartTimesRef.current[prev.currentQuestionIndex];
          if (!questionStartTime) {
            partStartTimesRef.current[prev.currentQuestionIndex] = now;
            return { ...prev, timeRemaining: PART2_QUESTION_TIME };
          }
          
          const questionElapsed = Math.floor((now.getTime() - questionStartTime.getTime()) / 1000);
          const remaining = PART2_QUESTION_TIME - questionElapsed;
          
          if (remaining <= 0) {
            // Auto move to next question or finish
            if (currentQ.questionNumber === 6 && prev.currentQuestionIndex < writingQuestions.length - 1) {
              partStartTimesRef.current[prev.currentQuestionIndex + 1] = now;
              return {
                ...prev,
                currentQuestionIndex: prev.currentQuestionIndex + 1,
                timeRemaining: PART2_QUESTION_TIME,
              };
            } else {
              return { ...prev, timeRemaining: 0, isLocked: true, isFinished: true };
            }
          }

          return { ...prev, timeRemaining: remaining };
        }

        // Part 3 (Q8): 30-minute timer
        if (currentQ.part === 3) {
          const part3StartTime = partTimerStartTimesRef.current[3];
          if (!part3StartTime) {
            partTimerStartTimesRef.current[3] = now;
            return { ...prev, timeRemaining: PART3_TOTAL_TIME };
          }
          
          const part3Elapsed = Math.floor((now.getTime() - part3StartTime.getTime()) / 1000);
          const remaining = PART3_TOTAL_TIME - part3Elapsed;
          if (remaining <= 0) {
            return { ...prev, timeRemaining: 0, isLocked: true, isFinished: true };
          }
          return { ...prev, timeRemaining: remaining };
        }

        return prev;
      });
    };

    updateTimer();
    globalTimerIntervalRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (globalTimerIntervalRef.current) {
        clearInterval(globalTimerIntervalRef.current);
        globalTimerIntervalRef.current = null;
      }
    };
  }, [state.isTimerRunning, state.timerStartedAt, state.isFinished, state.currentQuestionIndex]);

  const startExam = useCallback(() => {
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
    setActivePart(null);
    partStartTimesRef.current = {};
    partTimerStartTimesRef.current = {};
    setShownInstructions(new Set());
    sessionStorage.removeItem(INSTRUCTIONS_KEY);
  }, []);

  const setCurrentQuestion = useCallback((index: number | null) => {
    if (index === null) {
      setState((prev) => ({
        ...prev,
        currentQuestionIndex: null,
      }));
      return;
    }

    const targetQ = filteredQuestions[index];
    if (!targetQ) return;
    
    setState((prev) => {
      const isNewPart = prev.currentQuestionIndex !== null && 
        prev.currentQuestionIndex !== index && 
        filteredQuestions[prev.currentQuestionIndex]?.part !== targetQ.part;
      
      // If transitioning to a new part, set timer value but don't start timer yet
      if (isNewPart) {
        let timerValue = 0;
        if (targetQ.part === 1) {
          timerValue = PART1_TOTAL_TIME;
        } else if (targetQ.part === 2) {
          timerValue = PART2_QUESTION_TIME;
        } else if (targetQ.part === 3) {
          timerValue = PART3_TOTAL_TIME;
        }
        
        return {
          ...prev,
          currentQuestionIndex: index,
          timeRemaining: timerValue,
          isTimerRunning: false, // Don't start timer yet, wait for Continue button
          isLocked: false,
        };
      }
      
      // Same part or first question - calculate timer value
      const now = new Date();
      let timerValue = prev.timeRemaining;
      
      if (targetQ.part === 1) {
        const part1StartTime = partTimerStartTimesRef.current[1];
        if (part1StartTime && prev.isTimerRunning) {
          const part1Elapsed = Math.floor((now.getTime() - part1StartTime.getTime()) / 1000);
          timerValue = Math.max(0, PART1_TOTAL_TIME - part1Elapsed);
        } else {
          timerValue = PART1_TOTAL_TIME;
        }
      } else if (targetQ.part === 2) {
        const questionStartTime = partStartTimesRef.current[index];
        if (questionStartTime && prev.isTimerRunning) {
          const questionElapsed = Math.floor((now.getTime() - questionStartTime.getTime()) / 1000);
          timerValue = Math.max(0, PART2_QUESTION_TIME - questionElapsed);
        } else {
          timerValue = PART2_QUESTION_TIME;
        }
      } else if (targetQ.part === 3) {
        const part3StartTime = partTimerStartTimesRef.current[3];
        if (part3StartTime && prev.isTimerRunning) {
          const part3Elapsed = Math.floor((now.getTime() - part3StartTime.getTime()) / 1000);
          timerValue = Math.max(0, PART3_TOTAL_TIME - part3Elapsed);
        } else {
          timerValue = PART3_TOTAL_TIME;
        }
      }
      
      return {
        ...prev,
        currentQuestionIndex: index,
        timeRemaining: timerValue,
      };
    });
  }, []);

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
    // Reset selected questions to default (all questions)
    setSelectedQuestionIdsState(writingQuestions.map((q) => q.id));
    
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
    setActivePart(null);
    partStartTimesRef.current = {};
    partTimerStartTimesRef.current = {};
    setShownInstructions(new Set());
    if (globalTimerIntervalRef.current) {
      clearInterval(globalTimerIntervalRef.current);
      globalTimerIntervalRef.current = null;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(INSTRUCTIONS_KEY);
  }, []);

  const setQuestionText = useCallback((questionId: string, text: string) => {
    setState((prev) => ({
      ...prev,
      questions: {
        ...prev.questions,
        [questionId]: text,
      },
    }));
  }, []);

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

  const setQuestionImage = useCallback((questionId: string, imageData: string | null) => {
    setState((prev) => {
      const newImages: Record<string, string> = { ...prev.images };
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

  // Start timer when Continue is clicked in instruction modal
  // This is the ONLY place where activePart is set, locking navigation to other parts
  const startTimer = useCallback(() => {
    const now = new Date();
    setState((prev) => {
      if (prev.currentQuestionIndex === null) return prev;
      
      const currentQ = writingQuestions[prev.currentQuestionIndex];
      if (!currentQ) return prev;

      // CRITICAL: Set active part ONLY when user clicks Continue
      // This locks navigation to other parts
      setActivePart(currentQ.part);
      
      // Start timer for current part
      if (currentQ.part === 1) {
        if (!partTimerStartTimesRef.current[1]) {
          partTimerStartTimesRef.current[1] = now;
        }
      } else if (currentQ.part === 2) {
        if (!partStartTimesRef.current[prev.currentQuestionIndex]) {
          partStartTimesRef.current[prev.currentQuestionIndex] = now;
        }
      } else if (currentQ.part === 3) {
        if (!partTimerStartTimesRef.current[3]) {
          partTimerStartTimesRef.current[3] = now;
        }
      }

      return {
        ...prev,
        isTimerRunning: true,
        timerStartedAt: now,
        startTime: now,
      };
    });
  }, []);

  const lockAnswers = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLocked: true,
    }));
  }, []);

  // Finish current part and unlock navigation to other parts
  const finishPart = useCallback(() => {
    setActivePart(null);
  }, []);

  // Check if can navigate to a question
  const canNavigateToQuestion = useCallback((index: number): boolean => {
    const targetQ = writingQuestions[index];
    if (!targetQ) return false;
    
    // CRITICAL: When no active part (chưa bấm Continue), allow selecting ANY question
    // This allows users to freely choose any question when first entering
    if (activePart === null) {
      return true;
    }
    
    // If there's an active part (đã bấm Continue), only allow navigation within that part
    // This locks navigation to other parts once user has started a part
    return targetQ.part === activePart;
  }, [activePart]);

  // Get time remaining for a specific question
  const getQuestionTimeRemaining = useCallback((questionIndex: number) => {
    const question = writingQuestions[questionIndex];
    if (!question) return null;
    
    if (question.part === 1) {
      return state.timeRemaining;
    } else if (question.part === 2) {
      const questionStartTime = partStartTimesRef.current[questionIndex];
      if (questionStartTime && state.isTimerRunning) {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - questionStartTime.getTime()) / 1000);
        return Math.max(0, PART2_QUESTION_TIME - elapsed);
      }
      return PART2_QUESTION_TIME;
    } else if (question.part === 3) {
      return state.timeRemaining;
    }
    
    return null;
  }, [state.timeRemaining, state.isTimerRunning]);

  // Check if should show instruction for a part
  const shouldShowInstruction = useCallback((part: number): boolean => {
    if (state.currentQuestionIndex === null) return false;
    const currentQ = writingQuestions[state.currentQuestionIndex];
    if (!currentQ || currentQ.part !== part) return false;
    if (shownInstructions.has(part)) return false;
    if (state.isTimerRunning) return false;
    return true;
  }, [state.currentQuestionIndex, state.isTimerRunning, shownInstructions]);

  // Mark instruction as shown
  const markInstructionShown = useCallback((part: number) => {
    setShownInstructions(prev => new Set(prev).add(part));
  }, []);

  const currentQuestion = 
    state.currentQuestionIndex !== null 
      ? filteredQuestions[state.currentQuestionIndex] || null
      : null;

  return (
    <WritingContext.Provider
      value={{
        state,
        currentQuestion,
        selectedQuestionIds,
        setSelectedQuestionIds,
        filteredQuestions,
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
        setQuestionImage,
        startTimer,
        lockAnswers,
        finishPart,
        activePart,
        shouldShowInstruction,
        markInstructionShown,
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
