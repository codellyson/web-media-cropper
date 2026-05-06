import { useEffect, useMemo, useRef, useState } from 'react'
import { centeredCropBox } from '@/lib/presetsVideo'
import { cropBoxFromFocalPoint, type FocalPoint } from '@/lib/smartCrop'

type Preview = {
  bitmap: ImageBitmap
  width: number
  height: number
}

type SubjectStripProps = {
  preview: Preview | null
  focal: FocalPoint | null
  busy: boolean
  onPick: () => void
  onIngest: (file: File) => void
}

type Frame = { id: string; label: string; ratio: string; aspect: number }

const ALL_FRAMES: Frame[] = [
  { id: 'reel', label: 'Reel', ratio: '9:16', aspect: 9 / 16 },
  { id: 'square', label: 'Square', ratio: '1:1', aspect: 1 },
  { id: 'youtube', label: 'YouTube', ratio: '16:9', aspect: 16 / 9 },
]

// Below this viewport width the three-frame strip squashes the canvases —
// switch to a single 1:1 frame at full width so the splitter has room to work.
const MOBILE_BREAKPOINT_PX = 640

function useIsNarrow(maxWidth: number): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(max-width: ${maxWidth - 0.02}px)`)
    setNarrow(mq.matches)
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [maxWidth])
  return narrow
}

export function SubjectStrip({ preview, focal, busy, onPick, onIngest }: SubjectStripProps) {
  const isNarrow = useIsNarrow(MOBILE_BREAKPOINT_PX)
  const frames = useMemo<Frame[]>(
    () => (isNarrow ? [ALL_FRAMES[1]] : ALL_FRAMES),
    [isNarrow],
  )
  const totalAspect = useMemo(
    () => frames.reduce((s, f) => s + f.aspect, 0),
    [frames],
  )
  const frameEdges = useMemo(() => {
    let acc = 0
    return frames.map((f) => {
      const left = acc / totalAspect
      acc += f.aspect
      const right = acc / totalAspect
      return { left, right }
    })
  }, [frames, totalAspect])

  const [pct, setPct] = useState(1)
  const [over, setOver] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const animRafRef = useRef<number | null>(null)
  const animDoneRef = useRef(false)

  const bitmap = preview?.bitmap ?? null

  const cancelAutoAnim = () => {
    if (animRafRef.current != null) {
      cancelAnimationFrame(animRafRef.current)
      animRafRef.current = null
    }
  }

  // First time a file is loaded, auto-reveal: splitter slides from 1.0 (all smart)
  // to 0.5 (split). Tells the user "this is draggable" without copy.
  useEffect(() => {
    if (!bitmap || animDoneRef.current) return
    animDoneRef.current = true
    const start = performance.now()
    const from = 1
    const to = 0.5
    const duration = 1200
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setPct(from + (to - from) * eased)
      if (t < 1) {
        animRafRef.current = requestAnimationFrame(tick)
      } else {
        animRafRef.current = null
      }
    }
    animRafRef.current = requestAnimationFrame(tick)
    return cancelAutoAnim
  }, [bitmap])

  const updateFromClientX = (clientX: number) => {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const x = clientX - rect.left
    const next = Math.max(0, Math.min(1, x / rect.width))
    setPct(next)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!bitmap) return
    cancelAutoAnim()
    draggingRef.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // some browsers/test envs may throw — non-fatal
    }
    updateFromClientX(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    updateFromClientX(e.clientX)
  }
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // non-fatal
    }
  }

  return (
    <section className="relative left-1/2 right-1/2 -mx-[50vw] w-screen bg-black text-white">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-6 pt-7 pb-3">
        <span className="font-mono-geist text-[11px] uppercase tracking-[0.18em] text-white/55">
          ← Center crop
        </span>
        <span className="hidden font-mono-geist text-[11px] uppercase tracking-[0.18em] text-white/55 sm:inline">
          {busy
            ? 'detecting subject…'
            : bitmap
              ? 'drag the splitter'
              : 'drop a file to begin'}
        </span>
        <span className="font-mono-geist text-[11px] uppercase tracking-[0.18em] text-white">
          Subject-aware →
        </span>
      </div>

      <div
        ref={stripRef}
        role={bitmap ? 'slider' : undefined}
        aria-label={bitmap ? 'Subject-aware vs center crop comparison' : undefined}
        aria-valuemin={bitmap ? 0 : undefined}
        aria-valuemax={bitmap ? 100 : undefined}
        aria-valuenow={bitmap ? Math.round(pct * 100) : undefined}
        tabIndex={bitmap ? 0 : -1}
        onKeyDown={(e) => {
          if (!bitmap) return
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            setPct((p) => Math.max(0, p - 0.04))
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            setPct((p) => Math.min(1, p + 0.04))
          } else if (e.key === 'Home') {
            e.preventDefault()
            setPct(0)
          } else if (e.key === 'End') {
            e.preventDefault()
            setPct(1)
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onIngest(f)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={() => {
          if (!bitmap && !draggingRef.current) onPick()
        }}
        className="relative w-full touch-none select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--ic-accent)]"
        style={{
          aspectRatio: `${totalAspect} / 1`,
          maxHeight: isNarrow ? 420 : 480,
          minHeight: isNarrow ? 280 : 220,
          background: over ? 'rgba(255,255,255,0.04)' : 'transparent',
          cursor: bitmap ? 'ew-resize' : 'pointer',
        }}
      >
        <div className="flex h-full w-full">
          {frames.map((f, i) => {
            const edges = frameEdges[i]
            let smartClip: number
            if (pct <= edges.left) smartClip = 0
            else if (pct >= edges.right) smartClip = 100
            else smartClip = ((pct - edges.left) / (edges.right - edges.left)) * 100

            return (
              <div
                key={f.id}
                className="relative h-full"
                style={{
                  flexGrow: f.aspect,
                  flexShrink: 0,
                  flexBasis: 0,
                  borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  background: '#111',
                }}
              >
                {preview && bitmap ? (
                  <>
                    <FrameCanvas
                      bitmap={bitmap}
                      sourceWidth={preview.width}
                      sourceHeight={preview.height}
                      aspect={f.aspect}
                      focal={null}
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        clipPath: `inset(0 0 0 ${smartClip}%)`,
                        WebkitClipPath: `inset(0 0 0 ${smartClip}%)`,
                      }}
                    >
                      <FrameCanvas
                        bitmap={bitmap}
                        sourceWidth={preview.width}
                        sourceHeight={preview.height}
                        aspect={f.aspect}
                        focal={focal}
                      />
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 grid place-items-center">
                    <span className="font-mono-geist text-[11px] uppercase tracking-[0.18em] text-[var(--ic-ink-4)]">
                      {f.ratio}
                    </span>
                  </div>
                )}

                <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-sm bg-black/55 px-1.5 py-0.5 font-mono-geist text-[10px] font-semibold tracking-[0.12em] text-white">
                  {f.ratio}
                </span>
                <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-sm bg-black/55 px-1.5 py-0.5 font-mono-geist text-[10px] font-semibold tracking-[0.12em] text-white">
                  {f.label}
                </span>
              </div>
            )
          })}
        </div>

        {bitmap && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0"
            style={{ left: `${pct * 100}%`, transform: 'translateX(-50%)' }}
          >
            <div className="h-full w-px bg-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
            <div
              className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[var(--ic-ink)]"
              style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.5)' }}
            >
              <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M5 3 L2 7 L5 11 M9 3 L12 7 L9 11"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        )}

        {!bitmap && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className="grid h-14 w-14 place-items-center rounded-full text-white"
                style={{ background: 'var(--ic-accent)', boxShadow: '0 6px 22px var(--ic-accent-glow)' }}
              >
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 3v12" />
                  <path d="m6 9 6-6 6 6" />
                  <rect x={3} y={15} width={18} height={6} rx={2} />
                </svg>
              </div>
              <span className="font-mono-geist text-[11px] uppercase tracking-[0.18em] text-white">
                {busy ? 'decoding…' : over ? 'release to start' : 'drop or click anywhere'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto flex max-w-[1100px] items-center justify-center px-6 pb-7 pt-3 text-center">
        <span className="font-mono-geist text-[11px] uppercase tracking-[0.18em] text-white/55">
          {bitmap
            ? 'left of splitter: naïve center crop · right: focal-aware'
            : 'one source · every aspect ratio · subject locked'}
        </span>
      </div>
    </section>
  )
}

function FrameCanvas({
  bitmap,
  sourceWidth,
  sourceHeight,
  aspect,
  focal,
}: {
  bitmap: ImageBitmap
  sourceWidth: number
  sourceHeight: number
  aspect: number
  focal: FocalPoint | null
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    setSize({ w: parent.clientWidth, h: parent.clientHeight })
    const obs = new ResizeObserver((entries) => {
      const e = entries[0]
      if (!e) return
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    obs.observe(parent)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || !size) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.max(1, Math.round(size.w * dpr))
    c.height = Math.max(1, Math.round(size.h * dpr))
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    let box: { x: number; y: number; w: number; h: number }
    if (focal) {
      const b = cropBoxFromFocalPoint(sourceWidth, sourceHeight, aspect, focal)
      box = { x: b.x, y: b.y, w: b.width, h: b.height }
    } else {
      box = centeredCropBox(sourceWidth, sourceHeight, aspect)
    }
    ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height)
  }, [bitmap, sourceWidth, sourceHeight, aspect, focal, size])

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-hidden
    />
  )
}
