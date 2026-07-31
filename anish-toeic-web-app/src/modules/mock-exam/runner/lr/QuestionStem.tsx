import DOMPurify from 'dompurify';
import { splitStem } from '../core/format';

interface QuestionStemProps {
  displayNumber: number;
  html: string;
  bilingual: boolean;
}

export function QuestionStem({ displayNumber, html, bilingual }: QuestionStemProps) {
  const { main, translation } = splitStem(html ?? '');
  return (
    <div className="flex items-start gap-3">
      <span className="text-slate-700 font-bold shrink-0 min-w-6 text-right">{displayNumber}.</span>
      <div className="min-w-0">
        {main.trim() && (
          <div
            className="prose prose-slate max-w-none text-[15px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(main) }}
          />
        )}
        {bilingual && translation && (
          <div
            className="prose prose-blue max-w-none text-[14px] leading-relaxed text-blue-700 mt-1"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(translation) }}
          />
        )}
      </div>
    </div>
  );
}
