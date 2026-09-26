// The note list as a tree of folders.
//
// Folders come from the note paths, so the sidebar can never disagree with
// what is on disk. Expanded state is a per-viewer convenience and lives in
// localStorage, the way the theme and language preferences do.
import { useState } from 'react'
import { formatDate, t } from '@meetcc/shared/i18n'
import type { TreeFolder, TreeNote } from './tree'
import { Button } from '@meetcc/ui'

const KEY = 'companion:collapsed-folders'

/** The whole row as one line, for a title the tree had to truncate. */
function rowTooltip(n: TreeNote): string {
  const date = n.updatedAt ? formatDate(n.updatedAt) : ''
  let tip = n.title
  if (n.source) tip += ` · ${n.source}`
  if (date) tip += ` · ${date}`
  return tip
}

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

  const renderFolder = (folder: TreeFolder) => {
    const isCollapsed = collapsed.has(folder.path)
    const total = countNotes(folder)
    return (
      <li key={folder.path}>
        <div className="tree-folder-row">
          <Button
            type="button"
            className={over === folder.path ? 'tree-folder drop-over' : 'tree-folder'}
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
            <svg
              className={isCollapsed ? 'tree-caret' : 'tree-caret open'}
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M6 4l4 4-4 4" />
            </svg>
            <span className="tree-name">{folder.name}</span>
            {total > 0 && <span className="tree-count">{total}</span>}
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
        {!isCollapsed && renderChildren(folder)}
      </li>
    )
  }

  // Indentation comes from the nested lists, each drawing its own guide line;
  // the stylesheet stops indenting past a few levels so deep paths stay legible.
  const renderChildren = (folder: TreeFolder) => (
    <ul className="tree-list">
      {folder.folders.map((f) => renderFolder(f))}
      {folder.notes.map((n) => {
        const delivered = Boolean(n.platform && n.platform !== 'manual')
        return (
          <li key={n.rel}>
            <Button
              type="button"
              draggable
              className={selected === n.rel ? 'note-item active' : 'note-item'}
              title={rowTooltip(n)}
              onClick={() => onOpen(n.rel)}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', n.rel)
                e.dataTransfer.effectAllowed = 'move'
              }}
            >
              {/* A delivered meeting is an archive — editing copies it — so it
                  is marked before the click, not after. */}
              <span className={delivered ? 'note-kind delivered' : 'note-kind'} aria-hidden="true" />
              <span className="note-title">{n.title}</span>
              <span className="note-row-meta">
                {n.source && <span className="note-source">{n.source}</span>}
                {n.updatedAt && (
                  <span className="note-date">
                    {formatDate(n.updatedAt, { day: 'numeric', month: 'short' })}
                  </span>
                )}
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
      {renderChildren(root)}
    </div>
  )
}
