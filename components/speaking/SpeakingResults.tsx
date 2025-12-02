"use client";

import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import ResultCard from "@/components/shared/ResultCard";
import RubricCard from "@/components/shared/RubricCard";
import { SpeakingGradingResponse } from "@/lib/types";
import { staggerContainer, staggerItem } from "@/lib/animations";

interface SpeakingResultsProps {
  results: SpeakingGradingResponse;
}

export default function SpeakingResults({ results }: SpeakingResultsProps) {
  const criteriaArray = [
    results.criteria.pronunciation,
    results.criteria.intonation,
    results.criteria.grammar,
    results.criteria.vocabulary,
    results.criteria.content,
    results.criteria.fluency,
  ];

  return (
    <div className="space-y-8">
      {/* Overall Score */}
      <ResultCard
        title="Overall Score"
        score={results.overallScore}
        maxScore={200}
      />

      {/* Transcripts Section */}
      {results.perQuestionFeedback.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-xl font-bold text-[#1e3a8a]">Transcripts</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.perQuestionFeedback.map((feedback, index) => (
              <motion.div
                key={feedback.questionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card>
                  <CardContent className="p-4">
                    <div className="mb-2 text-sm font-semibold text-[#1e3a8a]">
                      Question {index + 1}
                    </div>
                    <p className="mb-2 text-black">{feedback.transcript}</p>
                    <div className="text-sm text-black">{feedback.feedback}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </CardContent>
        </Card>
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
                score={criterion.score}
                maxScore={criterion.maxScore}
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
    </div>
  );
}
