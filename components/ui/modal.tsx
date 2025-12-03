"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "./button";
import { Card, CardContent, CardHeader } from "./card";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "alert" | "confirm";
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  message,
  type = "alert",
  onConfirm,
  confirmText = "OK",
  cancelText = "Cancel",
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={type === "alert" ? onClose : undefined}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <Card className="bg-white border border-slate-200 shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200">
                  <h3 className="text-xl font-bold text-slate-900">{title}</h3>
                  {type === "alert" && (
                    <button
                      onClick={onClose}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-slate-700 mb-6">{message}</p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-end">
                    {type === "confirm" && (
                      <Button
                        variant="outline"
                        onClick={onClose}
                        className="border-slate-300 text-slate-900 hover:bg-slate-50"
                      >
                        {cancelText}
                      </Button>
                    )}
                    <Button
                      onClick={handleConfirm}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      {confirmText}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
