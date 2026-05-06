import { cropInWorker } from './cropClient'
import type { OutputFormat } from './crop'

export type CompressFormat = OutputFormat | 'auto'

function inferFormat(mime: string): OutputFormat {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  return 'jpeg'
}

export async function compressAtQuality(
  blob: Blob,
  width: number,
  height: number,
  format: CompressFormat,
  quality: number,
): Promise<Blob> {
  const fmt: OutputFormat = format === 'auto' ? inferFormat(blob.type) : format
  return cropInWorker(
    blob,
    { x: 0, y: 0, width, height },
    { width, height },
    { format: fmt, quality },
  )
}

export async function compressToTargetSize(
  blob: Blob,
  width: number,
  height: number,
  format: CompressFormat,
  targetBytes: number,
  onProgress?: (iter: number, size: number, q: number) => void,
): Promise<{ blob: Blob; quality: number; iterations: number }> {
  const fmt: OutputFormat = format === 'auto' ? inferFormat(blob.type) : format
  if (fmt === 'png') {
    const out = await compressAtQuality(blob, width, height, 'png', 1)
    return { blob: out, quality: 1, iterations: 1 }
  }

  let lo = 0.1
  let hi = 1
  let best: { blob: Blob; quality: number } | null = null
  let iter = 0
  const MAX_ITER = 8
  const TOLERANCE = 0.05

  while (iter < MAX_ITER) {
    iter++
    const q = (lo + hi) / 2
    const out = await cropInWorker(
      blob,
      { x: 0, y: 0, width, height },
      { width, height },
      { format: fmt, quality: q },
    )
    onProgress?.(iter, out.size, q)

    if (out.size <= targetBytes) {
      best = { blob: out, quality: q }
      if (out.size >= targetBytes * (1 - TOLERANCE)) break
      lo = q
    } else {
      hi = q
    }
    if (hi - lo < 0.005) break
  }

  if (!best) {
    const out = await cropInWorker(
      blob,
      { x: 0, y: 0, width, height },
      { width, height },
      { format: fmt, quality: lo },
    )
    best = { blob: out, quality: lo }
  }
  return { ...best, iterations: iter }
}

export function parseTargetSize(input: string): number | null {
  const m = input.trim().match(/^(\d+(?:\.\d+)?)\s*(kb|mb|kib|mib|b)?$/i)
  if (!m) return null
  const n = Number(m[1])
  const unit = (m[2] ?? 'kb').toLowerCase()
  if (unit === 'b') return Math.round(n)
  if (unit === 'kb' || unit === 'kib') return Math.round(n * 1024)
  if (unit === 'mb' || unit === 'mib') return Math.round(n * 1024 * 1024)
  return null
}
