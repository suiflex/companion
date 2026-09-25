import type { ReactNode } from 'react'
import { Button } from './Button'

export interface SegmentedOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  role?: 'group' | 'tablist'
}

export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  role = 'group',
}: SegmentedControlProps) {
  const isTabList = role === 'tablist'

  return (
    <div className="ui-segmented" role={role} aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <Button
            key={option.value}
            className={`ui-segmented-option${selected ? ' is-active' : ''}`}
            type="button"
            role={isTabList ? 'tab' : undefined}
            aria-selected={isTabList ? selected : undefined}
            aria-pressed={isTabList ? undefined : selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
