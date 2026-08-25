import type { Entry } from '@meetcc/shared';

// P2.2 — live highlights. A meeting is worth flagging *while* it runs, and an
// LLM call every few seconds is neither cheap nor private-by-default, so the
// live pass is lexical: cue phrases that reliably precede a decision, an
// assignment, a deadline or a blocker. The AI pass after the meeting is what
// produces the authoritative list; this only surfaces moments as they happen.

export type HighlightKind = 'decision' | 'action' | 'deadline' | 'risk';

const CUES: { kind: HighlightKind; re: RegExp }[] = [
  {
    kind: 'decision',
    re: /\b(kita putuskan|diputuskan|keputusannya|sepakat|deal|kita pakai|kita ambil|final(?:nya)?|we decided|let's go with)\b/i,
  },
  {
    kind: 'action',
    re: /\b(tolong|minta bantuan|kamu handle|saya kerjakan|aku kerjakan|action item|follow ?up|PIC|assign|akan (?:saya|aku|kami) (?:buat|kirim|cek))\b/i,
  },
  {
    kind: 'deadline',
    re: /\b(deadline|paling lambat|due|sebelum tanggal|minggu depan|besok|hari ini|end of day|EOD)\b/i,
  },
  {
    kind: 'risk',
    re: /\b(risiko|resiko|blocker|kendala|masalahnya|bahaya|gagal|terlambat|blocked|at risk)\b/i,
  },
];

/** Too short to be a real statement — "oke deal" alone is not a decision. */
export const MIN_HIGHLIGHT_CHARS = 24;

export interface Highlight {
  seq: number;
  kind: HighlightKind;
  text: string;
  speaker: string;
  time: string;
}

/** Scan entries from `fromSeq` on, so a live meeting only pays for new lines. */
export function detectHighlights(entries: Entry[], fromSeq = 0): Highlight[] {
  const out: Highlight[] = [];
  for (let i = Math.max(0, fromSeq); i < entries.length; i++) {
    const e = entries[i];
    if (e.text.length < MIN_HIGHLIGHT_CHARS) continue;
    for (const cue of CUES) {
      if (cue.re.test(e.text)) {
        out.push({ seq: i, kind: cue.kind, text: e.text, speaker: e.speaker, time: e.time });
        break; // one kind per line: the first cue that matches wins
      }
    }
  }
  return out;
}
