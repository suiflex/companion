import { describe, expect, it } from 'vitest';
import { speakerStats } from './speakers';

const line = (speaker: string, text: string) => ({ speaker, text, time: '2026-01-01T00:00:00.000Z' });

describe('speakerStats', () => {
  it('ranks speakers by words and reports shares that add up', () => {
    const stats = speakerStats([
      line('Akbar', 'satu dua tiga'),
      line('Widi', 'satu'),
      line('Akbar', 'empat'),
    ]);
    expect(stats.map((s) => s.speaker)).toEqual(['Akbar', 'Widi']);
    expect(stats[0]).toMatchObject({ turns: 2, words: 4 });
    expect(stats.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1);
  });

  it('survives empty and whitespace-only captions', () => {
    const stats = speakerStats([line('  ', '   '), line('Akbar', '')]);
    expect(stats.map((s) => s.speaker).sort()).toEqual(['Akbar', 'Unknown']);
    expect(stats.every((s) => s.share === 0)).toBe(true);
  });
});
