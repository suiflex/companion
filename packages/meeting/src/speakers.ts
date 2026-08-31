import type { Entry } from '@meetcc/shared';

// Who actually talked. Captions carry no duration, so airtime is measured in
// words — a proxy, but a stable one across speaking speeds, and honest as long
// as the UI says "porsi bicara" and not "menit".

export interface SpeakerStat {
  speaker: string;
  /** Caption lines attributed to this speaker. */
  turns: number;
  words: number;
  /** Share of all words, 0..1. */
  share: number;
}

const countWords = (text: string): number => (text.trim().match(/\S+/g) ?? []).length;

/** Word share and turn count per speaker, biggest talker first. */
export function speakerStats(entries: Entry[]): SpeakerStat[] {
  const by = new Map<string, { turns: number; words: number }>();
  for (const e of entries) {
    const name = e.speaker.trim() || 'Unknown';
    const row = by.get(name) ?? { turns: 0, words: 0 };
    row.turns++;
    row.words += countWords(e.text);
    by.set(name, row);
  }
  const total = [...by.values()].reduce((n, r) => n + r.words, 0);
  return [...by.entries()]
    .map(([speaker, r]) => ({ speaker, ...r, share: total ? r.words / total : 0 }))
    .sort((a, b) => b.words - a.words || a.speaker.localeCompare(b.speaker));
}
