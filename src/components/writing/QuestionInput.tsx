import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { sanitizeQuestionText } from "@/lib/sanitize";

interface QuestionInputProps {
  questionId: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

const AUTOSAVE_PREFIX = "writing-autosave-question-";
const AUTOSAVE_DEBOUNCE_MS = 1000;

export default function QuestionInput({
  questionId,
  value,
  onChange,
  placeholder = "Paste your question here...",
}: QuestionInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>("");

  // Sync from parent
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Autosave to sessionStorage
  const autosave = useCallback(
    (text: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        try {
          sessionStorage.setItem(`${AUTOSAVE_PREFIX}${questionId}`, text);
          lastSavedContentRef.current = text;
        } catch (err) {
          console.error(`[QuestionInput] Autosave failed for ${questionId}:`, err);
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [questionId]
  );

  // Restore from autosave on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`${AUTOSAVE_PREFIX}${questionId}`);
      if (saved && saved !== localValue) {
        const sanitized = sanitizeQuestionText(saved);
        if (sanitized && sanitized !== value) {
          setLocalValue(sanitized);
          onChange(sanitized);
        }
      }
    } catch (err) {
      console.error(`[QuestionInput] Restore failed for ${questionId}:`, err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Trigger autosave
  useEffect(() => {
    if (localValue !== lastSavedContentRef.current) {
      autosave(localValue);
    }
  }, [localValue, autosave]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const rawValue = e.target.value;
    // Sanitize: strip any HTML from pasted content
    const sanitized = sanitizeQuestionText(rawValue);
    setLocalValue(sanitized);
    onChange(sanitized);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    const htmlData = clipboardData.getData("text/html");

    if (htmlData) {
      e.preventDefault();
      const doc = new DOMParser().parseFromString(htmlData, "text/html");
      const plainText = doc.body.textContent || "";

      const textarea = e.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = localValue.substring(0, start) + plainText + localValue.substring(end);

      setLocalValue(newValue);
      onChange(newValue);
    }
    // Plain text paste: sanitized naturally via onChange handler
  };

  return (
    <Card className="bg-slate-50 border border-slate-200 mb-4">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-4 w-4 text-slate-600" />
          <label className="text-sm font-semibold text-slate-900">
            Question Text
          </label>
        </div>
        <textarea
          value={localValue}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder={placeholder}
          className="w-full min-h-[100px] rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 resize-none"
        />
      </CardContent>
    </Card>
  );
}
