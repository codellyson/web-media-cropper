// @ts-expect-error — piexifjs ships no types
import piexif from 'piexifjs'

function arrayBufferToBinaryString(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))),
    )
  }
  return s
}

function binaryStringToArrayBuffer(s: string): ArrayBuffer {
  const buf = new ArrayBuffer(s.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xff
  return buf
}

export function looksLikeJpeg(blob: Blob, name: string): boolean {
  return /jpe?g/i.test(blob.type) || /\.jpe?g$/i.test(name)
}

export async function extractExif(blob: Blob): Promise<unknown | null> {
  try {
    const buf = await blob.arrayBuffer()
    const binStr = arrayBufferToBinaryString(buf)
    const dict = piexif.load(binStr)
    if (!dict) return null
    const hasAny =
      Object.keys(dict['0th'] ?? {}).length > 0 ||
      Object.keys(dict.Exif ?? {}).length > 0 ||
      Object.keys(dict.GPS ?? {}).length > 0
    return hasAny ? dict : null
  } catch {
    return null
  }
}

export async function insertExifIntoJpeg(jpegBlob: Blob, exif: unknown): Promise<Blob> {
  if (!exif) return jpegBlob
  try {
    const buf = await jpegBlob.arrayBuffer()
    const binStr = arrayBufferToBinaryString(buf)
    const copy = JSON.parse(JSON.stringify(exif)) as Record<string, Record<string, unknown>>
    // Strip orientation — the canvas already baked the rotation into pixels.
    if (copy['0th'] && piexif.ImageIFD?.Orientation != null) {
      delete copy['0th'][piexif.ImageIFD.Orientation]
    }
    const exifStr = piexif.dump(copy)
    const newBin = piexif.insert(exifStr, binStr)
    return new Blob([binaryStringToArrayBuffer(newBin)], { type: 'image/jpeg' })
  } catch {
    return jpegBlob
  }
}
