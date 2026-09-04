// A date field that looks like the rest of the app.
//
// `<input type="date">` draws its calendar in the browser's own panel, which
// no stylesheet can reach — in a desktop window it reads as a foreign control
// pinned to its own palette. This is the same field built from ordinary
// elements, so it follows the theme tokens like everything else.
//
// The value stays the ISO `YYYY-MM-DD` the frontmatter stores; only the
// display is localised.
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDate, locale, t } from '@meetcc/shared/i18n'

/** Weekday initials and month names come from Intl, so they follow the
    language without a second list to keep in step with the catalogue. */
function weekdayNames(): string[] {
  const fmt = new Intl.DateTimeFormat(locale(), { weekday: 'short' })
  // 2024-01-01 was a Monday, and this calendar starts on Monday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
}

function monthName(d: Date): string {
  return new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(d)
}

export const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Parsed as local time: `new Date('2026-09-04')` is UTC and can shift a day. */
export function parseIso(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function label(value: string): string {
  return parseIso(value) ? formatDate(value) : ''
}

/**
 * The days to draw for `month`, padded to whole weeks starting Monday, so the
 * grid never reflows as the user pages between months.
 */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  // getDay() is Sunday-first; this calendar starts on Monday.
  const lead = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(1 - lead)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export function DateField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<Date>(() => parseIso(value) ?? new Date())
  const wrap = useRef<HTMLDivElement>(null)

  // Reopening on a note with a date should land on that date's month, not
  // wherever the last note left the calendar.
  useEffect(() => {
    if (open) setMonth(parseIso(value) ?? new Date())
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const days = useMemo(() => monthGrid(month), [month])
  const dayNames = useMemo(() => weekdayNames(), [])
  const today = iso(new Date())
  const shift = (by: number): void =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1))

  return (
    <div className="datefield" ref={wrap}>
      <button
        type="button"
        className="datefield-button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? undefined : 'placeholder'}>{label(value) || t('desktop.date.pick')}</span>
        {/* Clearing has to be reachable: a due date that cannot be removed is
            worse than one that was never set. */}
        {value && (
          <span
            role="button"
            tabIndex={0}
            className="datefield-clear"
            aria-label={t('desktop.date.clear')}
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                e.preventDefault()
                onChange('')
              }
            }}
          >
            ×
          </span>
        )}
      </button>

      {open && (
        <div className="calendar" role="dialog" aria-label={t('desktop.date.dialog')}>
          <div className="calendar-head">
            <button type="button" onClick={() => shift(-1)} aria-label={t('desktop.date.prevMonth')}>
              ‹
            </button>
            <strong>{monthName(month)}</strong>
            <button type="button" onClick={() => shift(1)} aria-label={t('desktop.date.nextMonth')}>
              ›
            </button>
          </div>

          <div className="calendar-grid">
            {dayNames.map((d, i) => (
              <span key={i} className="calendar-dow">
                {d}
              </span>
            ))}
            {days.map((d) => {
              const key = iso(d)
              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    'calendar-day',
                    d.getMonth() === month.getMonth() ? '' : 'outside',
                    key === value ? 'selected' : '',
                    key === today ? 'today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onChange(key)
                    setOpen(false)
                  }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div className="calendar-foot">
            <button type="button" onClick={() => { onChange(today); setOpen(false) }}>
              {t('desktop.date.today')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
