"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CheckCircle2, Image as ImageIcon, FileText, HelpCircle } from "lucide-react";
import { useSpeaking } from "@/contexts/SpeakingContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import QuestionStepper from "./QuestionStepper";
import AudioRecorder from "./AudioRecorder";
import Timer from "@/components/shared/Timer";
import ProgressBar from "@/components/shared/ProgressBar";
import { speakingQuestions, speakingTexts } from "@/lib/mockData";
import { blobToBase64 } from "@/lib/utils";
import Image from "next/image";

export default function SpeakingTab() {
  const {
    state,
    currentQuestion,
    setCurrentQuestion,
    saveAnswer,
    finishExam,
    startExam,
  } = useSpeaking();

  const [preparationTime, setPreparationTime] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (!currentQuestion) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold text-slate-900">
            TOEIC Speaking Test
          </h2>
          <p className="mb-6 text-slate-700">
            Click the button below to start the speaking test.
          </p>
          <Button onClick={startExam} size="lg">
            Start Speaking Test
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.isFinished && state.results) {
    // Results will be shown by parent component
    return null;
  }

  const progress = ((state.currentQuestionIndex + 1) / speakingQuestions.length) * 100;
  const canGoNext = state.currentQuestionIndex < speakingQuestions.length - 1;
  const canGoPrev = state.currentQuestionIndex > 0;

  const handleRecordingComplete = async (audioBlob: Blob, audioBase64: string) => {
    const answer = {
      questionId: currentQuestion.id,
      questionType: currentQuestion.part,
      questionText: currentQuestion.questionText,
      audioBlob,
      audioBase64,
      recordedAt: new Date(),
    };
    saveAnswer(answer);
  };

  const handleNext = () => {
    if (canGoNext) {
      setCurrentQuestion(state.currentQuestionIndex + 1);
      setIsPreparing(false);
      setPreparationTime(null);
      setImageError(false);
    }
  };

  const handlePrev = () => {
    if (canGoPrev) {
      setCurrentQuestion(state.currentQuestionIndex - 1);
      setIsPreparing(false);
      setPreparationTime(null);
      setImageError(false);
    }
  };

  const handleFinish = () => {
    if (confirm("Are you sure you want to finish the speaking test? You cannot go back after finishing.")) {
      finishExam();
    }
  };

  const startPreparation = () => {
    if (currentQuestion.preparationTime) {
      setIsPreparing(true);
      setPreparationTime(currentQuestion.preparationTime);
    }
  };

  const currentAnswer = state.answers.find((a) => a.questionId === currentQuestion.id);
  const isAnswered = !!currentAnswer;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl font-bold gradient-text tracking-wide">
            TOEIC SPEAKING TEST
          </h2>
          <div className="text-right">
            <div className="text-sm text-slate-700 font-medium">Question</div>
            <div className="text-xl font-bold text-slate-900">
              {state.currentQuestionIndex + 1} / {speakingQuestions.length}
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
                currentIndex={state.currentQuestionIndex}
                onQuestionClick={setCurrentQuestion}
                answers={state.answers}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Question Content & Recording */}
        <div className="lg:col-span-2 space-y-6 order-1 lg:order-2">
          {/* Question Card */}
          <Card className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50 border-b border-slate-200 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Part {currentQuestion.part} - Question {currentQuestion.questionNumber}
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

              {/* Part 1: Text to read */}
              {currentQuestion.part === 1 && (
                <Card className="bg-slate-50 border border-slate-200">
                  <CardContent className="p-4">
                    <p className="text-slate-900 leading-relaxed">
                      {speakingTexts[currentQuestion.id] || "Sample text to read aloud..."}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Part 2: Image */}
              {currentQuestion.part === 2 && currentQuestion.imageUrl && (
                <div className="bg-slate-100/80 border-2 border-dashed border-slate-300 rounded-xl p-8">
                  <div className="relative h-64 w-full overflow-hidden rounded-lg">
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

              {/* Part 5-6: Preparation Timer */}
              {currentQuestion.preparationTime && !isPreparing && preparationTime === null && (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-center text-slate-900">
                    You will have {currentQuestion.preparationTime} seconds to prepare.
                  </p>
                  <Button onClick={startPreparation} size="lg">
                    Start Preparation
                  </Button>
                </div>
              )}

              {isPreparing && preparationTime !== null && (
                <div className="flex flex-col items-center gap-4">
                  <div className="text-center">
                    <p className="mb-2 text-slate-900">Preparation Time</p>
                    <Timer
                      initialSeconds={preparationTime}
                      onComplete={() => {
                        setIsPreparing(false);
                        setPreparationTime(null);
                      }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recording Card */}
          {(!currentQuestion.preparationTime || (!isPreparing && preparationTime === null)) && (
            <Card className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50 border-b border-slate-200 rounded-t-2xl">
                <h3 className="text-lg font-bold text-slate-900">Your Response</h3>
                <p className="text-sm text-slate-700">
                  You have {currentQuestion.responseTime} seconds to respond.
                </p>
              </CardHeader>
              <CardContent className="pt-6">
                <AudioRecorder
                  maxDuration={currentQuestion.responseTime}
                  onRecordingComplete={handleRecordingComplete}
                  disabled={isPreparing}
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
        </div>
      </div>
    </div>
  );
}
