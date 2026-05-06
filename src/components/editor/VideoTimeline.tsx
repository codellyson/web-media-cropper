import { useEffect, useRef, useState, type ReactNode } from 'react'

type TrimProps = {
  inMs: number
  outMs: number
  onTrimChange: (next: { inMs: number; outMs: number }) => void
}

type VideoTimelineProps = {
  durationMs: number
  currentMs: number
  playing: boolean
  capturedTimes?: number[]
  keyframeTimes?: number[]
  onSeek: (ms: number) => void
  onPlayToggle: () => void
  onStep: (dir: -1 | 1) => void
  trim?: TrimProps
  primaryAction?: ReactNode
}

function fmt(ms: number): string {
  const total = ms / 1000
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  const cs = Math.floor((ms % 1000) / 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function VideoTimeline({
  durationMs,
  currentMs,
  playing,
  capturedTimes,
  keyframeTimes,
  onSeek,
  onPlayToggle,
  onStep,
  trim,
  primaryAction,
}: VideoTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<'play' | 'in' | 'out' | null>(null)
  const pct = durationMs > 0 ? (currentMs / durationMs) * 100 : 0
  const inPct = trim ? (trim.inMs / durationMs) * 100 : 0
  const outPct = trim ? (trim.outMs / durationMs) * 100 : 100

  useEffect(() => {
    if (!drag) return
    const snapMs = (ms: number, snapWindowMs: number): number => {
      if (!keyframeTimes || keyframeTimes.length === 0) return ms
      let best = ms
      let bestDist = snapWindowMs
      for (const k of keyframeTimes) {
        const d = Math.abs(k - ms)
        if (d < bestDist) {
          bestDist = d
          best = k
        }
      }
      return best
    }
    const move = (e: MouseEvent) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
      const rawMs = (x / rect.width) * durationMs
      const snapWindow = (durationMs / rect.width) * 8
      if (drag === 'play') onSeek(rawMs)
      else if (drag === 'in' && trim) {
        const snapped = snapMs(rawMs, snapWindow)
        trim.onTrimChange({
          inMs: Math.min(snapped, trim.outMs - 100),
          outMs: trim.outMs,
        })
      } else if (drag === 'out' && trim) {
        const snapped = snapMs(rawMs, snapWindow)
        trim.onTrimChange({
          inMs: trim.inMs,
          outMs: Math.max(snapped, trim.inMs + 100),
        })
      }
    }
    const up = () => setDrag(null)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [drag, durationMs, onSeek, trim, keyframeTimes])

  const handleTrackMouseDown = (e: React.MouseEvent) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    onSeek((x / rect.width) * durationMs)
    setDrag('play')
  }

  return (
    <div className="border-t border-[var(--ic-line)] bg-[var(--ic-bg-2)] px-4 pt-3 pb-3">
      <div className="mb-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onStep(-1)}
          aria-label="Previous frame"
          className="grid h-7 w-7 place-items-center rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] text-[var(--ic-ink-2)] hover:bg-[var(--ic-bg-3)]"
        >
          ◂
        </button>
        <button
          type="button"
          onClick={onPlayToggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-9 w-9 place-items-center rounded-full bg-[var(--ic-ink)] text-[var(--ic-bg)] transition hover:scale-105"
        >
          {playing ? (
            <span
              className="block h-3 w-3"
              style={{
                background: 'currentColor',
                clipPath:
                  'polygon(0 0, 35% 0, 35% 100%, 0 100%, 0 0, 65% 0, 65% 100%, 100% 100%, 100% 0, 65% 0)',
              }}
            />
          ) : (
            <span
              className="ml-0.5 block"
              style={{
                width: 0,
                height: 0,
                borderLeft: '8px solid currentColor',
                borderTop: '5px solid transparent',
                borderBottom: '5px solid transparent',
              }}
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          aria-label="Next frame"
          className="grid h-7 w-7 place-items-center rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] text-[var(--ic-ink-2)] hover:bg-[var(--ic-bg-3)]"
        >
          ▸
        </button>
        <span className="ml-2 font-mono-geist text-[12px] text-[var(--ic-ink-3)]">
          <span className="text-[var(--ic-ink)]">{fmt(currentMs)}</span> / {fmt(durationMs)}
        </span>
        {trim && (
          <span className="ml-3 font-mono-geist text-[11px] text-[var(--ic-ink-3)]">
            <span className="text-[var(--ic-accent)]">{fmt(trim.outMs - trim.inMs)}</span>{' '}
            selected
          </span>
        )}
        <span className="flex-1" />
        {primaryAction}
      </div>

      <div
        ref={trackRef}
        onMouseDown={handleTrackMouseDown}
        className="relative h-12 cursor-pointer overflow-hidden rounded-md bg-[var(--ic-bg-3)]"
      >
        <div
          className="absolute inset-1 flex overflow-hidden rounded-sm"
          style={{ background: 'linear-gradient(135deg, #1e3a8a, var(--ic-accent))' }}
        >
          {Array.from({ length: 36 }).map((_, i) => (
            <i
              key={i}
              className="flex-1 border-r border-white/[0.08]"
              style={{
                background:
                  i % 2
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.05), transparent 50%, rgba(0,0,0,0.3))'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.15), transparent 50%, rgba(0,0,0,0.2))',
              }}
            />
          ))}
        </div>

        {trim && (
          <>
            <span
              aria-hidden
              className="absolute top-0 bottom-0"
              style={{
                left: 0,
                width: `${inPct}%`,
                background: 'rgba(0,0,0,0.55)',
              }}
            />
            <span
              aria-hidden
              className="absolute top-0 bottom-0"
              style={{
                right: 0,
                width: `${100 - outPct}%`,
                background: 'rgba(0,0,0,0.55)',
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0"
              style={{
                left: `${inPct}%`,
                width: `${outPct - inPct}%`,
                border: '2px solid var(--ic-accent)',
                borderLeftWidth: 0,
                borderRightWidth: 0,
              }}
            />
            <button
              type="button"
              onMouseDown={(e) => {
                e.stopPropagation()
                setDrag('in')
              }}
              aria-label="Trim in"
              className="absolute top-0 bottom-0 z-20 flex w-3 cursor-ew-resize items-center justify-center"
              style={{ left: `calc(${inPct}% - 6px)`, background: 'var(--ic-accent)' }}
            >
              <span className="block h-3 w-px bg-white/70" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.stopPropagation()
                setDrag('out')
              }}
              aria-label="Trim out"
              className="absolute top-0 bottom-0 z-20 flex w-3 cursor-ew-resize items-center justify-center"
              style={{ left: `calc(${outPct}% - 6px)`, background: 'var(--ic-accent)' }}
            >
              <span className="block h-3 w-px bg-white/70" />
            </button>
          </>
        )}

        {keyframeTimes?.map((t, i) => (
          <span
            key={`k-${i}`}
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 z-[5] w-px"
            style={{
              left: `${(t / durationMs) * 100}%`,
              background: 'rgba(255,255,255,0.45)',
            }}
          />
        ))}

        {capturedTimes?.map((t, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute top-0 bottom-0 z-10 w-px"
            style={{
              left: `${(t / durationMs) * 100}%`,
              background: '#fbbf24',
              boxShadow: '0 0 6px #fbbf24',
            }}
          />
        ))}

        <div
          className="pointer-events-none absolute top-0 bottom-0 z-30 w-0.5"
          style={{
            left: `${pct}%`,
            background: 'var(--ic-accent)',
            boxShadow: '0 0 10px var(--ic-accent)',
          }}
        >
          <span
            className="absolute -left-[5px] -top-0.5 h-3 w-3 rotate-45 rounded-sm"
            style={{ background: 'var(--ic-accent)' }}
          />
        </div>
      </div>
    </div>
  )
}
