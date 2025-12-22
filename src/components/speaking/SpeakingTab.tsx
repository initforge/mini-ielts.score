import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Image as ImageIcon, FileText } from "lucide-react";
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
import { speakingQuestions } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { storeAudio } from "@/lib/audioStorage";

export default function SpeakingTab() {
  const {
    state,
    currentQuestion,
    setCurrentQuestion,
    saveAnswer,
    finishExam,
    setQuestionText,
    setQuestionImage,
    setStartTime,
    resetTimerState,
  } = useSpeaking();

  const [preparationTime, setPreparationTime] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepDone, setPrepDone] = useState(false);
  const [autoStartKey, setAutoStartKey] = useState(0);
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [, setImageError] = useState(false);
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

  // Reset timer states when question changes and auto-start preparation
  useEffect(() => {
    if (!currentQuestion) return;
    resetTimerState();
    const prep = currentQuestion.preparationTime ?? 0;
    setPreparationTime(prep);
    // Reset autoStartKey khi chuyển câu để tránh trigger auto-start từ câu trước
    setAutoStartKey(0);
    setIsRecordingLocal(false);

    // Nếu câu này đã có câu trả lời thì không chạy lại thời gian chuẩn bị
    const existingAnswer = state.answers.find(
      (a) => a.questionId === currentQuestion.id
    );

    if (prep > 0 && !existingAnswer) {
      setIsPreparing(true);
      setPrepDone(false);
    } else {
      setIsPreparing(false);
      setPrepDone(true);
    }
  }, [currentQuestion?.id, currentQuestion?.preparationTime, resetTimerState, state.answers]);

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
        setShowPart2Instruction(true);
        setShownInstructions(prev => new Set(prev).add(2));
        break;
      case 3:
        setShowPart3Instruction(true);
        setShownInstructions(prev => new Set(prev).add(3));
        break;
      case 4:
        setShowPart4Instruction(true);
        setShownInstructions(prev => new Set(prev).add(4));
        break;
      case 5:
        setShowPart5Instruction(true);
        setShownInstructions(prev => new Set(prev).add(5));
        break;
    }
  }, [currentQuestion, hasUserSelectedQuestion, state.startTime, shownInstructions]);

  // REMOVED: Auto-start preparation timer - Timer only starts when user clicks record


  // REMOVED: Lock recording effect - handled by AudioRecorder component

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
    
    // Store audio in IndexedDB for persistence (supports large files)
    try {
      // Calculate duration for metadata
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.addEventListener('loadedmetadata', async () => {
        const duration = Math.floor(audio.duration);
        await storeAudio(question.id, audioBlob, {
          duration,
          size: audioBlob.size,
        });
      });
      
      // Also store immediately (duration will be updated later if available)
      await storeAudio(question.id, audioBlob);
      
      // URL is already stored in state via saveAnswer
    } catch (error) {
      console.error("Failed to store audio in IndexedDB:", error);
    }
  };

  const navigationLocked = isPreparing || isRecordingLocal;

  const handleNext = () => {
    if (navigationLocked) return;
    if (canGoNext && state.currentQuestionIndex !== null) {
      setCurrentQuestion(state.currentQuestionIndex + 1);
      setHasUserSelectedQuestion(true); // Mark as user navigation
      resetTimerState();
      setImageError(false);
      // Timer will auto-start after popup check in useEffect
    }
  };

  const handlePrev = () => {
    if (navigationLocked) return;
    if (canGoPrev && state.currentQuestionIndex !== null) {
      setCurrentQuestion(state.currentQuestionIndex - 1);
      setHasUserSelectedQuestion(true); // Mark as user navigation
      resetTimerState();
      setIsPreparing(false);
      setPreparationTime(null);
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
    // Set startTime when starting Part 1 (first time)
    if (currentQuestion.part === 1 && currentQuestion.questionNumber === 1 && !state.startTime) {
      setStartTime();
    }
    // Timer only starts when user clicks record button
  };

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
                  if (navigationLocked) return;
                  setCurrentQuestion(index);
                  setHasUserSelectedQuestion(true); // Mark that user manually selected
                  resetTimerState();
                  setIsPreparing(false);
                  setPreparationTime(null);
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
                    {state.questions?.[currentQuestion.id] || currentQuestion.questionText}
                  </h3>
                </div>
                {isAnswered && (
                  <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* Preparation / Response overview */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Preparation</p>
                    <span className="text-xs text-slate-500">
                      {currentQuestion.preparationTime ?? 0}s
                    </span>
                  </div>
                  {isPreparing && preparationTime !== null ? (
                    <div className="mt-2 flex justify-center">
                    <Timer
                      initialSeconds={preparationTime}
                      onComplete={() => {
                        setIsPreparing(false);
                        setPreparationTime(0);
                          setPrepDone(true);
                          setAutoStartKey((k) => k + 1); // trigger auto-record
                      }}
                      onTick={(remaining) => {
                        setPreparationTime(remaining);
                      }}
                        warningThreshold={5}
                    />
                  </div>
                  ) : (
                    <div className="mt-3 flex items-center justify-between">
                      {currentQuestion.preparationTime && currentQuestion.preparationTime > 0 ? (
                        <>
                          <span className="text-xs text-slate-600">
                            {prepDone ? "Preparation finished" : "Preparing..."}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500">No preparation time</span>
                      )}
                </div>
              )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Response</p>
                    <span className="text-xs text-slate-500">
                      {currentQuestion.responseTime}s
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Recording timer will auto-stop after the response time.
                  </p>
                </div>
              </div>

              {/* Question Input - luôn hiển thị để người dùng có thể dán câu hỏi ngay khi bắt đầu, kể cả lúc đang chuẩn bị */}
              <QuestionInput
                questionId={currentQuestion.id}
                value={state.questions?.[currentQuestion.id] || ""}
                onChange={(text) => setQuestionText(currentQuestion.id, text)}
                placeholder="Paste your question here..."
              />

              {/* Part 1 (Q1-5): Image Upload - Separate for each question */}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 1 && (
                <CollapsibleImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q1)"
                />
              )}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 2 && (
                <CollapsibleImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q2)"
                />
              )}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 3 && (
                <CollapsibleImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q3)"
                />
              )}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 4 && (
                <CollapsibleImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q4)"
                />
              )}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 5 && (
                <CollapsibleImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q5)"
                />
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


              {/* Part 4 (Q8-10): Shared Image Upload */}
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

          {/* Recording Card */}
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
              <AudioRecorder
                key={currentQuestion.id}
                maxDuration={currentQuestion.responseTime}
                onRecordingComplete={handleRecordingComplete}
                disabled={state.isLocked || (!prepDone && (currentQuestion.preparationTime ?? 0) > 0)}
                isLocked={state.isLocked}
                questionId={currentQuestion.id}
                savedAudioUrl={state.audioUrls?.[currentQuestion.id]}
                autoStartKey={prepDone ? autoStartKey : undefined}
                onRecordingChange={setIsRecordingLocal}
              />
              {!prepDone && (currentQuestion.preparationTime ?? 0) > 0 && (
                <p className="mt-3 text-xs text-orange-600">
                  Bắt đầu phần chuẩn bị trước khi ghi âm.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={!canGoPrev || navigationLocked}
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
              disabled={!canGoNext || navigationLocked}
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
