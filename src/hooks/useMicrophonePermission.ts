import { useState, useRef, useCallback, useEffect } from "react";

export type MicrophoneState =
  | "idle"           // Chưa kiểm tra
  | "unsupported"    // Trình duyệt không hỗ trợ getUserMedia
  | "prompt"         // Chưa cấp quyền, cần hiển thị prompt
  | "denied"         // Người dùng từ chối/block
  | "granted";       // Đã có quyền

export type DeviceState =
  | "unknown"        // Chưa kiểm tra
  | "no-devices"     // Không có microphone nào
  | "available"      // Có microphone khả dụng
  | "in-use"         // Microphone đang bị sử dụng bởi app khác
  | "disconnected";  // Microphone bị ngắt kết nối giữa chừng

export type CodecInfo = {
  mimeType: string;
  supported: boolean;
};

export interface MicrophoneStatus {
  permission: MicrophoneState;
  device: DeviceState;
  codec: string | null;
  codecList: CodecInfo[];
  error: string | null;
  stream: MediaStream | null;
}

const CODECS_TO_TEST: string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/wav",
];

export function useMicrophonePermission() {
  const [status, setStatus] = useState<MicrophoneStatus>({
    permission: "idle",
    device: "unknown",
    codec: null,
    codecList: [],
    error: null,
    stream: null,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"untested" | "passed" | "failed" | "empty">("untested");
  const [testVolume, setTestVolume] = useState<number>(0);

  // Detect available codecs
  const detectCodecs = useCallback((): CodecInfo[] => {
    return CODECS_TO_TEST.map((mimeType) => ({
      mimeType,
      supported: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType),
    }));
  }, []);

  // Get best available codec
  const getBestCodec = useCallback((): string | null => {
    for (const codec of CODECS_TO_TEST) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(codec)) {
        return codec;
      }
    }
    return null;
  }, []);

  // Check initial permission state (without prompting)
  const checkPermission = useCallback(async (): Promise<MicrophoneState> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus((prev) => ({ ...prev, permission: "unsupported", error: "getUserMedia not supported" }));
      return "unsupported";
    }

    try {
      // Check Permissions API (silent)
      if (navigator.permissions?.query) {
        const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
        const state = result.state as PermissionState;
        if (state === "granted") {
          setStatus((prev) => ({ ...prev, permission: "granted" }));
          return "granted";
        }
        if (state === "denied") {
          setStatus((prev) => ({ ...prev, permission: "denied", error: "Microphone permission denied" }));
          return "denied";
        }
        if (state === "prompt") {
          setStatus((prev) => ({ ...prev, permission: "prompt" }));
          return "prompt";
        }
      }

      // Fallback: Try getUserMedia with very short timeout
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setStatus((prev) => ({ ...prev, permission: "granted" }));
      return "granted";
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus((prev) => ({ ...prev, permission: "denied", error: "Microphone permission denied" }));
        return "denied";
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setStatus((prev) => ({ ...prev, permission: "prompt", device: "no-devices", error: "No microphone found" }));
        return "prompt";
      }
      setStatus((prev) => ({ ...prev, permission: "prompt", error: err?.message || "Unknown error" }));
      return "prompt";
    }
  }, []);

  // Request microphone permission (prompts user)
  const requestPermission = useCallback(async (): Promise<{ granted: boolean; stream: MediaStream | null; codec: string | null }> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus((prev) => ({ ...prev, permission: "unsupported", error: "getUserMedia not supported" }));
      return { granted: false, stream: null, codec: null };
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

      const bestCodec = getBestCodec();
      const codecList = detectCodecs();

      streamRef.current = stream;
      setStatus({
        permission: "granted",
        device: "available",
        codec: bestCodec,
        codecList,
        error: null,
        stream,
      });

      // Detect device disconnect
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          setStatus((prev) => ({
            ...prev,
            device: "disconnected",
            error: "Microphone disconnected",
          }));
        });
      });

      return { granted: true, stream, codec: bestCodec };
    } catch (err: any) {
      const name = err?.name || "";
      let deviceState: DeviceState = "unknown";

      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus((prev) => ({ ...prev, permission: "denied", error: "Microphone permission denied" }));
        return { granted: false, stream: null, codec: null };
      }

      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        deviceState = "no-devices";
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        deviceState = "in-use";
      }

      setStatus((prev) => ({
        ...prev,
        permission: "prompt",
        device: deviceState,
        error: err?.message || "Failed to access microphone",
        stream: null,
      }));

      return { granted: false, stream: null, codec: null };
    }
  }, [getBestCodec, detectCodecs]);

  // Test microphone for actual audio input (detect empty stream)
  const testMicrophone = useCallback(async (): Promise<"passed" | "failed" | "empty"> => {
    setIsTesting(true);
    setTestResult("untested");
    setTestVolume(0);

    try {
      let stream = streamRef.current;
      if (!stream) {
        const result = await requestPermission();
        if (!result.granted || !result.stream) {
          setTestResult("failed");
          setIsTesting(false);
          return "failed";
        }
        stream = result.stream;
      }

      // Use AudioContext to analyze audio input
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Check for audio signal over 1 second
      let maxVolume = 0;
      const checkInterval = 100; // Check every 100ms
      const totalChecks = 10; // 1 second total

      return new Promise((resolve) => {
        let checkCount = 0;
        const interval = setInterval(() => {
          analyser.getByteFrequencyData(dataArray);
          const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          maxVolume = Math.max(maxVolume, volume);
          setTestVolume(volume);

          checkCount++;
          if (checkCount >= totalChecks) {
            clearInterval(interval);
            source.disconnect();
            audioContext.close();

            // If max volume is very low, it might be an empty/silent stream
            if (maxVolume < 2) {
              setTestResult("empty");
              setIsTesting(false);
              resolve("empty");
            } else {
              setTestResult("passed");
              setIsTesting(false);
              resolve("passed");
            }
          }
        }, checkInterval);
      });
    } catch (err) {
      setTestResult("failed");
      setIsTesting(false);
      return "failed";
    }
  }, [requestPermission]);

  // Check available devices
  const checkDevices = useCallback(async (): Promise<DeviceState> => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return "unknown";
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");

      if (audioInputs.length === 0) {
        setStatus((prev) => ({ ...prev, device: "no-devices" }));
        return "no-devices";
      }

      setStatus((prev) => ({ ...prev, device: "available" }));
      return "available";
    } catch {
      return "unknown";
    }
  }, []);

  // Release the stream
  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStatus((prev) => ({
      ...prev,
      stream: null,
      permission: "idle",
      device: "unknown",
      error: null,
    }));
    setTestResult("untested");
    setTestVolume(0);
    setIsTesting(false);
  }, []);

  // Check on mount
  useEffect(() => {
    checkPermission();
    checkDevices();
    const codecList = detectCodecs();
    const bestCodec = getBestCodec();
    setStatus((prev) => ({ ...prev, codec: bestCodec, codecList }));
  }, [checkPermission, checkDevices, detectCodecs, getBestCodec]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      releaseStream();
    };
  }, [releaseStream]);

  return {
    status,
    isTesting,
    testResult,
    testVolume,
    streamRef,
    testAudioRef,
    checkPermission,
    requestPermission,
    testMicrophone,
    checkDevices,
    detectCodecs,
    getBestCodec,
    releaseStream,
  };
}
