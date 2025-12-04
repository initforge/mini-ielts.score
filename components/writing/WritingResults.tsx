"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Lightbulb, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ResultCard from "@/components/shared/ResultCard";
import RubricCard from "@/components/shared/RubricCard";
import { WritingGradingResponse } from "@/lib/types";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { cn, countWords } from "@/lib/utils";
import { writingQuestions } from "@/lib/mockData";

interface WritingResultsProps {
  results: WritingGradingResponse;
}

export default function WritingResults({ results }: WritingResultsProps) {
  const [hoveredError, setHoveredError] = useState<{
    questionId: string;
    index: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("part1");

  const criteriaArray = [
    results.criteria.grammar,
    results.criteria.vocabularyRange,
    results.criteria.organization,
    results.criteria.taskFulfillment,
  ];

  // Helper to check if answer is empty or invalid
  const isAnswerInvalid = (questionId: string, text: string): boolean => {
    if (!text || text.trim().length === 0) return true;
    const wordCount = countWords(text);
    // Consider answers with less than 3 words as potentially invalid
    if (wordCount < 3) return true;
    // Check for nonsensical patterns (all same character, etc.)
    const uniqueChars = new Set(text.trim().toLowerCase()).size;
    if (uniqueChars < 3) return true;
    return false;
  };

  const renderHighlightedText = (highlightedAnswer: typeof results.highlightedAnswers[0]) => {
    const { text, errors } = highlightedAnswer;
    if (errors.length === 0) {
      return <span>{text}</span>;
    }

    // Sort errors by start position
    const sortedErrors = [...errors].sort((a, b) => a.start - b.start);
    
    const parts: Array<{ text: string; error?: typeof errors[0] }> = [];
    let lastIndex = 0;

    sortedErrors.forEach((error) => {
      if (error.start > lastIndex) {
        parts.push({ text: text.slice(lastIndex, error.start) });
      }
      parts.push({ text: text.slice(error.start, error.end), error });
      lastIndex = error.end;
    });

    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex) });
    }

    return (
      <div className="leading-relaxed">
        {parts.map((part, index) => {
          if (part.error) {
            return (
              <span
                key={index}
                className={cn(
                  "relative cursor-help underline decoration-wavy decoration-error/60 underline-offset-2",
                  hoveredError?.questionId === highlightedAnswer.questionId &&
                    hoveredError?.index === index &&
                    "bg-error/20"
                )}
                onMouseEnter={() =>
                  setHoveredError({ questionId: highlightedAnswer.questionId, index })
                }
                onMouseLeave={() => setHoveredError(null)}
                title={`${part.error.type}: ${part.error.explanation}`}
              >
                {part.text}
                {hoveredError?.questionId === highlightedAnswer.questionId &&
                  hoveredError?.index === index && (
                    <div className="absolute bottom-full left-0 z-10 mb-2 rounded-lg bg-brand-card border border-brand-border p-2 text-xs shadow-lg">
                    <div className="font-semibold text-error">{part.error.type}</div>
                    <div className="text-black">{part.error.explanation}</div>
                    </div>
                  )}
              </span>
            );
          }
          return <span key={index}>{part.text}</span>;
        })}
      </div>
    );
  };

  // Get answers for each part
  const part1Answers = results.highlightedAnswers.filter(a => {
    const q = writingQuestions.find(q => q.id === a.questionId);
    return q && q.part === 1;
  });
  const part2Answers = results.highlightedAnswers.filter(a => {
    const q = writingQuestions.find(q => q.id === a.questionId);
    return q && q.part === 2;
  });
  const part3Answers = results.highlightedAnswers.filter(a => {
    const q = writingQuestions.find(q => q.id === a.questionId);
    return q && q.part === 3;
  });

  return (
    <div className="space-y-8">
      {/* Overall Score */}
      <ResultCard
        title="Overall Score"
        score={results.overallScore}
        maxScore={200}
      />

      {/* Results Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="part1">Part 1 (Q1-5)</TabsTrigger>
          <TabsTrigger value="part2">Part 2 (Q6-7)</TabsTrigger>
          <TabsTrigger value="part3">Part 3 (Q8)</TabsTrigger>
        </TabsList>

        {/* Part 1 Tab */}
        <TabsContent value="part1" className="space-y-6">
          {results.part1 && (
            <ResultCard
              title="Part 1 Score"
              score={results.part1.overallScore}
              maxScore={200}
            />
          )}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Question Scores</h3>
            {part1Answers.map((answer, index) => {
              const question = writingQuestions.find(q => q.id === answer.questionId);
              const score = results.part1?.scores.find(s => s.questionId === answer.questionId);
              const isInvalid = isAnswerInvalid(answer.questionId, answer.text);
              
              return (
                <Card key={answer.questionId} className={cn(
                  isInvalid && "border-red-300 bg-red-50/50"
                )}>
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        Question {question?.questionNumber || index + 1}
                      </div>
                      {isInvalid ? (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">No answer / Invalid</span>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-slate-900">
                          Score: {score?.score || 0} / 200
                        </div>
                      )}
                    </div>
                    {isInvalid ? (
                      <div className="text-red-700 italic">
                        No valid answer provided
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 text-slate-700">{renderHighlightedText(answer)}</div>
                        {score?.feedback && (
                          <p className="text-sm text-slate-600 mt-2">{score.feedback}</p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Part 2 Tab */}
        <TabsContent value="part2" className="space-y-6">
          {results.part2 && (
            <ResultCard
              title="Part 2 Score"
              score={results.part2.overallScore}
              maxScore={200}
            />
          )}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Question Scores</h3>
            {part2Answers.map((answer, index) => {
              const question = writingQuestions.find(q => q.id === answer.questionId);
              const score = results.part2?.scores.find(s => s.questionId === answer.questionId);
              const isInvalid = isAnswerInvalid(answer.questionId, answer.text);
              
              return (
                <Card key={answer.questionId} className={cn(
                  isInvalid && "border-red-300 bg-red-50/50"
                )}>
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        Question {question?.questionNumber || index + 1}
                      </div>
                      {isInvalid ? (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">No answer / Invalid</span>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-slate-900">
                          Score: {score?.score || 0} / 200
                        </div>
                      )}
                    </div>
                    {isInvalid ? (
                      <div className="text-red-700 italic">
                        No valid answer provided
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 text-slate-700">{renderHighlightedText(answer)}</div>
                        {score?.feedback && (
                          <p className="text-sm text-slate-600 mt-2">{score.feedback}</p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Part 3 Tab */}
        <TabsContent value="part3" className="space-y-6">
          {results.part3 && (
            <ResultCard
              title="Part 3 Score"
              score={results.part3.score}
              maxScore={200}
            />
          )}
          <div className="space-y-4">
            {part3Answers.map((answer) => {
              const isInvalid = isAnswerInvalid(answer.questionId, answer.text);
              
              return (
                <Card key={answer.questionId} className={cn(
                  isInvalid && "border-red-300 bg-red-50/50"
                )}>
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        Question 8 (Essay)
                      </div>
                      {isInvalid ? (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">No answer / Invalid</span>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-slate-900">
                          Score: {results.part3?.score || 0} / 200
                        </div>
                      )}
                    </div>
                    {isInvalid ? (
                      <div className="text-red-700 italic">
                        No valid answer provided
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 text-slate-700">{renderHighlightedText(answer)}</div>
                        {results.part3?.feedback && (
                          <p className="text-sm text-slate-600 mt-2">{results.part3.feedback}</p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Criteria Grid */}
      <div>
        <h3 className="mb-4 text-xl font-bold text-[#1e3a8a]">Evaluation Criteria</h3>
        <motion.div
          className="grid gap-4 md:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {criteriaArray.map((criterion, index) => (
            <motion.div key={criterion.name} variants={staggerItem}>
              <RubricCard
                name={criterion.name}
                score={criterion.score}
                maxScore={criterion.maxScore}
                explanation={criterion.explanation}
                index={index}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Highlighted Answers with Errors */}
      {results.highlightedAnswers.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-xl font-bold text-[#1e3a8a]">Your Answers with Error Highlights</h3>
            <p className="text-sm text-black">
              Hover over underlined text to see error details
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.highlightedAnswers.map((highlightedAnswer, index) => (
              <motion.div
                key={highlightedAnswer.questionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card>
                  <CardContent className="p-4">
                    <div className="mb-2 text-sm font-semibold text-text-muted">
                      Question {index + 1}
                    </div>
                    <div className="text-black">
                      {renderHighlightedText(highlightedAnswer)}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Strengths */}
      {results.strengths.length > 0 && (
        <Card borderColor="green">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <h3 className="text-xl font-bold text-[#1e3a8a]">Điểm mạnh (Strengths)</h3>
              <span className="ml-auto rounded-full bg-success/20 px-3 py-1 text-xs font-semibold text-success">
                GOOD
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {results.strengths.map((strength, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-2 text-black"
                >
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-success" />
                  {strength}
                </motion.li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Weaknesses */}
      {results.weaknesses.length > 0 && (
        <Card borderColor="yellow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              <h3 className="text-xl font-bold text-[#1e3a8a]">Điểm yếu (Weaknesses)</h3>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {results.weaknesses.map((weakness, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-2 text-black"
                >
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-warning" />
                  {weakness}
                </motion.li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Improvement Tips */}
      {results.improvementTips.length > 0 && (
        <Card borderColor="purple">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-[#A855F7]" />
              <h3 className="text-xl font-bold text-[#1e3a8a]">Gợi ý cải thiện (Suggestions)</h3>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {results.improvementTips.map((tip, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-2 text-black"
                >
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#A855F7]" />
                  {tip}
                </motion.li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Per-Part Feedback */}
      {results.perPartFeedback.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-xl font-bold text-[#1e3a8a]">Part-by-Part Feedback</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.perPartFeedback.map((feedback, index) => (
              <motion.div
                key={feedback.part}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card>
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-[#1e3a8a]">
                        Part {feedback.part}
                      </div>
                      <div className="text-sm font-bold text-black">
                        Score: {feedback.score} / 200
                      </div>
                    </div>
                    <p className="text-black">{feedback.feedback}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
