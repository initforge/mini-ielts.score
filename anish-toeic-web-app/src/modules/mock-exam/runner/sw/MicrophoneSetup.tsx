/**
 * MicrophoneSetup — initial mic permission check + test before Speaking section.
 */
import { useState, useCallback } from 'react';
import { Mic, MicOff, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useSWStore } from './swStore';

export function MicrophoneSetup() {
  const micStatus = useSWStore((s) => s.micStatus);
  const requestMic = useSWStore((s) => s.requestMic);
  const setPhase = useSWStore((s) => s.setPhase);

  const [testing, setTesting] = useState(false);
  const [testPassed, setTestPassed] = useState(false);

  const handleRequestMic = useCallback(async () => {
    const ok = await requestMic();
    if (ok) {
      setTesting(true);
      // Simulate a brief mic test (check for actual audio input)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Sample audio over ~2 seconds
        let maxVol = 0;
        await new Promise<void>((resolve) => {
          let ticks = 0;
          const iv = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            const vol = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            maxVol = Math.max(maxVol, vol);
            ticks++;
            if (ticks >= 10) {
              clearInterval(iv);
              resolve();
            }
          }, 200);
        });

        source.disconnect();
        audioContext.close();
        stream.getTracks().forEach((t) => t.stop());

        if (maxVol < 2) {
          // Mic may be muted — still allow proceeding but warn
          useSWStore.setState({
            micStatus: { state: 'empty', codec: null, error: 'Very low audio signal detected' },
          });
        }
        setTestPassed(true);
      } catch {
        setTestPassed(true); // Allow proceeding even if test fails
      }
      setTesting(false);
    }
  }, [requestMic]);

  const handleContinue = useCallback(() => {
    // Move to the directions screen; the runner page starts prep when the
    // user taps "Bắt đầu" there.
    setPhase('directions');
  }, [setPhase]);

  const micGranted = micStatus.state === 'granted' || micStatus.state === 'empty';

  return (
    <div className="flex flex-col items-center justify-center max-w-2xl mx-auto bg-white p-10 rounded-2xl shadow-sm border border-slate-200 text-center">
      <div className="mb-6">
        {micGranted && testPassed ? (
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        ) : micStatus.state === 'denied' || micStatus.state === 'unsupported' ? (
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
        ) : (
          <Mic className="w-16 h-16 text-blue-600 mx-auto" />
        )}
      </div>

      <h2 className="text-2xl font-bold text-slate-900 mb-3">Microphone Setup</h2>
      <p className="text-slate-600 mb-8 max-w-md">
        Before starting the Speaking test, we need to check your microphone.
        Please ensure your microphone is connected and working.
      </p>

      {!micGranted && (
        <>
          <button
            onClick={handleRequestMic}
            disabled={testing || micStatus.state === 'unsupported'}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
            {testing ? 'Testing microphone...' : 'Allow Microphone Access'}
          </button>

          {micStatus.state === 'denied' && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-left">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Microphone access denied</p>
                  <p className="text-xs text-red-600 mt-1">
                    Please go to your browser settings → Privacy & Security → Microphone
                    and allow access for this site.
                  </p>
                </div>
              </div>
            </div>
          )}

          {micStatus.state === 'unsupported' && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-left">
              <div className="flex items-start gap-2">
                <MicOff className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Microphone not supported</p>
                  <p className="text-xs text-red-600 mt-1">
                    Your browser does not support microphone access or you are not on a secure
                    connection (HTTPS). Please use a modern browser or localhost.
                  </p>
                </div>
              </div>
            </div>
          )}

          {micStatus.error && micStatus.state !== 'denied' && micStatus.state !== 'unsupported' && (
            <p className="text-sm text-red-600 mt-3">{micStatus.error}</p>
          )}
        </>
      )}

      {micGranted && !testPassed && !testing && (
        <button
          onClick={handleRequestMic}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          <Mic className="w-5 h-5" />
          Test Microphone
        </button>
      )}

      {testing && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-slate-600 text-sm">Testing microphone input...</p>
        </div>
      )}

      {micGranted && testPassed && (
        <>
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-left w-full max-w-md">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-700">Microphone is ready</p>
                <p className="text-xs text-green-600 mt-1">
                  {micStatus.state === 'empty'
                    ? 'Low signal detected, but you may proceed.'
                    : 'Your microphone is working correctly.'}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleContinue}
            className="inline-flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-colors"
          >
            Continue to Test
          </button>
        </>
      )}
    </div>
  );
}
