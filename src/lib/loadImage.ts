export type LoadedImage = {
  bitmap: ImageBitmap
  width: number
  height: number
  mime: string
  name: string
  sizeBytes: number
}

const HEIC_EXT = /\.(heic|heif)$/i
const HEIC_MIME = /image\/hei[cf]/i

async function maybeDecodeHeic(blob: Blob, name: string): Promise<Blob> {
  const looksHeic = HEIC_EXT.test(name) || HEIC_MIME.test(blob.type)
  if (!looksHeic) return blob
  try {
    await createImageBitmap(blob)
    return blob
  } catch {
    // Browser can't decode HEIC natively — fall through to heic2any
  }
  const { default: heic2any } = await import('heic2any')
  const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.95 })
  return Array.isArray(converted) ? converted[0] : converted
}

export async function loadImageFromBlob(blob: Blob, name = 'image'): Promise<LoadedImage> {
  const decoded = await maybeDecodeHeic(blob, name)
  const bitmap = await createImageBitmap(decoded, { imageOrientation: 'from-image' })
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    mime: decoded.type || blob.type || 'image/*',
    name,
    sizeBytes: blob.size,
  }
}

export async function loadImageFromFile(file: File): Promise<LoadedImage> {
  return loadImageFromBlob(file, file.name)
}
