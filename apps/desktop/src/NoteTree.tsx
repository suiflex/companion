// The note list as a tree of folders.
//
// Folders come from the note paths, so the sidebar can never disagree with
// what is on disk. Expanded state is a per-viewer convenience and lives in
// localStorage, the way the theme and language preferences do.
import { useState } from 'react'
import { formatDate, t } from '@meetcc/shared/i18n'
import type { TreeFolder } from './tree'
import { Button } from '@meetcc/ui'

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
  onMove,
  onAddFolder,
}: {
  root: TreeFolder
  selected: string | null
  onOpen: (rel: string) => void
  /** Drop a note onto a folder. `folder` is '' for the vault root. */
  onMove: (rel: string, folder: string) => void
  /** Start naming a new folder inside this one. '' is the vault root. */
  onAddFolder: (folder: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  // The folder currently under a dragged note, so the drop target is visible.
  // Without it the whole gesture is invisible and you are guessing.
  const [over, setOver] = useState<string | null>(null)

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
        <div className="tree-folder-row">
          <Button
            type="button"
            className={over === folder.path ? 'tree-folder drop-over' : 'tree-folder'}
            style={{ paddingLeft: `${Math.min(8 + depth * 12, 56)}px` }}
            aria-expanded={!isCollapsed}
            onClick={() => toggle(folder.path)}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOver(folder.path)
            }}
            onDragLeave={() => setOver((path) => (path === folder.path ? null : path))}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOver(null)
              const rel = e.dataTransfer.getData('text/plain')
              if (rel) onMove(rel, folder.path)
            }}
          >
            <span className={isCollapsed ? 'tree-caret' : 'tree-caret open'} aria-hidden="true" />
            <span className="tree-name">{folder.name}</span>
            <span className="tree-count">{total}</span>
          </Button>
          <Button
            type="button"
            className="tree-add"
            aria-label={t('desktop.vault.newFolderIn', { folder: folder.name })}
            data-tip={t('desktop.vault.newFolderIn', { folder: folder.name })}
            onClick={() => onAddFolder(folder.path)}
          >
            ⊞
          </Button>
        </div>
        {!isCollapsed && renderChildren(folder, depth + 1)}
      </li>
    )
  }

  const renderChildren = (folder: TreeFolder, depth: number) => (
    <ul className="tree-list">
      {folder.folders.map((f) => renderFolder(f, depth))}
      {folder.notes.map((n) => {
        const delivered = Boolean(n.platform && n.platform !== 'manual')
        return (
          <li key={n.rel}>
            <Button
              type="button"
              draggable
              className={selected === n.rel ? 'note-item active' : 'note-item'}
              style={{ paddingLeft: `${Math.min(8 + depth * 12, 56)}px` }}
              onClick={() => onOpen(n.rel)}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', n.rel)
                e.dataTransfer.effectAllowed = 'move'
              }}
            >
              <span className={delivered ? 'note-kind delivered' : 'note-kind'} aria-hidden="true">
                {delivered ? '▤' : '·'}
              </span>
              <span className="note-main">
                <span className="note-title">{n.title}</span>
                <span className="note-row-meta">
                  {n.source && <span className="note-source">{n.source}</span>}
                  {n.updatedAt && <span className="note-date">{formatDate(n.updatedAt)}</span>}
                </span>
              </span>
            </Button>
          </li>
        )
      })}
    </ul>
  )

  const empty = root.folders.length === 0 && root.notes.length === 0
  if (empty) return <ul className="note-list"><li className="empty-hint">{t('desktop.vault.empty')}</li></ul>

  return (
    <div
      className={over === '' ? 'note-tree drop-over' : 'note-tree'}
      onDragOver={(e) => {
        e.preventDefault()
        setOver('')
      }}
      onDragLeave={() => setOver((p) => (p === '' ? null : p))}
      onDrop={(e) => {
        e.preventDefault()
        setOver(null)
        const rel = e.dataTransfer.getData('text/plain')
        // Dropping on the background means the vault root — the way back out
        // of a folder, which a folder-only target list cannot express.
        if (rel) onMove(rel, '')
      }}
    >
      {renderChildren(root, 0)}
    </div>
  )
}
