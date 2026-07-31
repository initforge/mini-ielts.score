import { X, Play } from 'lucide-react';
import { Section, Question } from '../../types/exam';

interface QuestionPaletteDrawerProps {
  open: boolean;
  onClose: () => void;
  questions: Question[];
  sections: Section[];
  responses: Record<number, { selected_option_id: number | null; marked_for_review: boolean }>;
  currentQuestionIndex: number;
  onSelectQuestion: (index: number) => void;
}

export const QuestionPaletteDrawer = ({
  open,
  onClose,
  questions,
  sections,
  responses,
  currentQuestionIndex,
  onSelectQuestion
}: QuestionPaletteDrawerProps) => {
  if (!open) return null;

  // Calculate answered count
  const answeredCount = Object.keys(responses).length;

  // Group questions by section
  const sectionMap = new Map<number, Question[]>();
  questions.forEach(q => {
    if (!sectionMap.has(q.section_id)) {
      sectionMap.set(q.section_id, []);
    }
    sectionMap.get(q.section_id)?.push(q);
  });

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-[360px] h-full bg-slate-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-5 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold text-slate-800">Bảng câu hỏi</h2>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors flex items-center text-sm font-medium"
            >
              Đóng <X className="w-4 h-4 ml-1" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              Đã trả lời {answeredCount}/{questions.length}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {sections.map(section => {
            const sectionQuestions = sectionMap.get(section.id) || [];
            if (sectionQuestions.length === 0) return null;

            const firstQ = sectionQuestions[0].displayNumber;
            const lastQ = sectionQuestions[sectionQuestions.length - 1].displayNumber;
            
            return (
              <div key={section.id}>
                <div className="flex items-center gap-2 mb-3">
                  <Play className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
                  <h3 className="font-bold text-slate-700 text-sm">
                    {section.part_type || section.title} <span className="text-slate-400 font-normal">({firstQ}-{lastQ})</span>
                  </h3>
                </div>
                
                <div className="grid grid-cols-5 gap-2">
                  {sectionQuestions.map(q => {
                    const qIndex = questions.findIndex(x => x.id === q.id);
                    const isCurrent = qIndex === currentQuestionIndex;
                    const isAnswered = !!responses[q.id];

                    let btnClass = "w-full aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all cursor-pointer ";
                    
                    if (isCurrent) {
                      btnClass += "bg-blue-600 text-white shadow-md shadow-blue-600/20";
                    } else if (isAnswered) {
                      btnClass += "bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200";
                    } else {
                      btnClass += "bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:bg-slate-50";
                    }

                    return (
                      <button
                        key={q.id}
                        onClick={() => onSelectQuestion(qIndex)}
                        className={btnClass}
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
};
