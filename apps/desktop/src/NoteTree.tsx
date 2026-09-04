// The note list as a tree of folders.
//
// Folders come from the note paths, so the sidebar can never disagree with
// what is on disk. Expanded state is a per-viewer convenience and lives in
// localStorage, the way the theme and language preferences do.
import { useState } from 'react'
import { t } from '@meetcc/shared/i18n'
import type { TreeFolder } from './tree'

const KEY = 'companion:collapsed-folders'

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
  } catch {
    /* private mode, or a value someone hand-edited — start expanded */
    return new Set()
  }
}

function saveCollapsed(paths: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...paths]))
  } catch {
    /* the tree still works for this session */
  }
}

export function NoteTree({
  root,
  selected,
  onOpen,
}: {
  root: TreeFolder
  selected: string | null
  onOpen: (rel: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)

  const toggle = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      saveCollapsed(next)
      return next
    })
  }

  const countNotes = (folder: TreeFolder): number =>
    folder.notes.length + folder.folders.reduce((n, f) => n + countNotes(f), 0)

  const renderFolder = (folder: TreeFolder, depth: number) => {
    const isCollapsed = collapsed.has(folder.path)
    const total = countNotes(folder)
    return (
      <li key={folder.path}>
        <button
          type="button"
          className="tree-folder"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          aria-expanded={!isCollapsed}
          onClick={() => toggle(folder.path)}
        >
          <span className={isCollapsed ? 'tree-caret' : 'tree-caret open'} aria-hidden="true" />
          <span className="tree-name">{folder.name}</span>
          <span className="tree-count">{total}</span>
        </button>
        {!isCollapsed && renderChildren(folder, depth + 1)}
      </li>
    )
  }

  const renderChildren = (folder: TreeFolder, depth: number) => (
    <ul className="tree-list">
      {folder.folders.map((f) => renderFolder(f, depth))}
      {folder.notes.map((n) => (
        <li key={n.rel}>
          <button
            type="button"
            className={selected === n.rel ? 'note-item active' : 'note-item'}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            onClick={() => onOpen(n.rel)}
          >
            <span className="note-title">{n.title}</span>
          </button>
        </li>
      ))}
    </ul>
  )

  const empty = root.folders.length === 0 && root.notes.length === 0
  if (empty) return <ul className="note-list"><li className="empty-hint">{t('desktop.vault.empty')}</li></ul>

  return <div className="note-tree">{renderChildren(root, 0)}</div>
}
