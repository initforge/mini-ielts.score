import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SpeakingQuestion, WritingQuestion } from "@/lib/types";

interface QuestionSelectorProps {
  questions: (SpeakingQuestion | WritingQuestion)[];
  examType: "speaking" | "writing";
  onConfirm: (selectedQuestionIds: string[]) => void;
}

const partLabels: Record<number, { title: string; description: string }> = {
  1: {
    title: "Part 1",
    description: "Read aloud / Write sentences"
  },
  2: {
    title: "Part 2",
    description: "Picture / Email response"
  },
  3: {
    title: "Part 3",
    description: "Q&A / Opinion essay"
  },
  4: {
    title: "Part 4",
    description: "Info response"
  },
  5: {
    title: "Part 5",
    description: "Opinion"
  },
};

export default function QuestionSelector({ questions, examType, onConfirm }: QuestionSelectorProps) {
  // Mặc định chọn tất cả các câu
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>(
    questions.map((q) => q.id)
  );

  const toggleQuestion = (questionId: string) => {
    setSelectedQuestionIds((prev) => {
      if (prev.includes(questionId)) {
        // Bỏ chọn câu này
        const newIds = prev.filter((id) => id !== questionId);
        // Đảm bảo ít nhất chọn 1 câu
        return newIds.length > 0 ? newIds : prev;
      } else {
        // Chọn câu này
        return [...prev, questionId];
      }
    });
  };

  const togglePart = (part: number) => {
    const partQuestions = questions.filter((q) => q.part === part);
    const partQuestionIds = partQuestions.map((q) => q.id);
    const allSelected = partQuestionIds.every((id) => selectedQuestionIds.includes(id));

    if (allSelected) {
      // Bỏ chọn tất cả câu trong part này
      setSelectedQuestionIds((prev) => {
        const newIds = prev.filter((id) => !partQuestionIds.includes(id));
        // Đảm bảo ít nhất chọn 1 câu
        return newIds.length > 0 ? newIds : prev;
      });
    } else {
      // Chọn tất cả câu trong part này
      setSelectedQuestionIds((prev) => {
        const newIds = [...prev];
        partQuestionIds.forEach((id) => {
          if (!newIds.includes(id)) {
            newIds.push(id);
          }
        });
        return newIds;
      });
    }
  };

  const handleConfirm = () => {
    if (selectedQuestionIds.length > 0) {
      onConfirm(selectedQuestionIds);
    }
  };

  // Group questions by part
  const questionsByPart: Record<number, (SpeakingQuestion | WritingQuestion)[]> = {};
  questions.forEach((q) => {
    if (!questionsByPart[q.part]) {
      questionsByPart[q.part] = [];
    }
    questionsByPart[q.part].push(q);
  });

  const parts = Object.keys(questionsByPart).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="mb-2 text-3xl font-bold gradient-text tracking-wide">
          Chọn Câu Hỏi
        </h2>
        <p className="text-slate-600">
          Chọn các câu hỏi bạn muốn làm bài. Bạn có thể tick/bỏ tick từng câu hoặc cả part.
        </p>
      </div>

      <div className="space-y-6">
        {parts.map((part) => {
          const partQuestions = questionsByPart[part];
          const partQuestionIds = partQuestions.map((q) => q.id);
          const allSelected = partQuestionIds.every((id) => selectedQuestionIds.includes(id));
          // const someSelected = partQuestionIds.some((id) => selectedQuestionIds.includes(id));
          const partInfo = partLabels[part] || { title: `Part ${part}`, description: "" };

          return (
            <Card
              key={part}
              className="bg-slate-50 border-2 border-slate-200 rounded-2xl shadow-sm"
            >
              <CardHeader className="bg-slate-50 rounded-t-2xl border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {partInfo.title}
                    </h3>
                    <p className="text-sm text-slate-600">{partInfo.description}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => togglePart(part)}
                    className="gap-2"
                  >
                    {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {partQuestions.map((question) => {
                    const isSelected = selectedQuestionIds.includes(question.id);

                    return (
                      <motion.div
                        key={question.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Card
                          className={`
                            cursor-pointer transition-all duration-200
                            ${isSelected
                              ? "bg-blue-50 border-2 border-blue-500 shadow-md"
                              : "bg-white border-2 border-slate-300 hover:border-slate-400"
                            }
                          `}
                          onClick={() => toggleQuestion(question.id)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-bold text-slate-900">
                                    Question {question.questionNumber}
                                  </span>
                                  {isSelected && (
                                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 line-clamp-2">
                                  {(() => {
                                    // Speaking: tất cả các part hiển thị mô tả tính chất
                                    if (examType === "speaking") {
                                      if (question.part === 1) return "Read aloud";
                                      if (question.part === 2) return "Describe picture";
                                      if (question.part === 3) return "Respond to question";
                                      if (question.part === 4) return "Respond using information";
                                      if (question.part === 5) return "Express opinion";
                                    }
                                    // Writing: tất cả các part hiển thị mô tả tính chất
                                    if (examType === "writing") {
                                      if (question.part === 1) return "Write sentence";
                                      if (question.part === 2) return "Email response";
                                      if (question.part === 3) return "Opinion essay";
                                    }
                                    return "No description";
                                  })()}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-blue-50 p-4 border border-blue-200">
        <div>
          <p className="font-semibold text-slate-900">
            Đã chọn: {selectedQuestionIds.length} / {questions.length} câu hỏi
          </p>
          <p className="text-sm text-slate-600">
            {parts.length} phần • {selectedQuestionIds.length} câu đã chọn
          </p>
        </div>
        <Button
          onClick={handleConfirm}
          disabled={selectedQuestionIds.length === 0}
          size="lg"
          className="gap-2"
        >
          Bắt đầu làm bài
        </Button>
      </div>
    </div>
  );
}

