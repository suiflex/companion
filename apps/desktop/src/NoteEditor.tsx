// The note body, edited as rich text but stored as markdown.
//
// Milkdown is markdown-native: remark parses the document in and stringifies
// it back out, so what the vault stores stays a .md file anyone can open in
// another editor — the frontmatter that noteToMarkdown wraps around this body
// is never touched. That is the reason for this editor rather than a rich-text
// one with a markdown exporter bolted on.
//
// Crepe is imperative and owns its DOM, so the editor is built once per note
// and torn down with it. The parent keys this component by the note, which is
// what makes "open another note" a rebuild instead of a value push.
import { Crepe } from '@milkdown/crepe'
import { t } from '@meetcc/shared/i18n'
import { useEffect, useRef } from 'react'

// The light frame is the base; every colour it exposes is re-pointed at our own
// tokens in styles.css, so the editor follows the app's theme instead of being
// pinned to whichever of Crepe's two themes was imported here.
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

export function NoteEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (markdown: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  // The callback changes identity on every keystroke in the parent; reading it
  // through a ref keeps the editor from being rebuilt underneath the cursor.
  const emit = useRef(onChange)
  emit.current = onChange

  useEffect(() => {
    const root = host.current
    if (!root) return

    const crepe = new Crepe({
      root,
      defaultValue: value,
      features: {
        // No AI here: this editor must never call out, and the note body is
        // already summarized upstream by the extension.
        [Crepe.Feature.AI]: false,
        [Crepe.Feature.Latex]: false,
        // No persistent toolbar. Formatting appears when text is selected —
        // the Toolbar feature, on by default — so an unselected note is just
        // the note. A row of buttons above the body made this read as a form
        // to fill in rather than a document to write.
        [Crepe.Feature.TopBar]: false,
      },
      featureConfigs: {
        // `block` rather than the default, so *every* empty block carries the
        // hint instead of only an empty document. The slash menu and the drag
        // handle were always here; nothing said so, which is the same as not
        // having them.
        [Crepe.Feature.Placeholder]: {
          text: t('desktop.editor.blockPlaceholder'),
          mode: 'block',
        },
      },
    })

    // Anything emitted while the document is still being parsed is the
    // serializer echoing the note back, not the user typing — treating that as
    // an edit would mark every note dirty the moment it was opened.
    let ready = false
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prev) => {
        if (!ready || markdown === prev) return
        emit.current(markdown)
      })
    })

    void crepe.create().then(() => {
      ready = true
    })
    return () => {
      ready = false
      void crepe.destroy()
    }
    // Built once for this note; the parent's key remounts it for another one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="body-editor" ref={host} />
}
