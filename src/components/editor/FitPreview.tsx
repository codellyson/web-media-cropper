import { useEffect, useRef } from 'react'

type FitPreviewProps = {
  imageUrl: string
  sourceWidth: number
  sourceHeight: number
  aspect: number
  blurPx?: number
}

/**
 * Live preview of Fit mode: full source contained inside the target aspect, with
 * a cover-fit blurred upscale of the source filling the bleed. Mirrors the
 * worker render so what you see matches what you export.
 *
 * Renders into an internal canvas sized to its parent's bounding box.
 */
export function FitPreview({
  imageUrl,
  sourceWidth,
  sourceHeight,
  aspect,
  blurPx = 40,
}: FitPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    let cancelled = false
    let img: HTMLImageElement | null = null

    const draw = (image: HTMLImageElement) => {
      if (cancelled) return
      const rect = wrap.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, w, h)

      // Cover-fit blurred backdrop.
      const coverScale = Math.max(w / sourceWidth, h / sourceHeight)
      const bgW = sourceWidth * coverScale
      const bgH = sourceHeight * coverScale
      const bgX = (w - bgW) / 2
      const bgY = (h - bgH) / 2
      const blurScaled = blurPx * dpr
      const bleed = blurScaled * 2
      ctx.filter = `blur(${blurScaled}px)`
      ctx.drawImage(image, bgX - bleed, bgY - bleed, bgW + bleed * 2, bgH + bleed * 2)
      ctx.filter = 'none'

      // Dark scrim.
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(0, 0, w, h)

      // Contain-fit source on top.
      const fitScale = Math.min(w / sourceWidth, h / sourceHeight)
      const fgW = sourceWidth * fitScale
      const fgH = sourceHeight * fitScale
      const fgX = (w - fgW) / 2
      const fgY = (h - fgH) / 2
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, fgX, fgY, fgW, fgH)
    }

    img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (!img) return
      draw(img)
      const ro = new ResizeObserver(() => img && draw(img))
      ro.observe(wrap)
      // Stash so we can disconnect on cleanup.
      ;(wrap as unknown as { __ro?: ResizeObserver }).__ro = ro
    }
    img.src = imageUrl

    return () => {
      cancelled = true
      const ro = (wrap as unknown as { __ro?: ResizeObserver }).__ro
      ro?.disconnect()
    }
  }, [imageUrl, sourceWidth, sourceHeight, aspect, blurPx])

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-lg bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
