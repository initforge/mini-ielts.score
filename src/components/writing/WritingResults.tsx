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

  // Get criteria by part
  const part1Criteria = [
    results.criteria.part1Grammar,
    results.criteria.part1SentenceStructure,
    results.criteria.part1Accuracy,
  ].filter(Boolean);

  const part2Criteria = [
    results.criteria.part2TaskFulfillment,
    results.criteria.part2Grammar,
    results.criteria.part2Vocabulary,
    results.criteria.part2Clarity,
  ].filter(Boolean);

  const part3Criteria = [
    results.criteria.part3Organization,
    results.criteria.part3Development,
    results.criteria.part3Grammar,
    results.criteria.part3Vocabulary,
    results.criteria.part3Logic,
  ].filter(Boolean);

  // Helper to check if answer is empty or invalid
  const isAnswerInvalid = (_questionId: string, text: string): boolean => {
    if (!text || text.trim().length === 0) return true;
    const wordCount = countWords(text);
    // Consider answers with less than 3 words as potentially invalid
    if (wordCount < 3) return true;
    // Check for nonsensical patterns (all same character, etc.)
    const uniqueChars = new Set(text.trim().toLowerCase()).size;
    if (uniqueChars < 3) return true;
    return false;
  };

  const renderHighlightedText = (highlightedAnswer: { questionId: string; text: string; errors: Array<{ start: number; end: number; type: string; explanation: string }> }) => {
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

  // Get part scores from new format
  const part1Data = results.partScores?.find(p => p.part === 1);
  const part2Data = results.partScores?.find(p => p.part === 2);
  const part3Data = results.partScores?.find(p => p.part === 3);

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
          {part1Data && (
            <ResultCard
              title="Part 1 Score"
              score={part1Data.partScore}
              maxScore={40}
            />
          )}

          {/* Part 1 Criteria - chỉ hiển thị trong tab Part 1 */}
          {part1Criteria.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold text-[#1e3a8a]">Part 1 Criteria</h3>
              <motion.div
                className="grid gap-4 md:grid-cols-3"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {part1Criteria.map((criterion, index) => criterion && (
                  <motion.div key={criterion.name} variants={staggerItem}>
                    <RubricCard
                      name={criterion.name}
                      explanation={criterion.explanation}
                      index={index}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Question Scores</h3>
            {!part1Data || !part1Data.questionScores || part1Data.questionScores.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-slate-700 italic">
                  No valid answers for Part 1.
                </CardContent>
              </Card>
            ) : part1Data.questionScores.map((qScore) => {
              const question = writingQuestions.find(q => q.id === qScore.questionId);
              const isInvalid = isAnswerInvalid(qScore.questionId, qScore.text);
              
              // Part 1: 5 câu, tổng 40 điểm → mỗi câu tối đa ~8
              const questionMax = 8;
              const scaledQuestionScore = Math.round(
                ((qScore.score ?? 0) / 200) * questionMax
              );

              return (
                <Card key={qScore.questionId} className={cn(
                  isInvalid && "border-red-300 bg-red-50/50"
                )}>
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        Question {qScore.questionNumber || question?.questionNumber || qScore.questionId}
                      </div>
                      {isInvalid ? (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">No answer / Invalid</span>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-slate-900">
                          Score: {scaledQuestionScore} / {questionMax}
                        </div>
                      )}
                    </div>
                    {isInvalid ? (
                      <div className="text-red-700 italic">
                        No valid answer provided
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 text-slate-700">
                          {renderHighlightedText({
                            questionId: qScore.questionId,
                            text: qScore.text,
                            errors: qScore.errors || [],
                          })}
                        </div>
                        {qScore.feedback && (
                          <p className="text-sm text-slate-600 mt-2">{qScore.feedback}</p>
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
          {part2Data && (
            <ResultCard
              title="Part 2 Score"
              score={part2Data.partScore}
              maxScore={60}
            />
          )}

          {/* Part 2 Criteria - chỉ hiển thị trong tab Part 2 */}
          {part2Criteria.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold text-[#1e3a8a]">Part 2 Criteria</h3>
              <motion.div
                className="grid gap-4 md:grid-cols-2"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {part2Criteria.map((criterion, index) => criterion && (
                  <motion.div key={criterion.name} variants={staggerItem}>
                    <RubricCard
                      name={criterion.name}
                      explanation={criterion.explanation}
                      index={index}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Question Scores</h3>
            {!part2Data || !part2Data.questionScores || part2Data.questionScores.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-slate-700 italic">
                  No valid answers for Part 2.
                </CardContent>
              </Card>
            ) : part2Data.questionScores.map((qScore) => {
              const question = writingQuestions.find(q => q.id === qScore.questionId);
              const isInvalid = isAnswerInvalid(qScore.questionId, qScore.text);
              
              // Part 2: 2 câu, tổng 60 điểm → mỗi câu tối đa ~30
              const questionMax = 30;
              const scaledQuestionScore = Math.round(
                ((qScore.score ?? 0) / 200) * questionMax
              );

              return (
                <Card key={qScore.questionId} className={cn(
                  isInvalid && "border-red-300 bg-red-50/50"
                )}>
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        Question {qScore.questionNumber || question?.questionNumber || qScore.questionId}
                      </div>
                      {isInvalid ? (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">No answer / Invalid</span>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-slate-900">
                          Score: {scaledQuestionScore} / {questionMax}
                        </div>
                      )}
                    </div>
                    {isInvalid ? (
                      <div className="text-red-700 italic">
                        No valid answer provided
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 text-slate-700">
                          {renderHighlightedText({
                            questionId: qScore.questionId,
                            text: qScore.text,
                            errors: qScore.errors || [],
                          })}
                        </div>
                        {qScore.feedback && (
                          <p className="text-sm text-slate-600 mt-2">{qScore.feedback}</p>
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
          {part3Data && (
            <ResultCard
              title="Part 3 Score"
              score={part3Data.partScore}
              maxScore={100}
            />
          )}

          {/* Part 3 Criteria - chỉ hiển thị trong tab Part 3 */}
          {part3Criteria.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold text-[#1e3a8a]">Part 3 Criteria</h3>
              <motion.div
                className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {part3Criteria.map((criterion, index) => criterion && (
                  <motion.div key={criterion.name} variants={staggerItem}>
                    <RubricCard
                      name={criterion.name}
                      explanation={criterion.explanation}
                      index={index}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

          <div className="space-y-4">
            {!part3Data || !part3Data.questionScores || part3Data.questionScores.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-slate-700 italic">
                  No valid answers for Part 3.
                </CardContent>
              </Card>
            ) : part3Data.questionScores.map((qScore) => {
              const isInvalid = isAnswerInvalid(qScore.questionId, qScore.text);
              // Part 3: 1 câu, tổng 100 điểm → tối đa 100
              const questionMax = 100;
              const scaledQuestionScore = Math.round(
                ((qScore.score ?? 0) / 200) * questionMax
              );
              
              return (
                <Card key={qScore.questionId} className={cn(
                  isInvalid && "border-red-300 bg-red-50/50"
                )}>
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        Question {qScore.questionNumber || 8} (Essay)
                      </div>
                      {isInvalid ? (
                        <div className="flex items-center gap-2 text-red-600">
                          <XCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">No answer / Invalid</span>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-slate-900">
                          Score: {scaledQuestionScore} / {questionMax}
                        </div>
                      )}
                    </div>
                    {isInvalid ? (
                      <div className="text-red-700 italic">
                        No valid answer provided
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 text-slate-700">
                          {renderHighlightedText({
                            questionId: qScore.questionId,
                            text: qScore.text,
                            errors: qScore.errors || [],
                          })}
                        </div>
                        {qScore.feedback && (
                          <p className="text-sm text-slate-600 mt-2">{qScore.feedback}</p>
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

      {/* Improvement Tips - Optional, chỉ hiển thị khi có */}
      {results.improvementTips && results.improvementTips.length > 0 && (
        <Card borderColor="purple">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-[#A855F7]" />
              <h3 className="text-xl font-bold text-[#1e3a8a]">Gợi ý cải thiện (Improvement Tips)</h3>
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
    </div>
  );
}
