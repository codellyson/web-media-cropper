import { useEngineStatus } from '@/hooks/useEngineStatus'

// Dev-only readout for the ffmpeg-wasm core variant. Tells you at a glance
// whether cross-origin isolation kicked in and the MT core actually loaded,
// without having to crack open devtools and inspect getEngineStatus().
export function EngineBadge() {
  const status = useEngineStatus()
  if (process.env.NODE_ENV !== 'development') return null
  if (status.kind === 'idle') return null

  const { color, label } = render(status)
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-3 right-3 z-[1000] rounded-md border border-black/20 bg-black/80 px-2 py-1 font-mono text-[10.5px] uppercase tracking-wider text-white shadow-md backdrop-blur-sm"
      style={{ color }}
    >
      {label}
    </div>
  )
}

function render(status: ReturnType<typeof useEngineStatus>): { color: string; label: string } {
  switch (status.kind) {
    case 'loading':
      return { color: '#fbbf24', label: `engine · loading ${Math.round(status.progress * 100)}%` }
    case 'ready':
      return status.variant === 'mt'
        ? { color: '#4ade80', label: 'engine · mt · isolated' }
        : { color: '#fb923c', label: 'engine · st · not isolated' }
    case 'error':
      return { color: '#f87171', label: `engine · error` }
    default:
      return { color: '#ffffff', label: 'engine · idle' }
  }
}
