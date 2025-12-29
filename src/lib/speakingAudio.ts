// Base URL cho audio (có thể đổi theo environment)
const AUDIO_BASE_URL = import.meta.env.VITE_AUDIO_BASE_URL || '/audio/speaking';

export const speakingAudio = {
  system: {
    beep: `${AUDIO_BASE_URL}/system/beep.mp3`,
    beginPreparing: `${AUDIO_BASE_URL}/system/begin-preparing.mp3`,
    beginSpeaking: `${AUDIO_BASE_URL}/system/begin-speaking.mp3`,
  },
  directions: {
    part1: `${AUDIO_BASE_URL}/directions/part1.mp3`,  // Q1-2
    part2: `${AUDIO_BASE_URL}/directions/part2.mp3`,  // Q3-4
    part3: `${AUDIO_BASE_URL}/directions/part3.mp3`,  // Q5-7
    part4: `${AUDIO_BASE_URL}/directions/part4.mp3`,  // Q8-10
    part5: `${AUDIO_BASE_URL}/directions/part5.mp3`,  // Q11
  },
} as const;

/**
 * Lấy direction audio theo part number
 */
export function getDirectionAudio(part: number): string {
  const map: Record<number, string> = {
    1: speakingAudio.directions.part1,
    2: speakingAudio.directions.part2,
    3: speakingAudio.directions.part3,
    4: speakingAudio.directions.part4,
    5: speakingAudio.directions.part5,
  };
  return map[part] || '';
}

/**
 * Type-safe audio keys để dùng trong code
 */
export type SpeakingAudioKey = 
  | 'system.beep'
  | 'system.beginPreparing'
  | 'system.beginSpeaking'
  | 'directions.part1'
  | 'directions.part2'
  | 'directions.part3'
  | 'directions.part4'
  | 'directions.part5';

/**
 * Helper để lấy audio URL từ key string
 */
export function getAudioUrl(key: SpeakingAudioKey): string {
  const [category, name] = key.split('.');
  if (category === 'system') {
    return speakingAudio.system[name as keyof typeof speakingAudio.system];
  }
  if (category === 'directions') {
    return speakingAudio.directions[name as keyof typeof speakingAudio.directions];
  }
  return '';
}

