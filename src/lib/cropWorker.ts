/// <reference lib="webworker" />
import Pica from 'pica'

export type WorkerCropRequest = {
  id: number
  blob: Blob
  box: { x: number; y: number; width: number; height: number }
  output: { width: number; height: number }
  format: 'png' | 'jpeg' | 'webp' | 'avif'
  quality: number
  fillMode?: 'crop' | 'fit'
  blurPx?: number
}

export type WorkerCropResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

let picaInstance: ReturnType<typeof Pica> | null = null
function pica() {
  if (!picaInstance) {
    picaInstance = Pica({ features: ['js', 'wasm', 'cib'] })
  }
  return picaInstance
}

function mimeFor(format: WorkerCropRequest['format']): string {
  if (format === 'png') return 'image/png'
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'avif') return 'image/avif'
  return 'image/webp'
}

async function renderFit(
  req: WorkerCropRequest,
  outW: number,
  outH: number,
  mime: string,
  encodeQuality: number | undefined,
): Promise<Blob> {
  // Fit mode: full source contained inside target, blurred upscale fills the bleed.
  // Decode the full source. Cap pixels at SAFE_FIT_PIXELS so giant images don't OOM the worker.
  const SAFE_FIT_PIXELS = 16_000_000
  let bitmap: ImageBitmap
  // First decode at native size to read dims, then redecode scaled if needed.
  const probe = await createImageBitmap(req.blob, { imageOrientation: 'from-image' })
  const probePixels = probe.width * probe.height
  if (probePixels > SAFE_FIT_PIXELS) {
    const scale = Math.sqrt(SAFE_FIT_PIXELS / probePixels)
    const dw = Math.max(outW, Math.round(probe.width * scale))
    const dh = Math.max(outH, Math.round(probe.height * scale))
    probe.close?.()
    bitmap = await createImageBitmap(req.blob, {
      imageOrientation: 'from-image',
      resizeWidth: dw,
      resizeHeight: dh,
      resizeQuality: 'high',
    })
  } else {
    bitmap = probe
  }
  try {
    const sw = bitmap.width
    const sh = bitmap.height

    const canvas = new OffscreenCanvas(outW, outH)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2D unavailable')

    // 1. Cover-fit blurred backdrop. Scale the source to cover the canvas, draw with blur filter.
    const coverScale = Math.max(outW / sw, outH / sh)
    const bgW = sw * coverScale
    const bgH = sh * coverScale
    const bgX = (outW - bgW) / 2
    const bgY = (outH - bgH) / 2
    const blurPx = Math.max(0, Math.min(80, req.blurPx ?? 40))
    ctx.filter = `blur(${blurPx}px)`
    // Draw slightly oversized so the blur halo doesn't leak transparent edges.
    const bleed = blurPx * 2
    ctx.drawImage(bitmap, bgX - bleed, bgY - bleed, bgW + bleed * 2, bgH + bleed * 2)
    ctx.filter = 'none'

    // 2. Subtle dark scrim so subject pops against bright backdrops.
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(0, 0, outW, outH)

    // 3. Contain-fit source on top, centered.
    const fitScale = Math.min(outW / sw, outH / sh)
    const fgW = sw * fitScale
    const fgH = sh * fitScale
    const fgX = (outW - fgW) / 2
    const fgY = (outH - fgH) / 2
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, fgX, fgY, fgW, fgH)

    return await canvas.convertToBlob({ type: mime, quality: encodeQuality })
  } finally {
    bitmap.close?.()
  }
}

async function handle(req: WorkerCropRequest): Promise<Blob> {
  const sx = Math.max(0, Math.round(req.box.x))
  const sy = Math.max(0, Math.round(req.box.y))
  const sw = Math.max(1, Math.round(req.box.width))
  const sh = Math.max(1, Math.round(req.box.height))
  const outW = Math.max(1, Math.round(req.output.width))
  const outH = Math.max(1, Math.round(req.output.height))
  const mime = mimeFor(req.format)
  const encodeQuality = req.format === 'png' ? undefined : req.quality

  if (req.fillMode === 'fit') {
    return renderFit(req, outW, outH, mime, encodeQuality)
  }

  const SAFE_REGION_PIXELS = 24_000_000
  const regionPixels = sw * sh
  let region: ImageBitmap
  if (regionPixels > SAFE_REGION_PIXELS) {
    const downscale = Math.sqrt(SAFE_REGION_PIXELS / regionPixels)
    const decodeW = Math.max(outW, Math.round(sw * downscale))
    const decodeH = Math.max(outH, Math.round(sh * downscale))
    region = await createImageBitmap(req.blob, sx, sy, sw, sh, {
      imageOrientation: 'from-image',
      resizeWidth: decodeW,
      resizeHeight: decodeH,
      resizeQuality: 'high',
    })
  } else {
    region = await createImageBitmap(req.blob, sx, sy, sw, sh, {
      imageOrientation: 'from-image',
    })
  }
  try {
    const isDownscale = outW < region.width || outH < region.height
    if (isDownscale) {
      const intermediate = new OffscreenCanvas(region.width, region.height)
      const ictx = intermediate.getContext('2d')
      if (!ictx) throw new Error('OffscreenCanvas 2D unavailable')
      ictx.drawImage(region, 0, 0)
      const out = new OffscreenCanvas(outW, outH)
      // Pica accepts OffscreenCanvas in workers when 'cib' feature is enabled.
      await pica().resize(intermediate as unknown as HTMLCanvasElement, out as unknown as HTMLCanvasElement)
      return await out.convertToBlob({ type: mime, quality: encodeQuality })
    }
    const out = new OffscreenCanvas(outW, outH)
    const octx = out.getContext('2d')
    if (!octx) throw new Error('OffscreenCanvas 2D unavailable')
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    octx.drawImage(region, 0, 0, region.width, region.height, 0, 0, outW, outH)
    return await out.convertToBlob({ type: mime, quality: encodeQuality })
  } finally {
    region.close?.()
  }
}

ctx.onmessage = async (e: MessageEvent<WorkerCropRequest>) => {
  const req = e.data
  try {
    const blob = await handle(req)
    const res: WorkerCropResponse = { id: req.id, ok: true, blob }
    ctx.postMessage(res)
  } catch (err) {
    const res: WorkerCropResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Crop failed',
    }
    ctx.postMessage(res)
  }
}
