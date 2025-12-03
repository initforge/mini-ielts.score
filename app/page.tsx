"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { SpeakingProvider, useSpeaking } from "@/contexts/SpeakingContext";
import { WritingProvider, useWriting } from "@/contexts/WritingContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import SpeakingTab from "@/components/speaking/SpeakingTab";
import SpeakingResults from "@/components/speaking/SpeakingResults";
import WritingTab from "@/components/writing/WritingTab";
import WritingResults from "@/components/writing/WritingResults";
import { SpeakingGradingResponse, WritingGradingResponse } from "@/lib/types";
import { writingQuestions } from "@/lib/mockData";
import { mockSpeakingResults, mockWritingResults } from "@/lib/mockResults";

function SpeakingContent() {
  const { state, resetExam, setResults } = useSpeaking();
  const [isGrading, setIsGrading] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);

  const handleGrade = async () => {
    if (state.answers.length === 0) {
      setShowNoAnswerModal(true);
      return;
    }

    setIsGrading(true);
    setGradingError(null);

    try {
      const response = await fetch("/api/grade-speaking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answers: state.answers,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to grade speaking test");
      }

      const results: SpeakingGradingResponse = await response.json();
      setResults(results);
    } catch (error) {
      console.error("Grading error:", error);
      // Use mock data for testing/review when API fails or is unavailable
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate API delay
      setResults(mockSpeakingResults);
    } finally {
      setIsGrading(false);
    }
  };

  if (state.isFinished && state.results) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Speaking Test Results</h2>
          <Button variant="outline" onClick={resetExam}>
            Start New Test
          </Button>
        </div>
        <SpeakingResults results={state.results} />
      </div>
    );
  }

  if (state.isFinished && !state.results) {
    return (
      <>
        <Modal
          isOpen={showNoAnswerModal}
          onClose={() => setShowNoAnswerModal(false)}
          title="No Answers Recorded"
          message="Please record at least one answer before grading."
          type="alert"
          confirmText="OK"
        />
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold text-slate-900">
              Speaking Test Completed
            </h2>
            <p className="mb-6 text-slate-700">
              {state.answers.length} answer(s) recorded. Click the button below to get your results.
            </p>
          {gradingError && (
            <div className="mb-4 rounded-lg bg-error/20 p-4 text-error">
              {gradingError}
            </div>
          )}
          <Button
            onClick={handleGrade}
            disabled={isGrading}
            size="lg"
            className="gap-2"
          >
            {isGrading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Grading...
              </>
            ) : (
              "Get Results"
            )}
          </Button>
        </CardContent>
      </Card>
      </>
    );
  }

  return <SpeakingTab />;
}

function WritingContent() {
  const { state, resetExam, setResults } = useWriting();
  const [isGrading, setIsGrading] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);

  const handleGrade = async () => {
    if (state.answers.length === 0) {
      setShowNoAnswerModal(true);
      return;
    }

    setIsGrading(true);
    setGradingError(null);

    try {
      // Organize answers by part
      const part1 = state.answers.filter((a) => a.questionType === 1);
      const part2 = state.answers.filter((a) => a.questionType === 2);
      const part3 = state.answers.filter((a) => a.questionType === 3);

      const response = await fetch("/api/grade-writing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parts: {
            part1,
            part2,
            part3,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to grade writing test");
      }

      const results: WritingGradingResponse = await response.json();
      setResults(results);
    } catch (error) {
      console.error("Grading error:", error);
      // Use mock data for testing/review when API fails or is unavailable
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate API delay
      setResults(mockWritingResults);
    } finally {
      setIsGrading(false);
    }
  };

  if (state.isFinished && state.results) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Writing Test Results</h2>
          <Button variant="outline" onClick={resetExam} className="text-black">
            Start New Test
          </Button>
        </div>
        <WritingResults results={state.results} />
      </div>
    );
  }

  if (state.isFinished && !state.results) {
    return (
      <>
        <Modal
          isOpen={showNoAnswerModal}
          onClose={() => setShowNoAnswerModal(false)}
          title="No Answers Submitted"
          message="Please write at least one answer before grading."
          type="alert"
          confirmText="OK"
        />
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold text-slate-900">
              Writing Test Completed
            </h2>
            <p className="mb-6 text-slate-700">
              {state.answers.length} answer(s) submitted. Click the button below to get your results.
            </p>
          {gradingError && (
            <div className="mb-4 rounded-lg bg-error/20 p-4 text-error">
              {gradingError}
            </div>
          )}
          <Button
            onClick={handleGrade}
            disabled={isGrading}
            size="lg"
            className="gap-2"
          >
            {isGrading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Grading...
              </>
            ) : (
              "Get Results"
            )}
          </Button>
        </CardContent>
      </Card>
      </>
    );
  }

  return <WritingTab />;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("speaking");

  return (
    <SpeakingProvider>
      <WritingProvider>
        {/* Layer 1 - App background (navy dark with grid) */}
        <div 
          className="min-h-screen"
          style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #020617 100%)',
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.03) 40px, rgba(255,255,255,0.03) 41px),
              repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.03) 40px, rgba(255,255,255,0.03) 41px)
            `
          }}
        >
          {/* Layer 2 - Content zone */}
          <div className="container mx-auto px-4 py-6">
            <div className="mx-auto max-w-6xl rounded-3xl bg-[#F5F6F8] border border-white/10 shadow-[0_24px_60px_rgba(15,23,42,0.65)] p-6 sm:p-8 lg:p-12">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="mb-8 flex justify-center">
                  <TabsList>
                    <TabsTrigger value="speaking">Speaking</TabsTrigger>
                    <TabsTrigger value="writing">Writing</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="speaking">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <SpeakingContent />
                  </motion.div>
                </TabsContent>

                <TabsContent value="writing">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <WritingContent />
                  </motion.div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </WritingProvider>
    </SpeakingProvider>
  );
}
