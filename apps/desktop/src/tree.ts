// The sidebar's folder tree, derived from the note paths themselves.
//
// `listMarkdown` is contractually flat and stays that way — nothing in
// packages/vault grows a tree type for this. The paths already carry the
// structure (`Rapat/2026-09-04/room-1000.md`), so the tree is a view over them
// and can never disagree with what is on disk.
export interface TreeNote {
  rel: string
  title: string
  /** The meeting platform, or 'manual' for a note written in the app. */
  platform?: string
}

export interface TreeFolder {
  /** Vault-relative folder path, e.g. `Rapat/2026-09-04`. Empty for the root. */
  path: string
  /** Last segment, which is what the sidebar shows. */
  name: string
  folders: TreeFolder[]
  notes: TreeNote[]
}

/** Every folder in the tree, deepest last — the list a "move to" picker needs. */
export function folderPaths(root: TreeFolder): string[] {
  const out: string[] = []
  const walk = (f: TreeFolder): void => {
    if (f.path) out.push(f.path)
    for (const child of f.folders) walk(child)
  }
  walk(root)
  return out
}

/**
 * Group notes by their directory.
 *
 * Order is preserved from the input, which arrives newest-first from
 * `listNotes`, so a folder's notes stay in the order the sidebar already used
 * and folders appear in the order they were first seen.
 */
export function buildTree(notes: TreeNote[]): TreeFolder {
  const root: TreeFolder = { path: '', name: '', folders: [], notes: [] }

  for (const note of notes) {
    const segments = note.rel.split('/')
    // The last segment is the file; everything before it is the path.
    const dirs = segments.slice(0, -1)
    let current = root
    let path = ''
    for (const dir of dirs) {
      path = path ? `${path}/${dir}` : dir
      let next = current.folders.find((f) => f.name === dir)
      if (!next) {
        next = { path, name: dir, folders: [], notes: [] }
        current.folders.push(next)
      }
      current = next
    }
    current.notes.push(note)
  }

  return root
}

/**
 * Fold in folders that hold no notes yet.
 *
 * A folder someone just created is empty, and an empty directory has no note
 * path to be derived from — so it would vanish the moment it was made.
 */
export function withEmptyFolders(root: TreeFolder, paths: readonly string[]): TreeFolder {
  for (const path of paths) {
    let current = root
    let walked = ''
    for (const dir of path.split('/').filter(Boolean)) {
      walked = walked ? `${walked}/${dir}` : dir
      let next = current.folders.find((f) => f.name === dir)
      if (!next) {
        next = { path: walked, name: dir, folders: [], notes: [] }
        current.folders.push(next)
      }
      current = next
    }
  }
  return root
}
