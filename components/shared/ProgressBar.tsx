"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  className?: string;
  showLabel?: boolean;
  accent?: "blue" | "indigo";
}

export default function ProgressBar({
  value,
  max = 100,
  className,
  showLabel = false,
  accent = "blue",
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const accentClass = accent === "indigo" 
    ? "bg-gradient-to-r from-indigo-500 to-violet-500" 
    : "bg-gradient-to-r from-cyan-500 to-blue-500";

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-medium">Progress</span>
          </div>
          <span className="font-semibold">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <motion.div
          className={cn("h-full", accentClass)}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
