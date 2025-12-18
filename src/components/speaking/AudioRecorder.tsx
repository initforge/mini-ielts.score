import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import Timer from "@/components/shared/Timer";
import { cn, formatTime, blobToBase64 } from "@/lib/utils";
import { getAudio } from "@/lib/audioStorage";

interface AudioRecorderProps {
  maxDuration: number; // in seconds
  onRecordingComplete: (audioBlob: Blob, audioBase64: string) => void;
  disabled?: boolean;
  isLocked?: boolean;
  questionId?: string; // For loading persisted audio
  savedAudioUrl?: string; // Pre-loaded audio URL from sessionStorage
  autoStartKey?: number; // change to trigger auto start (e.g., after prep)
  onRecordingChange?: (isRecording: boolean) => void;
}

export default function AudioRecorder({
  maxDuration,
  onRecordingComplete,
  disabled = false,
  isLocked = false,
  questionId,
  savedAudioUrl,
  autoStartKey,
  onRecordingChange,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [actualDuration, setActualDuration] = useState<number | null>(null); // Actual audio duration from audio element
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(savedAudioUrl || null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null); // Track actual recording start time
  const stopTimeoutRef = useRef<number | null>(null); // Hard cap recording duration

  // Load saved audio from IndexedDB when switching questions so playback is per-question
  useEffect(() => {
    if (!questionId) return;

    let cancelled = false;

    // Reset state when question changes
    setAudioBlob(null);
    setAudioUrl(savedAudioUrl || null);
    setActualDuration(null);
    setTimeElapsed(0);
    setIsPlaying(false);

    (async () => {
      try {
        const blob = await getAudio(questionId);
        if (!blob || cancelled) return;
        const url = URL.createObjectURL(blob);
              setAudioBlob(blob);
        setAudioUrl(url);

              const audio = new Audio(url);
        audio.addEventListener("loadedmetadata", () => {
          if (cancelled) return;
                const duration = Math.floor(audio.duration);
                setActualDuration(duration);
                setTimeElapsed(duration);
              });
      } catch (error) {
            console.error("Failed to load audio from IndexedDB:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [questionId, savedAudioUrl]);

  useEffect(() => {
    return () => {
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (stopTimeoutRef.current !== null) {
        window.clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
      // Don't revoke URL if it's from savedAudioUrl prop (managed by parent)
      if (audioUrl && audioUrl !== savedAudioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl, savedAudioUrl]);

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
        if (stopTimeoutRef.current !== null) {
          window.clearTimeout(stopTimeoutRef.current);
          stopTimeoutRef.current = null;
        }
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Calculate actual duration from audio element
        const audio = new Audio(url);
        audio.addEventListener('loadedmetadata', () => {
          const duration = Math.floor(audio.duration);
          setActualDuration(duration);
        });

        const base64 = await blobToBase64(blob);
        onRecordingComplete(blob, base64);
      };

      mediaRecorder.start();
      setIsRecording(true);
      onRecordingChange?.(true);
      setTimeElapsed(0);
      
      // Store actual recording start time for accurate timer
      recordingStartTimeRef.current = Date.now();

      // Hard stop after maxDuration seconds in case Timer UI is throttled / tab is background
      if (stopTimeoutRef.current !== null) {
        window.clearTimeout(stopTimeoutRef.current);
      }
      stopTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, maxDuration * 1000 + 250); // small buffer
    } catch (error) {
      console.error("Error starting recording:", error);
      setShowErrorModal(true);
    }
  };

  const stopRecording = () => {
    // Always attempt to stop mediaRecorder if it exists.
    // We DON'T depend on React state here because timeouts may capture stale isRecording.
    if (!mediaRecorderRef.current) return;

      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      setIsRecording(false);
    onRecordingChange?.(false);
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    // Calculate final elapsed time (clamped to maxDuration for safety)
      if (recordingStartTimeRef.current) {
      const finalElapsed = Math.min(
        maxDuration,
        Math.floor((Date.now() - recordingStartTimeRef.current) / 1000)
      );
        setTimeElapsed(finalElapsed);
        recordingStartTimeRef.current = null;
    }
  };

  // Handle timer completion from Timer component
  const handleTimerComplete = () => {
    stopRecording();
  };

  // Auto-start recording when key changes (e.g., after preparation finishes)
  useEffect(() => {
    if (autoStartKey === undefined || autoStartKey === 0) return;
    if (isLocked || disabled || isRecording) return;
    // Only auto-start if we don't already have audio for this question
    if (audioBlob || audioUrl) return;
    // Small delay to ensure UI is ready
    const timeoutId = setTimeout(() => {
      startRecording();
    }, 100);
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartKey]);

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
    if (audioRef.current && audioUrl) {
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onpause = () => setIsPlaying(false);
      
      // Get actual duration when audio is loaded
      const updateDuration = () => {
        if (audioRef.current && !isNaN(audioRef.current.duration)) {
          const duration = Math.floor(audioRef.current.duration);
          setActualDuration(duration);
        }
      };
      
      audioRef.current.addEventListener('loadedmetadata', updateDuration);
      if (audioRef.current.readyState >= 1) {
        updateDuration();
      }
      
      return () => {
        audioRef.current?.removeEventListener('loadedmetadata', updateDuration);
      };
    }
  }, [audioUrl]);


  const hasAudio = !!audioBlob || !!audioUrl;

  return (
    <div className="space-y-6">
      <Modal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title="Microphone Access Error"
        message="Failed to access microphone. Please check your permissions and try again."
        type="alert"
        confirmText="OK"
      />
      {/* Recording Button */}
      <div className="flex flex-col items-center gap-4">
        <motion.button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || isLocked}
          className={cn(
            "relative flex h-24 w-24 items-center justify-center rounded-full transition-all duration-200",
            isLocked
              ? "bg-slate-400 cursor-not-allowed opacity-50"
              : isRecording
              ? "bg-error shadow-lg shadow-error/50"
              : "bg-brand-primary text-brand-bg shadow-lg border border-brand-primary",
            "hover:scale-105 active:scale-95",
            (disabled || isLocked) && "opacity-50 cursor-not-allowed"
          )}
          whileHover={!disabled && !isLocked ? { scale: 1.05 } : {}}
          whileTap={!disabled && !isLocked ? { scale: 0.95 } : {}}
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

      {/* Timer - Only show when recording */}
      {isRecording && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex justify-center">
            <Timer
              initialSeconds={maxDuration}
              onComplete={handleTimerComplete}
              showWarning={true}
              warningThreshold={10}
            />
          </div>
        </div>
      )}

      {/* Locked State */}
      {isLocked && !isRecording && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-center text-red-600 font-medium">
            Time expired - Recording locked
          </div>
        </div>
      )}

      {/* Playback Controls - Show if audio exists and NOT recording */}
      {hasAudio && !isRecording && (
        <div className="flex flex-col items-center gap-4">
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
                  <span className="text-black">Play Recording</span>
                </>
              )}
            </Button>
            {audioUrl && (
              <audio ref={audioRef} src={audioUrl} className="hidden" />
            )}
          </div>
          
          {/* Time Display */}
          <div className="text-center text-sm text-slate-600">
            {hasAudio ? (
              <>
                Recording available
                {actualDuration !== null && ` (${formatTime(actualDuration)})`}
                {timeElapsed > 0 && actualDuration === null && ` (${formatTime(timeElapsed)})`}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
