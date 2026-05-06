import type { FocalDetection } from '@/lib/smartCrop'

type TrackerOverlayProps = {
  detection: FocalDetection
  sourceWidth: number
  sourceHeight: number
  aspect: number
  visible: boolean
}

function visibleCropSize(sourceW: number, sourceH: number, aspect: number) {
  const sourceAspect = sourceW / sourceH
  if (sourceAspect > aspect) {
    return { w: sourceH * aspect, h: sourceH }
  }
  return { w: sourceW, h: sourceW / aspect }
}

export function TrackerOverlay({
  detection,
  sourceWidth,
  sourceHeight,
  aspect,
  visible,
}: TrackerOverlayProps) {
  const isFace = detection.source === 'face' && !!detection.bbox
  const pct = Math.round(detection.confidence * 100)

  if (isFace && detection.bbox) {
    const crop = visibleCropSize(sourceWidth, sourceHeight, aspect)
    const wPct = Math.min(0.85, (detection.bbox.w * sourceWidth) / crop.w)
    const hPct = Math.min(0.85, (detection.bbox.h * sourceHeight) / crop.h)

    return (
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-[3] -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 transition-opacity duration-300"
        style={{
          width: `${wPct * 100}%`,
          height: `${hPct * 100}%`,
          borderColor: 'var(--ic-accent)',
          background: 'var(--ic-accent-tint)',
          opacity: visible ? 1 : 0,
          animation: 'ic-tracker-pulse 2s ease-in-out infinite',
        }}
      >
        <span className="absolute -top-[22px] left-0 whitespace-nowrap rounded-sm bg-[var(--ic-accent)] px-2 py-0.5 font-mono-geist text-[10px] font-semibold tracking-wider text-white">
          SUBJECT · {pct}%
        </span>
      </div>
    )
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-[3] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300"
      style={{ opacity: visible ? 0.85 : 0 }}
    >
      <span className="block h-12 w-12 rounded-full border-2 border-dashed border-white/80" />
      <span
        className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'var(--ic-accent)' }}
      />
      <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/70 px-2 py-0.5 font-mono-geist text-[10px] font-semibold tracking-wider text-white">
        FOCAL POINT
      </span>
    </div>
  )
}
