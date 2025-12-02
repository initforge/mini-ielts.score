"use client";

import { motion } from "framer-motion";
import { Check, Circle, Lock } from "lucide-react";
import { cn, countWords } from "@/lib/utils";
import { writingQuestions } from "@/lib/mockData";
import { QuestionStatus } from "@/lib/types";

interface QuestionNavigatorProps {
  currentIndex: number;
  onQuestionClick: (index: number) => void;
  questionStatuses: Record<string, QuestionStatus>;
  answers: Array<{ questionId: string; text: string }>;
}

export default function QuestionNavigator({
  currentIndex,
  onQuestionClick,
  questionStatuses,
  answers,
}: QuestionNavigatorProps) {
  const parts = [1, 2, 3];

  const getQuestionsForPart = (part: number) => {
    return writingQuestions.filter((q) => q.part === part);
  };

  // Check if question 7 should be visible (only if question 6 is completed)
  const isQuestion7Visible = () => {
    const q6Answer = answers.find((a) => a.questionId === "w6");
    return q6Answer && countWords(q6Answer.text) >= 50;
  };

  // Check if a question can be navigated to
  const canNavigateTo = (questionId: string, questionNumber: number) => {
    // Questions 1-5 can always be navigated to
    if (questionNumber <= 5) return true;
    
    // Question 6 can be navigated to
    if (questionId === "w6") return true;
    
    // Question 7 can only be navigated to if question 6 is completed
    if (questionId === "w7") {
      return isQuestion7Visible();
    }
    
    // Question 8 can be navigated to
    if (questionId === "w8") return true;
    
    return false;
  };

  // Check if navigation is disabled (for questions 6-7)
  const isNavigationDisabled = (questionId: string, questionNumber: number) => {
    // Questions 6-7 cannot be navigated back from
    if (questionId === "w6" || questionId === "w7") {
      return true;
    }
    return false;
  };

  const getStatusIcon = (questionId: string) => {
    const status = questionStatuses[questionId];
    if (status === "completed") {
      return <Check className="h-4 w-4 text-success" />;
    }
    if (status === "in-progress") {
      return <Circle className="h-4 w-4 text-indigo-500" />;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {parts.map((part) => {
        const partQuestions = getQuestionsForPart(part);
        const partStartIndex = writingQuestions.findIndex((q) => q.part === part);

        return (
          <div key={part} className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              Part {part}
            </h4>
            <div className="space-y-1">
              {partQuestions.map((question, idx) => {
                // Hide question 7 if question 6 is not completed
                if (question.id === "w7" && !isQuestion7Visible()) {
                  return null;
                }

                const questionIndex = partStartIndex + idx;
                const isCurrent = questionIndex === currentIndex;
                const status = questionStatuses[question.id];
                const canNavigate = canNavigateTo(question.id, question.questionNumber);
                const isDisabled = isNavigationDisabled(question.id, question.questionNumber);

                return (
                  <motion.button
                    key={question.id}
                    onClick={() => {
                      if (canNavigate && !isDisabled) {
                        onQuestionClick(questionIndex);
                      }
                    }}
                    disabled={!canNavigate || isDisabled}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all duration-200",
                      !canNavigate || isDisabled
                        ? "bg-slate-100 text-slate-400 border-l-2 border-slate-300 cursor-not-allowed"
                        : isCurrent
                        ? "bg-slate-50 text-slate-900 border-l-4 border-[#4F46E5] shadow-sm font-semibold"
                        : status === "completed"
                        ? "bg-slate-50 text-slate-700 border-l-2 border-success/50"
                        : status === "in-progress"
                        ? "bg-slate-50 text-slate-700 border-l-2 border-indigo-300"
                        : "bg-slate-50 text-slate-600 border-l-2 border-transparent hover:border-indigo-200 hover:bg-slate-100"
                    )}
                    whileHover={canNavigate && !isDisabled ? { scale: 1.02, x: 4 } : {}}
                    whileTap={canNavigate && !isDisabled ? { scale: 0.98 } : {}}
                  >
                    <span className={cn(
                      "font-medium",
                      isCurrent ? "text-slate-900 font-semibold" : "text-slate-700",
                      (!canNavigate || isDisabled) && "text-slate-400"
                    )}>
                      Q{question.questionNumber}
                      {isDisabled && (
                        <Lock className="h-3 w-3 inline-block ml-1" />
                      )}
                    </span>
                    {getStatusIcon(question.id)}
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
