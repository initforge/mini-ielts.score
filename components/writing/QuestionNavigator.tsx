"use client";

import { motion } from "framer-motion";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { writingQuestions } from "@/lib/mockData";
import { QuestionStatus } from "@/lib/types";

interface QuestionNavigatorProps {
  currentIndex: number | null; // null means no question selected
  onQuestionClick: (index: number) => void;
  questionStatuses: Record<string, QuestionStatus>;
  canNavigateToQuestion?: (index: number) => boolean;
}

export default function QuestionNavigator({
  currentIndex,
  onQuestionClick,
  questionStatuses,
  canNavigateToQuestion,
}: QuestionNavigatorProps) {
  const parts = [1, 2, 3];

  const getQuestionsForPart = (part: number) => {
    return writingQuestions.filter((q) => q.part === part);
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
                const questionIndex = partStartIndex + idx;
                const isCurrent = currentIndex !== null && questionIndex === currentIndex;
                const status = questionStatuses[question.id];
                const canNavigate = canNavigateToQuestion ? canNavigateToQuestion(questionIndex) : true;
                const isDisabled = !canNavigate && !isCurrent;
                
                // Hide Q7 if Q6 is not answered (for Part 2)
                if (part === 2 && question.questionNumber === 7 && !canNavigate && !isCurrent) {
                  return null;
                }

                return (
                  <motion.button
                    key={question.id}
                    onClick={() => {
                      if (canNavigate) {
                        onQuestionClick(questionIndex);
                      }
                    }}
                    disabled={isDisabled}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all duration-200",
                      isCurrent
                        ? "bg-slate-50 text-slate-900 border-l-4 border-[#4F46E5] shadow-sm font-semibold"
                        : status === "completed"
                        ? "bg-slate-50 text-slate-700 border-l-2 border-success/50"
                        : status === "in-progress"
                        ? "bg-slate-50 text-slate-700 border-l-2 border-indigo-300"
                        : isDisabled
                        ? "bg-slate-100 text-slate-400 border-l-2 border-transparent cursor-not-allowed opacity-50"
                        : "bg-slate-50 text-slate-600 border-l-2 border-transparent hover:border-indigo-200 hover:bg-slate-100"
                    )}
                    whileHover={!isDisabled ? { scale: 1.02, x: 4 } : {}}
                    whileTap={!isDisabled ? { scale: 0.98 } : {}}
                  >
                    <span className={cn(
                      "font-medium",
                      isCurrent ? "text-black font-semibold" : isDisabled ? "text-slate-400" : "text-black"
                    )}>
                      Q{question.questionNumber}
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
