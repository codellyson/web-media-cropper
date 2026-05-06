export type LoadedImage = {
  bitmap: ImageBitmap
  width: number
  height: number
  scale: number
  sourceBlob: Blob
  mime: string
  name: string
  sizeBytes: number
}

const HEIC_EXT = /\.(heic|heif)$/i
const HEIC_MIME = /image\/hei[cf]/i

const PREVIEW_MAX_PIXELS = 16_000_000
const PREVIEW_MAX_EDGE = 8192

async function maybeDecodeHeic(blob: Blob, name: string): Promise<Blob> {
  const looksHeic = HEIC_EXT.test(name) || HEIC_MIME.test(blob.type)
  if (!looksHeic) return blob
  try {
    const probe = await createImageBitmap(blob)
    probe.close?.()
    return blob
  } catch {
    // Browser can't decode HEIC natively — fall through to heic2any
  }
  const { default: heic2any } = await import('heic2any')
  const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.95 })
  return Array.isArray(converted) ? converted[0] : converted
}

function previewDimensions(width: number, height: number): { w: number; h: number } | null {
  const pixels = width * height
  const longEdge = Math.max(width, height)
  if (pixels <= PREVIEW_MAX_PIXELS && longEdge <= PREVIEW_MAX_EDGE) return null
  const byPixels = Math.sqrt(PREVIEW_MAX_PIXELS / pixels)
  const byEdge = PREVIEW_MAX_EDGE / longEdge
  const ratio = Math.min(byPixels, byEdge)
  return {
    w: Math.max(1, Math.round(width * ratio)),
    h: Math.max(1, Math.round(height * ratio)),
  }
}

export async function loadImageFromBlob(blob: Blob, name = 'image'): Promise<LoadedImage> {
  const decoded = await maybeDecodeHeic(blob, name)

  const probe = await createImageBitmap(decoded, { imageOrientation: 'from-image' })
  const fullWidth = probe.width
  const fullHeight = probe.height

  const previewSize = previewDimensions(fullWidth, fullHeight)
  let bitmap: ImageBitmap
  if (previewSize) {
    probe.close?.()
    bitmap = await createImageBitmap(decoded, {
      imageOrientation: 'from-image',
      resizeWidth: previewSize.w,
      resizeHeight: previewSize.h,
      resizeQuality: 'high',
    })
  } else {
    bitmap = probe
  }

  const scale = bitmap.width / fullWidth

  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    scale,
    sourceBlob: decoded,
    mime: decoded.type || blob.type || 'image/*',
    name,
    sizeBytes: blob.size,
  }
}

export async function loadImageFromFile(file: File): Promise<LoadedImage> {
  return loadImageFromBlob(file, file.name)
}
