import type { Section } from '../../../../types/exam';

export function formatTime(totalSeconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export interface SplitContent {
  main: string;
  translation: string | null;
}

/**
 * Convention: a translation line in question/passage HTML starts a line with
 * `→` / `⟶` / `->`. This mirrors the reference corpus format
 * (`references/xoamutoeic/snapshots/exam-lr-reading-bilingual.md`).
 */
export function splitStem(html: string): SplitContent {
  const lines = html.split(/\n/);
  const mainLines: string[] = [];
  const translationLines: string[] = [];
  for (const line of lines) {
    if (/^\s*(→|⟶|->)\s/.test(line)) {
      translationLines.push(line.replace(/^\s*(→|⟶|->)\s*/, ''));
    } else {
      mainLines.push(line);
    }
  }
  return {
    main: mainLines.join('\n'),
    translation: translationLines.length ? translationLines.join('<br />') : null,
  };
}

/** Options store translations inline after a ` → ` arrow when present. */
export function splitOptionTranslation(text: string): SplitContent {
  const arrow = text.indexOf(' → ');
  if (arrow > 0) return { main: text.slice(0, arrow), translation: text.slice(arrow + 3) };
  const alt = text.indexOf(' ⟶ ');
  if (alt > 0) return { main: text.slice(0, alt), translation: text.slice(alt + 3) };
  return { main: text, translation: null };
}

/** Parts 5-7 are Reading; the LR scorer uses section order_index <= 4 for Listening. */
export function isReadingSection(section: Section): boolean {
  return section.order_index >= 5;
}

export function isListeningSection(section: Section): boolean {
  return section.order_index <= 4;
}

export function currentSkillLabel(section: Section | undefined): string {
  return section && isReadingSection(section) ? 'READING' : 'LISTENING';
}
