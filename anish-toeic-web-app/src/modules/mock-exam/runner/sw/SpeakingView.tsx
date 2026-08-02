/**
 * SpeakingView — prep timer + audio recording + playback + upload states.
 *
 * Covers AC14 (microphone test, speaking phases, timers, recording,
 * device failures) and AC15-FE (upload retry, failure states, no data loss).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic,
  Square,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Clock,
  Upload,
  Loader2,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { useSWStore } from './swStore';
import { SWQuestion } from './types';

// ── helpers ──────────────────────────────────────────────────────────────

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function detectEmptyMic(stream: MediaStream): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let maxVol = 0;
      let ticks = 0;
      const iv = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const vol = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        maxVol = Math.max(maxVol, vol);
        ticks++;
        if (ticks >= 5) {
          clearInterval(iv);
          source.disconnect();
          audioContext.close();
          resolve(maxVol < 2);
        }
      }, 200);
    } catch {
      resolve(false);
    }
  });
}

// ── component ────────────────────────────────────────────────────────────

interface SpeakingViewProps {
  question: SWQuestion;
}

export function SpeakingView({ question }: SpeakingViewProps) {
  const phase = useSWStore((s) => s.phase);
  const prepActive = useSWStore((s) => s.prepActive);
  const prepSecondsLeft = useSWStore((s) => s.prepSecondsLeft);
  const recordActive = useSWStore((s) => s.recordActive);
  const recordSecondsLeft = useSWStore((s) => s.recordSecondsLeft);
  const recordingLocked = useSWStore((s) => s.recordingLocked);
  const speakingResponses = useSWStore((s) => s.speakingResponses);
  const uploadErrors = useSWStore((s) => s.uploadErrors);
  const micStatus = useSWStore((s) => s.micStatus);
  const setMicStatus = useSWStore((s) => s.setMicStatus);
  const startPrep = useSWStore((s) => s.startPrep);
  const startRecording = useSWStore((s) => s.startRecording);
  const finishRecording = useSWStore((s) => s.finishRecording);
  const retryUpload = useSWStore((s) => s.retryUpload);
  const lockRecording = useSWStore((s) => s.lockRecording);

  const resp = speakingResponses[question.id];
  const uploadError = uploadErrors[question.id];

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);
  const autoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [localRecording, setLocalRecording] = useState(false);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [emptyWarning, setEmptyWarning] = useState(false);

  // Sync local recording state
  useEffect(() => {
    if (!recordActive && mediaRecorderRef.current?.state === 'recording') {
      stopRecorder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordActive]);

  // Tick prep timer
  useEffect(() => {
    if (!prepActive) return;
    const iv = setInterval(() => useSWStore.getState().tickPrep(), 1000);
    return () => clearInterval(iv);
  }, [prepActive]);

  // Tick recording timer
  useEffect(() => {
    if (!recordActive) return;
    const iv = setInterval(() => useSWStore.getState().tickRecording(), 1000);
    return () => clearInterval(iv);
  }, [recordActive]);

  const stopRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }
    setLocalRecording(false);
  }, []);

  const handleStartRecording = useCallback(async () => {
    setRecordingError(null);
    setEmptyWarning(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus({ state: 'unsupported', codec: null, error: 'No mic support' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;

      // Check for empty mic
      const isEmpty = await detectEmptyMic(stream);
      if (isEmpty) {
        setEmptyWarning(true);
        setMicStatus({ state: 'empty', codec: null, error: 'Low audio signal' });
      } else {
        setMicStatus({ state: 'granted', codec: null, error: null });
      }

      // Determine best mime type
      let mimeType = 'audio/webm';
      for (const codec of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
        if (MediaRecorder.isTypeSupported(codec)) { mimeType = codec; break; }
      }

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const duration = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        finishRecording(blob, Math.min(duration, question.recordTimeSeconds));
        setLocalRecording(false);
      };

      recorder.onerror = () => {
        setRecordingError('MediaRecorder error');
        stopRecorder();
      };

      recordingStartRef.current = Date.now();
      recorder.start();
      setLocalRecording(true);

      // Auto-stop after record time
      autoStopTimeoutRef.current = setTimeout(() => {
        lockRecording();
        stopRecorder();
      }, question.recordTimeSeconds * 1000);

      startRecording();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      const name = error.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicStatus({ state: 'denied', codec: null, error: 'Microphone permission denied' });
      } else if (name === 'NotFoundError') {
        setMicStatus({ state: 'disconnected', codec: null, error: 'No microphone found' });
      } else {
        setRecordingError(error.message);
      }
    }
  }, [question.recordTimeSeconds, finishRecording, lockRecording, setMicStatus, startRecording, stopRecorder]);

  const handleStopRecording = useCallback(() => {
    lockRecording();
    stopRecorder();
  }, [lockRecording, stopRecorder]);

  const handlePlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (playbackPlaying) {
      audioRef.current.pause();
      setPlaybackPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaybackPlaying(true);
    }
  }, [playbackPlaying]);

  // ── render ────────────────────────────────────────────────────────

  const isPrep = prepActive && phase === 'speaking_prep';
  const isRec = recordActive && phase === 'speaking_recording';
  const isPlayback = phase === 'speaking_playback' || (!isPrep && !isRec && !!resp?.blobUrl);
  const hasAudio = !!resp?.blobUrl;

  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      {/* Question content */}
      <div className="w-full mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Part {question.part} &middot; Question {question.questionNumber}
        </div>
        {question.imageUrl && (
          <img
            src={question.imageUrl}
            alt="Question prompt"
            className="w-full max-h-64 object-contain rounded-xl mb-4 border border-slate-100"
          />
        )}
        <div
          className="prose prose-slate max-w-none text-lg"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(question.content) }}
        />
      </div>

      {/* Timer display */}
      {isPrep && (
        <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-2xl text-center w-full max-w-md">
          <p className="text-blue-700 font-semibold text-sm uppercase tracking-wide mb-2">
            Preparation Time
          </p>
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-6 h-6 text-blue-600" />
            <span className="text-4xl font-mono font-bold text-blue-900">
              {formatTime(prepSecondsLeft)}
            </span>
          </div>
          <div className="mt-3 w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${(prepSecondsLeft / question.prepTimeSeconds) * 100}%` }}
            />
          </div>
          <p className="text-xs text-blue-600 mt-3">
            You have {question.prepTimeSeconds}s to prepare. Recording starts after preparation.
          </p>
          <button
            onClick={() => useSWStore.getState().finishPrep()}
            className="mt-3 text-xs text-blue-600 underline hover:text-blue-800"
            aria-label="Skip preparation"
          >
            Bỏ qua chuẩn bị
          </button>
        </div>
      )}

      {isRec && (
        <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-2xl text-center w-full max-w-md">
          <p className="text-red-700 font-semibold text-sm uppercase tracking-wide mb-2">
            Recording...
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-4xl font-mono font-bold text-red-900">
              {formatTime(recordSecondsLeft)}
            </span>
          </div>
          <div className="mt-3 w-full bg-red-200 rounded-full h-2">
            <div
              className="bg-red-600 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${(recordSecondsLeft / question.recordTimeSeconds) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Recording error */}
      {recordingError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl w-full max-w-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Recording Error</p>
              <p className="text-xs text-red-600">{recordingError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Empty mic warning */}
      {emptyWarning && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl w-full max-w-md">
          <div className="flex items-start gap-2">
            <Mic className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-yellow-700">Low Audio Signal</p>
              <p className="text-xs text-yellow-600">
                Your microphone may be muted or too quiet. You can still record.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mic denied / disconnected states */}
      {micStatus.state === 'denied' && !localRecording && !hasAudio && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl w-full max-w-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Microphone Denied</p>
              <p className="text-xs text-red-600">
                Please enable microphone access in browser settings to record your response.
              </p>
            </div>
          </div>
        </div>
      )}

      {micStatus.state === 'disconnected' && !localRecording && !hasAudio && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl w-full max-w-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-yellow-700">Microphone Disconnected</p>
              <p className="text-xs text-yellow-600">
                No microphone found. Please connect a microphone to continue.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recording controls */}
      <div className="flex flex-col items-center gap-4">
        {/* Start prep (speaking_prep with no active prep) */}
        {phase === 'speaking_prep' && !prepActive && !hasAudio && !recordingLocked && (
          <button
            onClick={startPrep}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors active:scale-95"
            aria-label="Start preparation"
          >
            <Clock className="w-5 h-5" /> Bắt đầu chuẩn bị
          </button>
        )}

        {/* Record button */}
        {!isPlayback && !isRec && !recordingLocked && !hasAudio && (
          <button
            onClick={handleStartRecording}
            disabled={recordingLocked || (phase === 'speaking_prep' && prepActive)}
            className="flex items-center justify-center w-20 h-20 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Start recording"
          >
            <Mic className="w-8 h-8" />
          </button>
        )}

        {/* Recording active */}
        {isRec && localRecording && (
          <button
            onClick={handleStopRecording}
            className="flex items-center justify-center w-20 h-20 rounded-full bg-red-600 text-white shadow-lg shadow-red-500/30 hover:bg-red-700 transition-all active:scale-95 animate-pulse"
            aria-label="Stop recording"
          >
            <Square className="w-8 h-8" />
          </button>
        )}

        {/* Recording locked / finished */}
        {recordingLocked && hasAudio && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <p className="text-sm text-slate-600">
              Recording saved ({resp?.duration ?? 0}s)
            </p>
          </div>
        )}

        {/* Playback */}
        {hasAudio && resp?.blobUrl && (
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayback}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              {playbackPlaying ? (
                <>
                  <Pause className="w-5 h-5" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" /> Play Recording
                </>
              )}
            </button>
            <audio
              ref={audioRef}
              src={resp.blobUrl}
              onEnded={() => setPlaybackPlaying(false)}
              onPause={() => setPlaybackPlaying(false)}
              className="hidden"
            />
          </div>
        )}

        {/* Upload status */}
        {resp && !resp.uploaded && (
          <div className="flex items-center gap-2 mt-2">
            {uploadError ? (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Upload failed: {uploadError}</span>
                <button
                  onClick={() => retryUpload(question.id)}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 underline text-sm"
                >
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading...</span>
              </div>
            )}
          </div>
        )}

        {resp?.uploaded && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <Upload className="w-4 h-4" />
            <span>Uploaded</span>
          </div>
        )}
      </div>
    </div>
  );
}
