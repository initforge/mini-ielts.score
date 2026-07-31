import { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { sanitizeText } from "@/lib/sanitize";

interface WordCountEditorProps {
  value: string;
  onChange: (value: string) => void;
  minWords: number;
  questionId: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const AUTOSAVE_PREFIX = "writing-autosave-answer-";
const AUTOSAVE_DEBOUNCE_MS = 1000;

export default function WordCountEditor({
  value,
  onChange,
  minWords: _minWords,
  questionId,
  placeholder = "Type your answer here...",
  className,
  disabled = false,
}: WordCountEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>("");

  // Autosave to sessionStorage (debounced)
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
          console.error(`[WordCountEditor] Autosave failed for ${questionId}:`, err);
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [questionId]
  );

  // Restore from autosave on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`${AUTOSAVE_PREFIX}${questionId}`);
      if (saved && saved !== value && !disabled) {
        // Sanitize before restore
        const sanitized = sanitizeText(saved);
        if (sanitized && sanitized !== value) {
          onChange(sanitized);
        }
      }
    } catch (err) {
      console.error(`[WordCountEditor] Restore failed for ${questionId}:`, err);
    }
    // Intentionally only on mount + questionId change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Trigger autosave when value changes
  useEffect(() => {
    if (value !== lastSavedContentRef.current) {
      autosave(value);
    }
  }, [value, autosave]);

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
    // Apply DOMPurify to strip any injected HTML from paste
    const sanitized = sanitizeText(rawValue);
    onChange(sanitized);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // When pasting rich HTML (e.g., from Word), strip all formatting
    // and only keep plain text. Let the textarea handle text pastes normally.
    const clipboardData = e.clipboardData;
    const htmlData = clipboardData.getData("text/html");

    if (htmlData) {
      e.preventDefault();
      // Extract plain text from HTML
      const doc = new DOMParser().parseFromString(htmlData, "text/html");
      const plainText = doc.body.textContent || "";

      // Insert at cursor
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = value.substring(0, start) + plainText + value.substring(end);
        onChange(sanitizeText(newValue));
      } else {
        onChange(sanitizeText(value + plainText));
      }
    }
    // Plain text pastes are handled by the onChange handler + sanitization
  };

  return (
    <div className={cn("relative", className)}>
      <motion.textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "min-h-[300px] w-full rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 resize-none",
          disabled && "cursor-not-allowed opacity-50 bg-slate-100"
        )}
      />
    </div>
  );
}
