import { forwardRef, type TextareaHTMLAttributes } from 'react'

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className = '', ...props },
  ref,
) {
  return <textarea {...props} ref={ref} className={['ui-input', className].filter(Boolean).join(' ')} />
})
