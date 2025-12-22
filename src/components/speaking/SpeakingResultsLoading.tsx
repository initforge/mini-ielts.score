import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { speakingQuestions } from "@/lib/mockData";

export default function SpeakingResultsLoading() {
  // Nhóm câu hỏi theo part để hiển thị skeleton giống trang kết quả thật
  const questionsByPart: Record<number, typeof speakingQuestions> = {};
  speakingQuestions.forEach((q) => {
    if (!questionsByPart[q.part]) {
      questionsByPart[q.part] = [];
    }
    questionsByPart[q.part].push(q);
  });

  const partLabels: Record<number, string> = {
    1: "Part 1 – Read aloud (Q1-2)",
    2: "Part 2 – Picture (Q3)",
    3: "Part 3 – Q&A (Q4-6)",
    4: "Part 4 – Info response (Q7-9)",
    5: "Part 5 – Opinion (Q10)",
    6: "Part 6 – Written prompt (Q11)",
  };

  return (
    <div className="space-y-8">
      {/* Overall skeleton */}
      <Card>
        <CardHeader>
          <h3 className="text-xl font-bold text-slate-900">Speaking Results đang được chấm...</h3>
        </CardHeader>
        <CardContent className="flex items-center gap-3 text-slate-700">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          <span>Vui lòng đợi, hệ thống đang transcribe audio theo batch và chấm điểm bài làm của bạn.</span>
        </CardContent>
      </Card>

      {/* Skeleton cho từng part / question */}
      {Object.entries(questionsByPart).map(([partStr, questions]) => {
        const part = Number(partStr);
        return (
          <Card key={part}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-[#1e3a8a]">
                  {partLabels[part] || `Part ${part}`}
                </h4>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang chấm...</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {questions.map((q) => (
                <Card key={q.id} className="bg-slate-50 border-dashed border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-[#1e3a8a]">
                        Question {q.questionNumber}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Đang xử lý...</span>
                      </div>
                    </div>
                    <div className="h-4 w-3/4 rounded bg-slate-200 animate-pulse mb-2" />
                    <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}


