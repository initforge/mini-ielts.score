import { useMemo } from 'react';
import { Option, Question, Section } from '../../../../types/exam';
import { ResponseDraft } from '../../store/attemptStore';
import { OptionList } from './OptionList';
import { PassagePane } from './PassagePane';
import { QuestionStem } from './QuestionStem';

interface PassageViewProps {
  section: Section;
  sectionQuestions: Question[];
  options: Record<number, Option[]>;
  responses: Record<number, ResponseDraft>;
  currentQuestionIndex: number;
  questions: Question[];
  bilingual: boolean;
  annotationOpen: boolean;
  annotationKey: string;
  onSelect: (questionId: number) => void;
}

export function PassageView({
  section,
  sectionQuestions,
  options,
  responses,
  currentQuestionIndex,
  questions,
  bilingual,
  annotationOpen,
  annotationKey,
  onSelect,
}: PassageViewProps) {
  // Convention: the passage for Parts 6-7 lives in section.instructions
  // ("Questions N-M refer to the following text." + passage HTML). If a
  // fixture instead stores it as an anchor question without options, use
  // that question's content. ponytail: revisit when the S2 fixture seeds
  // dedicated passage rows.
  const anchor = useMemo(
    () => sectionQuestions.find((q) => (options[q.id]?.length ?? 0) === 0),
    [sectionQuestions, options],
  );
  const passageHtml = useMemo(() => {
    const instructions = section.instructions?.trim();
    if (instructions && instructions.length > 20) return instructions;
    return anchor?.content ?? '';
  }, [section.instructions, anchor]);

  const questionCards = useMemo(
    () => sectionQuestions.filter((q) => (options[q.id]?.length ?? 0) > 0),
    [sectionQuestions, options],
  );

  return (
    <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
      <div className="flex-1 min-h-0 border-r border-slate-200">
        <PassagePane
          html={passageHtml}
          annotationKey={annotationKey}
          annotationOpen={annotationOpen}
          bilingual={bilingual}
        />
      </div>

      <div className="w-full md:w-[540px] bg-slate-50 overflow-y-auto">
        <div className="p-5 md:p-6 space-y-5">
          {questionCards.map((q) => {
            const qIndex = questions.findIndex((x) => x.id === q.id);
            const isCurrent = qIndex === currentQuestionIndex;
            const draft = responses[q.id];
            return (
              <div
                key={q.id}
                id={`question-${q.id}`}
                className={`rounded-xl p-4 transition-all ${
                  isCurrent
                    ? 'bg-white border-2 border-blue-600 shadow-md'
                    : 'bg-white border border-slate-200 shadow-sm'
                }`}
              >
                <div className="mb-4">
                  <QuestionStem displayNumber={q.displayNumber ?? 0} html={q.content ?? ''} bilingual={bilingual} />
                </div>
                <OptionList
                  options={options[q.id] ?? []}
                  selectedOptionId={draft?.selected_option_id ?? null}
                  onSelect={onSelect}
                  bilingual={bilingual}
                />
              </div>
            );
          })}
          {questionCards.length === 0 && (
            <div className="text-slate-400 italic text-center py-10">
              Phần này chưa có câu hỏi.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
