import { useEffect, useRef, useState, type ReactNode } from 'react'

type PreviewCanvasProps = {
  aspect: number
  ratioLabel: string
  dimsLabel: string
  children: ReactNode
}

const MIN_DIM = 200
const PAD_X = 48 // px-6 left + right
const PAD_Y = 84 // pt-12 (48) + pb-6 (24) + ~12 slack for the ratio label

function fitFrame(aspect: number, maxW: number, maxH: number) {
  if (maxW <= 0 || maxH <= 0) return { w: MIN_DIM, h: MIN_DIM / aspect }
  let w: number, h: number
  if (aspect >= 1) {
    w = maxW
    h = w / aspect
    if (h > maxH) {
      h = maxH
      w = h * aspect
    }
  } else {
    h = maxH
    w = h * aspect
    if (w > maxW) {
      w = maxW
      h = w / aspect
    }
  }
  return { w, h }
}

export function PreviewCanvas({ aspect, ratioLabel, dimsLabel, children }: PreviewCanvasProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(() => fitFrame(aspect, 600, 460))
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const recompute = () => {
      const rect = el.getBoundingClientRect()
      const maxW = Math.max(MIN_DIM, rect.width - PAD_X)
      const maxH = Math.max(MIN_DIM, rect.height - PAD_Y)
      setSize(fitFrame(aspect, maxW, maxH))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  const checker = `linear-gradient(45deg, var(--ic-bg-3) 25%, transparent 25%), linear-gradient(-45deg, var(--ic-bg-3) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--ic-bg-3) 75%), linear-gradient(-45deg, transparent 75%, var(--ic-bg-3) 75%)`

  return (
    <div
      ref={ref}
      className="relative flex flex-1 flex-col overflow-hidden"
      style={{
        background: checker,
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        backgroundColor: 'var(--ic-bg-2)',
      }}
    >
      <div className="absolute left-4 top-3.5 z-[5] flex items-center gap-2.5 font-mono-geist text-[11px] text-[var(--ic-ink-3)]">
        <span className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2 py-1">
          {dimsLabel}
        </span>
      </div>
      <div className="absolute right-4 top-3.5 z-[5] flex items-center gap-1.5 font-mono-geist text-[11px] text-[var(--ic-ink-3)]">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.5, z * 0.85))}
          className="grid h-6 w-6 place-items-center rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] hover:bg-[var(--ic-bg-3)]"
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          onClick={() => setZoom(1)}
          className="min-w-[50px] rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2 py-1 text-center hover:bg-[var(--ic-bg-3)]"
        >
          {zoom === 1 ? 'fit' : `${Math.round(zoom * 100)}%`}
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(1, z * 1.15))}
          className="grid h-6 w-6 place-items-center rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] hover:bg-[var(--ic-bg-3)]"
        >
          +
        </button>
      </div>
      <div className="grid flex-1 place-items-center overflow-hidden px-6 pb-6 pt-12">
        <div
          className="relative rounded-md"
          style={{
            width: `${size.w * zoom}px`,
            height: `${size.h * zoom}px`,
            transition:
              'width 0.25s cubic-bezier(0.4,0,0.2,1), height 0.25s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
          <span className="absolute left-1/2 -top-9 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-1 font-mono-geist text-[11px] text-[var(--ic-ink-2)] shadow-[var(--ic-shadow-sm)]">
            {ratioLabel}
          </span>
          <div className="absolute inset-0 overflow-hidden rounded-md bg-black">{children}</div>
          <CropBrackets />
        </div>
      </div>
    </div>
  )
}

function CropBrackets() {
  const corners = [
    { left: -4, top: -4, dirs: 'tl' },
    { right: -4, top: -4, dirs: 'tr' },
    { left: -4, bottom: -4, dirs: 'bl' },
    { right: -4, bottom: -4, dirs: 'br' },
  ] as const
  const stroke = '2.5px solid var(--ic-accent)'
  return (
    <div className="absolute -inset-px z-[2] pointer-events-none">
      {corners.map((c, i) => {
        const has = (d: string) => c.dirs.includes(d)
        return (
          <i
            key={i}
            className="absolute block"
            style={{
              width: 14,
              height: 14,
              left: 'left' in c ? c.left : undefined,
              right: 'right' in c ? c.right : undefined,
              top: 'top' in c ? c.top : undefined,
              bottom: 'bottom' in c ? c.bottom : undefined,
              borderTop: has('t') ? stroke : 0,
              borderBottom: has('b') ? stroke : 0,
              borderLeft: has('l') ? stroke : 0,
              borderRight: has('r') ? stroke : 0,
              background: 'rgba(0,0,0,0.4)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 0 8px var(--ic-accent-glow)',
            }}
          />
        )
      })}
    </div>
  )
}
