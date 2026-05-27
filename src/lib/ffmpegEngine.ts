import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

// ffmpeg-wasm has two cores. ST (single-thread) loads anywhere. MT (multi-thread,
// pthreads via SharedArrayBuffer) is 3–5× faster on x264 encodes but requires
// the page to be cross-origin-isolated (COOP: same-origin + COEP: require-corp).
//
// In dev, MT files are served same-origin from node_modules by the Next.js
// route handler at app/ffmpeg-mt/[file]/route.ts (Vite served them via a
// custom plugin pre-migration). In prod they live on the asset CDN (R2 behind
// assets.kreativekorna.com) — bundling the ~31MB wasm into the deploy bloats
// every cold deploy unnecessarily. ST wasm has always lived on the CDN for
// the same reason. Both paths require the CDN to send
// `Cross-Origin-Resource-Policy: cross-origin` + `Access-Control-Allow-Origin: *`
// on /ffmpeg* — without those, COEP enforcement on /studio/* blocks the fetch.
const MT_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://assets.kreativekorna.com/ffmpeg-mt'
    : '/ffmpeg-mt'
const ST_URLS = {
  core: '/ffmpeg/ffmpeg-core.js',
  wasm: 'https://assets.kreativekorna.com/ffmpeg/ffmpeg-core.wasm',
} as const
const MT_URLS = {
  core: `${MT_BASE}/ffmpeg-core.js`,
  wasm: `${MT_BASE}/ffmpeg-core.wasm`,
  worker: `${MT_BASE}/ffmpeg-core.worker.js`,
} as const

function canUseMT(): boolean {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof crossOriginIsolated !== 'undefined' &&
    crossOriginIsolated === true
  )
}

// Pipes ffmpeg's stderr to the browser console so we can see what it's actually
// doing during a hang. Dev-only — no-op in prod builds.
function attachDevLogTap(ff: FFmpeg): void {
  if (process.env.NODE_ENV !== 'development') return
  ff.on('log', ({ type, message }: { type: string; message: string }) => {
    console.log(`[ffmpeg:${type}] ${message}`)
  })
}

let instance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

type Listener = (status: EngineStatus) => void
const listeners = new Set<Listener>()

export type EngineStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: number }
  | { kind: 'ready'; variant: 'mt' | 'st' }
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
    try {
      // MT is preferred when the page is isolated, but a CDN miss (404, CORP
      // misconfig, transient network) shouldn't break the app — fall back to
      // ST so the engine still loads, just slower. The badge surfaces which
      // path actually won.
      if (canUseMT()) {
        try {
          const ff = new FFmpeg()
          const [coreURL, wasmURL, workerURL] = await Promise.all([
            toBlobURL(MT_URLS.core, 'text/javascript'),
            toBlobURL(MT_URLS.wasm, 'application/wasm'),
            toBlobURL(MT_URLS.worker, 'text/javascript'),
          ])
          await ff.load({ coreURL, wasmURL, workerURL })
          instance = ff
          attachDevLogTap(ff)
          setStatus({ kind: 'ready', variant: 'mt' })
          return ff
        } catch (mtErr) {
          console.warn('[ffmpeg] MT core unavailable, falling back to ST:', mtErr)
        }
      }
      const ff = new FFmpeg()
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(ST_URLS.core, 'text/javascript'),
        toBlobURL(ST_URLS.wasm, 'application/wasm'),
      ])
      await ff.load({ coreURL, wasmURL })
      instance = ff
      attachDevLogTap(ff)
      setStatus({ kind: 'ready', variant: 'st' })
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

/**
 * Returns a `0xRRGGBB` color string for ffmpeg filter graphs. Returns null if
 * the input isn't a well-formed hex color. ffmpeg accepts `#RRGGBB` directly,
 * but `0xRRGGBB` avoids any URL/shell escaping concerns and is universal.
 */
function sanitizeFfmpegColor(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const m = /^#?([0-9a-fA-F]{6})$/.exec(input.trim())
  return m ? `0x${m[1].toLowerCase()}` : null
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
    /** Target effective blur radius in CSS-px terms (4–48). Higher = softer bleed. */
    blurPx?: number
    /**
     * Optional trim range in milliseconds. When provided, the encode emits only
     * frames in [in, out]. Done in the same ffmpeg pass as the crop/fit so we
     * stay at one re-encode, not two.
     */
    trimMs?: { in: number; out: number }
    /** Backdrop kind for fit mode. Default: 'blur'. */
    backdropType?: 'blur' | 'solid'
    /** Hex color (#RRGGBB) used when backdropType === 'solid'. */
    backdropColor?: string
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

  const backdropType = options.backdropType ?? 'blur'
  const backdropColor = sanitizeFfmpegColor(options.backdropColor) ?? 'black'

  // Cap source long edge at 1280 and convert to 8-bit BEFORE the split/blur/
  // overlay pipeline runs. Tighter cap than the compress path (which is 1920)
  // because the fit graph runs every filter twice (bg + fg) — more memory
  // and CPU per frame, and the headroom on wasm's 32-bit 2GB cap is small.
  const preFilter = `scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`

  // Solid backdrop: a single `pad` filter wraps the contain-fit source with the
  // chosen color, then `vignette` darkens the corners so the bleed reads as
  // ambient light rather than flat paint. PI/5 is a moderate falloff angle.
  // Still no filter_complex, no blur — measurably faster than the blur path.
  const solidVf =
    `${preFilter},` +
    `scale=${ow}:${oh}:force_original_aspect_ratio=decrease:force_divisible_by=2,` +
    `pad=${ow}:${oh}:(${ow}-iw)/2:(${oh}-ih)/2:color=${backdropColor},` +
    `vignette=angle=PI/5,format=yuv420p`

  // Blur backdrop: split source into two paths — a cover-fit blurred backdrop
  // and a contain-fit foreground — then overlay foreground centered on backdrop.
  //
  // Perf note: blur ops are O(W*H*kernel) per frame, so a strong full-res Gaussian
  // crawls in ffmpeg-wasm. Instead we cover-fit, downscale hard, run a cheap
  // boxblur there, then upscale back. The upscale smoothing fills in the rest.
  // 20–50× faster than the equivalent gblur at full resolution.
  //
  // The user-facing "blur" knob controls the downscale target (smaller = softer)
  // plus boxblur passes for the high end of the range.
  const blurPx = Math.max(4, Math.min(48, Math.round(options.blurPx ?? 24)))
  const downscaleWidth = Math.max(120, Math.min(400, Math.round(480 - blurPx * 6)))
  const boxblurPasses = blurPx >= 32 ? 3 : 2
  const fitFilter =
    `[0:v]${preFilter},split=2[bg][fg];` +
    `[bg]scale=${ow}:${oh}:force_original_aspect_ratio=increase,crop=${ow}:${oh},` +
    `scale=${downscaleWidth}:-2,boxblur=2:${boxblurPasses},` +
    `scale=${ow}:${oh}:flags=bilinear,eq=brightness=-0.1[bgblur];` +
    `[fg]scale=${ow}:${oh}:force_original_aspect_ratio=decrease:force_divisible_by=2[fitv];` +
    `[bgblur][fitv]overlay=(W-w)/2:(H-h)/2,format=yuv420p[outv]`

  // Output-seek trim args (after -i) — accurate, suits the re-encode we're
  // already doing. Empty array when no trim is requested.
  const trim = options.trimMs
  const trimArgs: string[] =
    trim && trim.out > trim.in
      ? ['-ss', fmtTime(trim.in), '-to', fmtTime(trim.out)]
      : []

  const fitArgs: string[] =
    backdropType === 'solid'
      ? [
          '-i',
          inputName,
          ...trimArgs,
          '-vf',
          solidVf,
          '-c:v',
          'libx264',
          '-preset',
          'superfast',
          '-crf',
          String(crf),
          // -threads 1 in the crop/fit paths. With MT pthread workers active
          // for decode + filter graph, layering libx264's own internal slice/
          // lookahead threads on top can deadlock when the filter graph has
          // parallel branches (filter_complex with split/overlay). Single-
          // threaded x264 sidesteps the deadlock; the rest of the wasm stays
          // multi-threaded so decode + filters still benefit from MT.
          '-threads',
          '1',
          '-movflags',
          '+faststart',
          outputName,
        ]
      : [
          '-i',
          inputName,
          ...trimArgs,
          // Serialize the filter graph. Solid backdrop works because it uses
          // a single linear -vf chain; blur backdrop uses filter_complex with
          // parallel split → bg/fg branches → overlay, and ffmpeg-wasm's MT
          // pthread layer deadlocks during the parallel-branch synchronization.
          // Single-threaded filter processing avoids the deadlock; decode +
          // encode still run multi-threaded so MT's value is preserved.
          '-filter_threads',
          '1',
          '-filter_complex_threads',
          '1',
          '-filter_complex',
          fitFilter,
          '-map',
          '[outv]',
          '-map',
          '0:a?',
          '-c:v',
          'libx264',
          '-preset',
          'superfast',
          '-crf',
          String(crf),
          // -threads 1 in the crop/fit paths. With MT pthread workers active
          // for decode + filter graph, layering libx264's own internal slice/
          // lookahead threads on top can deadlock when the filter graph has
          // parallel branches (filter_complex with split/overlay). Single-
          // threaded x264 sidesteps the deadlock; the rest of the wasm stays
          // multi-threaded so decode + filters still benefit from MT.
          '-threads',
          '1',
          '-movflags',
          '+faststart',
          outputName,
        ]

  const args: string[] =
    fillMode === 'fit'
      ? fitArgs
      : [
          '-i',
          inputName,
          ...trimArgs,
          '-vf',
          `crop=${iw}:${ih}:${ix}:${iy},scale=${ow}:${oh},format=yuv420p`,
          '-c:v',
          'libx264',
          '-preset',
          'superfast',
          '-crf',
          String(crf),
          // -threads 1 in the crop/fit paths. With MT pthread workers active
          // for decode + filter graph, layering libx264's own internal slice/
          // lookahead threads on top can deadlock when the filter graph has
          // parallel branches (filter_complex with split/overlay). Single-
          // threaded x264 sidesteps the deadlock; the rest of the wasm stays
          // multi-threaded so decode + filters still benefit from MT.
          '-threads',
          '1',
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

// Each pass is a full re-encode. 2 passes with a looser ±15% tolerance is the
// sweet spot for ffmpeg-wasm: average run lands in 1 pass and worst-case lands
// in 2, instead of always paying for 3. Users sharing to social platforms care
// about "small enough", not "exactly this many bytes".
const MAX_COMPRESS_PASSES = 2
const COMPRESS_TOLERANCE = 0.15

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
  options: {
    onProgress?: (p: CompressProgress) => void
    /**
     * Optional trim range in ms. When provided, compression operates on the
     * trimmed slice and CRF estimation uses the trimmed duration so the size
     * target reflects the actual output, not the full source.
     */
    trimMs?: { in: number; out: number }
  } = {},
): Promise<Blob> {
  const ff = await getFFmpeg()
  const ext = extOf(blob.type, name)
  const inputName = `in.${ext}`
  const outputName = 'out.mp4'

  // Output-seek trim args (after -i) — accurate, suits the re-encode we're
  // already doing. Each iteration runs the same trim.
  const trim = options.trimMs
  const trimArgs: string[] =
    trim && trim.out > trim.in
      ? ['-ss', fmtTime(trim.in), '-to', fmtTime(trim.out)]
      : []
  const effectiveDurationMs =
    trim && trim.out > trim.in ? trim.out - trim.in : durationMs

  const durationSec = Math.max(1, effectiveDurationMs / 1000)
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
            ...trimArgs,
            // Cap long edge at 1920 and force 8-bit yuv420p. 4K 10-bit inputs
            // OOM the wasm heap during decode otherwise (20MB+ per frame), and
            // Compress's goal is hitting a target size for sharing — 4K isn't
            // useful at sub-10MB anyway. Standard 1080p content passes through
            // unchanged because its long edge already equals 1920.
            '-vf',
            "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
            '-c:v',
            'libx264',
            // ultrafast is ~2-3× faster than veryfast in wasm-x264; the ~25%
            // size penalty at a given CRF is absorbed by the CRF iteration
            // loop landing on the target. Net result: way less wall time per
            // pass without measurably worse output for sharing scenarios.
            '-preset',
            'ultrafast',
            '-crf',
            String(crfRounded),
            '-threads',
            '2',
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
