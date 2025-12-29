import { useEffect, useState, useRef } from "react";
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
  const startTimeRef = useRef<number | null>(null);

  // Reset timer when initialSeconds changes (e.g., new recording starts)
  useEffect(() => {
    setSeconds(initialSeconds);
    startTimeRef.current = Date.now();
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) {
      onComplete?.();
      return;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    // Use more accurate timing with drift correction
    let expectedTime = startTimeRef.current + 1000;
    
    let timeoutId: NodeJS.Timeout;
    
    const tick = () => {
      const now = Date.now();
      const drift = now - expectedTime;
      
      // Calculate remaining seconds based on actual elapsed time from start
      const elapsed = Math.floor((now - (startTimeRef.current || now)) / 1000);
      const remaining = Math.max(0, initialSeconds - elapsed);
      
      if (remaining <= 0) {
        setSeconds(0);
          onComplete?.();
        return;
      }
      
      // Update state if value changed
      if (remaining !== seconds) {
        setSeconds(remaining);
        onTick?.(remaining);
      }
      
      // Schedule next tick with drift correction
      expectedTime += 1000;
      const delay = Math.max(0, 1000 - drift);
      timeoutId = setTimeout(tick, delay);
    };
    
    timeoutId = setTimeout(tick, 1000);
    return () => clearTimeout(timeoutId);
  }, [seconds, initialSeconds, onComplete, onTick]);

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
