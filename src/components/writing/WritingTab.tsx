import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Image as ImageIcon, Clock, FileText } from "lucide-react";
import { useWriting } from "@/contexts/WritingContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import InstructionModal from "./InstructionModal";
import QuestionInput from "./QuestionInput";
import ImageUpload from "./ImageUpload";
import QuestionNavigator from "./QuestionNavigator";
import WordCountEditor from "./WordCountEditor";
import ProgressBar from "@/components/shared/ProgressBar";
// Removed import - using filteredQuestions from context instead
import { countWords, cn, formatTime } from "@/lib/utils";
import { QuestionStatus } from "@/lib/types";

const PART2_QUESTION_TIME = 10 * 60; // 10 minutes per question for Part 2 (Q6, Q7)

export default function WritingTab() {
  const {
    state,
    currentQuestion,
    filteredQuestions,
    setCurrentQuestion,
    saveAnswer,
    finishExam,
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
  } = useWriting();

  const [currentText, setCurrentText] = useState("");
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionStatus>>({});
  const [, setImageError] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [navigationMessage] = useState("");
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

  // Reset hasUserSelectedQuestion when question becomes null
  useEffect(() => {
    if (!currentQuestion) {
      setHasUserSelectedQuestion(false);
      setShowPart1Instruction(false);
      setShowPart2Instruction(false);
      setShowPart3Instruction(false);
    }
  }, [currentQuestion]);

  // Show instruction modal when user selects a question for the first time
  useEffect(() => {
    if (!currentQuestion || !hasUserSelectedQuestion) return;
    
    // Show instruction for current part if not shown yet and timer not running
    if (currentQuestion.part === 1 && shouldShowInstruction(1)) {
      setShowPart1Instruction(true);
      markInstructionShown(1);
    } else if (currentQuestion.part === 2 && currentQuestion.questionNumber === 6 && shouldShowInstruction(2)) {
      setShowPart2Instruction(true);
      markInstructionShown(2);
    } else if (currentQuestion.part === 3 && currentQuestion.questionNumber === 8 && shouldShowInstruction(3)) {
      setShowPart3Instruction(true);
      markInstructionShown(3);
    }
  }, [currentQuestion, hasUserSelectedQuestion, shouldShowInstruction, markInstructionShown]);

  // Update question statuses (removed minWords check)
  useEffect(() => {
    const statuses: Record<string, QuestionStatus> = {};
    filteredQuestions.forEach((q) => {
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
    ? ((state.currentQuestionIndex + 1) / filteredQuestions.length) * 100 
    : 0;
  
  // Calculate time progress based on current question
  const currentQ = currentQuestion;
  const currentTimeRemaining = (() => {
    if (!currentQuestion) return null;
    if (currentQuestion.part === 1 || currentQuestion.part === 3) {
      return state.timeRemaining;
    }
    return getQuestionTimeRemaining(state.currentQuestionIndex ?? 0) ?? PART2_QUESTION_TIME;
  })();
  
  // Navigation logic - Allow free navigation
  const canGoNext = state.currentQuestionIndex !== null && state.currentQuestionIndex < filteredQuestions.length - 1;
  const canGoPrev = state.currentQuestionIndex !== null && state.currentQuestionIndex > 0;

  const handleTextChange = (text: string) => {
    if (state.isLocked || !currentQuestion) return; // Don't allow changes when locked or no question
    setCurrentText(text);
    const wordCount = countWords(text);
    // Use user input question text if available, otherwise use default
    const questionText = state.questions?.[currentQuestion.id] || (() => {
      // Tất cả các part: hiển thị mô tả tính chất thay vì questionText mock
      if (currentQuestion.part === 1) return "Write one sentence about the picture";
      if (currentQuestion.part === 2) return "Read the email below. Write a response to the email";
      if (currentQuestion.part === 3) return "Write an opinion essay based on the question provided";
      return currentQuestion.questionText;
    })();
    const answer = {
      questionId: currentQuestion.id,
      questionType: currentQuestion.part,
      questionText,
      text,
      wordCount,
    };
    saveAnswer(answer);
  };


  const handleNext = () => {
    if (!canGoNext || state.currentQuestionIndex === null) return;
    
    const nextIndex = state.currentQuestionIndex + 1;
    const nextQ = filteredQuestions[nextIndex];
    
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
    // Finish current part if active
    if (activePart !== null) {
      finishPart();
    }
    finishExam();
    setShowFinishModal(false);
  };

  const handlePartTransition = () => {
    if (pendingNextPart !== null) {
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

      {/* Progress Bar */}
      <div className="mb-6">
        <ProgressBar value={progress} showLabel={true} accent="indigo" />
      </div>

      {/* Part timer */}
      <div className="mb-4">
        <Card className="border border-slate-200 shadow-sm bg-white/90">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Clock className="h-4 w-4 text-slate-600" />
              <span>
                {currentQuestion
                  ? `Part ${currentQuestion.part} · Question ${currentQuestion.questionNumber}`
                  : "Select a question to start"}
              </span>
            </div>
            {currentTimeRemaining !== null && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  Time left
                </span>
                <span className="font-mono text-lg font-bold text-slate-900">
                  {formatTime(Math.max(currentTimeRemaining, 0))}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
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
                filteredQuestions={filteredQuestions}
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
                    {(() => {
                      // Nếu có user input question text, ưu tiên dùng
                      if (state.questions?.[currentQuestion.id]) {
                        return state.questions[currentQuestion.id];
                      }
                      // Tất cả các part: hiển thị mô tả tính chất thay vì questionText mock
                      if (currentQuestion.part === 1) return "Write one sentence about the picture";
                      if (currentQuestion.part === 2) return "Read the email below. Write a response to the email";
                      if (currentQuestion.part === 3) return "Write an opinion essay based on the question provided";
                      return currentQuestion.questionText;
                    })()}
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

              {/* Part 1 (Q1-5): Image Upload - Separate for each question - Only show if no image uploaded */}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 1 && !state.images?.[currentQuestion.id] && (
                <ImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q1)"
                />
              )}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 2 && !state.images?.[currentQuestion.id] && (
                <ImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q2)"
                />
              )}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 3 && !state.images?.[currentQuestion.id] && (
                <ImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q3)"
                />
              )}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 4 && !state.images?.[currentQuestion.id] && (
                <ImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q4)"
                />
              )}
              {currentQuestion.part === 1 && currentQuestion.questionNumber === 5 && !state.images?.[currentQuestion.id] && (
                <ImageUpload
                  part={1}
                  value={state.images?.[currentQuestion.id]}
                  onChange={(imageData) => setQuestionImage(currentQuestion.id, imageData)}
                  label="Upload Image (for Q5)"
                />
              )}

              {/* Display uploaded image for Part 1 (Q1-5) */}
              {currentQuestion.part === 1 && 
               currentQuestion.questionNumber >= 1 && 
               currentQuestion.questionNumber <= 5 && 
               state.images?.[currentQuestion.id] && (
                <Card className="bg-slate-50 border border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="h-4 w-4 text-slate-600" />
                      <label className="text-sm font-semibold text-slate-900">
                        Image (for Q{currentQuestion.questionNumber})
                      </label>
                    </div>
                    <div className="relative h-64 w-full overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100">
                      <img
                        src={state.images[currentQuestion.id]}
                        alt={`Question ${currentQuestion.questionNumber} image`}
                        className="h-full w-full object-contain"
                      />
                      </div>
                  </CardContent>
                </Card>
              )}

              {/* Part 2: Image Upload (for Q6-7) - Only show upload component on Q6 if no image */}
              {currentQuestion.part === 2 && currentQuestion.questionNumber === 6 && !state.images?.[2] && (
                <ImageUpload
                  part={2}
                  value={state.images?.[2]}
                  onChange={(imageData) => setPartImage(2, imageData)}
                  label="Upload Image (for Q6-7)"
                />
              )}

              {/* Display uploaded image for Part 2 - Show on both Q6 and Q7 if image exists */}
              {currentQuestion.part === 2 && 
               (currentQuestion.questionNumber === 6 || currentQuestion.questionNumber === 7) && 
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
                      <img
                        src={state.images[2]}
                        alt="Question image"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <button
                      onClick={() => setPartImage(2, null)}
                      className="mt-2 rounded-lg bg-error px-3 py-1 text-sm text-white hover:bg-error/90 transition-colors"
                    >
                      Remove Image
                    </button>
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
