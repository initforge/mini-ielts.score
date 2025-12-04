"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CheckCircle2, Image as ImageIcon, FileText, HelpCircle } from "lucide-react";
import { useSpeaking } from "@/contexts/SpeakingContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import SpeakingInstructionModal from "./SpeakingInstructionModal";
import QuestionInput from "@/components/writing/QuestionInput";
import CollapsibleImageUpload from "./CollapsibleImageUpload";
import QuestionStepper from "./QuestionStepper";
import AudioRecorder from "./AudioRecorder";
import Timer from "@/components/shared/Timer";
import ProgressBar from "@/components/shared/ProgressBar";
import { speakingQuestions, speakingTexts } from "@/lib/mockData";
import { blobToBase64, cn } from "@/lib/utils";
import Image from "next/image";

export default function SpeakingTab() {
  const {
    state,
    currentQuestion,
    setCurrentQuestion,
    saveAnswer,
    finishExam,
    startExam,
    setQuestionText,
    setQuestionImage,
    startPreparationTimer,
    startResponseTimer,
    lockRecording,
    setStartTime,
    resetTimerState,
  } = useSpeaking();

  const [preparationTime, setPreparationTime] = useState<number | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [isReadingPart4, setIsReadingPart4] = useState(false); // Track Part 4 reading phase
  const [imageError, setImageError] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);
  const [showPart1Instruction, setShowPart1Instruction] = useState(false);
  const [showPart2Instruction, setShowPart2Instruction] = useState(false);
  const [showPart3Instruction, setShowPart3Instruction] = useState(false);
  const [showPart4Instruction, setShowPart4Instruction] = useState(false);
  const [showPart5Instruction, setShowPart5Instruction] = useState(false);
  const [hasUserSelectedQuestion, setHasUserSelectedQuestion] = useState(false);
  const [shownInstructions, setShownInstructions] = useState<Set<number>>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("speaking-shown-instructions");
      if (saved) {
        try {
          return new Set(JSON.parse(saved));
        } catch (e) {
          return new Set();
        }
      }
    }
    return new Set();
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("speaking-shown-instructions", JSON.stringify(Array.from(shownInstructions)));
    }
  }, [shownInstructions]);

  if (state.isFinished && state.results) {
    // Results will be shown by parent component
    return null;
  }

  const progress = state.currentQuestionIndex !== null 
    ? ((state.currentQuestionIndex + 1) / speakingQuestions.length) * 100 
    : 0;
  const canGoNext = state.currentQuestionIndex !== null && state.currentQuestionIndex < speakingQuestions.length - 1;
  const canGoPrev = state.currentQuestionIndex !== null && state.currentQuestionIndex > 0;

  // Reset hasUserSelectedQuestion when question becomes null (tab switch)
  useEffect(() => {
    if (!currentQuestion) {
      setHasUserSelectedQuestion(false);
      // Close all popups
      setShowPart1Instruction(false);
      setShowPart2Instruction(false);
      setShowPart3Instruction(false);
      setShowPart4Instruction(false);
      setShowPart5Instruction(false);
    }
  }, [currentQuestion]);

  // Reset timer states when question changes - MUST run first
  useEffect(() => {
    if (!currentQuestion) return;
    
    // Reset all timer-related states when question changes
    resetTimerState();
    setIsPreparing(false);
    setIsResponding(false);
    setIsReadingPart4(false);
    setPreparationTime(null);
    setResponseTime(null);
  }, [currentQuestion?.id, resetTimerState]);

  // Show instruction modal ONLY when user manually selects a question
  useEffect(() => {
    if (!currentQuestion) return;
    if (!hasUserSelectedQuestion) return; // Only show popup after manual selection
    
    const currentPart = currentQuestion.part;
    
    // Check if we need to show popup for this part
    if (shownInstructions.has(currentPart)) {
      // Already shown, skip
      return;
    }
    
    // Show popup based on part
    switch (currentPart) {
      case 1:
        setShowPart1Instruction(true);
        setShownInstructions(prev => new Set(prev).add(1));
        break;
      case 2:
        // Only show if exam has started (has startTime)
        if (state.startTime) {
          setShowPart2Instruction(true);
          setShownInstructions(prev => new Set(prev).add(2));
        }
        break;
      case 3:
        if (state.startTime) {
          setShowPart3Instruction(true);
          setShownInstructions(prev => new Set(prev).add(3));
        }
        break;
      case 4:
        if (state.startTime) {
          setShowPart4Instruction(true);
          setShownInstructions(prev => new Set(prev).add(4));
        }
        break;
      case 5:
        if (state.startTime) {
          setShowPart5Instruction(true);
          setShownInstructions(prev => new Set(prev).add(5));
        }
        break;
    }
  }, [currentQuestion, hasUserSelectedQuestion, state.startTime, shownInstructions]);

  // Auto-start preparation timer - Priority 2 (only after popup check)
  useEffect(() => {
    if (!currentQuestion) return;
    
    // Don't auto-start if we need to show popup first
    if (!shownInstructions.has(currentQuestion.part)) {
      return;
    }
    
    // Don't auto-start if timers are already running or popup is open
    if (state.preparationTimerStarted || 
        state.responseTimerStarted ||
        showPart1Instruction ||
        showPart2Instruction ||
        showPart3Instruction ||
        showPart4Instruction ||
        showPart5Instruction) {
      return;
    }
    
    // Auto-start preparation timer if question has preparationTime
    if (currentQuestion.preparationTime && currentQuestion.preparationTime > 0) {
      // Special handling for Part 4 Q8: Start reading timer first
      if (currentQuestion.part === 4 && currentQuestion.questionNumber === 8) {
        startPreparationTimer();
        setIsReadingPart4(true);
        setIsPreparing(true);
        setPreparationTime(45); // Reading time for information/image
      } else {
        // For other questions, start normal preparation timer
        startPreparationTimer();
        setIsPreparing(true);
        setPreparationTime(currentQuestion.preparationTime);
      }
    }
  }, [
    currentQuestion, 
    shownInstructions, 
    state.preparationTimerStarted, 
    state.responseTimerStarted,
    showPart1Instruction,
    showPart2Instruction,
    showPart3Instruction,
    showPart4Instruction,
    showPart5Instruction,
    startPreparationTimer
  ]);


  // Lock recording when time expires
  useEffect(() => {
    if (state.isLocked && isResponding) {
      setIsResponding(false);
      setResponseTime(null);
    }
  }, [state.isLocked, isResponding]);

  const handleRecordingComplete = async (audioBlob: Blob, audioBase64: string) => {
    if (!currentQuestion) return; // Safety check
    // TypeScript: currentQuestion is guaranteed to be non-null after this check
    const question = currentQuestion;
    // Use user input question text if available
    const questionText = state.questions?.[question.id] || question.questionText;
    const answer = {
      questionId: question.id,
      questionType: question.part,
      questionText,
      audioBlob,
      audioBase64,
      recordedAt: new Date(),
    };
    saveAnswer(answer);
  };

  const handleNext = () => {
    if (canGoNext && state.currentQuestionIndex !== null) {
      const nextQ = speakingQuestions[state.currentQuestionIndex + 1];
      setCurrentQuestion(state.currentQuestionIndex + 1);
      setHasUserSelectedQuestion(true); // Mark as user navigation
      resetTimerState();
      setIsPreparing(false);
      setIsResponding(false);
      setIsReadingPart4(false);
      setPreparationTime(null);
      setResponseTime(null);
      setImageError(false);
      // Timer will auto-start after popup check in useEffect
    }
  };

  const handlePrev = () => {
    if (canGoPrev && state.currentQuestionIndex !== null) {
      setCurrentQuestion(state.currentQuestionIndex - 1);
      setHasUserSelectedQuestion(true); // Mark as user navigation
      resetTimerState();
      setIsPreparing(false);
      setIsResponding(false);
      setIsReadingPart4(false);
      setPreparationTime(null);
      setResponseTime(null);
      setImageError(false);
    }
  };

  const handleFinish = () => {
    // Check if there are any answers
    if (state.answers.length === 0) {
      setShowNoAnswerModal(true);
      return;
    }
    setShowFinishModal(true);
  };

  const confirmFinish = () => {
      finishExam();
    setShowFinishModal(false);
  };

  // Instruction content for each part
  const part1Instructions = `In this part of the test, you will read aloud the text on the screen. You will have 45 seconds to prepare. Then you will have 45 seconds to read the text aloud.`;

  const part2Instructions = `In this part of the test, you will describe the picture on your screen in as much detail as you can. You will have 30 seconds to prepare your response. Then you will have 30 seconds to speak about the picture.`;

  const part3Instructions = `In this part of the test, you will answer three questions. You will have three seconds to prepare after you hear each question. You will have 15 seconds to respond to Questions 5 and 6, and 15 seconds to respond to Question 7.`;

  const part4Instructions = `In this part of the test, you will answer three questions based on the information provided. You will have 45 seconds to read the information before the questions begin. You will hear Question 10 two times. You will have three seconds to prepare and 30 seconds to respond to Questions 8 and 9. You will have 15 seconds to prepare and 30 seconds to respond to Question 10.`;

  const part5Instructions = `In this part of the test, you will give your opinion about a specific topic. Be sure to say as much as you can in the time allowed. You will have 15 seconds to prepare. Then you will have 60 seconds to speak.`;

  const handleStartPart = () => {
    if (!currentQuestion) return;
    // TypeScript: currentQuestion is guaranteed to be non-null after this check
    const question = currentQuestion;
    
    // Set startTime when starting Part 1 (first time)
    if (question.part === 1 && question.questionNumber === 1 && !state.startTime) {
      setStartTime();
    }
    
    // Start preparation timer based on part
    if (question.part === 1 || question.part === 2 || question.part === 5) {
      // Q1-2, Q3-4, Q11: Start preparation timer
      if (question.preparationTime) {
        startPreparationTimer();
        setIsPreparing(true);
        setPreparationTime(question.preparationTime);
      }
    } else if (question.part === 4 && question.questionNumber === 8) {
      // Q8: Start 45s reading timer first (before questions)
      startPreparationTimer();
      setIsReadingPart4(true);
      setIsPreparing(true);
      setPreparationTime(45); // Reading time for information/image
    } else if (question.part === 3) {
      // Q5-7: Start 3s prep timer immediately
      startPreparationTimer();
      setIsPreparing(true);
      setPreparationTime(3);
    } else if (question.part === 4 && (question.questionNumber === 9 || question.questionNumber === 10)) {
      // Q9-10: Start prep timer (3s for Q9, 15s for Q10)
      if (question.preparationTime) {
        startPreparationTimer();
        setIsPreparing(true);
        setPreparationTime(question.preparationTime);
      }
    }
  };

  // Handle Part 4 reading time completion - auto start Q8 prep timer
  useEffect(() => {
    if (currentQuestion?.part === 4 && 
        currentQuestion.questionNumber === 8 && 
        isReadingPart4 &&
        !isPreparing && 
        preparationTime === 0 && 
        !isResponding) {
      // 45s reading time ended, start Q8 prep timer (3s)
      setIsReadingPart4(false);
      setIsPreparing(true);
      setPreparationTime(3); // Q8 prep time
    }
  }, [currentQuestion, isPreparing, preparationTime, isResponding, isReadingPart4]);

  const startPreparation = () => {
    if (!currentQuestion) return; // Safety check
    // TypeScript: currentQuestion is guaranteed to be non-null after this check
    const question = currentQuestion;
    if (question.preparationTime) {
      startPreparationTimer();
      setIsPreparing(true);
      setPreparationTime(question.preparationTime);
    }
  };

  // Auto start response timer after preparation ends (for all parts)
  useEffect(() => {
    if (!currentQuestion) return;
    
    // For Part 4 Q8, skip if it's the 45s reading time (not prep time)
    if (currentQuestion.part === 4 && 
        currentQuestion.questionNumber === 8 && 
        preparationTime === 0 && 
        !state.preparationTimerStarted) {
      return; // This was the reading time, not prep time
    }
    
    if (!isPreparing && preparationTime === 0 && !isResponding && state.preparationTimerStarted) {
      // Preparation ended, start response timer
      startResponseTimer();
      setIsResponding(true);
      setResponseTime(currentQuestion.responseTime);
    }
  }, [isPreparing, preparationTime, currentQuestion, isResponding, state.preparationTimerStarted, startResponseTimer]);

  // Auto lock when response time expires
  useEffect(() => {
    if (isResponding && responseTime === 0 && !state.isLocked) {
      lockRecording();
      setIsResponding(false);
    }
  }, [isResponding, responseTime, state.isLocked, lockRecording]);

  const currentAnswer = currentQuestion 
    ? state.answers.find((a) => a.questionId === currentQuestion.id)
    : undefined;
  const isAnswered = !!currentAnswer;

  return (
    <div>
      {/* Instruction Modals */}
      <SpeakingInstructionModal
        isOpen={showPart1Instruction}
        title="Questions 1-2: Read a text aloud"
        instructions={part1Instructions}
        onStart={() => {
          setShowPart1Instruction(false);
          handleStartPart();
        }}
      />
      <SpeakingInstructionModal
        isOpen={showPart2Instruction}
        title="Questions 3-4: Describe a picture"
        instructions={part2Instructions}
        onStart={() => {
          setShowPart2Instruction(false);
          handleStartPart();
        }}
      />
      <SpeakingInstructionModal
        isOpen={showPart3Instruction}
        title="Questions 5-7: Respond to questions"
        instructions={part3Instructions}
        onStart={() => {
          setShowPart3Instruction(false);
          handleStartPart();
        }}
      />
      <SpeakingInstructionModal
        isOpen={showPart4Instruction}
        title="Questions 8-10: Respond to questions using information provided"
        instructions={part4Instructions}
        onStart={() => {
          setShowPart4Instruction(false);
          handleStartPart();
        }}
      />
      <SpeakingInstructionModal
        isOpen={showPart5Instruction}
        title="Question 11: Express an opinion"
        instructions={part5Instructions}
        onStart={() => {
          setShowPart5Instruction(false);
          handleStartPart();
        }}
      />

      {/* Other Modals */}
      <Modal
        isOpen={showNoAnswerModal}
        onClose={() => setShowNoAnswerModal(false)}
        title="No Answers Recorded"
        message="Please record at least one answer before finishing the test."
        type="alert"
        confirmText="OK"
      />
      <Modal
        isOpen={showFinishModal}
        onClose={() => setShowFinishModal(false)}
        title="Finish Speaking Test"
        message="Are you sure you want to finish the speaking test? You cannot go back after finishing."
        type="confirm"
        onConfirm={confirmFinish}
        confirmText="Finish"
        cancelText="Cancel"
      />

      {/* Header */}
      <div className="mb-6">
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl font-bold gradient-text tracking-wide">
            TOEIC SPEAKING TEST
          </h2>
          <div className="text-right">
            <div className="text-sm text-slate-700 font-medium">Question</div>
            <div className="text-xl font-bold text-slate-900">
              {state.currentQuestionIndex !== null ? state.currentQuestionIndex + 1 : 0} / {speakingQuestions.length}
            </div>
          </div>
        </div>
        <ProgressBar value={progress} showLabel={false} accent="blue" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Question Stepper */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <Card className="bg-slate-50/95 border border-slate-200 rounded-2xl shadow-sm">
            <CardHeader className="bg-slate-50 rounded-t-2xl border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600" />
                <h3 className="text-lg font-bold text-slate-900">Questions</h3>
              </div>
            </CardHeader>
            <CardContent>
              <QuestionStepper
                currentIndex={state.currentQuestionIndex ?? null}
                onQuestionClick={(index) => {
                  setCurrentQuestion(index);
                  setHasUserSelectedQuestion(true); // Mark that user manually selected
                  // Reset all timer states when manually navigating
                  resetTimerState();
                  setIsPreparing(false);
                  setIsResponding(false);
                  setIsReadingPart4(false);
                  setPreparationTime(null);
                  setResponseTime(null);
                }}
                answers={state.answers}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Question Content & Recording */}
        <div className="lg:col-span-2 space-y-6 order-1 lg:order-2">
          {!currentQuestion ? (
            /* Placeholder when no question selected */
            <Card className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
              <CardContent className="p-12 text-center">
                <p className="text-lg text-slate-600">
                  Vui lòng chọn câu hỏi từ danh sách để bắt đầu
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Question Card */}
              <Card className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
                <CardHeader className="bg-slate-50 border-b border-slate-200 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Part {currentQuestion.part} - Question {currentQuestion.questionNumber}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">
                        {isReadingPart4 
                          ? "Read the information above. Questions will begin after reading time." 
                          : (state.questions?.[currentQuestion.id] || currentQuestion.questionText)}
                      </h3>
                    </div>
                    {isAnswered && (
                      <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
              {/* Question Input - User can paste question text (hide during Part 4 reading time) */}
              {!isReadingPart4 && (
                <QuestionInput
                  questionId={currentQuestion.id}
                  value={state.questions?.[currentQuestion.id] || ""}
                  onChange={(text) => setQuestionText(currentQuestion.id, text)}
                  placeholder="Paste your question here..."
                />
              )}

              {/* Part 1 (Q1-2): Display user's text or default */}
              {currentQuestion.part === 1 && (
                <Card className="bg-slate-50 border border-slate-200">
                  <CardContent className="p-4">
                    <p className="text-slate-900 leading-relaxed">
                      {state.questions?.[currentQuestion.id] || speakingTexts[currentQuestion.id] || "Sample text to read aloud..."}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Part 2 (Q3-4): Image Upload - Separate for Q3 and Q4 */}
              {currentQuestion.part === 2 && currentQuestion.questionNumber === 3 && (
                <CollapsibleImageUpload
                  part={2}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q3)"
                />
              )}
              {currentQuestion.part === 2 && currentQuestion.questionNumber === 4 && (
                <CollapsibleImageUpload
                  part={2}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q4)"
                />
              )}


              {/* Part 4 (Q8-10): Shared Image Upload - Show on all Q8-10 */}
              {currentQuestion.part === 4 && (
                <CollapsibleImageUpload
                  part={4}
                  value={state.images?.["part4"]}
                  onChange={(imageData) => {
                    // Store as "part4" key for shared image across Q8-10
                    setQuestionImage("part4", imageData);
                  }}
                  label="Upload Image (for Q8-10)"
                />
              )}

              {/* Display shared image for Part 4 (Q8, Q9, Q10) */}
              {currentQuestion.part === 4 && state.images?.["part4"] && (
                <Card className="bg-slate-50 border border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="h-4 w-4 text-slate-600" />
                      <label className="text-sm font-semibold text-slate-900">
                        Information (for Q8-10)
                      </label>
                    </div>
                    <div className="relative h-64 w-full overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">
                      <Image
                        src={state.images["part4"]}
                        alt="Question image"
                        fill
                        className="object-contain"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Display user's question text if available (hide during Part 4 reading time) */}
              {!isReadingPart4 && state.questions?.[currentQuestion.id] && (
                <Card className="bg-blue-50 border border-blue-200">
                  <CardContent className="p-4">
                    <div className="mb-2 text-sm font-semibold text-slate-900">Question:</div>
                    <div className="whitespace-pre-wrap text-slate-700">
                      {state.questions[currentQuestion.id]}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Preparation Timer / Reading Time */}
              {isPreparing && preparationTime !== null && (
                <div className="flex flex-col items-center gap-4">
                  <div className="text-center">
                    <p className="mb-2 text-slate-900">
                      {isReadingPart4 
                        ? "Reading Time (Read the information above)" 
                        : "Preparation Time"}
                    </p>
                    <Timer
                      initialSeconds={preparationTime}
                      onComplete={() => {
                        setIsPreparing(false);
                        setPreparationTime(0);
                      }}
                      onTick={(remaining) => {
                        setPreparationTime(remaining);
                      }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recording Card */}
          {(!isPreparing || preparationTime === 0) && !isReadingPart4 && (
            <Card className={cn(
              "bg-slate-50 rounded-2xl border border-slate-200 shadow-sm",
              state.isLocked && "opacity-75"
            )}>
              <CardHeader className="bg-slate-50 border-b border-slate-200 rounded-t-2xl">
                <h3 className="text-lg font-bold text-slate-900">Your Response</h3>
                {!state.isLocked && (
                  <p className="text-sm text-slate-700">
                    You have {currentQuestion.responseTime} seconds to respond.
                  </p>
                )}
                {state.isLocked && (
                  <p className="text-sm text-red-600 font-medium">
                    Time expired - Recording is locked
                  </p>
                )}
              </CardHeader>
              <CardContent className="pt-6">
                {/* Response Timer */}
                {isResponding && responseTime !== null && !state.isLocked && (
                  <div className="flex justify-center mb-4">
                    <Timer
                      initialSeconds={responseTime}
                      onComplete={() => {
                        lockRecording();
                        setIsResponding(false);
                        setResponseTime(null);
                      }}
                      onTick={(remaining) => {
                        setResponseTime(remaining);
                      }}
                      showWarning={true}
                      warningThreshold={10}
                    />
                  </div>
                )}
                <AudioRecorder
                  maxDuration={currentQuestion.responseTime}
                  onRecordingComplete={handleRecordingComplete}
                  disabled={isPreparing || state.isLocked}
                  isLocked={state.isLocked}
                />
              </CardContent>
            </Card>
          )}

              {/* Navigation */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={handlePrev}
                  disabled={!canGoPrev}
                  className="gap-2 flex-1 sm:flex-initial border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400"
                >
                  <ChevronLeft className="h-4 w-4 text-slate-900" />
                  Previous
                </Button>

                <Button
                  variant="default"
                  onClick={handleFinish}
                  className="gap-2 flex-1 sm:flex-initial"
                >
                  Finish Test
                </Button>

                <Button
                  variant="outline"
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className="gap-2 flex-1 sm:flex-initial border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400"
                >
                  Next
                  <ChevronRight className="h-4 w-4 text-slate-900" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
