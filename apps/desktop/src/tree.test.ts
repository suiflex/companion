import { describe, expect, it } from 'vitest'
import { buildTree, folderPaths, withEmptyFolders } from './tree'

const n = (rel: string, title = rel) => ({ rel, title })

describe('buildTree', () => {
  it('groups notes by their directory', () => {
    const root = buildTree([
      n('Rapat/2026-09-04/a.md'),
      n('Rapat/2026-09-04/b.md'),
      n('Rapat/2026-09-03/c.md'),
    ])
    expect(root.folders.map((f) => f.name)).toEqual(['Rapat'])
    const rapat = root.folders[0]
    expect(rapat.folders.map((f) => f.name)).toEqual(['2026-09-04', '2026-09-03'])
    expect(rapat.folders[0].notes.map((x) => x.rel)).toEqual([
      'Rapat/2026-09-04/a.md',
      'Rapat/2026-09-04/b.md',
    ])
  })

  it('keeps the order it was given, which is newest first', () => {
    const root = buildTree([n('B/1.md'), n('A/2.md')])
    expect(root.folders.map((f) => f.name)).toEqual(['B', 'A'])
  })

  it('puts a note with no directory at the root', () => {
    const root = buildTree([n('loose.md')])
    expect(root.folders).toEqual([])
    expect(root.notes.map((x) => x.rel)).toEqual(['loose.md'])
  })

  it('nests as deep as the path goes', () => {
    const root = buildTree([n('a/b/c/d.md')])
    expect(root.folders[0].folders[0].folders[0].path).toBe('a/b/c')
  })

  it('carries the full path on every folder, not just the name', () => {
    // The path is what the move command and the collapsed-state key use, so a
    // folder that only knew its own name would collide with a sibling
    // elsewhere in the tree.
    const root = buildTree([n('x/dup/1.md'), n('y/dup/2.md')])
    expect(folderPaths(root).sort()).toEqual(['x', 'x/dup', 'y', 'y/dup'])
  })

  it('handles an empty vault', () => {
    expect(buildTree([])).toEqual({ path: '', name: '', folders: [], notes: [] })
  })
})

describe('withEmptyFolders', () => {
  it('keeps a folder that has no notes yet', () => {
    // An empty directory has no note path to be derived from, so a folder
    // would disappear the instant it was created.
    const root = withEmptyFolders(buildTree([]), ['Projects/Alpha'])
    expect(folderPaths(root)).toEqual(['Projects', 'Projects/Alpha'])
  })

  it('does not duplicate a folder that already has notes', () => {
    const root = withEmptyFolders(buildTree([n('Rapat/x.md')]), ['Rapat'])
    expect(folderPaths(root)).toEqual(['Rapat'])
    expect(root.folders[0].notes).toHaveLength(1)
  })
})
