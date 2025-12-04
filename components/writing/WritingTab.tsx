"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CheckCircle2, Image as ImageIcon, Clock, FileText, HelpCircle } from "lucide-react";
import { useWriting } from "@/contexts/WritingContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import InstructionModal from "./InstructionModal";
import QuestionInput from "./QuestionInput";
import ImageUpload from "./ImageUpload";
import QuestionNavigator from "./QuestionNavigator";
import WordCountEditor from "./WordCountEditor";
import Timer from "@/components/shared/Timer";
import ProgressBar from "@/components/shared/ProgressBar";
import { writingQuestions } from "@/lib/mockData";
import { countWords, cn } from "@/lib/utils";
import Image from "next/image";
import { QuestionStatus } from "@/lib/types";

export default function WritingTab() {
  const {
    state,
    currentQuestion,
    setCurrentQuestion,
    saveAnswer,
    finishExam,
    startExam,
    canNavigateToQuestion,
    getQuestionTimeRemaining,
    setQuestionText,
    setPartImage,
    startTimer,
    lockAnswers,
  } = useWriting();

  const [currentText, setCurrentText] = useState("");
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionStatus>>({});
  const [imageError, setImageError] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [navigationMessage, setNavigationMessage] = useState("");
  const [showPart1Instruction, setShowPart1Instruction] = useState(false);
  const [showPart2Instruction, setShowPart2Instruction] = useState(false);
  const [showPart3Instruction, setShowPart3Instruction] = useState(false);
  const [showPartTransitionModal, setShowPartTransitionModal] = useState(false);
  const [pendingNextPart, setPendingNextPart] = useState<number | null>(null);
  const [hasUserSelectedQuestion, setHasUserSelectedQuestion] = useState(false);

  // Load current answer
  useEffect(() => {
    if (currentQuestion) {
      const saved = state.answers.find((a) => a.questionId === currentQuestion.id);
      if (saved) {
        setCurrentText(saved.text);
      } else {
        setCurrentText("");
      }
      // Reset image error when question changes
      setImageError(false);
    }
  }, [currentQuestion, state.answers]);

  // Track which instruction modals have been shown (persist in sessionStorage)
  const [shownInstructions, setShownInstructions] = useState<Set<number>>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("writing-shown-instructions");
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
      sessionStorage.setItem("writing-shown-instructions", JSON.stringify(Array.from(shownInstructions)));
    }
  }, [shownInstructions]);

  // Reset hasUserSelectedQuestion when question becomes null (tab switch)
  useEffect(() => {
    if (!currentQuestion) {
      setHasUserSelectedQuestion(false);
      // Close all popups
      setShowPart1Instruction(false);
      setShowPart2Instruction(false);
      setShowPart3Instruction(false);
    }
  }, [currentQuestion]);

  // Show instruction modal ONLY when user manually selects a question
  useEffect(() => {
    if (!currentQuestion) return;
    if (!hasUserSelectedQuestion) return; // Only show popup after manual selection
    
    // Show Part 1 instruction when selecting any Q1-5 for the first time
    if (currentQuestion.part === 1 && !shownInstructions.has(1)) {
      if (!state.isTimerRunning) {
        setShowPart1Instruction(true);
        setShownInstructions(prev => new Set(prev).add(1));
      }
    }
    
    // Show Part 2 instruction when first entering Q6 (before timer starts for Q6)
    if (currentQuestion.part === 2 && currentQuestion.questionNumber === 6 && !shownInstructions.has(2)) {
      // Check if Q6 timer hasn't started (still at full time or null)
      if (state.currentQuestionIndex !== null) {
        const q6Timer = getQuestionTimeRemaining(state.currentQuestionIndex);
        if (q6Timer === null || (currentQuestion.timeLimit && q6Timer >= currentQuestion.timeLimit - 1)) {
          setShowPart2Instruction(true);
          setShownInstructions(prev => new Set(prev).add(2));
        }
      }
    }
    // Show Part 3 instruction when first entering Q8 (before timer starts for Q8)
    else if (currentQuestion.part === 3 && currentQuestion.questionNumber === 8 && !shownInstructions.has(3)) {
      if (state.currentQuestionIndex !== null) {
        const q8Timer = getQuestionTimeRemaining(state.currentQuestionIndex);
        if (q8Timer === null || (currentQuestion.timeLimit && q8Timer >= currentQuestion.timeLimit - 1)) {
          setShowPart3Instruction(true);
          setShownInstructions(prev => new Set(prev).add(3));
        }
      }
    }
  }, [currentQuestion, hasUserSelectedQuestion, state.isTimerRunning, state.currentQuestionIndex, shownInstructions, getQuestionTimeRemaining]);

  // Update question statuses (removed minWords check)
  useEffect(() => {
    const statuses: Record<string, QuestionStatus> = {};
    writingQuestions.forEach((q) => {
      const answer = state.answers.find((a) => a.questionId === q.id);
      if (answer && answer.text.trim().length > 0) {
        statuses[q.id] = "completed";
      } else {
        statuses[q.id] = "not-started";
      }
    });
    setQuestionStatuses(statuses);
  }, [state.answers]);

  // Lock answers when time is up
  useEffect(() => {
    if (state.timeRemaining <= 0 && !state.isLocked && state.isTimerRunning) {
      lockAnswers();
    }
  }, [state.timeRemaining, state.isLocked, state.isTimerRunning, lockAnswers]);

  if (state.isFinished && state.results) {
    // Results will be shown by parent component
    return null;
  }

  const progress = state.currentQuestionIndex !== null 
    ? ((state.currentQuestionIndex + 1) / writingQuestions.length) * 100 
    : 0;
  
  // Calculate time progress based on current question
  const currentQ = currentQuestion;
  let timeProgress = 0;
  if (currentQ) {
    if (currentQ.questionNumber <= 5) {
      // Part 1: 5 minutes total
      timeProgress = ((5 * 60 - state.timeRemaining) / (5 * 60)) * 100;
    } else if (currentQ.timeLimit && state.currentQuestionIndex !== null) {
      const questionTime = getQuestionTimeRemaining(state.currentQuestionIndex);
      if (questionTime !== null) {
        timeProgress = ((currentQ.timeLimit - questionTime) / currentQ.timeLimit) * 100;
      }
    }
  }
  
  // Navigation logic - Allow free navigation
  const canGoNext = state.currentQuestionIndex !== null && state.currentQuestionIndex < writingQuestions.length - 1;
  const canGoPrev = state.currentQuestionIndex !== null && state.currentQuestionIndex > 0;

  const handleTextChange = (text: string) => {
    if (state.isLocked || !currentQuestion) return; // Don't allow changes when locked or no question
    setCurrentText(text);
    const wordCount = countWords(text);
    // Use user input question text if available, otherwise use default
    const questionText = state.questions?.[currentQuestion.id] || currentQuestion.questionText;
    const answer = {
      questionId: currentQuestion.id,
      questionType: currentQuestion.part,
      questionText,
      text,
      wordCount,
    };
    saveAnswer(answer);
  };

  const handleQuestionTextChange = (text: string) => {
    if (!currentQuestion) return;
    setQuestionText(currentQuestion.id, text);
  };

  const handleNext = () => {
    if (!canGoNext || state.currentQuestionIndex === null) return;
    
    const nextIndex = state.currentQuestionIndex + 1;
    const nextQ = writingQuestions[nextIndex];
    
    // Check if transitioning between parts
    if (currentQ && nextQ && currentQ.part !== nextQ.part) {
      // Show transition confirmation modal
      setPendingNextPart(nextIndex);
      setShowPartTransitionModal(true);
      return;
    }
    
    // Allow free navigation - no need to check completion
    setCurrentQuestion(nextIndex);
    setHasUserSelectedQuestion(true); // Mark as user navigation
  };


  const handlePrev = () => {
    if (!canGoPrev || state.currentQuestionIndex === null) return;
    setCurrentQuestion(state.currentQuestionIndex - 1);
    setHasUserSelectedQuestion(true); // Mark as user navigation
  };

  const handleFinish = () => {
    // Check if there are any answers
    if (state.answers.length === 0) {
      setShowNoAnswerModal(true);
        return;
      }

    // No minimum word count validation - allow finish regardless
    setShowFinishModal(true);
  };

  const confirmFinish = () => {
    finishExam();
    setShowFinishModal(false);
  };

  const handlePartTransition = () => {
    if (pendingNextPart !== null) {
      const nextQ = writingQuestions[pendingNextPart];
      
      // Start main timer if not already running
      if (!state.isTimerRunning) {
        startTimer();
      }
      
      // The setCurrentQuestion will handle setting the start time for the new part/question
      setCurrentQuestion(pendingNextPart);
      setHasUserSelectedQuestion(true); // Mark as user navigation
      setPendingNextPart(null);
    }
    setShowPartTransitionModal(false);
  };

  const currentAnswer = currentQuestion ? state.answers.find((a) => a.questionId === currentQuestion.id) : undefined;
  const wordCount = countWords(currentText);
  const isAnswered = currentAnswer && currentAnswer.text.trim().length > 0;

  // Instruction texts for each part
  const part1Instructions = `In this part of the test, you will write ONE sentence that is based on a picture. With each picture, you will be given TWO words or phrases that you must use in your sentence. You can change the forms of the words and you can use the words in any order.

Your sentence will be scored on:
- the appropriate use of grammar, and
- the relevance of the sentence to the picture.

In this part, you can move to the next question by clicking on Next. If you want to return to a previous question, click on Back.

You will have five minutes to complete this part of the test.`;

  const part2Instructions = `Directions: In this part of the test, you will show how well you can write a response to an e-mail.

Your response will be scored on:
- the quality and variety of your sentences,
- vocabulary, and
- organization.

You will have 10 minutes to read and answer each e-mail.`;

  const part3Instructions = `In this part of the test, you will write an essay in response to a question that asks you to state, explain, and support your opinion on an issue.

Your response will be scored on:
- whether your opinion is supported with reasons and/or examples,
- grammar,
- vocabulary, and
- organization.

You will have 30 minutes to plan, write, and revise your essay.`;

  return (
    <div>
      {/* Instruction Modals */}
      <InstructionModal
        isOpen={showPart1Instruction}
        title="Questions 1-5: Write a sentence based on a picture"
        instructions={part1Instructions}
        onContinue={() => {
          setShowPart1Instruction(false);
          // startTimer() will set startTime automatically
          startTimer();
        }}
      />
      <InstructionModal
        isOpen={showPart2Instruction}
        title="Questions 6-7: Respond to a written request"
        instructions={part2Instructions}
        onContinue={() => {
          setShowPart2Instruction(false);
          if (!state.isTimerRunning) {
            startTimer();
          }
        }}
      />
      <InstructionModal
        isOpen={showPart3Instruction}
        title="Question 8: Write an opinion essay"
        instructions={part3Instructions}
        onContinue={() => {
          setShowPart3Instruction(false);
          if (!state.isTimerRunning) {
            startTimer();
          }
        }}
      />

      {/* Part Transition Modal */}
      <Modal
        isOpen={showPartTransitionModal}
        onClose={() => {
          setShowPartTransitionModal(false);
          setPendingNextPart(null);
        }}
        title="Chuyển phần"
        message="Bạn có muốn chuyển sang phần tiếp theo?"
        type="confirm"
        onConfirm={handlePartTransition}
        confirmText="Chuyển"
        cancelText="Hủy"
      />

      {/* Other Modals */}
      <Modal
        isOpen={showNoAnswerModal}
        onClose={() => setShowNoAnswerModal(false)}
        title="No Answers Submitted"
        message="Please write at least one answer before finishing the test."
        type="alert"
        confirmText="OK"
      />
      <Modal
        isOpen={showFinishModal}
        onClose={() => setShowFinishModal(false)}
        title="Finish Writing Test"
        message="Are you sure you want to finish the writing test? You cannot go back after finishing."
        type="confirm"
        onConfirm={confirmFinish}
        confirmText="Finish"
        cancelText="Cancel"
      />
      <Modal
        isOpen={showNavigationModal}
        onClose={() => setShowNavigationModal(false)}
        title="Cannot Proceed"
        message={navigationMessage}
        type="alert"
        confirmText="OK"
      />

      {/* Header Strip - Gradient band */}
      <div className="mb-6 rounded-t-3xl bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500 h-14 flex items-center justify-between px-6 shadow-lg">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-white uppercase tracking-[0.15em]">
            TOEIC WRITING TEST
          </h2>
          <span className="text-white/80">·</span>
          <div className="flex items-center gap-2 text-white/90">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Time Remaining</span>
            <Timer
              initialSeconds={currentQ && currentQ.timeLimit ? (getQuestionTimeRemaining(state.currentQuestionIndex) || currentQ.timeLimit) : state.timeRemaining}
              onComplete={() => {
                // Auto move to next question for question 6
                if (currentQ && currentQ.questionNumber === 6 && canGoNext) {
                  handleNext();
                } else {
                  finishExam();
                }
              }}
              showWarning={(() => {
                const timeRemaining = currentQ && currentQ.timeLimit 
                  ? (getQuestionTimeRemaining(state.currentQuestionIndex) || currentQ.timeLimit)
                  : state.timeRemaining;
                return timeRemaining <= 600;
              })()}
              warningThreshold={600}
              className="text-white"
            />
          </div>
          <span className="text-white/80">·</span>
          <div className="flex items-center gap-2 text-white/90">
            <HelpCircle className="h-4 w-4" />
            <span className="text-sm font-medium">
              Question {state.currentQuestionIndex !== null ? state.currentQuestionIndex + 1 : 0} / {writingQuestions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <ProgressBar value={progress} showLabel={true} accent="indigo" />
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Left Column: Question Navigator */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <Card className="bg-white/95 border border-slate-200 rounded-2xl shadow-sm">
            <CardHeader className="bg-slate-50 rounded-t-2xl border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600" />
                <h3 className="text-lg font-bold text-slate-900">Questions</h3>
              </div>
            </CardHeader>
            <CardContent>
              <QuestionNavigator
                currentIndex={state.currentQuestionIndex ?? null}
                onQuestionClick={(index) => {
                  // Check if can navigate
                  if (canNavigateToQuestion(index)) {
                    setCurrentQuestion(index);
                    setHasUserSelectedQuestion(true); // Mark that user manually selected
                  }
                }}
                questionStatuses={questionStatuses}
                canNavigateToQuestion={canNavigateToQuestion}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Question Content & Editor */}
        <div className="lg:col-span-3 space-y-6 order-1 lg:order-2">
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
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                        <span>Part {currentQuestion.part} - Question {currentQuestion.questionNumber}</span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">
                        {state.questions?.[currentQuestion.id] || currentQuestion.questionText}
                      </h3>
                    </div>
                    {isAnswered && (
                      <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
              {/* Question Input - User can paste question text */}
              <QuestionInput
                questionId={currentQuestion.id}
                value={state.questions?.[currentQuestion.id] || ""}
                onChange={(text) => setQuestionText(currentQuestion.id, text)}
                placeholder="Paste your question here..."
              />

              {/* Part 1: Image Upload (shared for Q1-5) - Only show upload component on Q1 */}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 1 && (
                <ImageUpload
                  part={1}
                  value={state.images?.[1]}
                  onChange={(imageData) => setPartImage(1, imageData)}
                  label="Upload Image (for Q1-5)"
                />
              )}

              {/* Display uploaded image for Part 1 - Only show on Q2-5 if image exists (not on Q1 to avoid duplicate) */}
              {currentQuestion.part === 1 && 
               currentQuestion.questionNumber >= 2 && 
               currentQuestion.questionNumber <= 5 && 
               state.images?.[1] && (
                <Card className="bg-slate-50 border border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="h-4 w-4 text-slate-600" />
                      <label className="text-sm font-semibold text-slate-900">
                        Image (for Q1-5)
                      </label>
                    </div>
                    <div className="relative h-64 w-full overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">
                      <Image
                        src={state.images[1]}
                        alt="Question image"
                        fill
                        className="object-contain"
                      />
                      </div>
                  </CardContent>
                </Card>
              )}

              {/* Part 2: Image Upload (for Q6-7) - Only show upload component on Q6 */}
              {currentQuestion.part === 2 && currentQuestion.questionNumber === 6 && (
                <ImageUpload
                  part={2}
                  value={state.images?.[2]}
                  onChange={(imageData) => setPartImage(2, imageData)}
                  label="Upload Image (for Q6-7)"
                />
              )}

              {/* Display uploaded image for Part 2 - Only show on Q7 if image exists (not on Q6 to avoid duplicate) */}
              {currentQuestion.part === 2 && 
               currentQuestion.questionNumber === 7 && 
               state.images?.[2] && (
                <Card className="bg-slate-50 border border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="h-4 w-4 text-slate-600" />
                      <label className="text-sm font-semibold text-slate-900">
                        Image (for Q6-7)
                      </label>
                    </div>
                    <div className="relative h-64 w-full overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">
                      <Image
                        src={state.images[2]}
                        alt="Question image"
                        fill
                        className="object-contain"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Display user's question text if available */}
              {state.questions?.[currentQuestion.id] && (
                <Card className="bg-blue-50 border border-blue-200">
                  <CardContent className="p-4">
                    <div className="mb-2 text-sm font-semibold text-slate-900">Question:</div>
                    <div className="whitespace-pre-wrap text-slate-700">
                      {state.questions[currentQuestion.id]}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          {/* Editor Card */}
          <Card className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50 border-b border-slate-200 rounded-t-2xl">
              <h3 className="text-lg font-bold text-slate-900">Your Answer</h3>
            </CardHeader>
            <CardContent className="pt-6">
              <div className={cn(
                "bg-slate-50 rounded-2xl border border-slate-200 p-4",
                state.isLocked && "opacity-50"
              )}>
                <WordCountEditor
                  value={currentText}
                  onChange={handleTextChange}
                  minWords={0} // Removed minWords requirement
                  questionId={currentQuestion.id}
                  disabled={state.isLocked}
                  placeholder={
                    currentQuestion.part === 1
                      ? "Write one sentence about the picture..."
                      : currentQuestion.part === 2
                      ? "Write your email response..."
                      : "Write your essay..."
                  }
                />
              </div>
              {/* Word count strip (informational only) */}
              <div className={cn(
                "mt-4 rounded-lg px-4 py-2 border",
                state.isLocked 
                  ? "bg-red-50 border-red-200" 
                  : "bg-indigo-50 border-indigo-100"
              )}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 font-medium">Word Count</span>
                  <span className={cn(
                    "font-semibold",
                    state.isLocked ? "text-red-600" : "text-indigo-600"
                  )}>
                    {wordCount} words
                    {state.isLocked && " (Locked)"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

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
