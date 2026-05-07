import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

const CORE_BASE = '/ffmpeg'

let instance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

type Listener = (status: EngineStatus) => void
const listeners = new Set<Listener>()

export type EngineStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

let status: EngineStatus = { kind: 'idle' }

function setStatus(next: EngineStatus) {
  status = next
  for (const l of listeners) l(next)
}

export function getEngineStatus(): EngineStatus {
  return status
}

export function subscribeEngine(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function getFFmpeg(): Promise<FFmpeg> {
  if (instance && status.kind === 'ready') return Promise.resolve(instance)
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    setStatus({ kind: 'loading', progress: 0 })
    const ff = new FFmpeg()
    try {
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      ])
      await ff.load({ coreURL, wasmURL })
      instance = ff
      setStatus({ kind: 'ready' })
      return ff
    } catch (err) {
      loadPromise = null
      const message = err instanceof Error ? err.message : 'Engine failed to load'
      setStatus({ kind: 'error', message })
      throw err
    }
  })()
  return loadPromise
}

function extOf(mime: string, name: string): string {
  if (/mp4|m4v/i.test(mime) || /\.(mp4|m4v)$/i.test(name)) return 'mp4'
  if (/webm/i.test(mime) || /\.webm$/i.test(name)) return 'webm'
  if (/quicktime|mov/i.test(mime) || /\.mov$/i.test(name)) return 'mov'
  if (/x-matroska|mkv/i.test(mime) || /\.mkv$/i.test(name)) return 'mkv'
  return 'mp4'
}

export type ProgressCallback = (pct: number) => void

let activeProgress: ProgressCallback | null = null

async function withProgress<T>(
  ff: FFmpeg,
  cb: ProgressCallback | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!cb) return fn()
  activeProgress = cb
  const handler = ({ progress }: { progress: number }) => {
    if (activeProgress) activeProgress(Math.max(0, Math.min(1, progress)))
  }
  ff.on('progress', handler)
  try {
    return await fn()
  } finally {
    ff.off('progress', handler)
    activeProgress = null
  }
}

async function runEncodeWithAudioFallback(ff: FFmpeg, baseArgs: string[]): Promise<void> {
  const out = baseArgs[baseArgs.length - 1]
  const head = baseArgs.slice(0, -1)
  try {
    await ff.exec([...head, '-c:a', 'copy', out])
    return
  } catch {
    // fall through
  }
  await ff.exec([...head, '-c:a', 'aac', '-b:a', '160k', out])
}

function fmtTime(ms: number): string {
  const total = ms / 1000
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`
}

export async function trimVideo(
  blob: Blob,
  name: string,
  inMs: number,
  outMs: number,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  if (outMs <= inMs) throw new Error('Trim out must be after in')
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const outputName = `out.${ext}`

  const buf = new Uint8Array(await blob.arrayBuffer())
  await ff.writeFile(inputName, buf)
  try {
    await withProgress(ff, onProgress, () =>
      ff.exec([
        '-ss',
        fmtTime(inMs),
        '-to',
        fmtTime(outMs),
        '-i',
        inputName,
        '-c',
        'copy',
        '-avoid_negative_ts',
        'make_zero',
        outputName,
      ]),
    )
    const data = (await ff.readFile(outputName)) as Uint8Array
    const out = new Uint8Array(data.byteLength)
    out.set(data)
    return new Blob([out.buffer], { type: blob.type || `video/${ext}` })
  } finally {
    try {
      await ff.deleteFile(inputName)
      await ff.deleteFile(outputName)
    } catch {
      // ignore
    }
  }
}

export async function trimVideoAccurate(
  blob: Blob,
  name: string,
  inMs: number,
  outMs: number,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  if (outMs <= inMs) throw new Error('Trim out must be after in')
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const outputName = 'out.mp4'

  const buf = new Uint8Array(await blob.arrayBuffer())
  await ff.writeFile(inputName, buf)
  try {
    await withProgress(ff, onProgress, async () => {
      await runEncodeWithAudioFallback(ff, [
        '-i',
        inputName,
        '-ss',
        fmtTime(inMs),
        '-to',
        fmtTime(outMs),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-movflags',
        '+faststart',
        outputName,
      ])
    })
    const data = (await ff.readFile(outputName)) as Uint8Array
    const copy = new ArrayBuffer(data.byteLength)
    new Uint8Array(copy).set(data)
    return new Blob([copy], { type: 'video/mp4' })
  } finally {
    try {
      await ff.deleteFile(inputName)
      await ff.deleteFile(outputName)
    } catch {
      // ignore
    }
  }
}

export async function extractAudio(
  blob: Blob,
  name: string,
  onProgress?: ProgressCallback,
): Promise<{ blob: Blob; ext: string }> {
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const buf = new Uint8Array(await blob.arrayBuffer())
  await ff.writeFile(inputName, buf)

  const tryFormat = async (outName: string, args: string[]): Promise<Blob | null> => {
    try {
      await ff.exec(args)
      const data = (await ff.readFile(outName)) as Uint8Array
      const copy = new ArrayBuffer(data.byteLength)
      new Uint8Array(copy).set(data)
      try {
        await ff.deleteFile(outName)
      } catch {
        // ignore
      }
      return new Blob([copy])
    } catch {
      return null
    }
  }

  try {
    let result: Blob | null = null
    let outExt = 'm4a'
    await withProgress(ff, onProgress, async () => {
      result = await tryFormat('out.m4a', ['-i', inputName, '-vn', '-c:a', 'copy', 'out.m4a'])
      if (!result) {
        outExt = 'mp3'
        result = await tryFormat('out.mp3', [
          '-i',
          inputName,
          '-vn',
          '-c:a',
          'libmp3lame',
          '-b:a',
          '192k',
          'out.mp3',
        ])
      }
    })
    if (!result) throw new Error('No audio track found')
    const mime = outExt === 'mp3' ? 'audio/mpeg' : 'audio/mp4'
    return { blob: new Blob([await (result as Blob).arrayBuffer()], { type: mime }), ext: outExt }
  } finally {
    try {
      await ff.deleteFile(inputName)
    } catch {
      // ignore
    }
  }
}

export async function muteVideo(
  blob: Blob,
  name: string,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const outputName = `out.${ext}`
  const buf = new Uint8Array(await blob.arrayBuffer())
  await ff.writeFile(inputName, buf)
  try {
    await withProgress(ff, onProgress, () =>
      ff.exec(['-i', inputName, '-c:v', 'copy', '-an', outputName]),
    )
    const data = (await ff.readFile(outputName)) as Uint8Array
    const copy = new ArrayBuffer(data.byteLength)
    new Uint8Array(copy).set(data)
    return new Blob([copy], { type: blob.type || `video/${ext}` })
  } finally {
    try {
      await ff.deleteFile(inputName)
      await ff.deleteFile(outputName)
    } catch {
      // ignore
    }
  }
}

export async function replaceAudio(
  videoBlob: Blob,
  videoName: string,
  audioBlob: Blob,
  audioName: string,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const ff = await getFFmpeg()
  const vExt = extOf(videoBlob.type, videoName)
  const aMatch = /\.([a-z0-9]+)$/i.exec(audioName)
  const aExt = (aMatch ? aMatch[1] : 'm4a').toLowerCase()
  const inputV = `in.${vExt}`
  const inputA = `audio.${aExt}`
  const outputName = 'out.mp4'

  await ff.writeFile(inputV, new Uint8Array(await videoBlob.arrayBuffer()))
  await ff.writeFile(inputA, new Uint8Array(await audioBlob.arrayBuffer()))
  try {
    await withProgress(ff, onProgress, () =>
      ff.exec([
        '-i',
        inputV,
        '-i',
        inputA,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-shortest',
        '-movflags',
        '+faststart',
        outputName,
      ]),
    )
    const data = (await ff.readFile(outputName)) as Uint8Array
    const copy = new ArrayBuffer(data.byteLength)
    new Uint8Array(copy).set(data)
    return new Blob([copy], { type: 'video/mp4' })
  } finally {
    try {
      await ff.deleteFile(inputV)
      await ff.deleteFile(inputA)
      await ff.deleteFile(outputName)
    } catch {
      // ignore
    }
  }
}

export async function gifFromVideo(
  blob: Blob,
  name: string,
  inMs: number,
  outMs: number,
  options: { fps?: number; width?: number; onProgress?: ProgressCallback } = {},
): Promise<Blob> {
  if (outMs <= inMs) throw new Error('GIF range must have positive duration')
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const paletteName = 'palette.png'
  const outputName = 'out.gif'
  const fps = Math.max(1, Math.min(30, options.fps ?? 15))
  const width = options.width ? Math.max(64, Math.min(1080, Math.round(options.width / 2) * 2)) : -1

  const buf = new Uint8Array(await blob.arrayBuffer())
  await ff.writeFile(inputName, buf)
  try {
    await withProgress(ff, options.onProgress, async () => {
      await ff.exec([
        '-ss',
        fmtTime(inMs),
        '-to',
        fmtTime(outMs),
        '-i',
        inputName,
        '-vf',
        `fps=${fps},scale=${width === -1 ? '-1' : width}:-1:flags=lanczos,palettegen=stats_mode=diff`,
        '-y',
        paletteName,
      ])
      await ff.exec([
        '-ss',
        fmtTime(inMs),
        '-to',
        fmtTime(outMs),
        '-i',
        inputName,
        '-i',
        paletteName,
        '-lavfi',
        `fps=${fps},scale=${width === -1 ? '-1' : width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`,
        '-loop',
        '0',
        '-y',
        outputName,
      ])
    })
    const data = (await ff.readFile(outputName)) as Uint8Array
    const copy = new ArrayBuffer(data.byteLength)
    new Uint8Array(copy).set(data)
    return new Blob([copy], { type: 'image/gif' })
  } finally {
    try {
      await ff.deleteFile(inputName)
      await ff.deleteFile(paletteName)
      await ff.deleteFile(outputName)
    } catch {
      // ignore
    }
  }
}

export async function probeKeyframes(
  blob: Blob,
  name: string,
  onProgress?: ProgressCallback,
): Promise<number[]> {
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const buf = new Uint8Array(await blob.arrayBuffer())
  await ff.writeFile(inputName, buf)

  const timesMs: number[] = []
  const handler = ({ message }: { message: string }) => {
    const m = /pts_time:\s*([\d.]+)/.exec(message)
    if (m) {
      const t = parseFloat(m[1])
      if (!isNaN(t)) timesMs.push(Math.round(t * 1000))
    }
  }
  ff.on('log', handler)
  try {
    await withProgress(ff, onProgress, () =>
      ff.exec([
        '-skip_frame',
        'nokey',
        '-i',
        inputName,
        '-an',
        '-vf',
        'showinfo',
        '-vsync',
        '0',
        '-f',
        'null',
        '-',
      ]),
    )
    return Array.from(new Set(timesMs)).sort((a, b) => a - b)
  } finally {
    ff.off('log', handler)
    try {
      await ff.deleteFile(inputName)
    } catch {
      // ignore
    }
  }
}

export type VideoCropBox = { x: number; y: number; w: number; h: number }

export async function cropEncodeVideo(
  blob: Blob,
  name: string,
  crop: VideoCropBox,
  output: { width: number; height: number },
  options: {
    crf?: number
    onProgress?: ProgressCallback
    fillMode?: 'crop' | 'fit'
    blurSigma?: number
  } = {},
): Promise<Blob> {
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const outputName = 'out.mp4'
  const crf = options.crf ?? 23
  const fillMode = options.fillMode ?? 'crop'

  const ix = Math.max(0, Math.round(crop.x))
  const iy = Math.max(0, Math.round(crop.y))
  const iw = Math.max(2, Math.round(crop.w))
  const ih = Math.max(2, Math.round(crop.h))
  const ow = Math.max(2, Math.round(output.width / 2) * 2)
  const oh = Math.max(2, Math.round(output.height / 2) * 2)

  // Fit mode: split source into two paths — a cover-fit Gaussian-blurred backdrop
  // and a contain-fit foreground — then overlay the foreground centered on the backdrop.
  // The crop coordinates are unused; the whole source is rendered.
  // Sigma 20 roughly matches the canvas blur(40px) used in the image preview.
  const blurSigma = Math.max(0, Math.min(40, options.blurSigma ?? 20))
  const fitFilter =
    `[0:v]split=2[bg][fg];` +
    `[bg]scale=${ow}:${oh}:force_original_aspect_ratio=increase,crop=${ow}:${oh},` +
    `gblur=sigma=${blurSigma},eq=brightness=-0.1[bgblur];` +
    `[fg]scale=${ow}:${oh}:force_original_aspect_ratio=decrease:force_divisible_by=2[fitv];` +
    `[bgblur][fitv]overlay=(W-w)/2:(H-h)/2,format=yuv420p[outv]`

  const args: string[] =
    fillMode === 'fit'
      ? [
          '-i',
          inputName,
          '-filter_complex',
          fitFilter,
          '-map',
          '[outv]',
          '-map',
          '0:a?',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          String(crf),
          '-movflags',
          '+faststart',
          outputName,
        ]
      : [
          '-i',
          inputName,
          '-vf',
          `crop=${iw}:${ih}:${ix}:${iy},scale=${ow}:${oh}`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          String(crf),
          '-movflags',
          '+faststart',
          outputName,
        ]

  const buf = new Uint8Array(await blob.arrayBuffer())
  await ff.writeFile(inputName, buf)
  try {
    await withProgress(ff, options.onProgress, async () => {
      await runEncodeWithAudioFallback(ff, args)
    })
    const data = (await ff.readFile(outputName)) as Uint8Array
    const out = new Uint8Array(data.byteLength)
    out.set(data)
    return new Blob([out.buffer], { type: 'video/mp4' })
  } finally {
    try {
      await ff.deleteFile(inputName)
      await ff.deleteFile(outputName)
    } catch {
      // ignore
    }
  }
}

export type CompressProgress = {
  pct: number
  pass: number
  maxPasses: number
  lastSizeBytes?: number
}

const MAX_COMPRESS_PASSES = 3
const COMPRESS_TOLERANCE = 0.08

function estimateInitialCrf(targetBytes: number, durationSec: number): number {
  const audioBps = 128_000
  const videoBps = Math.max(150_000, (targetBytes * 8) / durationSec - audioBps)
  const ref = 5_000_000
  const crf = 23 - 6 * Math.log2(videoBps / ref)
  return Math.max(18, Math.min(36, crf))
}

function adjustCrf(currentCrf: number, actualBytes: number, targetBytes: number): number {
  const ratio = actualBytes / targetBytes
  const next = currentCrf + 6 * Math.log2(ratio)
  return Math.max(18, Math.min(36, next))
}

export async function compressVideoToTargetSize(
  blob: Blob,
  name: string,
  durationMs: number,
  targetBytes: number,
  options: { onProgress?: (p: CompressProgress) => void } = {},
): Promise<Blob> {
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const outputName = 'out.mp4'

  const durationSec = Math.max(1, durationMs / 1000)
  let crf = estimateInitialCrf(targetBytes, durationSec)
  let bestData: ArrayBuffer | null = null
  let bestDiff = Infinity
  let lastSize: number | undefined

  const buf = new Uint8Array(await blob.arrayBuffer())
  await ff.writeFile(inputName, buf)
  try {
    for (let pass = 1; pass <= MAX_COMPRESS_PASSES; pass++) {
      const crfRounded = Math.round(crf)
      await withProgress(
        ff,
        options.onProgress
          ? (pct) => options.onProgress!({ pct, pass, maxPasses: MAX_COMPRESS_PASSES, lastSizeBytes: lastSize })
          : undefined,
        async () => {
          await runEncodeWithAudioFallback(ff, [
            '-i',
            inputName,
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            String(crfRounded),
            '-movflags',
            '+faststart',
            outputName,
          ])
        },
      )

      const data = (await ff.readFile(outputName)) as Uint8Array
      const size = data.byteLength
      lastSize = size
      const diff = Math.abs(size - targetBytes)
      if (diff < bestDiff) {
        bestDiff = diff
        const copy = new ArrayBuffer(size)
        new Uint8Array(copy).set(data)
        bestData = copy
      }

      if (Math.abs(size / targetBytes - 1) <= COMPRESS_TOLERANCE) break
      if (pass === MAX_COMPRESS_PASSES) break
      crf = adjustCrf(crf, size, targetBytes)
    }

    if (!bestData) throw new Error('Compression produced no output')
    return new Blob([bestData], { type: 'video/mp4' })
  } finally {
    try {
      await ff.deleteFile(inputName)
      await ff.deleteFile(outputName)
    } catch {
      // ignore
    }
  }
}

export async function extractFrame(
  blob: Blob,
  name: string,
  timeMs: number,
): Promise<Blob> {
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const outputName = 'out.png'
  const t = (timeMs / 1000).toFixed(3)

  const buf = new Uint8Array(await blob.arrayBuffer())
  await ff.writeFile(inputName, buf)
  try {
    await ff.exec(['-ss', t, '-i', inputName, '-frames:v', '1', '-q:v', '1', outputName])
    const data = (await ff.readFile(outputName)) as Uint8Array
    const out = new Uint8Array(data.byteLength)
    out.set(data)
    return new Blob([out.buffer], { type: 'image/png' })
  } finally {
    try {
      await ff.deleteFile(inputName)
      await ff.deleteFile(outputName)
    } catch {
      // ignore cleanup errors
    }
  }
}
