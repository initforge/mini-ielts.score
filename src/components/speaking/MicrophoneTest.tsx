import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, AlertTriangle, CheckCircle2, Loader2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMicrophonePermission, MicrophoneState, DeviceState } from "@/hooks/useMicrophonePermission";

interface MicrophoneTestProps {
  className?: string;
  onTestComplete?: (result: { permission: MicrophoneState; device: DeviceState; codec: string | null; audioDetected: boolean }) => void;
  showResults?: boolean;
}

export default function MicrophoneTest({
  className,
  onTestComplete,
  showResults = true,
}: MicrophoneTestProps) {
  const {
    status,
    isTesting,
    testResult,
    testVolume,
    checkPermission,
    requestPermission,
    testMicrophone,
    checkDevices,
    releaseStream,
  } = useMicrophonePermission();

  const [localTestStage, setLocalTestStage] = useState<"idle" | "checking" | "testing" | "done">("idle");
  const permissionLabel = getPermissionLabel(status.permission);
  const deviceLabel = getDeviceLabel(status.device);

  const handleTest = async () => {
    setLocalTestStage("checking");

    // Step 1: Check permission
    const perm = await checkPermission();
    if (perm === "denied" || perm === "unsupported") {
      setLocalTestStage("done");
      onTestComplete?.({
        permission: perm,
        device: status.device,
        codec: status.codec,
        audioDetected: false,
      });
      return;
    }

    // Step 2: Request permission if needed
    if (perm !== "granted") {
      const result = await requestPermission();
      if (!result.granted) {
        setLocalTestStage("done");
        onTestComplete?.({
          permission: status.permission,
          device: status.device,
          codec: status.codec,
          audioDetected: false,
        });
        return;
      }
    }

    await checkDevices();

    // Step 3: Test audio input
    setLocalTestStage("testing");
    const audioResult = await testMicrophone();
    setLocalTestStage("done");

    onTestComplete?.({
      permission: status.permission,
      device: status.device,
      codec: status.codec,
      audioDetected: audioResult === "passed",
    });
  };

  if (!showResults) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Status Display */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Permission */}
        <div
          className={cn(
            "rounded-xl border p-4",
            status.permission === "granted"
              ? "border-green-300 bg-green-50"
              : status.permission === "denied"
              ? "border-red-300 bg-red-50"
              : status.permission === "unsupported"
              ? "border-red-300 bg-red-50"
              : "border-yellow-300 bg-yellow-50"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {status.permission === "granted" ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : status.permission === "denied" || status.permission === "unsupported" ? (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            ) : (
              <Mic className="h-5 w-5 text-yellow-600" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Permission
            </span>
          </div>
          <p className={cn(
            "text-sm font-medium",
            status.permission === "granted" ? "text-green-700" : "text-slate-600"
          )}>
            {permissionLabel}
          </p>
        </div>

        {/* Device */}
        <div
          className={cn(
            "rounded-xl border p-4",
            status.device === "available"
              ? "border-green-300 bg-green-50"
              : status.device === "no-devices"
              ? "border-red-300 bg-red-50"
              : status.device === "disconnected"
              ? "border-red-300 bg-red-50"
              : "border-slate-300 bg-slate-50"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {status.device === "available" ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : status.device === "no-devices" || status.device === "disconnected" ? (
              <MicOff className="h-5 w-5 text-red-600" />
            ) : (
              <Mic className="h-5 w-5 text-slate-400" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Device
            </span>
          </div>
          <p className={cn(
            "text-sm font-medium",
            status.device === "available" ? "text-green-700" : "text-slate-600"
          )}>
            {deviceLabel}
          </p>
        </div>

        {/* Codec */}
        <div
          className={cn(
            "rounded-xl border p-4",
            status.codec
              ? "border-green-300 bg-green-50"
              : "border-slate-300 bg-slate-50"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {status.codec ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-slate-400" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Codec
            </span>
          </div>
          <p className={cn(
            "text-sm font-medium",
            status.codec ? "text-green-700" : "text-slate-600"
          )}>
            {status.codec || "None available"}
          </p>
        </div>
      </div>

      {/* Audio Test Visualization */}
      {isTesting && (
        <div className="rounded-xl border border-blue-300 bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm font-medium text-blue-700">
              Testing audio input...
            </span>
          </div>
          {/* Volume meter */}
          <div className="mt-3 h-2 rounded-full bg-blue-200 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-blue-600"
              animate={{ width: `${Math.min(testVolume * 2, 100)}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </div>
      )}

      {/* Test Result */}
      {testResult === "passed" && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-semibold text-green-700">
              Audio detected - Microphone is working!
            </span>
          </div>
        </div>
      )}

      {testResult === "empty" && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
          <div className="flex items-center gap-2">
            <VolumeX className="h-5 w-5 text-yellow-600" />
            <span className="text-sm font-semibold text-yellow-700">
              No audio detected - Microphone may be muted or not connected.
            </span>
          </div>
        </div>
      )}

      {testResult === "failed" && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <MicOff className="h-5 w-5 text-red-600" />
            <span className="text-sm font-semibold text-red-700">
              Microphone test failed - Please check your device settings.
            </span>
          </div>
        </div>
      )}

      {/* Available Codecs Info */}
      {status.codecList.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-700 mb-2">Supported Codecs:</p>
          <div className="flex flex-wrap gap-2">
            {status.codecList.map((codec) => (
              <span
                key={codec.mimeType}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-1 text-xs",
                  codec.supported
                    ? codec.mimeType === status.codec
                      ? "bg-green-100 text-green-700 border border-green-300"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                    : "bg-red-50 text-red-500 border border-red-200 line-through"
                )}
              >
                {codec.mimeType.replace("audio/", "").replace(";codecs=", " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {status.error && status.permission !== "granted" && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">Error</p>
              <p className="text-sm text-red-600">{status.error}</p>
              {status.permission === "denied" && (
                <p className="mt-1 text-xs text-red-500">
                  Please go to your browser settings → Privacy → Microphone and allow access for this site.
                </p>
              )}
              {status.permission === "unsupported" && (
                <p className="mt-1 text-xs text-red-500">
                  Your browser does not support microphone access. Please use a modern browser (Chrome, Firefox, Edge).
                </p>
              )}
              {!navigator.mediaDevices?.getUserMedia && (
                <p className="mt-1 text-xs text-red-500">
                  Microphone access requires HTTPS or localhost. Please use a secure connection.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test Button */}
      <div className="flex gap-2">
        <Button
          onClick={handleTest}
          disabled={isTesting || localTestStage === "testing"}
          className="gap-2"
          size="sm"
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              Test Microphone
            </>
          )}
        </Button>
        {status.stream && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => releaseStream()}
            className="gap-2 border-slate-300 text-slate-700"
          >
            <MicOff className="h-4 w-4" />
            Release
          </Button>
        )}
      </div>
    </div>
  );
}

function getPermissionLabel(state: MicrophoneState): string {
  switch (state) {
    case "idle":
      return "Not checked";
    case "unsupported":
      return "Not supported";
    case "prompt":
      return "Permission needed";
    case "denied":
      return "Denied";
    case "granted":
      return "Granted";
    default:
      return "Unknown";
  }
}

function getDeviceLabel(state: DeviceState): string {
  switch (state) {
    case "unknown":
      return "Not checked";
    case "no-devices":
      return "No microphone found";
    case "available":
      return "Microphone ready";
    case "in-use":
      return "In use by another app";
    case "disconnected":
      return "Disconnected";
    default:
      return "Unknown";
  }
}
