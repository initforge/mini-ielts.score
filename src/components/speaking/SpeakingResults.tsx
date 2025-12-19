import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import ResultCard from "@/components/shared/ResultCard";
import RubricCard from "@/components/shared/RubricCard";
import { SpeakingGradingResponse } from "@/lib/types";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { speakingQuestions } from "@/lib/mockData";

interface SpeakingResultsProps {
  results: SpeakingGradingResponse;
}

export default function SpeakingResults({ results }: SpeakingResultsProps) {
  const criteriaArray = [
    results.criteria.pronunciation,
    results.criteria.intonation,
    results.criteria.grammar,
    results.criteria.vocabulary,
    results.criteria.coherence,
    results.criteria.completeness,
  ];

  // Group questions by part for display
  const partLabels: Record<number, string> = {
    1: "Part 1 – Read aloud (Q1-2)",
    2: "Part 2 – Picture (Q3)",
    3: "Part 3 – Q&A (Q4-6)",
    4: "Part 4 – Info response (Q7-9)",
    5: "Part 5 – Opinion (Q10)",
    6: "Part 6 – Written prompt (Q11)",
  };

  // Max score per part trên thang 200 overall
  const partMaxScores: Record<number, number> = {
    1: 20,
    2: 20,
    3: 40,
    4: 60,
    5: 30,
    6: 30,
  };

  return (
    <div className="space-y-8">
      {/* Overall Score */}
      <ResultCard
        title="Overall Score"
        score={results.overallScore}
        maxScore={200}
      />

      {/* Part Scores */}
      {results.partScores && results.partScores.length > 0 && (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-[#1e3a8a]">Part Scores</h3>
          {results.partScores.map((partScore) => (
            <Card key={partScore.part}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-[#1e3a8a]">
                    {partLabels[partScore.part] || `Part ${partScore.part}`}
                  </h4>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-black">
                      {partScore.partScore}
                    </span>
                    <span className="ml-1 text-sm text-black">
                      / {partMaxScores[partScore.part] ?? 200}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {partScore.questionScores.map((qScore) => {
                  const question = speakingQuestions.find(q => q.id === qScore.questionId);
                  // AI đã chấm đúng format rồi, không cần scale:
                  // - Part 1: mỗi câu 0-10
                  // - Part 2: 0-20
                  // - Part 3: mỗi câu 0-13
                  // - Part 4: mỗi câu 0-20
                  // - Part 5: 0-30
                  // - Part 6: 0-30
                  const questionMaxScores: Record<number, number> = {
                    1: 10, // Part 1: mỗi câu 0-10
                    2: 20, // Part 2: 0-20
                    3: 13, // Part 3: mỗi câu 0-13
                    4: 20, // Part 4: mỗi câu 0-20
                    5: 30, // Part 5: 0-30
                    6: 30, // Part 6: 0-30
                  };
                  const questionMax = questionMaxScores[partScore.part] ?? 20;
                  const questionScore = Math.round(qScore.score ?? 0);
                  return (
                    <motion.div
                      key={qScore.questionId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <Card className="bg-slate-50">
                        <CardContent className="p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-semibold text-[#1e3a8a]">
                              Question {qScore.questionNumber || question?.questionNumber || qScore.questionId}
                            </div>
                            <div className="text-sm font-bold text-black">
                              Score: {questionScore} / {questionMax}
                            </div>
                          </div>
                          {qScore.transcript && (
                            <p className="mb-2 text-sm text-black italic">
                              <span className="font-semibold">Transcript:</span> {qScore.transcript}
                            </p>
                          )}
                          {qScore.feedback && (
                            <p className="text-sm text-black">{qScore.feedback}</p>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Criteria Grid */}
      <div>
        <h3 className="mb-4 text-xl font-bold text-[#1e3a8a]">Evaluation Criteria</h3>
        <motion.div
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {criteriaArray.map((criterion, index) => (
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
