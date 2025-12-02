"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface RubricCardProps {
  name: string;
  score: number;
  maxScore: number;
  explanation: string;
  index?: number;
  className?: string;
}

export default function RubricCard({
  name,
  score,
  maxScore,
  explanation,
  index = 0,
  className,
}: RubricCardProps) {
  const percentage = (score / maxScore) * 100;
  const isStrong = percentage >= 70;
  const isWeak = percentage < 50;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-lg",
          className
        )}
      >
        <CardContent className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-semibold text-[#1e3a8a]">{name}</h4>
            <div className="text-right">
              <span className="text-xl font-bold text-black">
                {score}
              </span>
              <span className="ml-1 text-sm text-black">/ {maxScore}</span>
            </div>
          </div>
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-brand-bg-alt border border-brand-border/50">
            <motion.div
              className={cn(
                "h-full",
                isStrong
                  ? "bg-success"
                  : isWeak
                  ? "bg-warning"
                  : "bg-brand-accent"
              )}
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ delay: index * 0.05 + 0.2, duration: 0.5 }}
            />
          </div>
          <p className="text-sm text-black leading-relaxed">{explanation}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
