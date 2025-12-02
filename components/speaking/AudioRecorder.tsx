"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import Timer from "@/components/shared/Timer";
import { cn, formatTime, blobToBase64 } from "@/lib/utils";

interface AudioRecorderProps {
  maxDuration: number; // in seconds
  onRecordingComplete: (audioBlob: Blob, audioBase64: string) => void;
  disabled?: boolean;
}

export default function AudioRecorder({
  maxDuration,
  onRecordingComplete,
  disabled = false,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        const base64 = await blobToBase64(blob);
        onRecordingComplete(blob, base64);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTimeElapsed(0);

      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setTimeElapsed((prev) => {
          const newTime = prev + 1;
          if (newTime >= maxDuration) {
            stopRecording();
            return maxDuration;
          }
          return newTime;
        });
      }, 1000);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Failed to access microphone. Please check your permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onpause = () => setIsPlaying(false);
    }
  }, [audioUrl]);

  const remainingTime = maxDuration - timeElapsed;
  const showWarning = remainingTime <= 10 && remainingTime > 0;

  return (
    <div className="space-y-6">
      {/* Recording Button */}
      <div className="flex flex-col items-center gap-4">
        <motion.button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || (audioBlob !== null && !isRecording)}
          className={cn(
            "relative flex h-24 w-24 items-center justify-center rounded-full transition-all duration-200",
            isRecording
              ? "bg-error shadow-lg shadow-error/50"
              : "bg-brand-primary text-brand-bg shadow-lg border border-brand-primary",
            "hover:scale-105 active:scale-95",
            (disabled || (audioBlob !== null && !isRecording)) && "opacity-50 cursor-not-allowed"
          )}
          whileHover={!disabled && !(audioBlob !== null && !isRecording) ? { scale: 1.05 } : {}}
          whileTap={!disabled && !(audioBlob !== null && !isRecording) ? { scale: 0.95 } : {}}
        >
          {isRecording ? (
            <>
              <Square className="h-8 w-8 text-white" />
              <motion.div
                className="absolute inset-0 rounded-full border-4 border-error"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </>
          ) : (
            <Mic className="h-10 w-10 text-white" />
          )}
        </motion.button>

        {isRecording && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 text-error">
              <motion.span
                className="h-2 w-2 rounded-full bg-error"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              REC
            </span>
          </div>
        )}
      </div>

      {/* Timer */}
      {isRecording && (
        <div className="flex justify-center">
          <Timer
            initialSeconds={remainingTime}
            onComplete={stopRecording}
            showWarning={true}
            warningThreshold={10}
          />
        </div>
      )}

      {/* Playback Controls */}
      {audioBlob && !isRecording && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="secondary"
            size="lg"
            onClick={togglePlayback}
            className="gap-2 text-black"
          >
            {isPlaying ? (
              <>
                <Pause className="h-5 w-5 text-black" />
                <span className="text-black">Pause</span>
              </>
            ) : (
              <>
                <Play className="h-5 w-5 text-black" />
                <span className="text-black">Play</span>
              </>
            )}
          </Button>
          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} className="hidden" />
          )}
        </div>
      )}

      {/* Time Display */}
      {!isRecording && audioBlob && (
        <div className="text-center text-sm text-text-muted">
          Recording completed ({formatTime(timeElapsed)})
        </div>
      )}
    </div>
  );
}
