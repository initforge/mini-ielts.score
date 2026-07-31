import DOMPurify from 'dompurify';
import { Option } from '../../../../types/exam';
import { splitOptionTranslation } from '../core/format';

interface OptionListProps {
  options: Option[];
  selectedOptionId: number | null;
  onSelect: (optionId: number) => void;
  bilingual: boolean;
}

export function OptionList({ options, selectedOptionId, onSelect, bilingual }: OptionListProps) {
  if (options.length === 0) {
    return (
      <div className="text-slate-400 italic font-medium py-4">
        (Hãy nghe audio để trả lời câu hỏi)
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {options.map((opt) => {
        const { main, translation } = splitOptionTranslation(opt.content ?? '');
        const isSelected = selectedOptionId === opt.id;
        return (
          <div
            key={opt.id}
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            onClick={() => onSelect(opt.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(opt.id);
              }
            }}
            className={`flex items-start p-3 rounded-xl cursor-pointer border-2 transition-all ${
              isSelected
                ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                : 'border-transparent bg-white hover:border-blue-200 hover:bg-slate-50 shadow-sm'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mr-3 text-xs font-bold transition-colors ${
                isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-500'
              }`}
            >
              {opt.label}
            </span>
            <div className={`text-[15px] ${isSelected ? 'text-blue-900 font-medium' : 'text-slate-700'}`}>
              <div
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(main || opt.content || '') }}
              />
              {bilingual && translation && (
                <div
                  className="text-blue-700 text-[14px] mt-0.5"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(translation) }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
