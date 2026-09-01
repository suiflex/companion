// Vault identity — ADR-013 / roadmap §17 shape.
//
// The desktop vault is the canonical owner of a meeting note's identity:
// every .md file carries a stable `id` (UUIDv7) and a `session_key` that
// makes capture-idempotent (the bridge must never write the same meeting
// twice after a disconnect/retry). This module is the single source for both.
//
// No deps beyond the runtime — usable from the Tauri Rust/TS boundary, the
// extension bridge, and tests alike.

/** RFC 9562 UUIDv7: 48-bit unix-ms + version 7 + variant, random rest. */
export function uuidV7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hi = BigInt(now) & 0xffffffffffffn
  bytes[0] = Number((hi >> 40n) & 0xffn)
  bytes[1] = Number((hi >> 32n) & 0xffn)
  bytes[2] = Number((hi >> 24n) & 0xffn)
  bytes[3] = Number((hi >> 16n) & 0xffn)
  bytes[4] = Number((hi >> 8n) & 0xffn)
  bytes[5] = Number(hi & 0xffn)
  bytes[6] = (bytes[6] & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/** Human prefix of `uuidV7()` — enough to disambiguate files in a list. */
export function shortId(id: string): string {
  return id.slice(0, 8)
}

/** Local wall-clock minutes of an ISO timestamp, `YYYY-MM-DDTHH:MM`. */
function wallMinutes(iso: string): string {
  const t = new Date(iso)
  const local = new Date(t.getTime() - t.getTimezoneOffset() * 60000)
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(
    local.getDate(),
  ).padStart(2, '0')}T${String(local.getHours()).padStart(2, '0')}:${String(
    local.getMinutes(),
  ).padStart(2, '0')}`
}

/**
 * `session_key` — the mockup's `meet/room#2026-08-28T14:00` shape. Combines
 * the room id with the meeting start so the same physical meeting maps to one
 * vault note no matter how many times the bridge redelivers it.
 */
export function sessionKeyFor(roomId: string, startedAtIso: string): string {
  return `${roomId}#${wallMinutes(startedAtIso)}`
}

/** Strip the `#start` suffix from a session key, leaving the raw room id. */
export function roomIdFromSessionKey(sessionKey: string): string {
  const hash = sessionKey.lastIndexOf('#')
  return hash === -1 ? sessionKey : sessionKey.slice(0, hash)
}
