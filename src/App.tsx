import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { SpeakingProvider, useSpeaking } from "@/contexts/SpeakingContext";
import { WritingProvider, useWriting } from "@/contexts/WritingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import Header from "@/components/shared/Header";
import StorageCleanup from "@/components/shared/StorageCleanup";
import GeminiKeyInput from "@/components/shared/GeminiKeyInput";
import SpeakingTab from "@/components/speaking/SpeakingTab";
import SpeakingResults from "@/components/speaking/SpeakingResults";
import SpeakingResultsLoading from "@/components/speaking/SpeakingResultsLoading";
import QuestionSelector from "@/components/shared/QuestionSelector";
import { speakingQuestions, writingQuestions } from "@/lib/mockData";
import WritingTab from "@/components/writing/WritingTab";
import WritingResults from "@/components/writing/WritingResults";
import { SpeakingGradingResponse, WritingGradingResponse } from "@/lib/types";

function SpeakingContent() {
  const { state, selectedQuestionIds, setSelectedQuestionIds, filteredQuestions, resetExam, setResults, updateTranscript } = useSpeaking();
  const [isGrading, setIsGrading] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [hasSelectedQuestions, setHasSelectedQuestions] = useState(false);
  const [quotaExceededInfo, setQuotaExceededInfo] = useState<{
    completedCount: number;
    failedCount: number;
    failedQuestionIds: string[];
  } | null>(null);

  const handleGrade = async () => {
    if (state.answers.length === 0) {
      setShowNoAnswerModal(true);
      return;
    }

    setIsGrading(true);
    setGradingError(null);

    try {
      const apiKey = typeof window !== "undefined" ? localStorage.getItem("GEMINI_API_KEY") : null;
      if (!apiKey) {
        setGradingError("Please connect your Gemini API key first.");
        setIsGrading(false);
        return;
      }

      // Filter answers: chỉ lấy các câu hỏi đã chọn
      const filteredQuestionIds = new Set(selectedQuestionIds);
      const filteredAnswers = state.answers.filter((answer) => 
        filteredQuestionIds.has(answer.questionId)
      );

      // Load audioBase64 từ IndexedDB cho những answer không có audioBase64
      const { getAudio } = await import("@/lib/audioStorage");
      const { blobToBase64 } = await import("@/lib/utils");
      
      const answersWithAudio = await Promise.all(
        filteredAnswers.map(async (answer) => {
          // Tạo answer object không có audioBlob (không thể serialize)
          const { audioBlob, ...answerWithoutBlob } = answer;
          
          // Nếu đã có audioBase64, giữ nguyên
          if (answer.audioBase64) {
            return answerWithoutBlob;
          }
          
          // Nếu không có audioBase64 nhưng có audioBlob, convert
          if (audioBlob) {
            const audioBase64 = await blobToBase64(audioBlob);
            return { ...answerWithoutBlob, audioBase64 };
          }
          
          // Nếu không có cả 2, thử load từ IndexedDB
          const audioBlobFromDB = await getAudio(answer.questionId);
          if (audioBlobFromDB) {
            const audioBase64 = await blobToBase64(audioBlobFromDB);
            return { ...answerWithoutBlob, audioBase64 };
          }
          
          // Không có audio, trả về answer không có audioBlob
          return answerWithoutBlob;
        })
      );

      // Filter questions and images: chỉ lấy các câu hỏi đã chọn
      const filteredQuestionsMap: Record<string, string> = {};
      const filteredImagesMap: Record<string, string> = {};
      
      // Check if any Part 4 question is selected
      const hasPart4Question = filteredQuestions.some((q) => q.part === 4);
      
      filteredQuestions.forEach((q) => {
        if (state.questions?.[q.id]) {
          filteredQuestionsMap[q.id] = state.questions[q.id];
        }
        if (state.images?.[q.id]) {
          filteredImagesMap[q.id] = state.images[q.id];
        }
      });
      
      // Part 4 shared image
      if (hasPart4Question && state.images?.["part4"]) {
        filteredImagesMap["part4"] = state.images["part4"];
      }

      const response = await fetch("/api/grade-speaking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answers: answersWithAudio,
          questions: filteredQuestionsMap,
          images: filteredImagesMap,
          apiKey,
        }),
      });

      // Đọc raw text trước để tránh crash khi body rỗng / không phải JSON
      const rawText = await response.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseError) {
        console.error("Failed to parse speaking grading response:", parseError, rawText);
        setGradingError("Có lỗi xảy ra khi đọc phản hồi từ server. Vui lòng thử lại.");
        setIsGrading(false);
        return;
      }

      // Handle API errors with specific codes
      if (!response.ok) {
        if (data.code === "API_KEY_INVALID") {
          setGradingError("API key không hợp lệ. Vui lòng nhấn nút 'Kết nối Gemini' ở góc trên để nhập API key mới.");
        } else if (data.code === "RATE_LIMIT") {
          setGradingError("Đã vượt quá giới hạn request. Vui lòng nhập API key khác hoặc đợi vài phút rồi thử lại.");
        } else if (data.code === "PERMISSION_DENIED") {
          setGradingError("API key không có quyền truy cập. Vui lòng kiểm tra quyền của API key.");
        } else if (data.code === "MODEL_NOT_FOUND") {
          setGradingError("Model không khả dụng (đã thử từ Gemini 3.0 → 2.5 → 1.5). Hãy kiểm tra project API key hoặc bật thêm model trong Google AI Studio.");
        } else {
          setGradingError(data.error || "Có lỗi xảy ra khi chấm điểm. Vui lòng thử lại.");
        }
        setIsGrading(false);
        return;
      }
      
      // Check for incomplete data response (quota exceeded với partial transcripts)
      if (data.incomplete && data.code === "QUOTA_EXCEEDED" && data.partialTranscripts) {
        // Lưu partial transcripts vào state
        const partialTranscripts: Array<{ questionId: string; transcript: string }> = data.partialTranscripts || [];
        partialTranscripts.forEach(({ questionId, transcript }) => {
          updateTranscript(questionId, transcript);
        });

        // Lưu thông tin để hiển thị UI
        const transcriptsCompleted = data.transcriptsCompleted === true; // Đã transcribe xong, chỉ cần grade lại
        setQuotaExceededInfo({
          completedCount: partialTranscripts.length,
          failedCount: transcriptsCompleted ? 0 : (data.failedQuestionIds?.length || 0),
          failedQuestionIds: data.failedQuestionIds || [],
        });

        const errorMessage = transcriptsCompleted
          ? "Đã transcribe xong tất cả audio nhưng chưa chấm được do đã vượt quá giới hạn quota ngày. Vui lòng nhập API key khác để tiếp tục chấm điểm (không cần transcribe lại)."
          : (data.message || "Đã vượt quá giới hạn quota ngày. Vui lòng nhập API key khác để tiếp tục.");

        setGradingError(errorMessage);
        setIsGrading(false);
        return;
      }

      // Check for other incomplete responses
      if (data.incomplete) {
        setGradingError(data.message || "Chưa đầy đủ thông tin. Vui lòng hoàn thành tất cả các câu hỏi.");
        setIsGrading(false);
        return;
      }

      // Clear quota exceeded info on success
      setQuotaExceededInfo(null);
      const results: SpeakingGradingResponse = data;
      setResults(results);
    } catch (error) {
      console.error("Grading error:", error);
      setGradingError("Có lỗi xảy ra khi chấm điểm. Vui lòng thử lại.");
    } finally {
      setIsGrading(false);
    }
  };

  // Show question selector if not selected yet
  if (!hasSelectedQuestions) {
    return (
      <div>
        <QuestionSelector
          questions={speakingQuestions}
          examType="speaking"
          onConfirm={(ids) => {
            setSelectedQuestionIds(ids);
            setHasSelectedQuestions(true);
          }}
        />
      </div>
    );
  }

  if (state.isFinished && state.results) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Speaking Test Results</h2>
          <Button variant="outline" onClick={() => {
            resetExam();
            setHasSelectedQuestions(false);
          }}>
            Start New Test
          </Button>
        </div>
        <SpeakingResults results={state.results} />
      </div>
    );
  }

  if (state.isFinished && !state.results) {
    // Khi đang grading: hiển thị luôn layout kết quả với skeleton loading
    if (isGrading) {
      return (
        <>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">Speaking Test Results</h2>
            <Button variant="outline" disabled className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang chấm...
            </Button>
          </div>
          <SpeakingResultsLoading />
        </>
      );
    }

    // Khi đã hoàn thành bài nhưng chưa bấm chấm điểm
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
              <div
                className={`mb-4 rounded-lg p-4 ${
                  gradingError.includes("Chưa đầy đủ")
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : quotaExceededInfo
                    ? "bg-yellow-50 text-yellow-800 border border-yellow-300"
                    : "bg-error/20 text-error"
                }`}
              >
                <div className="space-y-2">
                  <p>{gradingError}</p>
                  {quotaExceededInfo && (
                    <div className="mt-3 text-sm">
                      <p className="font-semibold mb-1">Tiến độ hiện tại:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li className="text-green-700">
                          ✅ Đã transcribe thành công: {quotaExceededInfo.completedCount} câu
                        </li>
                        <li className="text-yellow-700">
                          ⏳ Còn lại cần transcribe: {quotaExceededInfo.failedCount} câu
                        </li>
                      </ul>
                      <p className="mt-2 text-xs text-yellow-600">
                        Sau khi nhập API key mới, hệ thống sẽ chỉ transcribe các câu còn lại, không cần làm lại từ đầu.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {quotaExceededInfo && (
                <Button
                  onClick={() => setShowGeminiModal(true)}
                  variant="outline"
                  size="lg"
                  className="gap-2 border-yellow-400 text-yellow-700 hover:bg-yellow-50"
                >
                  Đổi API Key
                </Button>
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
                ) : quotaExceededInfo ? (
                  "Tiếp tục chấm với API key mới"
                ) : (
                  "Get Results"
                )}
              </Button>
            </div>
            <GeminiKeyInput
              isOpen={showGeminiModal}
              onClose={() => {
                setShowGeminiModal(false);
                // Sau khi đổi key, có thể tự động retry nếu user muốn
              }}
            />
          </CardContent>
        </Card>
      </>
    );
  }

  return <SpeakingTab />;
}

function WritingContent() {
  const { state, selectedQuestionIds, setSelectedQuestionIds, filteredQuestions, resetExam, setResults } = useWriting();
  const [isGrading, setIsGrading] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [hasSelectedQuestions, setHasSelectedQuestions] = useState(false);
  const [quotaExceededInfo] = useState<{
    completedCount: number;
    failedCount: number;
  } | null>(null);

  const handleGrade = async () => {
    if (state.answers.length === 0) {
      setShowNoAnswerModal(true);
      return;
    }

    setIsGrading(true);
    setGradingError(null);

    try {
      // Filter answers: chỉ lấy các câu hỏi đã chọn
      const filteredQuestionIds = new Set(selectedQuestionIds);
      const filteredAnswers = state.answers.filter((answer) => 
        filteredQuestionIds.has(answer.questionId)
      );

      // Organize answers by part
      const part1 = filteredAnswers.filter((a) => a.questionType === 1);
      const part2 = filteredAnswers.filter((a) => a.questionType === 2);
      const part3 = filteredAnswers.filter((a) => a.questionType === 3);

      const apiKey = typeof window !== "undefined" ? localStorage.getItem("GEMINI_API_KEY") : null;
      if (!apiKey) {
        setGradingError("Please connect your Gemini API key first.");
        setIsGrading(false);
        return;
      }

      // Filter questions and images: chỉ lấy các câu hỏi đã chọn
      const filteredQuestionsMap: Record<string, string> = {};
      const filteredImagesMap: Record<string, string> = {};
      
      filteredQuestions.forEach((q) => {
        if (state.questions?.[q.id]) {
          filteredQuestionsMap[q.id] = state.questions[q.id];
        }
        if (state.images?.[q.id]) {
          filteredImagesMap[q.id] = state.images[q.id];
        }
      });

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
          questions: filteredQuestionsMap,
          images: filteredImagesMap,
          apiKey,
        }),
      });

      // Đọc raw text trước để tránh crash khi body rỗng / không phải JSON
      const rawText = await response.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseError) {
        console.error("Failed to parse writing grading response:", parseError, rawText);
        setGradingError("Có lỗi xảy ra khi đọc phản hồi từ server. Vui lòng thử lại.");
        setIsGrading(false);
        return;
      }

      // Handle API errors with specific codes
      if (!response.ok) {
        if (data.code === "API_KEY_INVALID") {
          setGradingError("API key không hợp lệ. Vui lòng nhấn nút 'Kết nối Gemini' ở góc trên để nhập API key mới.");
        } else if (data.code === "RATE_LIMIT") {
          setGradingError("Đã vượt quá giới hạn request. Vui lòng nhập API key khác hoặc đợi vài phút rồi thử lại.");
        } else if (data.code === "PERMISSION_DENIED") {
          setGradingError("API key không có quyền truy cập. Vui lòng kiểm tra quyền của API key.");
        } else if (data.code === "MODEL_NOT_FOUND") {
          setGradingError("Model không khả dụng (đã thử từ Gemini 3.0 → 2.5 → 1.5). Hãy kiểm tra project API key hoặc bật thêm model trong Google AI Studio.");
        } else {
          setGradingError(data.error || "Có lỗi xảy ra khi chấm điểm. Vui lòng thử lại.");
        }
        setIsGrading(false);
        return;
      }
      
      // Check for incomplete data response
      if (data.incomplete) {
        setGradingError(data.message || "Chưa đầy đủ thông tin. Vui lòng hoàn thành tất cả các câu hỏi.");
        setIsGrading(false);
        return;
      }

      const results: WritingGradingResponse = data;
      setResults(results);
    } catch (error) {
      console.error("Grading error:", error);
      setGradingError("Có lỗi xảy ra khi chấm điểm. Vui lòng thử lại.");
    } finally {
      setIsGrading(false);
    }
  };

  // Show question selector if not selected yet
  if (!hasSelectedQuestions) {
    return (
      <div>
        <QuestionSelector
          questions={writingQuestions}
          examType="writing"
          onConfirm={(ids) => {
            setSelectedQuestionIds(ids);
            setHasSelectedQuestions(true);
          }}
        />
      </div>
    );
  }

  if (state.isFinished && state.results) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Writing Test Results</h2>
          <Button variant="outline" onClick={() => {
            resetExam();
            setHasSelectedQuestions(false);
          }} className="text-black">
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
            <div className={`mb-4 rounded-lg p-4 ${
              gradingError.includes("Chưa đầy đủ") 
                ? "bg-green-100 text-green-700 border border-green-300" 
                : quotaExceededInfo
                ? "bg-yellow-50 text-yellow-800 border border-yellow-300"
                : "bg-error/20 text-error"
            }`}>
              <div className="space-y-2">
                <p>{gradingError}</p>
                {quotaExceededInfo && (
                  <div className="mt-3 text-sm">
                    <p className="font-semibold mb-1">Tiến độ hiện tại:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li className="text-green-700">
                        ✅ Đã transcribe thành công: {quotaExceededInfo.completedCount} câu
                      </li>
                      <li className="text-yellow-700">
                        ⏳ Còn lại cần transcribe: {quotaExceededInfo.failedCount} câu
                      </li>
                    </ul>
                    <p className="mt-2 text-xs text-yellow-600">
                      Sau khi nhập API key mới, hệ thống sẽ chỉ transcribe các câu còn lại, không cần làm lại từ đầu.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {quotaExceededInfo && (
              <Button
                onClick={() => setShowGeminiModal(true)}
                variant="outline"
                size="lg"
                className="gap-2 border-yellow-400 text-yellow-700 hover:bg-yellow-50"
              >
                Đổi API Key
              </Button>
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
              ) : quotaExceededInfo ? (
                "Tiếp tục chấm với API key mới"
              ) : (
                "Get Results"
              )}
            </Button>
          </div>
          <GeminiKeyInput
            isOpen={showGeminiModal}
            onClose={() => {
              setShowGeminiModal(false);
              // Sau khi đổi key, có thể tự động retry nếu user muốn
            }}
          />
        </CardContent>
      </Card>
      </>
    );
  }

  return <WritingTab />;
}

// Wrapper component to handle tab switching and reset logic
function TabContentWrapper({ activeTab }: { activeTab: string }) {
  const { clearQuestionSelection: clearSpeakingSelection } = useSpeaking();
  const { clearQuestionSelection: clearWritingSelection } = useWriting();
  const [prevTab, setPrevTab] = useState(activeTab);

  // Reset question selection when switching tabs
  useEffect(() => {
    if (prevTab !== activeTab) {
      // Clear question selection for the tab being hidden
      if (prevTab === "speaking") {
        clearSpeakingSelection();
        // Clear shown instructions for speaking
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("speaking-shown-instructions");
        }
      } else if (prevTab === "writing") {
        clearWritingSelection();
        // Clear shown instructions for writing
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("writing-shown-instructions");
        }
      }
      setPrevTab(activeTab);
    }
  }, [activeTab, prevTab, clearSpeakingSelection, clearWritingSelection]);

  return null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("");

  return (
    <ThemeProvider>
      <StorageCleanup />
      <Header />
      <SpeakingProvider>
        <WritingProvider>
          <TabContentWrapper activeTab={activeTab} />
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

                  {!activeTab ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center justify-center min-h-[400px]"
                    >
                      <Card className="bg-slate-50 border border-slate-200">
                        <CardContent className="p-12 text-center">
                          <p className="text-lg text-slate-600">
                            Vui lòng chọn tab Speaking hoặc Writing để bắt đầu làm bài
                          </p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ) : (
                    <>
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
                    </>
                  )}
                </Tabs>
              </div>
            </div>
          </div>
        </WritingProvider>
      </SpeakingProvider>
    </ThemeProvider>
  );
}
