import { Option, Question } from '../../../../types/exam';
import { AudioPlayer } from './AudioPlayer';
import { OptionList } from './OptionList';
import { QuestionStem } from './QuestionStem';

interface ListeningViewProps {
  question: Question;
  options: Option[];
  selectedOptionId: number | null;
  bilingual: boolean;
  onSelect: (optionId: number) => void;
}

export function ListeningView({ question, options, selectedOptionId, bilingual, onSelect }: ListeningViewProps) {
  const content = question.content ?? '';
  const hasContent = content.trim().length > 0;

  return (
    <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
      <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white border-r border-slate-200 flex flex-col items-center">
        {question.audio_url && <AudioPlayer src={question.audio_url} />}

        {question.image_url && (
          <div className="w-full max-w-2xl bg-white p-2 rounded-xl mb-6">
            <img
              src={question.image_url}
              alt="Media câu hỏi"
              className="w-full h-auto object-contain rounded-lg shadow-sm border border-slate-100"
            />
          </div>
        )}

        {hasContent && (
          <div className="w-full max-w-3xl">
            <QuestionStem displayNumber={question.displayNumber ?? 0} html={content} bilingual={bilingual} />
          </div>
        )}

        {!question.image_url && !question.audio_url && !hasContent && (
          <div className="flex items-center justify-center h-full text-slate-400 font-medium italic">
            (Hãy nghe audio để trả lời câu hỏi)
          </div>
        )}
      </div>

      <div className="w-full md:w-[500px] bg-slate-50 overflow-y-auto">
        <div className="p-6 md:p-8">
          <div className="flex items-start mb-6">
            <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 mr-4 shadow-sm">
              {question.displayNumber}
            </div>
            <div className="flex-1">
              <OptionList
                options={options}
                selectedOptionId={selectedOptionId}
                onSelect={onSelect}
                bilingual={bilingual}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
