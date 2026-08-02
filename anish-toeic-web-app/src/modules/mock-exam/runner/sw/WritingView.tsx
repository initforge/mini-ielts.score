/**
 * WritingView — plain-text writing editor with live word count,
 * debounced autosave (textResponse + clientRevision) and content
 * restore on resume. Covers AC16. Quill + DOMPurify removed: the
 * answer is plain text, so a <textarea> is sufficient.
 */
import { useEffect } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useSWStore } from './swStore';
import { SWQuestion } from './types';

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface WritingViewProps {
  question: SWQuestion;
}

export function WritingView({ question }: WritingViewProps) {
  const text = useSWStore((s) => s.writingTexts[question.id] ?? '');
  const dirty = useSWStore((s) => !!s.writingDirty[question.id]);
  const setWritingText = useSWStore((s) => s.setWritingText);

  // Flush pending autosave before leaving the question.
  useEffect(() => {
    return () => {
      void useSWStore.getState().flushWritingAutosave(question.id);
    };
  }, [question.id]);

  const wordCount = countWords(text);

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Prompt */}
      <div className="p-6 border-b border-slate-100">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Part {question.part} &middot; Question {question.questionNumber} &middot; Writing
        </div>
        {question.imageUrl && (
          <img
            src={question.imageUrl}
            alt="Question prompt"
            className="w-full max-h-64 object-contain rounded-xl mb-4 border border-slate-100"
          />
        )}
        <p className="text-slate-800 text-lg leading-relaxed whitespace-pre-wrap">{question.content}</p>
        {question.minWords ? (
          <p className="text-sm text-slate-500 mt-3">
            Minimum {question.minWords} words.
          </p>
        ) : null}
      </div>

      {/* Editor */}
      <div className="p-6">
        <textarea
          value={text}
          onChange={(e) => setWritingText(question.id, e.target.value)}
          placeholder="Nhập câu trả lời của bạn..."
          rows={12}
          className="w-full min-h-[240px] rounded-xl border border-slate-300 p-4 text-base leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
        />

        {/* Footer: word count + autosave status */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
          <span className="text-slate-600 font-medium">
            Từ: <span className="font-bold text-slate-900">{wordCount}</span>
          </span>
          {dirty ? (
            <span className="inline-flex items-center gap-1.5 text-blue-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang lưu...
            </span>
          ) : wordCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã lưu
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <AlertTriangle className="w-3.5 h-3.5" /> Tự động lưu khi bạn gõ
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
