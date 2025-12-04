"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface SpeakingInstructionModalProps {
  isOpen: boolean;
  title: string;
  instructions: string | React.ReactNode;
  onStart: () => void;
}

export default function SpeakingInstructionModal({
  isOpen,
  title,
  instructions,
  onStart,
}: SpeakingInstructionModalProps) {
  if (!isOpen || typeof window === "undefined") return null;

  const modalContent = (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          style={{ zIndex: 999998 }}
        />
        
        {/* Modal */}
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 999999 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl"
            >
              <Card className="bg-white border border-slate-200 shadow-2xl">
                <CardHeader className="border-b border-slate-200">
                  <h3 className="text-2xl font-bold text-slate-900">{title}</h3>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="text-slate-700 mb-6 whitespace-pre-line leading-relaxed">
                    {typeof instructions === "string" ? (
                      <p>{instructions}</p>
                    ) : (
                      instructions
                    )}
                  </div>
                  <div className="flex justify-center">
                    <Button
                      onClick={onStart}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2"
                      size="lg"
                    >
                      Bắt đầu
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </>
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
