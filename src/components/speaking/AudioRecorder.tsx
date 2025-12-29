import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import Timer from "@/components/shared/Timer";
import { cn, formatTime, blobToBase64 } from "@/lib/utils";
import { getAudio } from "@/lib/audioStorage";
import { SpeakingAudioPlayer } from "./SpeakingAudioPlayer";
import { speakingAudio } from "@/lib/speakingAudio";

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
  const [shouldPlayBeepOnTimeout, setShouldPlayBeepOnTimeout] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null); // Track actual recording start time
  const stopTimeoutRef = useRef<number | null>(null); // Hard cap recording duration
  const mimeTypeRef = useRef<string>("audio/webm"); // Store mimeType for blob creation

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
      // Request high-quality audio
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100, // High quality sample rate
        }
      });
      streamRef.current = stream;

      // Try to use better codec if available
      let mimeType = "audio/webm";
      const codecs = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      
      for (const codec of codecs) {
        if (MediaRecorder.isTypeSupported(codec)) {
          mimeType = codec;
          console.log(`[AudioRecorder] Using codec: ${mimeType}`);
          break;
        }
      }
      
      mimeTypeRef.current = mimeType;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000, // Higher bitrate for better quality
      });
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
        const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
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

      // Store actual recording start time BEFORE starting recorder
      recordingStartTimeRef.current = Date.now();
      
      mediaRecorder.start();
      setIsRecording(true);
      onRecordingChange?.(true);
      setTimeElapsed(0);

      // Hard stop after EXACT maxDuration seconds (no buffer to ensure accuracy)
      if (stopTimeoutRef.current !== null) {
        window.clearTimeout(stopTimeoutRef.current);
      }
      stopTimeoutRef.current = window.setTimeout(() => {
        console.log(`[AudioRecorder] Hard stop timeout triggered after ${maxDuration}s`);
        // Play beep khi timeout
        setShouldPlayBeepOnTimeout(true);
        stopRecording();
      }, maxDuration * 1000); // Exact duration, no buffer
    } catch (error: any) {
      console.error("Error starting recording:", error);
      // Check if it's a permission/HTTPS issue
      const isPermissionError = error?.name === 'NotAllowedError' || 
                                error?.name === 'NotReadableError' ||
                                error?.message?.includes('getUserMedia') ||
                                !navigator.mediaDevices?.getUserMedia;
      
      if (isPermissionError && window.location.protocol === 'http:') {
        setShowErrorModal(true);
        // Update error message to mention HTTPS requirement
        console.warn('Microphone access requires HTTPS. Please use HTTPS or localhost.');
      } else {
        setShowErrorModal(true);
      }
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
    // Play beep khi timer complete
    setShouldPlayBeepOnTimeout(true);
    stopRecording();
  };
  
  // Play beep khi isLocked thay đổi (timeout từ bên ngoài)
  useEffect(() => {
    if (isLocked && isRecording) {
      setShouldPlayBeepOnTimeout(true);
      stopRecording();
    }
  }, [isLocked]);

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
        message={
          window.location.protocol === 'http:' && window.location.hostname !== 'localhost'
            ? "Microphone access requires HTTPS connection. Please contact administrator to setup SSL certificate, or use localhost for development."
            : "Failed to access microphone. Please check your browser permissions and allow microphone access when prompted."
        }
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
              onTick={(remaining) => {
                // Sync timer with actual recording time
                if (recordingStartTimeRef.current) {
                  const actualElapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
                  const actualRemaining = Math.max(0, maxDuration - actualElapsed);
                  // If timer is off by more than 1 second, force sync
                  if (Math.abs(actualRemaining - remaining) > 1) {
                    console.log(`[AudioRecorder] Timer sync: timer=${remaining}s, actual=${actualRemaining}s`);
                  }
                }
              }}
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
      
      {/* Beep audio khi timeout */}
      {shouldPlayBeepOnTimeout && (
        <SpeakingAudioPlayer
          src={speakingAudio.system.beep}
          autoPlay={true}
          onEnded={() => setShouldPlayBeepOnTimeout(false)}
        />
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
