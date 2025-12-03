"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CheckCircle2, Image as ImageIcon, Clock, FileText, HelpCircle } from "lucide-react";
import { useWriting } from "@/contexts/WritingContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import QuestionNavigator from "./QuestionNavigator";
import WordCountEditor from "./WordCountEditor";
import Timer from "@/components/shared/Timer";
import ProgressBar from "@/components/shared/ProgressBar";
import { writingQuestions, writingEmailPrompts } from "@/lib/mockData";
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
  } = useWriting();

  const [currentText, setCurrentText] = useState("");
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionStatus>>({});
  const [imageError, setImageError] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [navigationMessage, setNavigationMessage] = useState("");

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

  // Update question statuses
  useEffect(() => {
    const statuses: Record<string, QuestionStatus> = {};
    writingQuestions.forEach((q) => {
      const answer = state.answers.find((a) => a.questionId === q.id);
      if (answer && answer.text.trim().length > 0) {
        const wordCount = countWords(answer.text);
        statuses[q.id] = wordCount >= q.minWords ? "completed" : "in-progress";
      } else {
        statuses[q.id] = "not-started";
      }
    });
    setQuestionStatuses(statuses);
  }, [state.answers]);

  if (!currentQuestion) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold text-slate-900">
            TOEIC Writing Test
          </h2>
          <p className="mb-6 text-slate-700">
            Click the button below to start the writing test. You will have 60 minutes to complete all questions.
          </p>
          <Button onClick={startExam} size="lg">
            Start Writing Test
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.isFinished && state.results) {
    // Results will be shown by parent component
    return null;
  }

  const progress = ((state.currentQuestionIndex + 1) / writingQuestions.length) * 100;
  
  // Calculate time progress based on current question
  const currentQ = currentQuestion;
  let timeProgress = 0;
  if (currentQ) {
    if (currentQ.questionNumber <= 5) {
      // Part 1: 5 minutes total
      timeProgress = ((5 * 60 - state.timeRemaining) / (5 * 60)) * 100;
    } else if (currentQ.timeLimit) {
      const questionTime = getQuestionTimeRemaining(state.currentQuestionIndex);
      if (questionTime !== null) {
        timeProgress = ((currentQ.timeLimit - questionTime) / currentQ.timeLimit) * 100;
      }
    }
  }
  
  // Navigation logic
  const canGoNext = (() => {
    if (state.currentQuestionIndex >= writingQuestions.length - 1) return false;
    // For questions 6-7, can only go next if current question is completed
    if (currentQ && (currentQ.questionNumber === 6 || currentQ.questionNumber === 7)) {
      const currentAnswer = state.answers.find(a => a.questionId === currentQ.id);
      return currentAnswer && currentAnswer.text.trim().length > 0;
    }
    return true;
  })();
  
  const canGoPrev = (() => {
    if (state.currentQuestionIndex <= 0) return false;
    // Cannot go back from question 7 to question 6
    if (currentQ && currentQ.questionNumber === 7) return false;
    // Cannot go back from question 8 to question 7
    if (currentQ && currentQ.questionNumber === 8) return false;
    // For questions 1-5, can navigate freely
    if (currentQ && currentQ.questionNumber <= 5) return true;
    return false;
  })();

  const handleTextChange = (text: string) => {
    setCurrentText(text);
    const wordCount = countWords(text);
    const answer = {
      questionId: currentQuestion.id,
      questionType: currentQuestion.part,
      questionText: currentQuestion.questionText,
      text,
      wordCount,
    };
    saveAnswer(answer);
  };

  const handleNext = () => {
    if (!canGoNext) return;
    
    const nextIndex = state.currentQuestionIndex + 1;
    const nextQ = writingQuestions[nextIndex];
    
    // For question 6, check if can navigate to question 7
    if (currentQ && currentQ.questionNumber === 6) {
      const currentAnswer = state.answers.find(a => a.questionId === currentQ.id);
      if (!currentAnswer || currentAnswer.text.trim().length === 0) {
        setNavigationMessage("Please complete question 6 before proceeding to question 7.");
        setShowNavigationModal(true);
        return;
      }
    }
    
    if (canNavigateToQuestion(nextIndex)) {
      setCurrentQuestion(nextIndex);
    } else {
      setNavigationMessage("You must complete the previous question before proceeding.");
      setShowNavigationModal(true);
    }
  };

  const handlePrev = () => {
    if (!canGoPrev) return;
    setCurrentQuestion(state.currentQuestionIndex - 1);
  };

  const handleFinish = () => {
    // Check if there are any answers
    if (state.answers.length === 0) {
      setShowNoAnswerModal(true);
      return;
    }

    const allAnswered = writingQuestions.every((q) => {
      const answer = state.answers.find((a) => a.questionId === q.id);
      return answer && countWords(answer.text) >= q.minWords;
    });

    if (!allAnswered) {
      const unanswered = writingQuestions.filter((q) => {
        const answer = state.answers.find((a) => a.questionId === q.id);
        return !answer || countWords(answer.text) < q.minWords;
      });
      setShowIncompleteModal(true);
      return;
    }

    setShowFinishModal(true);
  };

  const confirmFinish = () => {
    finishExam();
    setShowFinishModal(false);
  };

  const currentAnswer = state.answers.find((a) => a.questionId === currentQuestion.id);
  const wordCount = countWords(currentText);
  const isAnswered = currentAnswer && wordCount >= currentQuestion.minWords;

  const unansweredCount = writingQuestions.filter((q) => {
    const answer = state.answers.find((a) => a.questionId === q.id);
    return !answer || countWords(answer.text) < q.minWords;
  }).length;

  return (
    <div>
      {/* Modals */}
      <Modal
        isOpen={showNoAnswerModal}
        onClose={() => setShowNoAnswerModal(false)}
        title="No Answers Submitted"
        message="Please write at least one answer before finishing the test."
        type="alert"
        confirmText="OK"
      />
      <Modal
        isOpen={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
        title="Incomplete Answers"
        message={`You have ${unansweredCount} question(s) that don't meet the minimum word requirement. Are you sure you want to finish?`}
        type="confirm"
        onConfirm={confirmFinish}
        confirmText="Finish Anyway"
        cancelText="Continue"
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
              Question {state.currentQuestionIndex + 1} / {writingQuestions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <ProgressBar value={timeProgress} showLabel={true} accent="indigo" />
        <ProgressBar value={progress} showLabel={false} accent="indigo" className="mt-2" />
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
                currentIndex={state.currentQuestionIndex}
                onQuestionClick={(index) => {
                  if (canNavigateToQuestion(index)) {
                    setCurrentQuestion(index);
                  } else {
                    setNavigationMessage("You must complete the previous question before proceeding.");
                    setShowNavigationModal(true);
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
          {/* Question Card */}
          <Card className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50 border-b border-slate-200 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                    <span>Part {currentQuestion.part} - Question {currentQuestion.questionNumber}</span>
                    {currentQuestion.minWords && (
                      <>
                        <span>·</span>
                        <span>{currentQuestion.minWords} words minimum</span>
                      </>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {currentQuestion.questionText}
                  </h3>
                </div>
                {isAnswered && (
                  <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {currentQuestion.instructions && (
                <p className="text-sm text-slate-700">{currentQuestion.instructions}</p>
              )}

              {/* Part 1: Image */}
              {currentQuestion.part === 1 && currentQuestion.imageUrl && (
                <div className="bg-slate-100/80 border-2 border-dashed border-slate-300 rounded-xl p-8">
                  <div className="relative h-48 w-full overflow-hidden rounded-lg">
                    {!imageError ? (
                      <Image
                        src={currentQuestion.imageUrl}
                        alt="Question image"
                        fill
                        className="object-contain"
                        onError={() => setImageError(true)}
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-500">
                        <ImageIcon className="h-12 w-12" />
                        <p className="text-sm font-medium">Image not available</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Part 2: Email prompt */}
              {currentQuestion.part === 2 && (currentQuestion.questionNumber === 6 || currentQuestion.questionNumber === 7) && (
                <Card className="bg-slate-50 border border-slate-200">
                  <CardContent className="p-4">
                    <div className="mb-2 text-sm font-semibold text-slate-900">Email to respond to:</div>
                    <div className="whitespace-pre-wrap text-slate-700">
                      {writingEmailPrompts[currentQuestion.questionNumber] || writingEmailPrompts[6]}
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
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <WordCountEditor
                  value={currentText}
                  onChange={handleTextChange}
                  minWords={currentQuestion.minWords}
                  questionId={currentQuestion.id}
                  placeholder={
                    currentQuestion.part === 1
                      ? "Write one sentence about the picture..."
                      : currentQuestion.part === 2
                      ? "Write your email response..."
                      : "Write your essay..."
                  }
                />
              </div>
              {/* Word count strip */}
              <div className="mt-4 bg-indigo-50 rounded-lg px-4 py-2 border border-indigo-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 font-medium">Word Count</span>
                  <span className={cn(
                    "font-semibold",
                    wordCount >= currentQuestion.minWords ? "text-indigo-600" : "text-slate-500"
                  )}>
                    {wordCount} / {currentQuestion.minWords} words
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
        </div>
      </div>
    </div>
  );
}
