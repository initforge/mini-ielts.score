import { useMemo } from 'react';
import { X, Play } from 'lucide-react';
import { Question, Section } from '../../../../types/exam';
import { ResponseDraft } from '../../store/attemptStore';
import { isListeningSection } from '../core/format';

interface QuestionPaletteProps {
  open: boolean;
  onClose: () => void;
  questions: Question[];
  sections: Section[];
  responses: Record<number, ResponseDraft>;
  currentQuestionIndex: number;
  practiceMode: boolean;
  onSelect: (index: number) => void;
}

export function QuestionPalette({
  open,
  onClose,
  questions,
  sections,
  responses,
  currentQuestionIndex,
  practiceMode,
  onSelect,
}: QuestionPaletteProps) {
  const answeredCount = useMemo(
    () =>
      questions.filter((q) => {
        const draft = responses[q.id];
        return draft !== undefined && draft.selected_option_id !== null;
      }).length,
    [questions, responses],
  );

  const currentQuestion = questions[currentQuestionIndex];
  const currentSection = currentQuestion
    ? sections.find((s) => s.id === currentQuestion.section_id)
    : undefined;
  const currentIsListening = currentSection ? isListeningSection(currentSection) : true;

  const sectionQuestions = useMemo(() => {
    const map = new Map<number, Question[]>();
    for (const q of questions) {
      if (!map.has(q.section_id)) map.set(q.section_id, []);
      map.get(q.section_id)?.push(q);
    }
    return map;
  }, [questions]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-[360px] max-w-[92vw] h-full bg-slate-50 flex flex-col shadow-2xl">
        <div className="p-5 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold text-slate-800">Bảng câu hỏi</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors flex items-center text-sm font-medium"
              aria-label="Đóng"
            >
              Đóng <X className="w-4 h-4 ml-1" />
            </button>
          </div>
          <div className="mt-2 space-y-0.5">
            <p className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md inline-block">
              Đã trả lời {answeredCount}/{questions.length}
            </p>
            <p className="text-xs text-slate-400 mt-1">Click ô số để nhảy tới câu</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {sections.map((section) => {
            const sectionQs = sectionQuestions.get(section.id) || [];
            if (sectionQs.length === 0) return null;

            const first = sectionQs[0].displayNumber;
            const last = sectionQs[sectionQs.length - 1].displayNumber;
            const isDifferentGroup =
              !practiceMode && isListeningSection(section) !== currentIsListening;

            return (
              <div key={section.id}>
                <div className="flex items-center gap-2 mb-3">
                  <Play className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
                  <h3 className="font-bold text-slate-700 text-sm">
                    Part {section.order_index} <span className="text-slate-400 font-normal">({first}-{last})</span>
                  </h3>
                </div>

                <div className="grid grid-cols-6 gap-2">
                  {sectionQs.map((q) => {
                    const qIndex = questions.findIndex((x) => x.id === q.id);
                    const isCurrent = qIndex === currentQuestionIndex;
                    const draft = responses[q.id];
                    const isAnswered = draft !== undefined && draft.selected_option_id !== null;
                    const isMarked = draft?.marked_for_review === true;

                    let buttonClass =
                      'w-full aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all cursor-pointer ';
                    if (isCurrent) {
                      buttonClass += 'bg-blue-600 text-white shadow-md shadow-blue-600/20';
                    } else if (isAnswered || isMarked) {
                      buttonClass += isMarked
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200';
                    } else {
                      buttonClass += 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:bg-slate-50';
                    }
                    if (isDifferentGroup) {
                      buttonClass += ' opacity-40 cursor-not-allowed';
                    }

                    return (
                      <button
                        key={q.id}
                        onClick={() => {
                          if (!isDifferentGroup) onSelect(qIndex);
                        }}
                        disabled={isDifferentGroup}
                        className={buttonClass}
                        aria-label={`Câu ${q.displayNumber}${isAnswered ? ' đã trả lời' : ''}${isMarked ? ', đánh dấu xem lại' : ''}`}
                      >
                        {q.displayNumber}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
