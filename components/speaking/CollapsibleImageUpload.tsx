"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import ImageUpload from "@/components/writing/ImageUpload";

interface CollapsibleImageUploadProps {
  part: number;
  value?: string; // base64 or URL
  onChange: (imageData: string | null) => void;
  label?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export default function CollapsibleImageUpload({
  part,
  value,
  onChange,
  label = "Upload Image",
  defaultExpanded = false,
  className,
}: CollapsibleImageUploadProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div className={cn("w-full", className)}>
      {/* Collapsed State - Placeholder */}
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-2 border-dashed border-slate-300 rounded-lg p-4 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
            onClick={handleToggle}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <ImageIcon className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {value ? "Image uploaded" : "Click to upload image"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {value ? "Click to expand and view/edit" : "Drag & drop or click to select"}
                  </p>
                </div>
              </div>
              <ChevronDown className="h-5 w-5 text-slate-400" />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            {/* Header with collapse button */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">{label}</span>
              </div>
              <button
                onClick={handleToggle}
                className="p-1 hover:bg-slate-200 rounded transition-colors"
                aria-label="Collapse"
              >
                <ChevronUp className="h-4 w-4 text-slate-600" />
              </button>
            </div>
            
            {/* ImageUpload Component */}
            <ImageUpload
              part={part}
              value={value}
              onChange={onChange}
              label={label}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
