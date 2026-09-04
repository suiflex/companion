// A dropdown that belongs to the app.
//
// A native `<select>` draws its open panel in the platform's own chrome, which
// no stylesheet reaches — the same reason `<input type="date">` had to go. The
// closed control could be styled; the list could not.
//
// Replacing a native control means inheriting its obligations. A `<select>` is
// keyboard-operable for free, so this one is too: Up/Down move, Enter and
// Space choose, Escape closes without changing anything, Home/End jump.
import { useEffect, useMemo, useRef, useState } from 'react'

/** The five the palette already has; anything unmapped stays neutral. */
export type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success'

export interface Option {
  /** Stored verbatim; not translated, because it goes into the note file. */
  value: string
  label: string
  /** Colours the dot and tints the label. Absent means neutral. */
  tone?: Tone
}

function Dot({ option }: { option: Option }) {
  // An empty value is "nothing chosen", which is not the same as a grey
  // status — it gets a hollow dot rather than a filled neutral one.
  const cls = option.value === '' ? 'tone-dot tone-empty' : `tone-dot tone-${option.tone ?? 'neutral'}`
  return <span className={cls} aria-hidden="true" />
}

/** Keep in step with `max-height` on `.select-list`. */
const PANEL_MAX = 232

export function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: Option[]
  onChange: (value: string) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  // Which way the panel opens. A select sitting in the editor's action bar is
  // a few pixels from the window's bottom edge, and a panel that always drops
  // downwards is simply cut off there — the options exist but cannot be seen.
  const [up, setUp] = useState(false)
  const [cursor, setCursor] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const index = useMemo(() => options.findIndex((o) => o.value === value), [options, value])
  const current = index >= 0 ? options[index] : options[0]

  // Opening lands on the current value, not at the top: arrowing from the
  // selected option is what a native select does.
  useEffect(() => {
    if (open) setCursor(index >= 0 ? index : 0)
  }, [open, index])

  // Measured at the moment of opening, not guessed from where the control
  // lives: the same select flips as the window is resized.
  useEffect(() => {
    if (!open) return
    const rect = wrap.current?.getBoundingClientRect()
    if (rect) setUp(rect.bottom + PANEL_MAX > window.innerHeight && rect.top > PANEL_MAX)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the cursor visible when the list is long enough to scroll.
  useEffect(() => {
    if (!open) return
    const row = list.current?.querySelector<HTMLElement>('[data-cursor="true"]')
    // Called optionally: scrollIntoView is absent in some environments, and
    // keeping the list scrolled is never worth taking the component down.
    row?.scrollIntoView?.({ block: 'nearest' })
  }, [open, cursor])

  const choose = (i: number): void => {
    onChange(options[i].value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      // Down or Enter opens, matching a native select.
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        setCursor((c) => Math.min(c + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setCursor((c) => Math.max(c - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setCursor(0)
        break
      case 'End':
        e.preventDefault()
        setCursor(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(cursor)
        break
      default:
        break
    }
  }

  return (
    <div className="select" ref={wrap}>
      <button
        type="button"
        className="select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        {current && <Dot option={current} />}
        <span className={`tone-label tone-${current?.value === '' ? 'neutral' : (current?.tone ?? 'neutral')}`}>
          {current?.label ?? ''}
        </span>
        <span className="select-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className={up ? 'select-list up' : 'select-list'} role="listbox" aria-label={label} ref={list}>
          {options.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              data-cursor={i === cursor}
              className={[
                'select-option',
                i === cursor ? 'cursor' : '',
                o.value === value ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => {
                // mousedown, not click: the outside-click listener fires first
                // otherwise and the panel closes before the choice lands.
                e.preventDefault()
                choose(i)
              }}
            >
              <Dot option={o} />
              <span className={`tone-label tone-${o.value === '' ? 'neutral' : (o.tone ?? 'neutral')}`}>
                {o.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
