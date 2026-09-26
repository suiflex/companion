import { forwardRef, type InputHTMLAttributes } from 'react'

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className = '', ...props },
  ref,
) {
  return <input {...props} ref={ref} className={['ui-input', className].filter(Boolean).join(' ')} />
})
