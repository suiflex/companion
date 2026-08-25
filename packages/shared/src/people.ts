// One person, many labels. Meet and Teams hand out whatever the participant
// typed — "Akbar", "Akbar (Guest)", "akbar h.", "Akbar Hidayat (Presenting)" —
// and the AI copies those labels into action-item owners. Without folding them
// together, "action item punya Akbar" silently misses half his tasks.
//
// Folding is conservative: only labels that reduce to the same key are merged,
// and the key is derived by removing decorations, never by guessing that two
// different names are the same person.

/** Trailing state Meet/Teams append to a display name. */
const DECORATIONS =
  /\s*[([{](?:guest|tamu|presenting|mempresentasikan|host|organizer|you|anda|me|saya|external|eksternal)[^)\]}]*[)\]}]/gi;

/** Honorifics and titles that come and go between meetings. */
const TITLES = /^(?:mr|mrs|ms|dr|drs|ir|prof|pak|bu|bpk|ibu|mas|mbak|kak)\.?\s+/i;

/** Trailing org/role suffix after a separator: "Akbar - Platform". */
const ROLE_SUFFIX = /\s+[-–—|]\s+.{2,40}$/;

/**
 * The comparison key for a display name. Lowercased, decorations and titles
 * removed, punctuation dropped, whitespace collapsed. Returns '' for a label
 * with no name in it at all (e.g. "?"), which callers treat as unknown.
 */
export function speakerKey(raw: string): string {
  const cleaned = raw
    .replace(DECORATIONS, ' ')
    .replace(ROLE_SUFFIX, ' ')
    .replace(TITLES, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned === '?' ? '' : cleaned;
}

export interface Person {
  /** Stable across meetings: the key every alias reduces to. */
  key: string;
  /** The label to show — the longest spelling actually seen, so "Akbar
   *  Hidayat" wins over "Akbar" rather than a normalised invention. */
  name: string;
  aliases: string[];
  lines: number;
}

/**
 * Fold raw speaker labels into people. `counts` is optional line counts per
 * label; without it every label counts once.
 */
export function clusterSpeakers(
  labels: Iterable<string>,
  counts?: Map<string, number>,
): Person[] {
  const byKey = new Map<string, Person>();
  for (const label of labels) {
    const key = speakerKey(label);
    if (!key) continue;
    const person = byKey.get(key) ?? { key, name: label, aliases: [], lines: 0 };
    if (!person.aliases.includes(label)) person.aliases.push(label);
    // prefer the fullest spelling; ties keep the first one seen
    if (label.length > person.name.length) person.name = label;
    person.lines += counts?.get(label) ?? 1;
    byKey.set(key, person);
  }
  return [...byKey.values()].sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
}

/** True when two labels denote the same person. */
export function sameSpeaker(a: string, b: string): boolean {
  const ka = speakerKey(a);
  return !!ka && ka === speakerKey(b);
}

/**
 * Match an owner string from an action item against a person. The AI often
 * writes a first name only, so a one-word owner matches a person whose name
 * starts with that word — but never the other way round, and never on a
 * substring that is not a whole word.
 */
export function matchesOwner(owner: string, personKey: string): boolean {
  const key = speakerKey(owner);
  if (!key || !personKey) return false;
  if (key === personKey) return true;
  const words = personKey.split(' ');
  return key.split(' ').length === 1 && words[0] === key;
}
