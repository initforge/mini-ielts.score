import { Option, Question } from '../../../../types/exam';
import { OptionList } from './OptionList';
import { QuestionStem } from './QuestionStem';

interface PartFiveViewProps {
  question: Question;
  options: Option[];
  selectedOptionId: number | null;
  bilingual: boolean;
  onSelect: (optionId: number) => void;
}

export function PartFiveView({ question, options, selectedOptionId, bilingual, onSelect }: PartFiveViewProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <div className="mb-6">
          <QuestionStem displayNumber={question.displayNumber ?? 0} html={question.content ?? ''} bilingual={bilingual} />
        </div>
        <OptionList options={options} selectedOptionId={selectedOptionId} onSelect={onSelect} bilingual={bilingual} />
      </div>
    </div>
  );
}
