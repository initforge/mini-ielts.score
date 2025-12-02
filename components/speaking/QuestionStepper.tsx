"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { speakingQuestions } from "@/lib/mockData";

interface QuestionStepperProps {
  currentIndex: number;
  onQuestionClick: (index: number) => void;
  answers: Array<{ questionId: string }>;
}

export default function QuestionStepper({
  currentIndex,
  onQuestionClick,
  answers,
}: QuestionStepperProps) {
  const parts = [1, 2, 3, 4, 5, 6];
  
  const getQuestionsForPart = (part: number) => {
    return speakingQuestions.filter((q) => q.part === part);
  };

  const isQuestionAnswered = (questionId: string) => {
    return answers.some((a) => a.questionId === questionId);
  };

  return (
    <div className="space-y-4">
      {parts.map((part) => {
        const partQuestions = getQuestionsForPart(part);
        const partStartIndex = speakingQuestions.findIndex((q) => q.part === part);
        
        return (
          <div key={part} className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              Part {part}
            </h4>
            <div className="flex flex-wrap gap-2">
              {partQuestions.map((question, idx) => {
                const questionIndex = partStartIndex + idx;
                const isCurrent = questionIndex === currentIndex;
                const isAnswered = isQuestionAnswered(question.id);
                
                return (
                  <motion.button
                    key={question.id}
                    onClick={() => onQuestionClick(questionIndex)}
                    className={cn(
                      "relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all duration-200",
                      isCurrent
                        ? "bg-slate-50 text-cyan-600 border-2 border-cyan-500 shadow-md scale-110 font-semibold"
                        : isAnswered
                        ? "bg-slate-50 text-slate-700 border-2 border-success/50"
                        : "bg-slate-50 text-slate-600 border-2 border-slate-300 hover:border-cyan-300"
                    )}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {isAnswered && !isCurrent && (
                      <Check className="h-4 w-4 text-success" />
                    )}
                    {!isAnswered && !isCurrent && (
                      <span className="text-slate-700">{question.questionNumber}</span>
                    )}
                    {isCurrent && (
                      <span className="text-cyan-600 font-bold">{question.questionNumber}</span>
                    )}
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
