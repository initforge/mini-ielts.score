"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ResultCardProps {
  title: string;
  score: number;
  maxScore?: number;
  children?: React.ReactNode;
  className?: string;
  gradientHeader?: boolean;
}

export default function ResultCard({
  title,
  score,
  maxScore = 200,
  children,
  className,
  gradientHeader = true,
}: ResultCardProps) {
  const percentage = (score / maxScore) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#1e3a8a]">{title}</h3>
            <div className="text-right">
              <motion.div
                className="text-3xl font-bold text-black"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                {score}
              </motion.div>
              <div className="text-sm text-black">/ {maxScore}</div>
            </div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-brand-bg-alt">
            <motion.div
              className="h-full bg-brand-accent"
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </CardHeader>
        {children && <CardContent>{children}</CardContent>}
      </Card>
    </motion.div>
  );
}
