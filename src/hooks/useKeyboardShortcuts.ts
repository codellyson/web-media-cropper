import { useEffect } from 'react'

type Handlers = {
  onDownload?: () => void
  onClear?: () => void
  onPresetByIndex?: (index: number) => void
  onUndoFocal?: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useKeyboardShortcuts({
  onDownload,
  onClear,
  onPresetByIndex,
  onUndoFocal,
}: Handlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        onUndoFocal?.()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onDownload?.()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        onDownload?.()
        return
      }
      if (e.key === 'Escape') {
        onClear?.()
        return
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        onPresetByIndex?.(Number(e.key) - 1)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onDownload, onClear, onPresetByIndex, onUndoFocal])
}
