import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
}

/** Shared action control. App-specific layout and behavior stay with each app. */
export function Button({ variant = 'default', className = '', type = 'button', ...props }: ButtonProps) {
  const classes = ['ui-button', variant !== 'default' && `ui-button--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return <button {...props} type={type} className={classes} />
}
