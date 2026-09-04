import { t } from '@meetcc/shared/i18n';
import type { Entry } from '@meetcc/shared';

// P2.10 — bring meetings in that Companion did not capture live: a Zoom
// transcript, a downloaded Teams/Meet .vtt, an .srt from a recording. Audio
// files need speech-to-text, which is a provider call, so that path is
// separate (`transcribeAudio`) and only runs when the user configured one.

export type TranscriptFormat = 'vtt' | 'srt' | 'zoom' | 'plain';

export function detectFormat(text: string): TranscriptFormat {
  const head = text.slice(0, 400);
  // \uFEFF: exported .vtt/.srt files routinely carry a UTF-8 BOM
  if (/^\uFEFF?WEBVTT/.test(head)) return 'vtt';
  if (/^\uFEFF?\d+\s*\r?\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/m.test(head)) return 'srt';
  if (/^\d{2}:\d{2}:\d{2}\s+[^:\n]{1,60}:/m.test(head)) return 'zoom';
  return 'plain';
}

const clockToMs = (clock: string): number => {
  const m = clock.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) return NaN;
  const [, h = '0', min, sec, frac = '0'] = m;
  return (
    Number(h) * 3_600_000 + Number(min) * 60_000 + Number(sec) * 1000 + Number(frac.padEnd(3, '0'))
  );
};

/** `Speaker: text` when a cue carries one, otherwise the whole line. */
function splitSpeaker(line: string): { speaker: string; text: string } {
  const m = line.match(/^\s*<v\s+([^>]+)>(.*)$/) ?? line.match(/^\s*([^:]{1,60}):\s+(.*)$/);
  if (!m) return { speaker: 'Unknown', text: line.trim() };
  return { speaker: m[1].trim(), text: m[2].replace(/<\/v>/g, '').trim() };
}

interface Cue {
  startMs: number;
  lines: string[];
}

function parseCues(text: string, arrow: RegExp): Cue[] {
  const cues: Cue[] = [];
  let current: Cue | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(arrow);
    if (m) {
      current = { startMs: clockToMs(m[1]), lines: [] };
      cues.push(current);
      continue;
    }
    if (!current) continue;
    if (!raw.trim()) {
      current = null;
      continue;
    }
    current.lines.push(raw);
  }
  return cues.filter((c) => Number.isFinite(c.startMs) && c.lines.length);
}

/**
 * Parse a transcript file into entries. `startedAt` anchors the relative
 * timestamps to a real clock; without it the meeting starts at the epoch of
 * the import, which keeps ordering correct but the times meaningless.
 */
export function parseTranscript(
  text: string,
  opts: { startedAt?: string; format?: TranscriptFormat } = {},
): Entry[] {
  const parsed = Date.parse(opts.startedAt ?? '');
  const base = Number.isFinite(parsed) ? parsed : Date.now();
  const format = opts.format ?? detectFormat(text);
  const iso = (ms: number): string => new Date(base + ms).toISOString();

  if (format === 'vtt' || format === 'srt') {
    const arrow =
      format === 'vtt'
        ? /^\s*((?:\d+:)?\d{1,2}:\d{2}(?:\.\d{1,3})?)\s*-->/
        : /^\s*((?:\d+:)?\d{1,2}:\d{2}:\d{2},\d{1,3})\s*-->/;
    return parseCues(text, format === 'srt' ? /^\s*((?:\d+:)?\d{2}:\d{2}:\d{2},\d{1,3})\s*-->/ : arrow).map(
      (c) => {
        const joined = c.lines.join(' ').replace(/<[^>]+>/g, (t) => (t.startsWith('<v') ? t : ''));
        const { speaker, text: body } = splitSpeaker(joined);
        return { speaker, text: body, time: iso(c.startMs) };
      },
    );
  }

  if (format === 'zoom') {
    const out: Entry[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const m = raw.match(/^(\d{2}:\d{2}:\d{2})\s+([^:]{1,60}):\s*(.*)$/);
      if (!m) continue;
      if (!m[3].trim()) continue;
      out.push({ speaker: m[2].trim(), text: m[3].trim(), time: iso(clockToMs(m[1])) });
    }
    return out;
  }

  // plain text: one line per turn, `Speaker: text` when present
  const out: Entry[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const { speaker, text: body } = splitSpeaker(raw);
    if (body) out.push({ speaker, text: body, time: iso(i * 5000) });
  });
  return out;
}

/** Entries with no text are dropped and consecutive lines from one speaker are
 *  merged, so an imported file looks like a captured meeting. */
export function normalizeImported(entries: Entry[]): Entry[] {
  const out: Entry[] = [];
  for (const e of entries) {
    const text = e.text.trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.speaker === e.speaker && Date.parse(e.time) - Date.parse(last.time) < 15_000) {
      last.text = `${last.text} ${text}`;
      continue;
    }
    out.push({ ...e, text });
  }
  return out;
}

export interface TranscriptionConfig {
  /** OpenAI-compatible audio transcription endpoint the user configured. */
  endpoint: string;
  apiKey: string;
  model: string;
}

/**
 * Speech-to-text for an imported recording, against a user-configured
 * OpenAI-compatible endpoint (also what a local Whisper server exposes). No
 * default endpoint: audio must never leave the machine implicitly.
 */
export async function transcribeAudio(
  file: Blob,
  filename: string,
  config: TranscriptionConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!config.endpoint) throw new Error(t('pkg.meeting.noTranscriptionEndpoint'));
  const form = new FormData();
  form.append('file', file, filename);
  form.append('model', config.model || 'whisper-1');
  form.append('response_format', 'verbose_json');
  const res = await fetchImpl(config.endpoint, {
    method: 'POST',
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(`Transkripsi gagal (${res.status})`);
  const data = (await res.json()) as {
    text?: string;
    segments?: { start: number; text: string; speaker?: string }[];
  };
  if (data.segments?.length) {
    // rebuild an SRT-ish body so the normal parser handles speakers/timing
    return labelSpeakers(data.segments)
      .map(({ start, speaker, text }) => {
        const t = new Date(start * 1000).toISOString().slice(11, 19);
        return `${t} ${speaker}: ${text}`;
      })
      .join('\n');
  }
  return data.text ?? '';
}

/** whisper.cpp's `--tinydiarize` marks a change of voice inline instead of
 *  labelling segments. */
const SPEAKER_TURN = /\[SPEAKER_TURN\]/g;

/**
 * Attach a speaker to each transcribed segment.
 *
 * Whisper itself does not diarize, so this uses whatever the endpoint actually
 * provides and never invents more than that:
 *  * a `speaker` field (WhisperX / pyannote / Deepgram-style wrappers) is used
 *    verbatim — that is real diarization;
 *  * failing that, a `[SPEAKER_TURN]` marker advances the counter;
 *  * failing both, everything is "Speaker 1", which is honest for a recording
 *    we cannot tell apart and is renameable in the Transcript view.
 */
export function labelSpeakers(
  segments: { start: number; text: string; speaker?: string }[],
): { start: number; speaker: string; text: string }[] {
  const out: { start: number; speaker: string; text: string }[] = [];
  let turn = 1;
  for (const seg of segments) {
    const pieces = seg.text.split(SPEAKER_TURN);
    pieces.forEach((piece, i) => {
      const text = piece.trim();
      // a turn marker still advances the speaker even when it lands on silence
      if (i > 0) turn++;
      if (!text) return;
      out.push({ start: seg.start, speaker: seg.speaker?.trim() || `Speaker ${turn}`, text });
    });
  }
  return out;
}
