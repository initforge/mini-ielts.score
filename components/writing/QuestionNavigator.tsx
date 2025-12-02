"use client";

import { motion } from "framer-motion";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { writingQuestions } from "@/lib/mockData";
import { QuestionStatus } from "@/lib/types";

interface QuestionNavigatorProps {
  currentIndex: number;
  onQuestionClick: (index: number) => void;
  questionStatuses: Record<string, QuestionStatus>;
}

export default function QuestionNavigator({
  currentIndex,
  onQuestionClick,
  questionStatuses,
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
                const isCurrent = questionIndex === currentIndex;
                const status = questionStatuses[question.id];

                return (
                  <motion.button
                    key={question.id}
                    onClick={() => onQuestionClick(questionIndex)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all duration-200",
                      isCurrent
                        ? "bg-slate-50 text-slate-900 border-l-4 border-[#4F46E5] shadow-sm font-semibold"
                        : status === "completed"
                        ? "bg-slate-50 text-slate-700 border-l-2 border-success/50"
                        : status === "in-progress"
                        ? "bg-slate-50 text-slate-700 border-l-2 border-indigo-300"
                        : "bg-slate-50 text-slate-600 border-l-2 border-transparent hover:border-indigo-200 hover:bg-slate-100"
                    )}
                    whileHover={{ scale: 1.02, x: 4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className={cn(
                      "font-medium text-black",
                      isCurrent && "font-semibold"
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
