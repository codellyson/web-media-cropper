import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  EditorShell,
  RailExportButton,
  RailFooterNote,
  RailHeader,
  RailSlider,
  StatLine,
} from '@/components/editor/EditorShell'
import { VideoTimeline } from '@/components/editor/VideoTimeline'
import { formatDuration, type LoadedVideo } from '@/lib/loadVideo'
import { formatBytes } from '@/lib/crop'
import {
  compressVideoToTargetSize,
  cropEncodeVideo,
  extractAudio,
  extractFrame,
  gifFromVideo,
  muteVideo,
  probeKeyframes,
  replaceAudio,
  trimVideo,
  trimVideoAccurate,
} from '@/lib/ffmpegEngine'
import { parseTargetSize } from '@/lib/compress'
import {
  VIDEO_PRESETS,
  centeredCropBox,
  outputForCrop,
  ratioLabel as videoRatioLabel,
  type VideoPreset,
} from '@/lib/presetsVideo'
import { useEngineStatus } from '@/hooks/useEngineStatus'
import { downloadBlob, swapExtension } from '@/lib/download'
import { PlatformIcon } from '@/components/PlatformIcon'
import {
  MobileAspectStrip,
  type MobileAspectEntry,
} from '@/components/editor/MobileAspectStrip'

const FRAME_STEP_MS = 1000 / 30

/** Filename-safe single-decimal seconds: 3500ms -> "3.5s". */
function fmtSeconds(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toFixed(1)}s`
}

/** Range suffix for export filenames, e.g. "-3.5s-7.0s". One source of truth. */
function formatTrimSuffix(inMs: number, outMs: number): string {
  return `-${fmtSeconds(inMs)}-${fmtSeconds(outMs)}`
}

const VIDEO_CROP_ASPECT_ENTRIES: MobileAspectEntry[] = VIDEO_PRESETS.map((p) => ({
  id: p.id,
  platform: p.platform,
  display: p.short ?? p.name,
  ratio: videoRatioLabel(p),
}))

type Capture = {
  id: number
  timeMs: number
  thumb: string
  exporting: boolean
  /** How the frame got into the gallery — manual via C/Capture, or auto via bulk. */
  source: 'manual' | 'bulk'
}

type VideoViewProps = {
  video: LoadedVideo
  objectUrl: string
  onClear: () => void
}

export function VideoView({ video, objectUrl, onClear }: VideoViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentMs, setCurrentMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [captures, setCaptures] = useState<Capture[]>([])
  // Defaults to 'crop' so the user lands on the headline feature (subject-aware
  // reframe with Fit backdrop). Matches the toolbar's first tab.
  const [mode, setMode] = useState<'frame' | 'trim' | 'crop' | 'compress' | 'audio'>('crop')
  const [audioWorking, setAudioWorking] = useState(false)
  const [trimIn, setTrimIn] = useState(0)
  const [trimOut, setTrimOut] = useState(video.durationMs)
  const [trimBusy, setTrimBusy] = useState(false)
  const [trimAccurate, setTrimAccurate] = useState(false)
  // GIF rendering shares the trim range — picking 'gif' as Trim's output format
  // turns the export into a palette-based GIF render. fps/width are GIF-only.
  const [trimFormat, setTrimFormat] = useState<'mp4' | 'gif'>('mp4')
  const [gifFps, setGifFps] = useState(15)
  const [gifWidth, setGifWidth] = useState(480)
  const [cropPresetId, setCropPresetId] = useState<string>(VIDEO_PRESETS[0].id)
  const [cropOffset, setCropOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const [cropFillMode, setCropFillMode] = useState<'crop' | 'fit'>('fit')
  const [cropBlurPx, setCropBlurPx] = useState<number>(24)
  const [cropBackdropType, setCropBackdropType] = useState<'blur' | 'solid'>('blur')
  const [cropBackdropColor, setCropBackdropColor] = useState<string>('#000000')
  const [cropping, setCropping] = useState(false)
  const [compressTarget, setCompressTarget] = useState('10 MB')
  const [compressing, setCompressing] = useState(false)
  const [compressed, setCompressed] = useState<Blob | null>(null)
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null)
  // Bulk-capture state — independent of `progress` (which is for ffmpeg ops).
  // Seek+drawImage loop runs in JS; can't race ffmpeg, so it's not in anyBusy.
  const [bulkIntervalSec, setBulkIntervalSec] = useState<number>(2)
  const [bulkCapturing, setBulkCapturing] = useState(false)
  const [bulkDone, setBulkDone] = useState(0)
  const [bulkTotal, setBulkTotal] = useState(0)
  const captureIdRef = useRef(1)
  const engine = useEngineStatus()
  const [keyframes, setKeyframes] = useState<number[]>([])

  // No reset-on-source-change effect needed — App.tsx mounts <VideoView>
  // with key={state.objectUrl}, so loading a new file produces a fresh
  // component instance and useState initializers above pick up the new
  // duration/source naturally.

  useEffect(() => {
    if (engine.kind !== 'ready') return
    let cancelled = false
    probeKeyframes(video.sourceBlob, video.name)
      .then((times) => {
        if (!cancelled) setKeyframes(times)
      })
      .catch((err) => console.warn('[probeKeyframes]', err))
    return () => {
      cancelled = true
    }
  }, [engine.kind, video.sourceBlob, video.name])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => setCurrentMs(Math.round(v.currentTime * 1000))
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('seeked', onTime)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('seeked', onTime)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [])

  const seek = useCallback((ms: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(video.durationMs / 1000, ms / 1000))
  }, [video.durationMs])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }, [])

  const step = useCallback(
    (dir: -1 | 1) => {
      const v = videoRef.current
      if (!v) return
      const next = v.currentTime + (dir * FRAME_STEP_MS) / 1000
      v.currentTime = Math.max(0, Math.min(video.durationMs / 1000, next))
    },
    [video.durationMs],
  )

  const capture = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const W = 240
    const aspect = video.width / video.height
    const H = Math.round(W / aspect)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, W, H)
    const thumb = canvas.toDataURL('image/jpeg', 0.7)
    setCaptures((prev) => [
      ...prev,
      {
        id: captureIdRef.current++,
        timeMs: Math.round(v.currentTime * 1000),
        thumb,
        exporting: false,
        source: 'manual',
      },
    ])
  }, [video.width, video.height])

  /**
   * Bulk-capture: seek the video element to evenly-spaced timestamps and
   * snapshot each into the gallery. Caps at 100 frames so a 0.5s interval on a
   * 60s clip can't generate 120 captures and tank the browser. Runs entirely
   * client-side on the <video> element — does not race ffmpeg.
   */
  const bulkCapture = useCallback(
    async (intervalSec: number) => {
      if (bulkCapturing) return
      const v = videoRef.current
      if (!v || !(intervalSec > 0)) return
      setBulkCapturing(true)
      const wasPaused = v.paused
      v.pause()

      const total = Math.min(
        100,
        Math.max(1, Math.floor(video.durationMs / 1000 / intervalSec) + 1),
      )
      setBulkTotal(total)
      setBulkDone(0)

      // Re-running bulk replaces the prior bulk batch — the user is changing
      // their mind about the interval, not adding to it. Manual single-frame
      // captures (source: 'manual') survive untouched.
      setCaptures((prev) => prev.filter((c) => c.source !== 'bulk'))

      const W = 240
      const aspect = video.width / video.height
      const H = Math.round(W / aspect)

      try {
        for (let i = 0; i < total; i++) {
          const tSec = Math.min(
            (video.durationMs - 50) / 1000,
            i * intervalSec,
          )
          // Seek and wait for the next 'seeked' event before drawing — drawing
          // before the seek completes would snapshot the prior frame.
          v.currentTime = tSec
          await new Promise<void>((resolve) => {
            const onSeeked = () => {
              v.removeEventListener('seeked', onSeeked)
              resolve()
            }
            v.addEventListener('seeked', onSeeked)
          })

          const canvas = document.createElement('canvas')
          canvas.width = W
          canvas.height = H
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          ctx.drawImage(v, 0, 0, W, H)
          const thumb = canvas.toDataURL('image/jpeg', 0.7)
          const cap: Capture = {
            id: captureIdRef.current++,
            timeMs: Math.round(tSec * 1000),
            thumb,
            exporting: false,
            source: 'bulk',
          }
          setCaptures((prev) => [...prev, cap])
          setBulkDone(i + 1)
        }
      } finally {
        setBulkCapturing(false)
        if (!wasPaused) void v.play()
      }
    },
    [bulkCapturing, video.durationMs, video.width, video.height],
  )

  useEffect(() => {
    function isTyping(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable
    }
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        step(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        step(-1)
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        capture()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, togglePlay, capture])

  const exportCapture = async (cap: Capture) => {
    setCaptures((prev) => prev.map((c) => (c.id === cap.id ? { ...c, exporting: true } : c)))
    try {
      const png = await extractFrame(video.sourceBlob, video.name, cap.timeMs)
      const name = swapExtension(video.name, 'png').replace('.png', `-frame-${fmtSeconds(cap.timeMs)}.png`)
      downloadBlob(png, name)
    } catch (err) {
      console.error('[exportCapture]', err)
    } finally {
      setCaptures((prev) => prev.map((c) => (c.id === cap.id ? { ...c, exporting: false } : c)))
    }
  }

  const exportAll = async () => {
    for (const cap of captures) {
      await exportCapture(cap)
    }
  }

  const removeCapture = (id: number) => {
    setCaptures((prev) => prev.filter((c) => c.id !== id))
  }

  const clearCaptures = () => setCaptures([])

  const exportTrim = async () => {
    if (trimBusy) return
    if (trimOut <= trimIn) return
    setTrimBusy(true)
    const label = trimAccurate ? 'Trimming (frame-accurate)…' : 'Trimming…'
    setProgress({ label, pct: 0 })
    try {
      const fn = trimAccurate ? trimVideoAccurate : trimVideo
      const blob = await fn(video.sourceBlob, video.name, trimIn, trimOut, (pct) =>
        setProgress({ label, pct }),
      )
      const ext = trimAccurate
        ? 'mp4'
        : (() => {
            const m = /\.([a-z0-9]+)$/i.exec(video.name)
            return m ? m[1] : 'mp4'
          })()
      const base = video.name.replace(/\.[^.]+$/, '')
      downloadBlob(blob, `${base}-trim${formatTrimSuffix(trimIn, trimOut)}.${ext}`)
    } catch (err) {
      console.error('[exportTrim]', err)
    } finally {
      setTrimBusy(false)
      setProgress(null)
    }
  }

  const exportAudio = async () => {
    if (audioWorking) return
    setAudioWorking(true)
    setProgress({ label: 'Extracting audio…', pct: 0 })
    try {
      const out = await extractAudio(video.sourceBlob, video.name, (pct) =>
        setProgress({ label: 'Extracting audio…', pct }),
      )
      const base = video.name.replace(/\.[^.]+$/, '')
      downloadBlob(out.blob, `${base}.${out.ext}`)
    } catch (err) {
      console.error('[exportAudio]', err)
    } finally {
      setAudioWorking(false)
      setProgress(null)
    }
  }

  const exportMuted = async () => {
    if (audioWorking) return
    setAudioWorking(true)
    setProgress({ label: 'Removing audio…', pct: 0 })
    try {
      const out = await muteVideo(video.sourceBlob, video.name, (pct) =>
        setProgress({ label: 'Removing audio…', pct }),
      )
      const base = video.name.replace(/\.[^.]+$/, '')
      const ext = (() => {
        const m = /\.([a-z0-9]+)$/i.exec(video.name)
        return m ? m[1] : 'mp4'
      })()
      downloadBlob(out, `${base}-muted.${ext}`)
    } catch (err) {
      console.error('[exportMuted]', err)
    } finally {
      setAudioWorking(false)
      setProgress(null)
    }
  }

  const exportReplacedAudio = async (audioFile: File) => {
    if (audioWorking) return
    setAudioWorking(true)
    setProgress({ label: 'Replacing audio…', pct: 0 })
    try {
      const out = await replaceAudio(video.sourceBlob, video.name, audioFile, audioFile.name, (pct) =>
        setProgress({ label: 'Replacing audio…', pct }),
      )
      const base = video.name.replace(/\.[^.]+$/, '')
      downloadBlob(out, `${base}-with-audio.mp4`)
    } catch (err) {
      console.error('[exportReplacedAudio]', err)
    } finally {
      setAudioWorking(false)
      setProgress(null)
    }
  }

  const exportGif = async () => {
    if (trimBusy) return
    if (trimOut <= trimIn) return
    setTrimBusy(true)
    setProgress({ label: 'Rendering GIF…', pct: 0 })
    try {
      const blob = await gifFromVideo(video.sourceBlob, video.name, trimIn, trimOut, {
        fps: gifFps,
        width: gifWidth,
        onProgress: (pct) => setProgress({ label: 'Rendering GIF…', pct }),
      })
      const base = video.name.replace(/\.[^.]+$/, '')
      downloadBlob(blob, `${base}${formatTrimSuffix(trimIn, trimOut)}.gif`)
    } catch (err) {
      console.error('[exportGif]', err)
    } finally {
      setTrimBusy(false)
      setProgress(null)
    }
  }

  /** Right-rail Export action for the Trim tool — branches by chosen format. */
  const exportTrimOrGif = () => {
    if (trimFormat === 'gif') return exportGif()
    return exportTrim()
  }

  const handleToolChange = (t: Parameters<React.ComponentProps<typeof EditorShell>['onToolChange']>[0]) => {
    if (t === 'video-frame') setMode('frame')
    else if (t === 'video-trim') setMode('trim')
    else if (t === 'video-crop') {
      setMode('crop')
      videoRef.current?.pause()
    } else if (t === 'video-compress') {
      setMode('compress')
      videoRef.current?.pause()
    } else if (t === 'video-audio') {
      setMode('audio')
      videoRef.current?.pause()
    }
  }

  const cropPreset = VIDEO_PRESETS.find((p) => p.id === cropPresetId) ?? VIDEO_PRESETS[0]

  const exportCrop = async () => {
    if (cropping) return
    setCropping(true)
    const label = cropFillMode === 'fit' ? 'Fitting…' : 'Cropping…'
    setProgress({ label, pct: 0 })
    try {
      const aspect = cropPreset.width / cropPreset.height
      const baseBox = centeredCropBox(video.width, video.height, aspect)
      const maxDx = (video.width - baseBox.w) / 2
      const maxDy = (video.height - baseBox.h) / 2
      const dx = Math.max(-maxDx, Math.min(maxDx, cropOffset.dx))
      const dy = Math.max(-maxDy, Math.min(maxDy, cropOffset.dy))
      const box = { x: Math.round(baseBox.x + dx), y: Math.round(baseBox.y + dy), w: baseBox.w, h: baseBox.h }
      // For Fit, render at the preset's full dimensions; the contained-source +
      // blurred-bleed pipeline doesn't downscale based on source crop.
      const output =
        cropFillMode === 'fit'
          ? { width: cropPreset.width, height: cropPreset.height }
          : outputForCrop(cropPreset, box.w, box.h)
      // Apply trim only when the user has actually narrowed the range — avoids
      // a pointless -ss 0 -to duration on every export.
      const isTrimmed =
        trimIn > 0 || trimOut < video.durationMs - 1
      const out = await cropEncodeVideo(
        video.sourceBlob,
        video.name,
        box,
        { width: output.width, height: output.height },
        {
          fillMode: cropFillMode,
          blurPx: cropBlurPx,
          backdropType: cropBackdropType,
          backdropColor: cropBackdropColor,
          trimMs: isTrimmed ? { in: trimIn, out: trimOut } : undefined,
          onProgress: (pct) => setProgress({ label, pct }),
        },
      )
      const base = video.name.replace(/\.[^.]+$/, '')
      const fitSuffix = cropFillMode === 'fit' ? '-fit' : ''
      const trimSuffix = isTrimmed ? formatTrimSuffix(trimIn, trimOut) : ''
      downloadBlob(
        out,
        `${base}-${cropPreset.id}-${output.width}x${output.height}${fitSuffix}${trimSuffix}.mp4`,
      )
    } catch (err) {
      console.error('[exportCrop]', err)
    } finally {
      setCropping(false)
      setProgress(null)
    }
  }

  const targetBytes = parseTargetSize(compressTarget)

  const exportCompress = async () => {
    if (compressing || !targetBytes) return
    setCompressing(true)
    setCompressed(null)
    setProgress({ label: 'Compressing…', pct: 0 })
    try {
      const isTrimmed = trimIn > 0 || trimOut < video.durationMs - 1
      const out = await compressVideoToTargetSize(
        video.sourceBlob,
        video.name,
        video.durationMs,
        targetBytes,
        {
          onProgress: ({ pct, pass, maxPasses }) =>
            setProgress({ label: `Compressing · pass ${pass}/${maxPasses}`, pct }),
          trimMs: isTrimmed ? { in: trimIn, out: trimOut } : undefined,
        },
      )
      setCompressed(out)
      const base = video.name.replace(/\.[^.]+$/, '')
      const trimSuffix = isTrimmed ? formatTrimSuffix(trimIn, trimOut) : ''
      downloadBlob(out, `${base}-compressed${trimSuffix}.mp4`)
    } catch (err) {
      console.error('[exportCompress]', err)
    } finally {
      setCompressing(false)
      setProgress(null)
    }
  }

  // ffmpeg-wasm holds an exclusive in-memory FS, so any active export blocks
  // every other export. Derive once and pass to every rail's button.
  const anyBusy = trimBusy || cropping || compressing || audioWorking

  // Mobile bottom-bar primary action — varies by tool. Audio mode has multiple
  // actions (extract / mute / replace) so we leave it empty there; the user
  // opens the Settings sheet to pick.
  let mobileAction: React.ReactNode = null
  if (mode === 'trim') {
    const span = trimOut - trimIn
    // GIF is meaningful at full clip; MP4 trim isn't. Match TrimRail's disabled rule.
    const disabled =
      anyBusy ||
      engine.kind === 'loading' ||
      span < 100 ||
      (trimFormat === 'mp4' && span >= video.durationMs)
    const label = trimBusy
      ? trimFormat === 'gif'
        ? 'Rendering…'
        : 'Trimming…'
      : trimFormat === 'gif'
        ? 'Export GIF'
        : 'Export trim'
    mobileAction = (
      <RailExportButton align="start" onClick={exportTrimOrGif} disabled={disabled}>
        {label}
      </RailExportButton>
    )
  } else if (mode === 'crop') {
    const cropTrimmed = trimIn > 0 || trimOut < video.durationMs - 1
    const disabled = anyBusy || engine.kind === 'loading'
    const baseLabel = cropFillMode === 'fit' ? 'Export fit' : 'Export crop'
    mobileAction = (
      <RailExportButton align="start" onClick={exportCrop} disabled={disabled}>
        {cropping
          ? 'Encoding…'
          : cropTrimmed
            ? `${baseLabel} · ${formatDuration(trimOut - trimIn)}`
            : baseLabel}
      </RailExportButton>
    )
  } else if (mode === 'compress') {
    const compressTrimmed = trimIn > 0 || trimOut < video.durationMs - 1
    const disabled = anyBusy || engine.kind === 'loading' || !targetBytes
    mobileAction = (
      <RailExportButton align="start" onClick={exportCompress} disabled={disabled}>
        {compressing
          ? 'Compressing…'
          : compressTrimmed
            ? `Compress · ${formatDuration(trimOut - trimIn)}`
            : 'Compress'}
      </RailExportButton>
    )
  } else if (mode === 'frame' && captures.length > 0) {
    // Hidden when no captures — better than a "Export  frames" placeholder.
    // Once the user captures a first frame, the button appears with the count.
    const disabled = anyBusy || engine.kind === 'loading'
    mobileAction = (
      <RailExportButton align="start" onClick={exportAll} disabled={disabled}>
        Export {captures.length} {captures.length === 1 ? 'frame' : 'frames'}
      </RailExportButton>
    )
  }

  return (
    <EditorShell
      fileName={video.name}
      toolbarMode="video"
      mobileAction={mobileAction}
      mobileAspects={
        mode === 'crop' ? (
          <MobileAspectStrip
            entries={VIDEO_CROP_ASPECT_ENTRIES}
            value={cropPresetId}
            onSelect={(id) => {
              setCropPresetId(id)
              setCropOffset({ dx: 0, dy: 0 })
            }}
          />
        ) : undefined
      }
      activeTool={
        mode === 'trim'
          ? 'video-trim'
          : mode === 'crop'
            ? 'video-crop'
            : mode === 'compress'
              ? 'video-compress'
              : mode === 'audio'
                ? 'video-audio'
                : 'video-frame'
      }
      onToolChange={handleToolChange}
      fileMeta={
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      }
      leftRail={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <RailHeader>Source</RailHeader>
            <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--ic-line)] bg-[var(--ic-card)] p-2.5">
              <StatLine label="Dimensions" value={`${video.width}×${video.height}`} />
              <StatLine label="Duration" value={formatDuration(video.durationMs)} />
              <StatLine label="Size" value={formatBytes(video.sizeBytes)} />
              <StatLine label="Container" value={video.mime.replace(/^video\//, '') || 'unknown'} />
            </div>
          </div>

          {mode === 'crop' && (
            <div className="flex flex-col gap-3 border-t border-[var(--ic-line)] pt-3">
              <RailHeader>Aspect</RailHeader>
              <CropAspectRail
                presetId={cropPresetId}
                onPickPreset={(id) => {
                  setCropPresetId(id)
                  setCropOffset({ dx: 0, dy: 0 })
                }}
              />
            </div>
          )}

          {mode === 'trim' && (
            <TrimSelectionPanel
              inMs={trimIn}
              outMs={trimOut}
              onSetIn={() => setTrimIn(currentMs)}
              onSetOut={() => setTrimOut(Math.max(currentMs, trimIn + 100))}
              onReset={() => {
                setTrimIn(0)
                setTrimOut(video.durationMs)
              }}
            />
          )}

          {mode === 'compress' && (
            <CompressResultPanel
              targetBytes={targetBytes}
              sourceBytes={video.sizeBytes}
              outputBytes={compressed?.size ?? null}
              compressing={compressing}
              durationMs={video.durationMs}
              trimIn={trimIn}
              trimOut={trimOut}
              onResetTrim={() => {
                setTrimIn(0)
                setTrimOut(video.durationMs)
              }}
            />
          )}

          {mode === 'frame' && (
            <FrameBulkPanel
              durationMs={video.durationMs}
              intervalSec={bulkIntervalSec}
              onIntervalChange={setBulkIntervalSec}
              capturing={bulkCapturing}
              done={bulkDone}
              total={bulkTotal}
              onCapture={() => void bulkCapture(bulkIntervalSec)}
            />
          )}

          {mode === 'audio' && (
            <p className="px-1 font-mono-geist text-[10.5px] leading-relaxed text-[var(--ic-ink-4)]">
              Extract, mute, or replace the source audio.
            </p>
          )}
        </div>
      }
      rightRail={
        mode === 'frame' ? (
          <FrameGalleryRail
            captures={captures}
            engine={engine}
            busy={anyBusy}
            onExport={exportCapture}
            onExportAll={exportAll}
            onRemove={removeCapture}
            onClear={clearCaptures}
            onJump={(ms) => seek(ms)}
          />
        ) : mode === 'trim' ? (
          <TrimRail
            durationMs={video.durationMs}
            inMs={trimIn}
            outMs={trimOut}
            format={trimFormat}
            onFormatChange={setTrimFormat}
            engine={engine}
            trimBusy={trimBusy}
            busy={anyBusy}
            accurate={trimAccurate}
            onAccurateChange={setTrimAccurate}
            fps={gifFps}
            onFpsChange={setGifFps}
            width={gifWidth}
            onWidthChange={setGifWidth}
            onExport={exportTrimOrGif}
          />
        ) : mode === 'crop' ? (
          <CropRail
            presetId={cropPresetId}
            offset={cropOffset}
            onResetOffset={() => setCropOffset({ dx: 0, dy: 0 })}
            sourceWidth={video.width}
            sourceHeight={video.height}
            fillMode={cropFillMode}
            onFillModeChange={(m) => {
              setCropFillMode(m)
              if (m === 'fit') setCropOffset({ dx: 0, dy: 0 })
            }}
            blurPx={cropBlurPx}
            onBlurPxChange={setCropBlurPx}
            backdropType={cropBackdropType}
            onBackdropTypeChange={setCropBackdropType}
            backdropColor={cropBackdropColor}
            onBackdropColorChange={setCropBackdropColor}
            durationMs={video.durationMs}
            trimIn={trimIn}
            trimOut={trimOut}
            onResetTrim={() => {
              setTrimIn(0)
              setTrimOut(video.durationMs)
            }}
            engine={engine}
            cropping={cropping}
            busy={anyBusy}
            onExport={exportCrop}
          />
        ) : mode === 'audio' ? (
          <AudioRail
            engine={engine}
            working={audioWorking}
            busy={anyBusy}
            onExtract={exportAudio}
            onMute={exportMuted}
            onReplace={exportReplacedAudio}
          />
        ) : (
          <CompressRail
            target={compressTarget}
            onTargetChange={setCompressTarget}
            targetBytes={targetBytes}
            engine={engine}
            compressing={compressing}
            busy={anyBusy}
            onExport={exportCompress}
          />
        )
      }
    >
      <VideoCanvas
        video={video}
        objectUrl={objectUrl}
        videoRef={videoRef}
        engine={engine}
        currentMs={currentMs}
        playing={playing}
        capturedTimes={mode === 'frame' ? captures.map((c) => c.timeMs) : []}
        keyframeTimes={
          (mode === 'trim' && !trimAccurate) || mode === 'crop' || mode === 'compress'
            ? keyframes
            : []
        }
        onSeek={seek}
        onPlayToggle={togglePlay}
        onStep={step}
        primaryAction={
          mode === 'frame' ? (
            <button
              type="button"
              onClick={capture}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--ic-accent)] bg-[var(--ic-accent-tint)] px-2.5 py-1 font-mono-geist text-[11px] font-semibold uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-accent)] hover:brightness-110"
            >
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--ic-accent)' }} />
              Capture frame
            </button>
          ) : null
        }
        trim={
          mode === 'trim' || mode === 'crop' || mode === 'compress'
            ? {
                inMs: trimIn,
                outMs: trimOut,
                onTrimChange: ({ inMs, outMs }) => {
                  setTrimIn(inMs)
                  setTrimOut(outMs)
                },
              }
            : undefined
        }
        cropAspect={mode === 'crop' ? cropPreset.width / cropPreset.height : undefined}
        cropLabel={mode === 'crop' ? `${cropPreset.short ?? cropPreset.name} · ${cropPreset.width}×${cropPreset.height}` : undefined}
        cropOffset={mode === 'crop' ? cropOffset : undefined}
        onCropOffsetChange={mode === 'crop' && cropFillMode === 'crop' ? setCropOffset : undefined}
        cropFillMode={mode === 'crop' ? cropFillMode : undefined}
        fitBlurPx={mode === 'crop' ? cropBlurPx : undefined}
        fitBackdropType={mode === 'crop' ? cropBackdropType : undefined}
        fitBackdropColor={mode === 'crop' ? cropBackdropColor : undefined}
        encodeProgress={progress}
      />
    </EditorShell>
  )
}

/**
 * Left-rail panel for the Trim tool. Shows In/Out/Duration stats and the
 * Set-IN / Set-OUT / reset controls — these are about *what slice of the clip
 * you're operating on* (scope), so they belong on the left next to Source.
 *
 * Right-rail TrimRail keeps the export-format-y settings (Frame-accurate
 * toggle) and the Export button.
 */
/**
 * Left-rail panel for the Frame tool. Lets the user snapshot every Nth second
 * across the clip in one click — the captures land in the gallery on the right
 * and export through the existing single-frame pipeline.
 *
 * Capped at 100 frames downstream so a 0.5s interval on a long clip doesn't
 * runaway-fill the gallery.
 */
function FrameBulkPanel({
  durationMs,
  intervalSec,
  onIntervalChange,
  capturing,
  done,
  total,
  onCapture,
}: {
  durationMs: number
  intervalSec: number
  onIntervalChange: (s: number) => void
  capturing: boolean
  done: number
  total: number
  onCapture: () => void
}) {
  const expected = Math.min(
    100,
    Math.max(1, Math.floor(durationMs / 1000 / Math.max(0.1, intervalSec)) + 1),
  )
  const intervalLabel = intervalSec < 1 ? `${(intervalSec * 1000).toFixed(0)}ms` : `${intervalSec.toFixed(1)}s`
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--ic-line)] pt-3">
      <RailHeader>Bulk capture</RailHeader>
      <RailSlider
        label="Interval"
        value={Math.round(intervalSec * 10)}
        valueLabel={intervalLabel}
        min={5}
        max={100}
        onChange={(v) => onIntervalChange(v / 10)}
      />
      <button
        type="button"
        onClick={onCapture}
        disabled={capturing}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] px-3 text-[12.5px] font-medium text-[var(--ic-ink-2)] transition enabled:hover:border-[var(--ic-ink-4)] enabled:hover:text-[var(--ic-ink)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {capturing
          ? `Capturing ${done}/${total}…`
          : `Capture every ${intervalLabel}`}
        {!capturing && (
          <span className="font-mono-geist text-[10.5px] uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-ink-4)]">
            ~{expected}
          </span>
        )}
      </button>
      <p className="px-1 font-mono-geist text-[10.5px] leading-relaxed text-[var(--ic-ink-4)]">
        Re-running replaces the previous batch · scrub + C still adds single frames
      </p>
    </div>
  )
}

function TrimSelectionPanel({
  inMs,
  outMs,
  onSetIn,
  onSetOut,
  onReset,
}: {
  inMs: number
  outMs: number
  onSetIn: () => void
  onSetOut: () => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--ic-line)] pt-3">
      <RailHeader>Selection</RailHeader>
      <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
        <StatLine label="In" value={formatTimeMs(inMs)} />
        <StatLine label="Out" value={formatTimeMs(outMs)} />
        <div className="mt-1 flex items-baseline justify-between border-t border-[var(--ic-line)] pt-2">
          <span className="text-[12px] text-[var(--ic-ink-3)]">Duration</span>
          <span className="font-mono-geist text-[14px] font-semibold text-[var(--ic-accent)]">
            {formatTimeMs(outMs - inMs)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSetIn}
          className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2 py-1.5 font-mono-geist text-[11px] uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-ink-2)] hover:bg-[var(--ic-bg-3)]"
        >
          Set IN [{`{`}
        </button>
        <button
          type="button"
          onClick={onSetOut}
          className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2 py-1.5 font-mono-geist text-[11px] uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-ink-2)] hover:bg-[var(--ic-bg-3)]"
        >
          Set OUT {`}`}]
        </button>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="self-start font-mono-geist text-[10px] uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-ink-4)] hover:text-[var(--ic-ink-2)]"
      >
        reset to full clip
      </button>
    </div>
  )
}

function TrimRail({
  durationMs,
  inMs,
  outMs,
  format,
  onFormatChange,
  engine,
  trimBusy,
  busy,
  accurate,
  onAccurateChange,
  fps,
  onFpsChange,
  width,
  onWidthChange,
  onExport,
}: {
  durationMs: number
  inMs: number
  outMs: number
  format: 'mp4' | 'gif'
  onFormatChange: (f: 'mp4' | 'gif') => void
  engine: ReturnType<typeof useEngineStatus>
  /** True only when THIS rail is currently encoding — drives the export label. */
  trimBusy: boolean
  /** True when ANY encode is running — drives the disabled state across all rails. */
  busy: boolean
  accurate: boolean
  onAccurateChange: (v: boolean) => void
  fps: number
  onFpsChange: (v: number) => void
  width: number
  onWidthChange: (v: number) => void
  onExport: () => void
}) {
  const FPS_OPTIONS = [10, 15, 24]
  const WIDTH_OPTIONS = [240, 360, 480, 640]
  const span = outMs - inMs
  const tooLongForGif = format === 'gif' && span > 15000
  const exportLabel =
    trimBusy
      ? format === 'gif'
        ? 'Rendering…'
        : 'Trimming…'
      : engine.kind === 'loading'
        ? 'Loading engine…'
        : format === 'gif'
          ? 'Export GIF '
          : accurate
            ? 'Export trim (accurate) '
            : 'Export trim '
  const footerNote =
    format === 'gif'
      ? '100% in your browser'
      : accurate
        ? 'Frame-accurate · in your browser'
        : 'Lossless · in your browser'
  return (
    <>
      <RailHeader>Format</RailHeader>
      <div
        role="radiogroup"
        aria-label="Output format"
        className="inline-flex items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[11px] uppercase tracking-[var(--ic-tracking-radio)]"
      >
        {(['mp4', 'gif'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={format === f}
            onClick={() => onFormatChange(f)}
            className={`h-7 flex-1 rounded-full px-2.5 transition ${
              format === f
                ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
            }`}
          >
            {f === 'mp4' ? 'MP4' : 'GIF'}
          </button>
        ))}
      </div>

      {format === 'mp4' ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-2">
          <input
            type="checkbox"
            checked={accurate}
            onChange={(e) => onAccurateChange(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--ic-accent)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[12px] font-medium text-[var(--ic-ink)]">Frame-accurate</span>
            <span className="text-[11px] leading-relaxed text-[var(--ic-ink-4)]">
              {accurate
                ? 'Re-encodes for exact in/out points. Slower; quality kept high.'
                : 'Off: instant lossless cut. May snap to nearest keyframe.'}
            </span>
          </span>
        </label>
      ) : (
        <>
          <RailHeader>Frame rate</RailHeader>
          <div
            role="radiogroup"
            aria-label="Frame rate"
            className="inline-flex w-full items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[11px] uppercase tracking-[var(--ic-tracking-radio)]"
          >
            {FPS_OPTIONS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={fps === f}
                onClick={() => onFpsChange(f)}
                className={`h-7 flex-1 rounded-full px-2.5 transition ${
                  fps === f
                    ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                    : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
                }`}
              >
                {f} fps
              </button>
            ))}
          </div>

          <RailHeader>Width</RailHeader>
          <div
            role="radiogroup"
            aria-label="Width"
            className="inline-flex w-full items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[10.5px] uppercase tracking-[var(--ic-tracking-radio)]"
          >
            {WIDTH_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={width === w}
                onClick={() => onWidthChange(w)}
                className={`h-7 flex-1 rounded-full px-2 transition ${
                  width === w
                    ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                    : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-[var(--ic-ink-4)]">
        {format === 'gif'
          ? tooLongForGif
            ? 'Tip: GIFs over 15s get huge. Trim tighter for sane file sizes.'
            : 'Two-pass palette generation for clean colors.'
          : 'Drag the timeline edges to set in/out. Audio kept as-is.'}
      </p>

      <div className="mt-auto flex flex-col gap-2">
        <RailExportButton
          onClick={onExport}
          // GIF export is meaningful at any length (re-encodes via palette);
          // MP4 trim with the full range is a no-op so we still block it.
          disabled={
            busy ||
            engine.kind === 'loading' ||
            outMs <= inMs ||
            outMs - inMs < 100 ||
            (format === 'mp4' && outMs - inMs >= durationMs)
          }
        >
          {exportLabel}
        </RailExportButton>
        <RailFooterNote>{footerNote}</RailFooterNote>
      </div>
    </>
  )
}

function FrameGalleryRail({
  captures,
  engine,
  busy,
  onExport,
  onExportAll,
  onRemove,
  onClear,
  onJump,
}: {
  captures: Capture[]
  engine: ReturnType<typeof useEngineStatus>
  /** True when ANY encode is running — disables Export All. */
  busy: boolean
  onExport: (c: Capture) => void
  onExportAll: () => void
  onRemove: (id: number) => void
  onClear: () => void
  onJump: (ms: number) => void
}) {
  const anyExporting = captures.some((c) => c.exporting)
  return (
    <>
      <div className="flex items-baseline justify-between">
        <RailHeader>Captured frames · {captures.length}</RailHeader>
        {captures.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="font-mono-geist text-[10px] uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-ink-4)] hover:text-[var(--ic-ink-2)]"
          >
            clear
          </button>
        )}
      </div>

      {captures.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--ic-line)] p-4 text-center">
          <span className="font-mono-geist text-[10px] uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-ink-4)]">
            no frames yet
          </span>
          <p className="text-[11px] leading-relaxed text-[var(--ic-ink-3)]">
            Scrub to a moment and hit{' '}
            <span className="font-mono-geist text-[var(--ic-accent)]">Capture</span> (or press{' '}
            <kbd className="rounded border border-[var(--ic-line)] bg-[var(--ic-bg-3)] px-1 font-mono-geist text-[10px]">
              C
            </kbd>
            ).
          </p>
        </div>
      ) : (
        // flex-1 + min-h-0 lets the list grow to fill the rail's free space
        // between the header and the bottom Export card, instead of a fixed
        // 320px window. min-h-0 is the magic that lets a flex child shrink
        // below its content height so overflow-y-auto can take over.
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
          {captures.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--ic-line)] bg-[var(--ic-card)] p-1.5"
            >
              <button
                type="button"
                onClick={() => onJump(c.timeMs)}
                aria-label={`Seek to ${formatTimeMs(c.timeMs)}`}
                className="block h-12 w-20 flex-shrink-0 overflow-hidden rounded-sm bg-black"
              >
                <img src={c.thumb} alt="" className="h-full w-full object-cover" />
              </button>
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="font-mono-geist text-[11px] font-semibold text-[var(--ic-ink)]">
                  {formatTimeMs(c.timeMs)}
                </span>
                <button
                  type="button"
                  onClick={() => onExport(c)}
                  disabled={c.exporting}
                  className="self-start font-mono-geist text-[10px] uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-accent)] hover:brightness-110 disabled:opacity-50"
                >
                  {c.exporting ? 'exporting…' : 'export PNG'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                aria-label="Remove"
                className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-[var(--ic-ink-4)] hover:bg-[var(--ic-bg-3)] hover:text-[var(--ic-ink-2)]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <RailExportButton
          onClick={onExportAll}
          disabled={busy || captures.length === 0 || anyExporting || engine.kind === 'loading'}
        >
          {engine.kind === 'loading'
            ? 'Loading engine…'
            : anyExporting
              ? 'Exporting…'
              : `Export all ${captures.length || ''}`.trim()}{' '}

        </RailExportButton>
        <RailFooterNote>Native resolution · in your browser</RailFooterNote>
      </div>
    </>
  )
}

type CanvasProps = {
  video: LoadedVideo
  objectUrl: string
  videoRef: React.RefObject<HTMLVideoElement | null>
  engine: ReturnType<typeof useEngineStatus>
  currentMs: number
  playing: boolean
  capturedTimes: number[]
  keyframeTimes?: number[]
  onSeek: (ms: number) => void
  onPlayToggle: () => void
  onStep: (dir: -1 | 1) => void
  primaryAction?: React.ReactNode
  trim?: { inMs: number; outMs: number; onTrimChange: (v: { inMs: number; outMs: number }) => void }
  cropAspect?: number
  cropLabel?: string
  cropOffset?: { dx: number; dy: number }
  onCropOffsetChange?: (next: { dx: number; dy: number }) => void
  cropFillMode?: 'crop' | 'fit'
  fitBlurPx?: number
  fitBackdropType?: 'blur' | 'solid'
  fitBackdropColor?: string
  encodeProgress?: { label: string; pct: number } | null
}

function VideoCanvas({
  video,
  objectUrl,
  videoRef,
  engine,
  currentMs,
  playing,
  capturedTimes,
  keyframeTimes,
  onSeek,
  onPlayToggle,
  onStep,
  primaryAction,
  trim,
  cropAspect,
  cropLabel,
  cropOffset,
  onCropOffsetChange,
  cropFillMode,
  fitBlurPx,
  fitBackdropType,
  fitBackdropColor,
  encodeProgress,
}: CanvasProps) {
  const sourceAspect = video.width / video.height
  // In Fit mode the stage frame matches the *target* aspect (the user is
  // previewing the output, not the source).
  const fitting = cropFillMode === 'fit' && cropAspect != null
  const aspect = fitting ? cropAspect : sourceAspect
  const MAX_W = 720
  const MAX_H = 380
  const PAD_X = 48 // p-6 left + right
  const PAD_Y = 72 // pt-12 (48) + pb-6 (24)
  const stageRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<{ w: number; h: number }>({ w: MAX_W, h: MAX_H })

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const compute = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const availW = Math.max(120, rect.width - PAD_X)
      const availH = Math.max(120, rect.height - PAD_Y)
      const capW = Math.min(MAX_W, availW)
      const capH = Math.min(MAX_H, availH)
      let w: number, h: number
      if (aspect >= 1) {
        w = capW
        h = w / aspect
        if (h > capH) {
          h = capH
          w = h * aspect
        }
      } else {
        h = capH
        w = h * aspect
        if (w > capW) {
          w = capW
          h = w / aspect
        }
      }
      setFrame({ w: Math.round(w), h: Math.round(h) })
    }
    compute()
    const obs = new ResizeObserver(compute)
    obs.observe(el)
    return () => obs.disconnect()
  }, [aspect])

  const checker = `linear-gradient(45deg, var(--ic-bg-3) 25%, transparent 25%), linear-gradient(-45deg, var(--ic-bg-3) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--ic-bg-3) 75%), linear-gradient(-45deg, transparent 75%, var(--ic-bg-3) 75%)`
  return (
    <div
      ref={stageRef}
      className="relative flex flex-1 flex-col overflow-hidden"
      style={{
        background: checker,
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        backgroundColor: 'var(--ic-bg-2)',
      }}
    >
      <div className="absolute left-4 top-3.5 z-[5] flex items-center gap-2.5 font-mono-geist text-[11px] text-[var(--ic-ink-3)]">
        <span className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2 py-1">
          {video.width}×{video.height}
        </span>
        <span style={{ color: 'var(--ic-ink-4)' }}>·</span>
        <span>{formatDuration(video.durationMs)}</span>
      </div>

      <div className="grid flex-1 place-items-center p-6 pt-12">
        <div
          className="relative rounded-md"
          style={{
            width: `${frame.w}px`,
            height: `${frame.h}px`,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
          <span className="absolute left-1/2 -top-9 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-1 font-mono-geist text-[11px] text-[var(--ic-ink-2)] shadow-[var(--ic-shadow-sm)]">
            {video.name}
          </span>
          {/* Inner clipping wrapper so the Fit-mode blurred backdrop's
              transform: scale(1.08) doesn't bleed past the rounded corners.
              Stable across Crop/Fit toggles — the <video> never moves DOM
              parent, so it doesn't remount. */}
          <div className="absolute inset-0 overflow-hidden rounded-md">
            <FitBackdrop
              videoRef={videoRef}
              frameW={frame.w}
              frameH={frame.h}
              visible={fitting}
              blurPx={fitBlurPx ?? 24}
              backdropType={fitBackdropType ?? 'blur'}
              backdropColor={fitBackdropColor ?? '#000000'}
            />
            {fitting && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.18)' }}
              />
            )}
            <video
              ref={videoRef}
              src={objectUrl}
              playsInline
              className={`relative block h-full w-full ${fitting ? 'bg-transparent object-contain' : 'bg-black'}`}
            />
          </div>
          {cropAspect != null && !fitting && (
            <CropOverlay
              frameW={frame.w}
              frameH={frame.h}
              sourceWidth={video.width}
              sourceHeight={video.height}
              cropAspect={cropAspect}
              label={cropLabel}
              offset={cropOffset ?? { dx: 0, dy: 0 }}
              onOffsetChange={onCropOffsetChange}
            />
          )}
          {fitting && cropLabel && (
            <span className="pointer-events-none absolute left-2 top-2 z-[5] rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)]/90 px-2 py-1 font-mono-geist text-[11px] text-[var(--ic-ink-2)] shadow-[var(--ic-shadow-sm)] backdrop-blur-sm">
              {cropLabel}
            </span>
          )}
        </div>
      </div>

      <VideoTimeline
        durationMs={video.durationMs}
        currentMs={currentMs}
        playing={playing}
        capturedTimes={capturedTimes}
        keyframeTimes={keyframeTimes}
        onSeek={onSeek}
        onPlayToggle={onPlayToggle}
        onStep={onStep}
        primaryAction={primaryAction}
        trim={trim}
      />

      {engine.kind === 'loading' && <EngineOverlay message="Loading video engine…" sub="One-time download · cached after first load" />}
      {engine.kind === 'error' && (
        <EngineOverlay
          message="Video engine failed to load"
          sub={engine.message}
          variant="error"
        />
      )}
      {encodeProgress && <ProgressOverlay label={encodeProgress.label} pct={encodeProgress.pct} />}
    </div>
  )
}

function ProgressOverlay({ label, pct }: { label: string; pct: number }) {
  const pctRounded = Math.round(pct * 100)
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center backdrop-blur-sm"
      style={{ background: 'rgba(0,0,0,0.45)' }}
    >
      <div
        className="pointer-events-auto flex w-80 flex-col items-stretch gap-3 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] px-6 py-5 shadow-[var(--ic-shadow-xl)]"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] font-semibold text-[var(--ic-ink)]">{label}</span>
          <span className="font-mono-geist text-[12px] text-[var(--ic-ink-3)]">{pctRounded}%</span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--ic-bg-3)]">
          <div
            className="absolute left-0 top-0 bottom-0 rounded-full"
            style={{
              width: `${pctRounded}%`,
              background: 'var(--ic-accent)',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
        <RailFooterNote>100% in your browser</RailFooterNote>
      </div>
    </div>
  )
}

function EngineOverlay({
  message,
  sub,
  variant,
}: {
  message: string
  sub?: string
  variant?: 'error'
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] px-6 py-5 shadow-[var(--ic-shadow-xl)]">
        <span
          className="block h-2 w-2 rounded-full"
          style={{
            background: variant === 'error' ? 'var(--destructive)' : 'var(--ic-accent)',
            boxShadow: variant === 'error' ? 'none' : '0 0 12px var(--ic-accent-glow)',
            animation: variant === 'error' ? undefined : 'ic-pulse-soft 1.2s ease-in-out infinite',
          }}
        />
        <p className="text-[14px] font-semibold text-[var(--ic-ink)]">{message}</p>
        {sub && (
          <p className="max-w-xs text-center font-mono-geist text-[11px] leading-relaxed text-[var(--ic-ink-3)]">
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}


/**
 * Paints the foreground <video> element into a canvas with cover-fit math, then
 * applies CSS blur + brightness to mimic the export's `gblur=sigma=20` +
 * `eq=brightness=-0.1` chain. The canvas overflows the frame slightly via
 * transform: scale so the blur halo doesn't show transparent edges.
 *
 * Always mounted (controlled by `visible`) so the foreground <video> element's
 * ref and playback state stay stable across Fit toggles.
 */
function FitBackdrop({
  videoRef,
  frameW,
  frameH,
  visible,
  blurPx = 24,
  backdropType = 'blur',
  backdropColor = '#000000',
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  frameW: number
  frameH: number
  visible: boolean
  blurPx?: number
  backdropType?: 'blur' | 'solid'
  backdropColor?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    // Solid mode doesn't need the rAF paint loop — the colored <div> below
    // does the work via plain CSS background. Skip wiring listeners entirely.
    if (!visible || backdropType === 'solid') return
    const canvas = canvasRef.current
    const vid = videoRef.current
    if (!canvas || !vid) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(40, Math.round(frameW * dpr))
    canvas.height = Math.max(40, Math.round(frameH * dpr))

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const vw = vid.videoWidth
      const vh = vid.videoHeight
      if (vw === 0 || vh === 0 || vid.readyState < 2) return
      const cw = canvas.width
      const ch = canvas.height
      const scale = Math.max(cw / vw, ch / vh)
      const w = vw * scale
      const h = vh * scale
      const x = (cw - w) / 2
      const y = (ch - h) / 2
      ctx.drawImage(vid, x, y, w, h)
    }

    const tick = () => {
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }

    if (!vid.paused) tick()
    else draw()

    const onPlay = () => {
      if (rafRef.current == null) tick()
    }
    const onPause = () => {
      stop()
      draw()
    }
    const onSeeked = () => draw()
    const onLoaded = () => draw()
    vid.addEventListener('play', onPlay)
    vid.addEventListener('pause', onPause)
    vid.addEventListener('seeked', onSeeked)
    vid.addEventListener('loadeddata', onLoaded)

    return () => {
      stop()
      vid.removeEventListener('play', onPlay)
      vid.removeEventListener('pause', onPause)
      vid.removeEventListener('seeked', onSeeked)
      vid.removeEventListener('loadeddata', onLoaded)
    }
  }, [visible, frameW, frameH, videoRef, backdropType])

  // Solid backdrop is a static colored <div> — no rAF, no canvas paint. A
  // radial gradient layer overlays the flat color so the corners fall off,
  // matching the vignette baked into the export pipeline.
  if (backdropType === 'solid') {
    const safeColor = /^#[0-9a-fA-F]{6}$/.test(backdropColor) ? backdropColor : '#000000'
    return (
      <div
        aria-hidden
        className="absolute inset-0 h-full w-full rounded-md"
        style={{
          display: visible ? 'block' : 'none',
          background: `radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.45) 100%), ${safeColor}`,
        }}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 h-full w-full rounded-md"
      style={{
        display: visible ? 'block' : 'none',
        // Slight upscale so the blur halo doesn't reveal transparent edges
        // when clipped by the parent's rounded-md. The scale tracks the blur
        // amount because larger blur radii fade further past the edge.
        transform: `scale(${1.04 + Math.min(0.08, blurPx / 600)})`,
        filter: `blur(${blurPx}px)`,
        background: '#000',
      }}
    />
  )
}


/**
 * "Selection" row in the crop rail's output card. Shows the current trim range
 * as part of the export summary; surfaces a one-click reset only when trimmed.
 * Always rendered so users discover that the timeline edges are draggable.
 */
function SelectionStat({
  isTrimmed,
  selectedMs,
  durationMs,
  onReset,
}: {
  isTrimmed: boolean
  selectedMs: number
  durationMs: number
  onReset: () => void
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-[var(--ic-ink-3)]">Selection</span>
      <span className="inline-flex items-baseline gap-2">
        <span
          className={`font-mono-geist text-[12px] font-semibold ${
            isTrimmed ? 'text-[var(--ic-accent)]' : 'text-[var(--ic-ink-3)]'
          }`}
        >
          {isTrimmed ? formatDuration(selectedMs) : `Full · ${formatDuration(durationMs)}`}
        </span>
        {isTrimmed && (
          <button
            type="button"
            onClick={onReset}
            aria-label="Reset trim"
            className="font-mono-geist text-[10px] uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-ink-4)] hover:text-[var(--ic-ink-2)]"
          >
            reset
          </button>
        )}
      </span>
    </div>
  )
}

function formatTimeMs(ms: number): string {
  const total = ms / 1000
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  const cs = Math.floor((ms % 1000) / 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function CropOverlay({
  frameW,
  frameH,
  sourceWidth,
  sourceHeight,
  cropAspect,
  label,
  offset,
  onOffsetChange,
}: {
  frameW: number
  frameH: number
  sourceWidth: number
  sourceHeight: number
  cropAspect: number
  label?: string
  offset: { dx: number; dy: number }
  onOffsetChange?: (next: { dx: number; dy: number }) => void
}) {
  const sourceAspect = sourceWidth / sourceHeight
  let cropW: number, cropH: number
  if (sourceAspect > cropAspect) {
    cropH = frameH
    cropW = cropH * cropAspect
  } else {
    cropW = frameW
    cropH = cropW / cropAspect
  }
  const scale = frameW / sourceWidth
  const maxDxSrc = (sourceWidth - cropW / scale) / 2
  const maxDySrc = (sourceHeight - cropH / scale) / 2
  const dxSrc = Math.max(-maxDxSrc, Math.min(maxDxSrc, offset.dx))
  const dySrc = Math.max(-maxDySrc, Math.min(maxDySrc, offset.dy))
  const left = (frameW - cropW) / 2 + dxSrc * scale
  const top = (frameH - cropH) / 2 + dySrc * scale

  const startDrag = (e: React.PointerEvent) => {
    if (!onOffsetChange) return
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    const pointerId = e.pointerId
    try {
      target.setPointerCapture(pointerId)
    } catch {
      // some browsers/test envs may throw — non-fatal
    }
    const startX = e.clientX
    const startY = e.clientY
    const startDx = dxSrc
    const startDy = dySrc
    const move = (ev: PointerEvent) => {
      const ddx = (ev.clientX - startX) / scale
      const ddy = (ev.clientY - startY) / scale
      onOffsetChange({
        dx: Math.max(-maxDxSrc, Math.min(maxDxSrc, startDx + ddx)),
        dy: Math.max(-maxDySrc, Math.min(maxDySrc, startDy + ddy)),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        // non-fatal
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* dim outside */}
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)" }} />
      <div
        onPointerDown={startDrag}
        role={onOffsetChange ? 'slider' : undefined}
        aria-label={onOffsetChange ? 'Crop position — drag to reframe' : undefined}
        tabIndex={onOffsetChange ? 0 : undefined}
        onKeyDown={(e) => {
          if (!onOffsetChange) return
          const step = (e.shiftKey ? 32 : 8) / scale
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            onOffsetChange({ dx: Math.max(-maxDxSrc, dxSrc - step), dy: dySrc })
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            onOffsetChange({ dx: Math.min(maxDxSrc, dxSrc + step), dy: dySrc })
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            onOffsetChange({ dx: dxSrc, dy: Math.max(-maxDySrc, dySrc - step) })
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            onOffsetChange({ dx: dxSrc, dy: Math.min(maxDySrc, dySrc + step) })
          }
        }}
        className={onOffsetChange ? 'pointer-events-auto absolute cursor-move touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--ic-accent)]' : 'absolute'}
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${cropW}px`,
          height: `${cropH}px`,
          background: "transparent",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          border: "2px solid var(--ic-accent)",
          borderRadius: 2,
        }}
      >
        {/* corners */}
        {[
          { l: -1, t: -1, dirs: "tl" },
          { r: -1, t: -1, dirs: "tr" },
          { l: -1, b: -1, dirs: "bl" },
          { r: -1, b: -1, dirs: "br" },
        ].map((c, i) => {
          const has = (d: string) => (c.dirs as string).includes(d)
          return (
            <span
              key={i}
              aria-hidden
              style={{
                position: "absolute",
                width: 12,
                height: 12,
                left: "l" in c ? (c.l as number) : undefined,
                right: "r" in c ? (c.r as number) : undefined,
                top: "t" in c ? (c.t as number) : undefined,
                bottom: "b" in c ? (c.b as number) : undefined,
                borderTop: has("t") ? "3px solid var(--ic-accent)" : 0,
                borderBottom: has("b") ? "3px solid var(--ic-accent)" : 0,
                borderLeft: has("l") ? "3px solid var(--ic-accent)" : 0,
                borderRight: has("r") ? "3px solid var(--ic-accent)" : 0,
              }}
            />
          )
        })}
        {label && (
          <span
            className="absolute -top-7 left-0 whitespace-nowrap rounded-sm bg-[var(--ic-accent)] px-2 py-0.5 font-mono-geist text-[10px] font-semibold uppercase tracking-[var(--ic-tracking-hint)] text-white"
          >
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Left-rail preset list for the Crop tool. Pulled out of CropRail so the right
 * rail (settings) and left rail (navigation/aspect picker) don't fight for
 * vertical space. Mirrors the image studio's FormatRail placement.
 */
function CropAspectRail({
  presetId,
  onPickPreset,
}: {
  presetId: string
  onPickPreset: (id: string) => void
}) {
  const portrait: VideoPreset[] = []
  const square: VideoPreset[] = []
  const landscape: VideoPreset[] = []
  for (const p of VIDEO_PRESETS) {
    const r = p.width / p.height
    if (r < 0.99) portrait.push(p)
    else if (r > 1.01) landscape.push(p)
    else square.push(p)
  }
  const groups: Array<{ id: string; label: string; items: VideoPreset[] }> = [
    { id: 'portrait', label: 'Portrait', items: portrait },
    { id: 'square', label: 'Square', items: square },
    { id: 'landscape', label: 'Landscape', items: landscape },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <div className="px-2.5 pb-1 font-mono-geist text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
            {group.label}
          </div>
          {group.items.map((p) => {
            const on = p.id === presetId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPickPreset(p.id)}
                aria-pressed={on}
                className={`relative flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition ${
                  on
                    ? 'bg-[var(--ic-card)] text-[var(--ic-ink)]'
                    : 'bg-transparent text-[var(--ic-ink-2)] hover:bg-[var(--ic-card)] hover:text-[var(--ic-ink)]'
                }`}
              >
                {on && (
                  <span
                    aria-hidden
                    className="absolute -left-3 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-sm"
                    style={{ background: 'var(--ic-accent)' }}
                  />
                )}
                <span className="inline-flex items-center gap-2.5">
                  <PlatformIcon platform={p.platform} size={16} />
                  {p.short ?? p.name}
                </span>
                <span
                  className={`font-mono-geist text-[11px] ${
                    on ? 'text-[var(--ic-ink-3)]' : 'text-[var(--ic-ink-4)]'
                  }`}
                >
                  {videoRatioLabel(p)}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function CropRail({
  presetId,
  offset,
  onResetOffset,
  sourceWidth,
  sourceHeight,
  fillMode,
  onFillModeChange,
  blurPx,
  onBlurPxChange,
  backdropType,
  onBackdropTypeChange,
  backdropColor,
  onBackdropColorChange,
  durationMs,
  trimIn,
  trimOut,
  onResetTrim,
  engine,
  cropping,
  busy,
  onExport,
}: {
  presetId: string
  offset: { dx: number; dy: number }
  onResetOffset: () => void
  sourceWidth: number
  sourceHeight: number
  fillMode: 'crop' | 'fit'
  onFillModeChange: (m: 'crop' | 'fit') => void
  blurPx: number
  onBlurPxChange: (v: number) => void
  backdropType: 'blur' | 'solid'
  onBackdropTypeChange: (t: 'blur' | 'solid') => void
  backdropColor: string
  onBackdropColorChange: (c: string) => void
  durationMs: number
  trimIn: number
  trimOut: number
  onResetTrim: () => void
  engine: ReturnType<typeof useEngineStatus>
  /** True only when THIS rail is currently encoding — drives the export label. */
  cropping: boolean
  /** True when ANY encode is running — drives the disabled state. */
  busy: boolean
  onExport: () => void
}) {
  const isFit = fillMode === 'fit'
  const active = VIDEO_PRESETS.find((p) => p.id === presetId) ?? VIDEO_PRESETS[0]
  const aspect = active.width / active.height
  const baseBox = centeredCropBox(sourceWidth, sourceHeight, aspect)
  const maxDx = (sourceWidth - baseBox.w) / 2
  const maxDy = (sourceHeight - baseBox.h) / 2
  const dx = Math.max(-maxDx, Math.min(maxDx, offset.dx))
  const dy = Math.max(-maxDy, Math.min(maxDy, offset.dy))
  const box = { x: Math.round(baseBox.x + dx), y: Math.round(baseBox.y + dy), w: baseBox.w, h: baseBox.h }
  const output = outputForCrop(active, box.w, box.h)
  const isOffset = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5
  const isTrimmed = trimIn > 0 || trimOut < durationMs - 1
  const selectedMs = Math.max(0, trimOut - trimIn)

  return (
    <>
      <RailHeader>Mode</RailHeader>
      <div
        role="radiogroup"
        aria-label="Fill mode"
        className="inline-flex items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[11px] uppercase tracking-[var(--ic-tracking-radio)]"
      >
        {(['fit', 'crop'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={fillMode === m}
            onClick={() => onFillModeChange(m)}
            className={`h-7 flex-1 rounded-full px-2.5 transition ${
              fillMode === m
                ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
            }`}
          >
            {m === 'fit' ? 'Fit' : 'Crop'}
          </button>
        ))}
      </div>

      {isFit ? (
        <>
          <RailHeader>Bleed</RailHeader>
          <div className="flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Backdrop"
              className="inline-flex flex-1 items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[11px] uppercase tracking-[var(--ic-tracking-radio)]"
            >
              {(['blur', 'solid'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={backdropType === t}
                  onClick={() => onBackdropTypeChange(t)}
                  className={`h-7 flex-1 rounded-full px-2.5 transition ${
                    backdropType === t
                      ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                      : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
                  }`}
                >
                  {t === 'blur' ? 'Blur' : 'Solid'}
                </button>
              ))}
            </div>
            {backdropType === 'solid' && (
              <label
                className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-[var(--ic-line)] hover:border-[var(--ic-ink-4)]"
                title={`Pick backdrop color (${backdropColor})`}
                style={{ background: backdropColor }}
              >
                <input
                  type="color"
                  value={backdropColor}
                  onChange={(e) => onBackdropColorChange(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Backdrop color"
                />
              </label>
            )}
          </div>
          {backdropType === 'blur' && (
            <RailSlider
              label="Blur"
              value={blurPx}
              valueLabel={blurPx <= 12 ? 'soft' : blurPx <= 28 ? 'medium' : 'strong'}
              min={4}
              max={48}
              onChange={onBlurPxChange}
            />
          )}
          <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
            <StatLine label="Output" value={`${active.width}×${active.height}`} />
            <SelectionStat
              isTrimmed={isTrimmed}
              selectedMs={selectedMs}
              durationMs={durationMs}
              onReset={onResetTrim}
            />
          </div>
        </>
      ) : (
        <>
          <RailHeader>Crop region</RailHeader>
          <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
            <StatLine label="Output" value={`${output.width}×${output.height}`} />
            <StatLine label="Source crop" value={`${box.w}×${box.h}`} />
            <StatLine label="Offset" value={`${box.x},${box.y}`} />
            <SelectionStat
              isTrimmed={isTrimmed}
              selectedMs={selectedMs}
              durationMs={durationMs}
              onReset={onResetTrim}
            />
          </div>
          {isOffset && (
            <button
              type="button"
              onClick={onResetOffset}
              className="self-start font-mono-geist text-[10px] uppercase tracking-[var(--ic-tracking-hint)] text-[var(--ic-ink-4)] hover:text-[var(--ic-ink-2)]"
            >
              recenter crop
            </button>
          )}
          <p className="px-1 text-[11px] leading-relaxed text-[var(--ic-ink-4)]">
            Drag inside the frame to reposition · drag the timeline edges to trim. Audio kept as-is.
          </p>
        </>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <RailExportButton onClick={onExport} disabled={busy || engine.kind === 'loading'}>
          {cropping
            ? 'Encoding…'
            : engine.kind === 'loading'
              ? 'Loading engine…'
              : isFit
                ? 'Export fit'
                : 'Export crop'}
        </RailExportButton>
        <RailFooterNote>100% in your browser</RailFooterNote>
      </div>
    </>
  )
}


/**
 * Left-rail panel for the Compress tool. Shows Original/Target/Output/Saved
 * stats — read-only context about what compression will produce. Lives next
 * to Source on the left so the right rail is just the input + Export.
 *
 * Also surfaces the trim selection so users discover that they can drag the
 * timeline edges to compress only a portion (single ffmpeg pass under the hood).
 */
function CompressResultPanel({
  targetBytes,
  sourceBytes,
  outputBytes,
  compressing,
  durationMs,
  trimIn,
  trimOut,
  onResetTrim,
}: {
  targetBytes: number | null
  sourceBytes: number
  outputBytes: number | null
  compressing: boolean
  durationMs: number
  trimIn: number
  trimOut: number
  onResetTrim: () => void
}) {
  const savedPct =
    outputBytes != null ? Math.max(0, Math.round((1 - outputBytes / sourceBytes) * 100)) : null
  const isTrimmed = trimIn > 0 || trimOut < durationMs - 1
  const selectedMs = Math.max(0, trimOut - trimIn)
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--ic-line)] pt-3">
      <RailHeader>Result</RailHeader>
      <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
        <StatLine label="Original" value={formatBytes(sourceBytes)} />
        <StatLine
          label="Target"
          value={targetBytes != null ? formatBytes(targetBytes) : '—'}
        />
        <StatLine
          label="Output"
          value={
            outputBytes != null
              ? formatBytes(outputBytes)
              : compressing
                ? 'encoding…'
                : '—'
          }
        />
        <SelectionStat
          isTrimmed={isTrimmed}
          selectedMs={selectedMs}
          durationMs={durationMs}
          onReset={onResetTrim}
        />
        {savedPct != null && (
          <div className="mt-1 flex items-baseline justify-between border-t border-[var(--ic-line)] pt-2">
            <span className="text-[12px] text-[var(--ic-ink-3)]">Saved</span>
            <span className="font-mono-geist text-[14px] font-semibold text-[var(--ic-accent)]">
              {savedPct}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function CompressRail({
  target,
  onTargetChange,
  targetBytes,
  engine,
  compressing,
  busy,
  onExport,
}: {
  target: string
  onTargetChange: (v: string) => void
  targetBytes: number | null
  engine: ReturnType<typeof useEngineStatus>
  /** True only when THIS rail is currently encoding — drives the export label. */
  compressing: boolean
  /** True when ANY encode is running — drives the disabled state. */
  busy: boolean
  onExport: () => void
}) {
  return (
    <>
      <RailHeader>Target size</RailHeader>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={target}
          onChange={(e) => onTargetChange(e.target.value)}
          // Disable while encoding — the value is captured at call time, but
          // a stale-looking input mid-encode is confusing.
          disabled={compressing}
          placeholder="10 MB"
          aria-label="Target size"
          className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-1.5 text-[13px] text-[var(--ic-ink)] placeholder:text-[var(--ic-ink-4)] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-[11px] text-[var(--ic-ink-4)]">
          Examples: 10 MB · 500 kB · 1024 kB
        </p>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-[var(--ic-ink-4)]">
        Targets your size while keeping picture quality reasonable. Drag the timeline edges to compress only a slice. Audio kept where possible.
      </p>

      <div className="mt-auto flex flex-col gap-2">
        <RailExportButton
          onClick={onExport}
          disabled={busy || engine.kind === 'loading' || !targetBytes}
        >
          {compressing
            ? 'Compressing…'
            : engine.kind === 'loading'
              ? 'Loading engine…'
              : 'Compress '}
        </RailExportButton>
        <RailFooterNote>100% in your browser</RailFooterNote>
      </div>
    </>
  )
}

function AudioRail({
  engine,
  working,
  busy,
  onExtract,
  onMute,
  onReplace,
}: {
  engine: ReturnType<typeof useEngineStatus>
  /** True only when THIS rail is currently encoding. */
  working: boolean
  /** True when ANY encode is running. */
  busy: boolean
  onExtract: () => void
  onMute: () => void
  onReplace: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const disabled = busy || engine.kind === 'loading'
  // `working` reserved for showing in-progress state on individual buttons later
  // — kept on the prop so future polish can flip a spinner on the active one.
  void working
  return (
    <>
      <RailHeader>Audio track</RailHeader>
      <p className="px-1 text-[11px] leading-relaxed text-[var(--ic-ink-4)]">
        Extract, mute, or replace the source audio. Output is MP4 (H.264 video, AAC audio).
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onExtract}
          disabled={disabled}
          className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-1.5 text-left text-[13px] font-medium text-[var(--ic-ink-2)] transition hover:bg-[var(--ic-bg-3)] hover:text-[var(--ic-ink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Extract audio 
        </button>
        <button
          type="button"
          onClick={onMute}
          disabled={disabled}
          className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-1.5 text-left text-[13px] font-medium text-[var(--ic-ink-2)] transition hover:bg-[var(--ic-bg-3)] hover:text-[var(--ic-ink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Remove audio (mute) 
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <RailHeader>Replace audio</RailHeader>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              onReplace(f)
              e.target.value = ''
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="rounded-md border border-dashed border-[var(--ic-line)] bg-transparent px-2.5 py-2.5 text-[12px] font-medium text-[var(--ic-ink-3)] transition hover:bg-[var(--ic-bg-3)] hover:text-[var(--ic-ink)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pick an audio file
        </button>
      </div>

      <div className="mt-auto">
        <RailFooterNote>
          {engine.kind === 'loading' ? 'Loading engine…' : '100% in your browser'}
        </RailFooterNote>
      </div>
    </>
  )
}

