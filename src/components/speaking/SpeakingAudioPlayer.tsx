import { useEffect, useRef, useState } from 'react';

interface SpeakingAudioPlayerProps {
  src: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  volume?: number; // 0-1, default 1
  preload?: 'none' | 'metadata' | 'auto';
}

export function SpeakingAudioPlayer({ 
  src, 
  autoPlay = false, 
  onEnded,
  onError,
  volume = 1,
  preload = 'auto'
}: SpeakingAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;
    
    const handlePlay = () => {
      // Audio started playing
    };
    const handlePause = () => {
      // Audio paused
    };
    const handleEnded = () => {
      onEnded?.();
    };
    const handleError = () => {
      setHasError(true);
      const error = new Error(`Failed to load audio: ${src}`);
      onError?.(error);
      console.error('[SpeakingAudioPlayer]', error);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    if (autoPlay) {
      audio.play().catch(err => {
        console.error('[SpeakingAudioPlayer] Auto-play failed:', err);
        handleError();
      });
    }

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [src, autoPlay, volume, onEnded, onError]);

  // Expose play/pause methods nếu cần control từ bên ngoài
  useEffect(() => {
    if (audioRef.current) {
      (audioRef.current as any).__speakingPlayer = {
        play: () => audioRef.current?.play(),
        pause: () => audioRef.current?.pause(),
        stop: () => {
          audioRef.current?.pause();
          audioRef.current && (audioRef.current.currentTime = 0);
        },
      };
    }
  }, []);

  if (hasError) {
    return null; // Silent fail - không hiển thị gì nếu lỗi
  }

  return (
    <audio 
      ref={audioRef} 
      src={src} 
      preload={preload}
      style={{ display: 'none' }}
    />
  );
}

