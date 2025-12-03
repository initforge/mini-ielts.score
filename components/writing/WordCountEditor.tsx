"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn, countWords } from "@/lib/utils";

interface WordCountEditorProps {
  value: string;
  onChange: (value: string) => void;
  minWords: number;
  questionId: string;
  placeholder?: string;
  className?: string;
}

export default function WordCountEditor({
  value,
  onChange,
  minWords,
  questionId,
  placeholder = "Type your answer here...",
  className,
}: WordCountEditorProps) {
  const [showShake, setShowShake] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Auto-save to sessionStorage (silent, no UI indication)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      sessionStorage.setItem(`writing-answer-${questionId}`, value);
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [value, questionId]);

  // Load from sessionStorage on mount, migrate from localStorage if needed
  useEffect(() => {
    const storageKey = `writing-answer-${questionId}`;
    let saved = sessionStorage.getItem(storageKey);
    
    // Migration: Check localStorage and move to sessionStorage if exists
    if (!saved) {
      const oldData = localStorage.getItem(storageKey);
      if (oldData) {
        sessionStorage.setItem(storageKey, oldData);
        localStorage.removeItem(storageKey);
        saved = oldData;
      }
    }
    
    if (saved && !value) {
      onChange(saved);
    }
  }, [questionId, onChange, value]);

  const wordCount = countWords(value);
  const isBelowMinimum = wordCount < minWords;

  const triggerShake = () => {
    setShowShake(true);
    setTimeout(() => setShowShake(false), 500);
  };

  return (
    <div className={cn("relative", className)}>
      <motion.textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "min-h-[300px] w-full rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 resize-none",
          showShake && "animate-shake"
        )}
        animate={showShake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
      />

    </div>
  );
}
