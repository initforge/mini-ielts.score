"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CheckCircle2, Image as ImageIcon, Clock, FileText, HelpCircle, Play, Volume2 } from "lucide-react";
import { useWriting } from "@/contexts/WritingContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import QuestionNavigator from "./QuestionNavigator";
import WordCountEditor from "./WordCountEditor";
import Timer from "@/components/shared/Timer";
import ProgressBar from "@/components/shared/ProgressBar";
import { writingQuestions, writingEmailPrompt } from "@/lib/mockData";
import { countWords, cn } from "@/lib/utils";
import Image from "next/image";
import { QuestionStatus, WritingPart } from "@/lib/types";

export default function WritingTab() {
  const {
    state,
    currentQuestion,
    setCurrentQuestion,
    saveAnswer,
    finishExam,
    startExam,
    startPart,
    markDirectionPlayed,
  } = useWriting();

  const [currentText, setCurrentText] = useState("");
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionStatus>>({});
  const [imageError, setImageError] = useState(false);
  const [isPlayingDirection, setIsPlayingDirection] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // Get direction audio URL for each part
  const getDirectionAudioUrl = (part: WritingPart): string => {
    // Placeholder URLs - replace with actual audio files
    return `/audio/writing-part${part}-direction.mp3`;
  };

  // Check if question 7 should be visible (only if question 6 is completed)
  const isQuestion7Visible = () => {
    const q6Answer = state.answers.find((a) => a.questionId === "w6");
    return q6Answer && countWords(q6Answer.text) >= 50;
  };

  // Check if current question should show direction
  const shouldShowDirection = () => {
    if (!currentQuestion) return false;
    
    // Check if direction has been played for this part
    const directionPlayed = state.partDirectionsPlayed?.[currentQuestion.part];
    const partStarted = state.currentPartStarted === currentQuestion.part;
    
    // Show direction if not played yet, or if part hasn't started
    return !directionPlayed || !partStarted;
  };

  const handlePlayDirection = () => {
    if (!currentQuestion) return;
    
    setIsPlayingDirection(true);
    const audioUrl = getDirectionAudioUrl(currentQuestion.part);
    
    // Create audio element
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    audio.onended = () => {
      setIsPlayingDirection(false);
      markDirectionPlayed(currentQuestion.part);
    };
    
    audio.onerror = () => {
      setIsPlayingDirection(false);
      // If audio fails, just mark as played and allow start
      markDirectionPlayed(currentQuestion.part);
    };
    
    audio.play().catch(() => {
      setIsPlayingDirection(false);
      markDirectionPlayed(currentQuestion.part);
    });
  };

  const handleStartPart = () => {
    if (!currentQuestion) return;
    startPart(currentQuestion.part);
  };

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
  let timeProgress = 0;
  if (currentQuestion) {
    if (currentQuestion.part === 1 && state.part1TimeRemaining !== undefined) {
      const total = 5 * 60;
      timeProgress = ((total - state.part1TimeRemaining) / total) * 100;
    } else if (currentQuestion.id === "w6" && state.part2Question6TimeRemaining !== undefined) {
      const total = 10 * 60;
      timeProgress = ((total - state.part2Question6TimeRemaining) / total) * 100;
    } else if (currentQuestion.id === "w7" && state.part2Question7TimeRemaining !== undefined) {
      const total = 10 * 60;
      timeProgress = ((total - state.part2Question7TimeRemaining) / total) * 100;
    } else if (currentQuestion.id === "w8" && state.part3Question8TimeRemaining !== undefined) {
      const total = 30 * 60;
      timeProgress = ((total - state.part3Question8TimeRemaining) / total) * 100;
    }
  }

  // Navigation logic: questions 1-5 can navigate freely, 6-7 cannot go back
  const canGoNext = () => {
    if (!currentQuestion) return false;
    
    // Can't go next if at last question
    if (state.currentQuestionIndex >= writingQuestions.length - 1) return false;
    
    // Question 6 can only go to 7 if 6 is completed
    if (currentQuestion.id === "w6") {
      return isQuestion7Visible();
    }
    
    // Question 7 cannot go to previous questions
    if (currentQuestion.id === "w7") {
      return state.currentQuestionIndex < writingQuestions.length - 1;
    }
    
    return true;
  };

  const canGoPrev = () => {
    if (!currentQuestion) return false;
    
    // Can't go back from question 6 or 7
    if (currentQuestion.id === "w6" || currentQuestion.id === "w7") {
      return false;
    }
    
    // Questions 1-5 can navigate freely
    return state.currentQuestionIndex > 0;
  };

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
    if (canGoNext()) {
      // If moving from question 6 to 7, ensure question 6 is completed
      if (currentQuestion?.id === "w6") {
        const q6Answer = state.answers.find((a) => a.questionId === "w6");
        if (!q6Answer || countWords(q6Answer.text) < 50) {
          alert("Please complete question 6 (at least 50 words) before proceeding to question 7.");
          return;
        }
      }
      
      const nextIndex = state.currentQuestionIndex + 1;
      const nextQuestion = writingQuestions[nextIndex];
      
      setCurrentQuestion(nextIndex);
      
      // If moving to question 7, start the timer for question 7 if not already started
      if (nextQuestion?.id === "w7" && state.currentPartStarted !== 2) {
        // Question 7 needs its own timer, but it's still part 2
        // The timer will be managed separately in the context
        startPart(2);
      }
    }
  };

  const handlePrev = () => {
    if (canGoPrev()) {
      setCurrentQuestion(state.currentQuestionIndex - 1);
    }
  };

  const handleFinish = () => {
    const allAnswered = writingQuestions.every((q) => {
      const answer = state.answers.find((a) => a.questionId === q.id);
      return answer && countWords(answer.text) >= q.minWords;
    });

    if (!allAnswered) {
      const unanswered = writingQuestions.filter((q) => {
        const answer = state.answers.find((a) => a.questionId === q.id);
        return !answer || countWords(answer.text) < q.minWords;
      });
      if (
        !confirm(
          `You have ${unanswered.length} question(s) that don't meet the minimum word requirement. Are you sure you want to finish?`
        )
      ) {
        return;
      }
    } else {
      if (!confirm("Are you sure you want to finish the writing test? You cannot go back after finishing.")) {
        return;
      }
    }
    finishExam();
  };

  const currentAnswer = state.answers.find((a) => a.questionId === currentQuestion.id);
  const wordCount = countWords(currentText);
  const isAnswered = currentAnswer && wordCount >= currentQuestion.minWords;
  const showDirection = shouldShowDirection();
  const partStarted = state.currentPartStarted === currentQuestion.part;

  // Show direction screen if needed
  if (showDirection) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            <Volume2 className="h-16 w-16 mx-auto text-indigo-500 mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Part {currentQuestion.part} - Directions
            </h2>
            <p className="text-slate-700">
              Listen to the directions for Part {currentQuestion.part}
            </p>
          </div>
          
          <Button
            onClick={handlePlayDirection}
            disabled={isPlayingDirection}
            size="lg"
            className="gap-2"
          >
            {isPlayingDirection ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Playing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Play Directions
              </>
            )}
          </Button>
          
          {state.partDirectionsPlayed?.[currentQuestion.part] && !partStarted && (
            <div className="mt-6">
              <Button onClick={handleStartPart} size="lg" variant="default">
                Start Part {currentQuestion.part}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
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
              initialSeconds={state.timeRemaining}
              onComplete={finishExam}
              showWarning={state.timeRemaining <= 600}
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
                onQuestionClick={setCurrentQuestion}
                questionStatuses={questionStatuses}
                answers={state.answers}
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
                    <div className="whitespace-pre-wrap text-slate-700">{writingEmailPrompt}</div>
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
              disabled={!canGoPrev()}
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
              disabled={!canGoNext()}
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
