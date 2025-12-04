"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

interface QuestionInputProps {
  questionId: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

export default function QuestionInput({
  questionId,
  value,
  onChange,
  placeholder = "Paste your question here...",
}: QuestionInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
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
          placeholder={placeholder}
          className="w-full min-h-[100px] rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 resize-none"
        />
      </CardContent>
    </Card>
  );
}
