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

export async function cropImage(
  source: ImageBitmap | HTMLImageElement,
  box: CropBox,
  output: OutputSize,
  options: CropOptions = {},
): Promise<Blob> {
  const format = options.format ?? 'png'
  const quality = options.quality ?? 0.92

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(output.width)
  canvas.height = Math.round(output.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(
    source,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp'
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error(`Failed to encode ${mime}`))
      },
      mime,
      format === 'png' ? undefined : quality,
    )
  })
}
