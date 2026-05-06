import JSZip from 'jszip'
import { cropInWorker } from './cropClient'
import type { OutputFormat } from './crop'
import { loadImageFromFile } from './loadImage'
import { extractVideoFirstFrame, looksLikeVideo } from './loadVideo'
import { cropEncodeVideo } from './ffmpegEngine'
import type { Preset } from './presets'
import { computeFocalDetection, cropBoxFromFocalPoint, type FocalPoint } from './smartCrop'

export type BatchItemStatus = 'pending' | 'running' | 'done' | 'error'

export type BatchItem = {
  fileName: string
  presetId: string
  status: BatchItemStatus
  message?: string
}

export type BatchProgress = {
  index: number
  total: number
  items: BatchItem[]
}

const VIDEO_DURATION_CAP_MS = 60_000
const VIDEO_CRF = 23

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
}

function extFor(format: OutputFormat): string {
  if (format === 'jpeg') return 'jpg'
  return format
}

export async function runBatch(
  files: File[],
  presets: Preset[],
  options: {
    format: OutputFormat
    quality: number
    onProgress?: (p: BatchProgress) => void
  },
): Promise<Blob> {
  const items: BatchItem[] = []
  for (const f of files) {
    for (const p of presets) {
      items.push({ fileName: f.name, presetId: p.id, status: 'pending' })
    }
  }
  const total = items.length
  const zip = new JSZip()
  const imageExt = extFor(options.format)

  let i = 0
  for (const file of files) {
    if (looksLikeVideo(file, file.name)) {
      i = await processVideoFile(file, presets, items, i, total, zip, options.onProgress)
    } else {
      i = await processImageFile(
        file,
        presets,
        items,
        i,
        total,
        zip,
        imageExt,
        options.format,
        options.quality,
        options.onProgress,
      )
    }
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

async function processImageFile(
  file: File,
  presets: Preset[],
  items: BatchItem[],
  startIdx: number,
  total: number,
  zip: JSZip,
  imageExt: string,
  format: OutputFormat,
  quality: number,
  onProgress?: (p: BatchProgress) => void,
): Promise<number> {
  let i = startIdx
  // Subject-aware path: keep the bitmap alive long enough to run focal detection,
  // then close it. Each preset crop derives from the same focal point so the
  // subject lands in shot for every aspect ratio.
  let dims: { width: number; height: number } | null = null
  let focal: FocalPoint = { x: 0.5, y: 0.5 }
  try {
    const img = await loadImageFromFile(file)
    dims = { width: img.width, height: img.height }
    try {
      const det = await computeFocalDetection(img.bitmap)
      focal = det.point
    } catch {
      // Fallback: dead-center. Crop still succeeds, just not subject-aware.
    }
    img.bitmap.close?.()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'load failed'
    for (let pi = 0; pi < presets.length; pi++) {
      const item = items[i++]
      item.status = 'error'
      item.message = msg
      onProgress?.({ index: i, total, items: [...items] })
    }
    return i
  }

  for (const preset of presets) {
    const item = items[i]
    item.status = 'running'
    onProgress?.({ index: i, total, items: [...items] })
    try {
      const aspect = preset.width / preset.height
      const box = cropBoxFromFocalPoint(dims.width, dims.height, aspect, focal)
      const scale = Math.min(1, box.width / preset.width, box.height / preset.height)
      const out = {
        width: Math.round(preset.width * scale),
        height: Math.round(preset.height * scale),
      }
      const blob = await cropInWorker(file, box, out, { format, quality })
      const base = safeName(file.name.replace(/\.[^.]+$/, ''))
      const folder = zip.folder(base) ?? zip
      folder.file(`${base}-${preset.id}-${out.width}x${out.height}.${imageExt}`, blob)
      item.status = 'done'
    } catch (err) {
      item.status = 'error'
      item.message = err instanceof Error ? err.message : 'crop failed'
    }
    i++
    onProgress?.({ index: i, total, items: [...items] })
  }
  return i
}

async function processVideoFile(
  file: File,
  presets: Preset[],
  items: BatchItem[],
  startIdx: number,
  total: number,
  zip: JSZip,
  onProgress?: (p: BatchProgress) => void,
): Promise<number> {
  let i = startIdx

  // Step 1: extract first frame for focal detection + read duration.
  let dims: { width: number; height: number } | null = null
  let durationMs = 0
  let focal: FocalPoint = { x: 0.5, y: 0.5 }
  try {
    const frame = await extractVideoFirstFrame(file)
    dims = { width: frame.width, height: frame.height }
    durationMs = frame.durationMs
    try {
      const det = await computeFocalDetection(frame.bitmap)
      focal = det.point
    } catch {
      // dead-center fallback
    }
    frame.bitmap.close?.()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'video load failed'
    for (let pi = 0; pi < presets.length; pi++) {
      const item = items[i++]
      item.status = 'error'
      item.message = msg
      onProgress?.({ index: i, total, items: [...items] })
    }
    return i
  }

  // Step 2: enforce 60s cap. Fail loudly so the user knows to trim in studio.
  if (durationMs > VIDEO_DURATION_CAP_MS) {
    const seconds = (durationMs / 1000).toFixed(0)
    for (let pi = 0; pi < presets.length; pi++) {
      const item = items[i++]
      item.status = 'error'
      item.message = `Clip is ${seconds}s — batch caps at 60s. Trim in single-file studio first.`
      onProgress?.({ index: i, total, items: [...items] })
    }
    return i
  }

  // Step 3: crop+scale+encode per preset. Sequential — ffmpeg-wasm holds
  // an exclusive in-memory FS, so concurrent encodes would clobber each other.
  for (const preset of presets) {
    const item = items[i]
    item.status = 'running'
    onProgress?.({ index: i, total, items: [...items] })
    try {
      const aspect = preset.width / preset.height
      const box = cropBoxFromFocalPoint(dims.width, dims.height, aspect, focal)
      const scale = Math.min(1, box.width / preset.width, box.height / preset.height)
      const out = {
        width: Math.round(preset.width * scale),
        height: Math.round(preset.height * scale),
      }
      const outBlob = await cropEncodeVideo(
        file,
        file.name,
        { x: box.x, y: box.y, w: box.width, h: box.height },
        out,
        { crf: VIDEO_CRF },
      )
      const base = safeName(file.name.replace(/\.[^.]+$/, ''))
      const folder = zip.folder(base) ?? zip
      folder.file(`${base}-${preset.id}-${out.width}x${out.height}.mp4`, outBlob)
      item.status = 'done'
    } catch (err) {
      item.status = 'error'
      item.message = err instanceof Error ? err.message : 'video crop failed'
    }
    i++
    onProgress?.({ index: i, total, items: [...items] })
  }
  return i
}
