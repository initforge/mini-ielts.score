"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface GeminiKeyInputProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GeminiKeyInput({ isOpen, onClose }: GeminiKeyInputProps) {
  const [apiKey, setApiKey] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("GEMINI_API_KEY");
      if (saved) {
        setApiKey(saved);
        setIsConnected(true);
      }
    }
  }, []);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem("GEMINI_API_KEY", apiKey.trim());
      setIsConnected(true);
      onClose();
    }
  };

  const handleRemove = () => {
    localStorage.removeItem("GEMINI_API_KEY");
    setApiKey("");
    setIsConnected(false);
  };

  const handleOpenGuide = () => {
    window.open("https://youtu.be/JZCjL3hrvcY?si=EqisXabAFRCPU4MU", "_blank");
  };

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

  if (!isOpen || typeof window === "undefined") return null;

  const modalContent = (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          style={{ zIndex: 999998, position: 'fixed' }}
        />
        
        {/* Modal */}
        <div 
          className="fixed inset-0 flex items-start justify-center p-4 pt-8 pointer-events-none"
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'auto',
            zIndex: 999999
          }}
        >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: "spring", duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md mt-8 pointer-events-auto"
            >
              <Card className="bg-white border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200">
                  <h3 className="text-xl font-bold text-slate-900">
                    Kết nối Gemini API
                  </h3>
                  <button
                    onClick={onClose}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </CardHeader>
                <CardContent className="pt-6">
                  {isConnected && apiKey ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-medium text-green-900">
                          Đã kết nối thành công
                        </span>
                      </div>
                      <div className="text-sm text-slate-600">
                        API Key đã được lưu trong localStorage.
                      </div>
                      <Button
                        onClick={handleRemove}
                        variant="outline"
                        className="w-full border-red-300 text-red-700 hover:bg-red-50"
                      >
                        Xóa kết nối
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-900 mb-2">
                          Gemini API Key
                        </label>
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Nhập API key của bạn..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <Button
                        onClick={handleOpenGuide}
                        variant="outline"
                        className="w-full border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Hướng dẫn lấy key
                      </Button>
                      <Button
                        onClick={handleSave}
                        disabled={!apiKey.trim()}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Lưu
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </>
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
