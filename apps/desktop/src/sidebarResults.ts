interface SearchableNote {
  platform: string
}

/** Search results belong to the active tab; inbox excludes notes written locally. */
export function inboxSearchResults<T extends SearchableNote>(
  query: string,
  incoming: readonly T[],
  matches: readonly T[],
): readonly T[] {
  return query.trim() ? matches.filter((note) => note.platform !== '' && note.platform !== 'manual') : incoming
}
