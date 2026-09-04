// Transient feedback for actions that would otherwise happen in silence.
//
// A port of the extension's `toast.tsx`, and the third small module duplicated
// per app after `theme.ts` and `lang.ts`, for the reason documented in both:
// the two apps share no runtime. The shape is kept identical so a call written
// against one reads the same in the other.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

// The default is a no-op, so `useToast()` outside a provider is silently safe
// rather than a crash in a component someone renders in isolation.
const ToastCtx = createContext<(kind: Toast['kind'], message: string) => void>(() => {})

export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
