"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Mic, PenTool, GraduationCap, Key } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import GeminiKeyInput from "./GeminiKeyInput";

export default function Header() {
  const [imageError, setImageError] = useState(false);
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  // Check if Gemini key exists
  useEffect(() => {
    if (typeof window !== "undefined") {
      const key = localStorage.getItem("GEMINI_API_KEY");
      setHasGeminiKey(!!key);
    }
  }, [showGeminiModal]);

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
          <div className="ml-auto flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setShowGeminiModal(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                hasGeminiKey
                  ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-300"
                  : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-300"
              }`}
            >
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">
                {hasGeminiKey ? "Đã kết nối" : "Kết nối Gemini"}
              </span>
            </button>
            <ThemeToggle />
          </div>
          <GeminiKeyInput
            isOpen={showGeminiModal}
            onClose={() => {
              setShowGeminiModal(false);
              // Check again after closing
              if (typeof window !== "undefined") {
                const key = localStorage.getItem("GEMINI_API_KEY");
                setHasGeminiKey(!!key);
              }
            }}
          />
        </div>
      </div>
    </header>
  );
}
