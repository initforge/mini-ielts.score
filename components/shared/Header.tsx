"use client";

import { useState } from "react";
import Image from "next/image";
import { Mic, PenTool, GraduationCap } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const [imageError, setImageError] = useState(false);

  return (
    <header className="glass sticky top-0 z-50 border-b border-brand-border">
      <div className="container mx-auto px-4 py-3 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative h-10 w-10 flex-shrink-0 sm:h-12 sm:w-12">
            {!imageError ? (
              <Image
                src="/logo.jpg"
                alt="ANISH TOEIC Logo"
                fill
                className="rounded-lg object-cover"
                priority
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg bg-brand-bg-alt border border-brand-accent/30">
                <GraduationCap className="h-6 w-6 text-brand-accent sm:h-8 sm:w-8" />
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold gradient-text tracking-wide truncate">
              ANISH TOEIC
            </h1>
            <span className="text-text-muted text-xs sm:text-sm font-medium tracking-wider hidden sm:inline">
              Speaking & Writing Lab
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <Mic className="h-4 w-4 sm:h-5 sm:w-5 text-text-muted" />
            <PenTool className="h-4 w-4 sm:h-5 sm:w-5 text-text-muted" />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
