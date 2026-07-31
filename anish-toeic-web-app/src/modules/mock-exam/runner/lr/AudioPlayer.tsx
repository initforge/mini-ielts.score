import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  label?: string;
}

export function AudioPlayer({ src, label }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(0.7);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  return (
    <div className="w-full max-w-2xl bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex items-center gap-4 sticky top-0 z-10">
      <audio ref={audioRef} controls src={src} className="flex-1" aria-label={label ?? 'Audio câu hỏi'}>
        Trình duyệt của bạn không hỗ trợ thẻ audio.
      </audio>
      <div className="flex items-center gap-2 shrink-0" title="Âm lượng">
        <Volume2 className="w-4 h-4 text-slate-400" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-20 accent-blue-600"
          aria-label="Âm lượng"
        />
      </div>
    </div>
  );
}
