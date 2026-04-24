import Pica from 'pica'

export type CropBox = {
  x: number
  y: number
  width: number
  height: number
}

export type OutputSize = {
  width: number
  height: number
}

export type OutputFormat = 'png' | 'jpeg' | 'webp'

export type CropOptions = {
  format?: OutputFormat
  quality?: number
}

export function centerCropBox(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
): CropBox {
  const sourceAspect = sourceWidth / sourceHeight
  if (sourceAspect > aspect) {
    const height = sourceHeight
    const width = height * aspect
    return { x: (sourceWidth - width) / 2, y: 0, width, height }
  }
  const width = sourceWidth
  const height = width / aspect
  return { x: 0, y: (sourceHeight - height) / 2, width, height }
}

let picaInstance: ReturnType<typeof Pica> | null = null
function pica() {
  if (!picaInstance) picaInstance = Pica({ features: ['js', 'wasm'] })
  return picaInstance
}

function mimeFor(format: OutputFormat): string {
  return format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp'
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Failed to encode ${mime}`))),
      mime,
      quality,
    )
  })
}

export async function cropImage(
  source: ImageBitmap | HTMLImageElement,
  box: CropBox,
  output: OutputSize,
  options: CropOptions = {},
): Promise<Blob> {
  const format = options.format ?? 'png'
  const quality = options.quality ?? 0.92
  const mime = mimeFor(format)

  const outW = Math.round(output.width)
  const outH = Math.round(output.height)
  const boxW = Math.round(box.width)
  const boxH = Math.round(box.height)

  const isDownscale = outW < boxW || outH < boxH

  if (isDownscale) {
    const intermediate = document.createElement('canvas')
    intermediate.width = boxW
    intermediate.height = boxH
    const ictx = intermediate.getContext('2d')
    if (!ictx) throw new Error('Canvas 2D unavailable')
    ictx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, boxW, boxH)

    const out = document.createElement('canvas')
    out.width = outW
    out.height = outH
    await pica().resize(intermediate, out)
    return toBlob(out, mime, format === 'png' ? undefined : quality)
  }

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, outW, outH)
  return toBlob(out, mime, format === 'png' ? undefined : quality)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
