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

// -- live action items --
// The AI pass after the meeting is still the authoritative list. During the
// call there is no AI at all (cost, and captions leaving the machine mid-
// meeting), so owner and due are read off the sentence itself and left blank
// when the sentence does not say — a wrong PIC is worse than an empty one.

export interface LiveAction {
  seq: number;
  task: string;
  owner: string;
  /** Verbatim deadline wording ("besok", "minggu depan"), never a parsed date. */
  due: string;
}

const DUE_CUE =
  /\b(hari ini|besok|lusa|minggu (?:ini|depan)|bulan (?:ini|depan)|akhir (?:minggu|bulan)|end of day|EOD|senin|selasa|rabu|kamis|jumat|sabtu|minggu|tanggal \d{1,2}(?: \w+)?)\b/i;
const SELF = /\b(saya|aku|gue|gw|I'?ll|I will)\b/i;

/** The speaker took it themselves, or a participant was named in the line. */
export function guessOwner(text: string, speaker: string, participants: string[]): string {
  const others = participants.filter((p) => p && p !== speaker);
  const named = others.find((p) => {
    const first = p.split(/\s+/)[0];
    return first.length > 2 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  });
  if (named) return named;
  return SELF.test(text) ? speaker : '';
}

/**
 * Provisional action items from the live lexical pass — what to raise before
 * everyone leaves the call. Duplicate wording is dropped so a topic repeated
 * three times is one line, not three.
 */
export function liveActions(
  highlights: { seq: number; kind: string; text: string }[],
  entries: { speaker: string }[],
): LiveAction[] {
  const out: LiveAction[] = [];
  const seenText = new Set<string>();
  const participants = [...new Set(entries.map((e) => e.speaker).filter(Boolean))];
  for (const h of highlights) {
    if (h.kind !== 'action') continue;
    const key = h.text.trim().toLowerCase();
    if (seenText.has(key)) continue;
    seenText.add(key);
    const speaker = entries[h.seq]?.speaker ?? '';
    out.push({
      seq: h.seq,
      task: h.text.trim(),
      owner: guessOwner(h.text, speaker, participants),
      due: h.text.match(DUE_CUE)?.[0] ?? '',
    });
  }
  return out;
}
