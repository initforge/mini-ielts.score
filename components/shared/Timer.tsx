"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn, formatTime } from "@/lib/utils";

interface TimerProps {
  initialSeconds: number;
  onComplete?: () => void;
  onTick?: (remaining: number) => void;
  className?: string;
  showWarning?: boolean;
  warningThreshold?: number;
}

export default function Timer({
  initialSeconds,
  onComplete,
  onTick,
  className,
  showWarning = true,
  warningThreshold = 10,
}: TimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const isWarning = showWarning && seconds <= warningThreshold && seconds > 0;

  useEffect(() => {
    if (seconds <= 0) {
      onComplete?.();
      return;
    }

    const interval = setInterval(() => {
      setSeconds((prev) => {
        const newValue = prev - 1;
        onTick?.(newValue);
        if (newValue <= 0) {
          onComplete?.();
        }
        return newValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [seconds, onComplete, onTick]);

  return (
    <motion.div
      className={cn(
        "flex items-center gap-2 font-mono text-xl font-bold",
        isWarning ? "text-warning" : className?.includes("text-white") ? "text-white" : "text-slate-900",
        className
      )}
      animate={isWarning ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 1, repeat: Infinity }}
    >
      <span
        className={cn(
          "inline-block rounded-lg px-3 py-1",
          className?.includes("text-white")
            ? "bg-white/20 border border-white/30 text-white"
            : isWarning
            ? "bg-warning/20 border-warning/50 text-warning animate-pulse-glow"
            : "bg-slate-100 border border-slate-300 text-slate-900"
        )}
      >
        {formatTime(seconds)}
      </span>
    </motion.div>
  );
}
