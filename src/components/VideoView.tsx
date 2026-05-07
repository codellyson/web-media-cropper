import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { EditorShell } from '@/components/editor/EditorShell'
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
  const [mode, setMode] = useState<'frame' | 'trim' | 'crop' | 'compress' | 'gif' | 'audio'>('frame')
  const [gifIn, setGifIn] = useState(0)
  const [gifOut, setGifOut] = useState(Math.min(5000, video.durationMs))
  const [gifFps, setGifFps] = useState(15)
  const [gifWidth, setGifWidth] = useState(480)
  const [gifWorking, setGifWorking] = useState(false)
  const [audioWorking, setAudioWorking] = useState(false)
  const [trimIn, setTrimIn] = useState(0)
  const [trimOut, setTrimOut] = useState(video.durationMs)
  const [trimming, setTrimming] = useState(false)
  const [trimAccurate, setTrimAccurate] = useState(false)
  const [cropPresetId, setCropPresetId] = useState<string>(VIDEO_PRESETS[0].id)
  const [cropOffset, setCropOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const [cropping, setCropping] = useState(false)
  const [compressTarget, setCompressTarget] = useState('10 MB')
  const [compressing, setCompressing] = useState(false)
  const [compressed, setCompressed] = useState<Blob | null>(null)
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null)
  const captureIdRef = useRef(1)
  const engine = useEngineStatus()
  const [keyframes, setKeyframes] = useState<number[]>([])

  useEffect(() => {
    setTrimIn(0)
    setTrimOut(video.durationMs)
    setKeyframes([])
  }, [video.durationMs])

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
      { id: captureIdRef.current++, timeMs: Math.round(v.currentTime * 1000), thumb, exporting: false },
    ])
  }, [video.width, video.height])

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
      const sec = (cap.timeMs / 1000).toFixed(2).replace('.', '_')
      const name = swapExtension(video.name, 'png').replace('.png', `-frame-${sec}s.png`)
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
    if (trimming) return
    if (trimOut <= trimIn) return
    setTrimming(true)
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
      const inSec = (trimIn / 1000).toFixed(2).replace('.', '_')
      const outSec = (trimOut / 1000).toFixed(2).replace('.', '_')
      downloadBlob(blob, `${base}-trim-${inSec}s-${outSec}s.${ext}`)
    } catch (err) {
      console.error('[exportTrim]', err)
    } finally {
      setTrimming(false)
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
    if (gifWorking) return
    if (gifOut <= gifIn) return
    setGifWorking(true)
    setProgress({ label: 'Rendering GIF…', pct: 0 })
    try {
      const blob = await gifFromVideo(video.sourceBlob, video.name, gifIn, gifOut, {
        fps: gifFps,
        width: gifWidth,
        onProgress: (pct) => setProgress({ label: 'Rendering GIF…', pct }),
      })
      const base = video.name.replace(/\.[^.]+$/, '')
      downloadBlob(blob, `${base}-${(gifIn / 1000).toFixed(1)}s-${(gifOut / 1000).toFixed(1)}s.gif`)
    } catch (err) {
      console.error('[exportGif]', err)
    } finally {
      setGifWorking(false)
      setProgress(null)
    }
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
    } else if (t === 'video-gif') {
      setMode('gif')
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
    setProgress({ label: 'Cropping…', pct: 0 })
    try {
      const aspect = cropPreset.width / cropPreset.height
      const baseBox = centeredCropBox(video.width, video.height, aspect)
      const maxDx = (video.width - baseBox.w) / 2
      const maxDy = (video.height - baseBox.h) / 2
      const dx = Math.max(-maxDx, Math.min(maxDx, cropOffset.dx))
      const dy = Math.max(-maxDy, Math.min(maxDy, cropOffset.dy))
      const box = { x: Math.round(baseBox.x + dx), y: Math.round(baseBox.y + dy), w: baseBox.w, h: baseBox.h }
      const output = outputForCrop(cropPreset, box.w, box.h)
      const out = await cropEncodeVideo(
        video.sourceBlob,
        video.name,
        box,
        { width: output.width, height: output.height },
        { onProgress: (pct) => setProgress({ label: 'Cropping…', pct }) },
      )
      const base = video.name.replace(/\.[^.]+$/, '')
      downloadBlob(out, `${base}-${cropPreset.id}-${output.width}x${output.height}.mp4`)
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
      const out = await compressVideoToTargetSize(
        video.sourceBlob,
        video.name,
        video.durationMs,
        targetBytes,
        {
          onProgress: ({ pct, pass, maxPasses }) =>
            setProgress({ label: `Compressing · pass ${pass}/${maxPasses}`, pct }),
        },
      )
      setCompressed(out)
      const base = video.name.replace(/\.[^.]+$/, '')
      downloadBlob(out, `${base}-compressed.mp4`)
    } catch (err) {
      console.error('[exportCompress]', err)
    } finally {
      setCompressing(false)
      setProgress(null)
    }
  }

  // Mobile bottom-bar primary action — varies by tool. Audio mode has multiple
  // actions (extract / mute / replace) so we leave it empty there; the user
  // opens the Settings sheet to pick.
  const mobileActionClass =
    'inline-flex h-10 items-center gap-2 rounded-full bg-[var(--ic-ink)] px-4 text-[13px] font-medium text-[var(--ic-bg)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40'
  let mobileAction: React.ReactNode = null
  if (mode === 'trim') {
    const span = trimOut - trimIn
    const disabled =
      trimming ||
      engine.kind === 'loading' ||
      span < 100 ||
      span >= video.durationMs
    mobileAction = (
      <button type="button" onClick={exportTrim} disabled={disabled} className={mobileActionClass}>
        {trimming ? 'Trimming…' : 'Export trim'}
      </button>
    )
  } else if (mode === 'crop') {
    const disabled = cropping || engine.kind === 'loading'
    mobileAction = (
      <button type="button" onClick={exportCrop} disabled={disabled} className={mobileActionClass}>
        {cropping ? 'Encoding…' : 'Export crop'}
      </button>
    )
  } else if (mode === 'compress') {
    const disabled = compressing || engine.kind === 'loading' || !targetBytes
    mobileAction = (
      <button type="button" onClick={exportCompress} disabled={disabled} className={mobileActionClass}>
        {compressing ? 'Compressing…' : 'Compress'}
      </button>
    )
  } else if (mode === 'gif') {
    const span = gifOut - gifIn
    const disabled =
      gifWorking ||
      engine.kind === 'loading' ||
      span < 100 ||
      span >= video.durationMs
    mobileAction = (
      <button type="button" onClick={exportGif} disabled={disabled} className={mobileActionClass}>
        {gifWorking ? 'Rendering…' : 'Export GIF'}
      </button>
    )
  } else if (mode === 'frame') {
    const disabled = captures.length === 0 || engine.kind === 'loading'
    mobileAction = (
      <button type="button" onClick={exportAll} disabled={disabled} className={mobileActionClass}>
        Export {captures.length > 0 ? captures.length : ''} {captures.length === 1 ? 'frame' : 'frames'}
      </button>
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
              : mode === 'gif'
                ? 'video-gif'
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
        <div className="flex flex-col gap-3">
          <RailHeader>Source</RailHeader>
          <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--ic-line)] bg-[var(--ic-card)] p-2.5">
            <Stat label="Dimensions" value={`${video.width}×${video.height}`} />
            <Stat label="Duration" value={formatDuration(video.durationMs)} />
            <Stat label="Size" value={formatBytes(video.sizeBytes)} />
            <Stat label="Container" value={video.mime.replace(/^video\//, '') || 'unknown'} />
          </div>
          <p className="px-1 font-mono-geist text-[10.5px] leading-relaxed text-[var(--ic-ink-4)]">
            {mode === 'frame'
              ? '← /  step ±1 frame · space play/pause · C capture'
              : mode === 'trim'
                ? 'Drag the in / out handles. Cuts may snap to the nearest keyframe.'
                : mode === 'crop'
                  ? 'Pick a platform. Crop is centered and applied to every frame at export.'
                  : 'Set a target file size. Output is a universal MP4.'}
          </p>
        </div>
      }
      rightRail={
        mode === 'frame' ? (
          <FrameGalleryRail
            captures={captures}
            engine={engine}
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
            onSetIn={() => setTrimIn(currentMs)}
            onSetOut={() => setTrimOut(Math.max(currentMs, trimIn + 100))}
            onReset={() => {
              setTrimIn(0)
              setTrimOut(video.durationMs)
            }}
            engine={engine}
            trimming={trimming}
            accurate={trimAccurate}
            onAccurateChange={setTrimAccurate}
            onExport={exportTrim}
          />
        ) : mode === 'crop' ? (
          <CropRail
            presetId={cropPresetId}
            onPickPreset={(id) => {
              setCropPresetId(id)
              setCropOffset({ dx: 0, dy: 0 })
            }}
            offset={cropOffset}
            onResetOffset={() => setCropOffset({ dx: 0, dy: 0 })}
            sourceWidth={video.width}
            sourceHeight={video.height}
            engine={engine}
            cropping={cropping}
            onExport={exportCrop}
          />
        ) : mode === 'gif' ? (
          <GifRail
            durationMs={video.durationMs}
            inMs={gifIn}
            outMs={gifOut}
            onTrimChange={({ inMs, outMs }) => {
              setGifIn(inMs)
              setGifOut(outMs)
            }}
            fps={gifFps}
            onFpsChange={setGifFps}
            width={gifWidth}
            onWidthChange={setGifWidth}
            engine={engine}
            working={gifWorking}
            onExport={exportGif}
          />
        ) : mode === 'audio' ? (
          <AudioRail
            engine={engine}
            working={audioWorking}
            onExtract={exportAudio}
            onMute={exportMuted}
            onReplace={exportReplacedAudio}
          />
        ) : (
          <CompressRail
            target={compressTarget}
            onTargetChange={setCompressTarget}
            targetBytes={targetBytes}
            sourceBytes={video.sizeBytes}
            outputBytes={compressed?.size ?? null}
            engine={engine}
            compressing={compressing}
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
        keyframeTimes={mode === 'trim' && !trimAccurate ? keyframes : []}
        onSeek={seek}
        onPlayToggle={togglePlay}
        onStep={step}
        primaryAction={
          mode === 'frame' ? (
            <button
              type="button"
              onClick={capture}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--ic-accent)] bg-[var(--ic-accent-tint)] px-2.5 py-1 font-mono-geist text-[11px] font-semibold uppercase tracking-wider text-[var(--ic-accent)] hover:brightness-110"
            >
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--ic-accent)' }} />
              Capture frame
            </button>
          ) : null
        }
        trim={
          mode === 'trim'
            ? {
                inMs: trimIn,
                outMs: trimOut,
                onTrimChange: ({ inMs, outMs }) => {
                  setTrimIn(inMs)
                  setTrimOut(outMs)
                },
              }
            : mode === 'gif'
              ? {
                  inMs: gifIn,
                  outMs: gifOut,
                  onTrimChange: ({ inMs, outMs }) => {
                    setGifIn(inMs)
                    setGifOut(outMs)
                  },
                }
              : undefined
        }
        cropAspect={mode === 'crop' ? cropPreset.width / cropPreset.height : undefined}
        cropLabel={mode === 'crop' ? `${cropPreset.short ?? cropPreset.name} · ${cropPreset.width}×${cropPreset.height}` : undefined}
        cropOffset={mode === 'crop' ? cropOffset : undefined}
        onCropOffsetChange={mode === 'crop' ? setCropOffset : undefined}
        encodeProgress={progress}
      />
    </EditorShell>
  )
}

function TrimRail({
  durationMs,
  inMs,
  outMs,
  onSetIn,
  onSetOut,
  onReset,
  engine,
  trimming,
  accurate,
  onAccurateChange,
  onExport,
}: {
  durationMs: number
  inMs: number
  outMs: number
  onSetIn: () => void
  onSetOut: () => void
  onReset: () => void
  engine: ReturnType<typeof useEngineStatus>
  trimming: boolean
  accurate: boolean
  onAccurateChange: (v: boolean) => void
  onExport: () => void
}) {
  return (
    <>
      <RailHeader>Trim selection</RailHeader>
      <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
        <Stat label="In" value={formatTimeMs(inMs)} />
        <Stat label="Out" value={formatTimeMs(outMs)} />
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
          className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2 py-1.5 font-mono-geist text-[11px] uppercase tracking-wider text-[var(--ic-ink-2)] hover:bg-[var(--ic-bg-3)]"
        >
          Set IN [{`{`}
        </button>
        <button
          type="button"
          onClick={onSetOut}
          className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2 py-1.5 font-mono-geist text-[11px] uppercase tracking-wider text-[var(--ic-ink-2)] hover:bg-[var(--ic-bg-3)]"
        >
          Set OUT {`}`}]
        </button>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="self-start font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)] hover:text-[var(--ic-ink-2)]"
      >
        reset to full clip
      </button>

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

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={trimming || engine.kind === 'loading' || outMs <= inMs || outMs - inMs < 100 || (outMs - inMs) >= durationMs}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--ic-ink)] px-4 text-[13px] font-medium text-[var(--ic-bg)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {trimming
            ? 'Trimming…'
            : engine.kind === 'loading'
              ? 'Loading engine…'
              : accurate
                ? 'Export trim (accurate) '
                : 'Export trim '}
        </button>
        <p className="text-center font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
          {accurate ? 'Frame-accurate · in your browser' : 'Lossless · in your browser'}
        </p>
      </div>
    </>
  )
}

function FrameGalleryRail({
  captures,
  engine,
  onExport,
  onExportAll,
  onRemove,
  onClear,
  onJump,
}: {
  captures: Capture[]
  engine: ReturnType<typeof useEngineStatus>
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
            className="font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)] hover:text-[var(--ic-ink-2)]"
          >
            clear
          </button>
        )}
      </div>

      {captures.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--ic-line)] p-4 text-center">
          <span className="font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
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
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-0.5">
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
                  className="self-start font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-accent)] hover:brightness-110 disabled:opacity-50"
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
        <button
          type="button"
          onClick={onExportAll}
          disabled={captures.length === 0 || anyExporting || engine.kind === 'loading'}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--ic-ink)] px-4 text-[13px] font-medium text-[var(--ic-bg)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {engine.kind === 'loading'
            ? 'Loading engine…'
            : anyExporting
              ? 'Exporting…'
              : `Export all ${captures.length || ''}`.trim()}{' '}
          
        </button>
        <p className="text-center font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
          Native resolution · in your browser
        </p>
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
  encodeProgress,
}: CanvasProps) {
  const aspect = video.width / video.height
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
          <video
            ref={videoRef}
            src={objectUrl}
            playsInline
            className="block h-full w-full rounded-md bg-black"
          />
          {cropAspect != null && (
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
        <p className="text-center font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
          100% in your browser
        </p>
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

function RailHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-0.5 py-1 font-mono-geist text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ic-ink-4)]">
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-[var(--ic-ink-3)]">{label}</span>
      <span className="font-mono-geist text-[12px] font-semibold text-[var(--ic-ink)]">{value}</span>
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
            className="absolute -top-7 left-0 whitespace-nowrap rounded-sm bg-[var(--ic-accent)] px-2 py-0.5 font-mono-geist text-[10px] font-semibold uppercase tracking-wider text-white"
          >
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

function CropRail({
  presetId,
  onPickPreset,
  offset,
  onResetOffset,
  sourceWidth,
  sourceHeight,
  engine,
  cropping,
  onExport,
}: {
  presetId: string
  onPickPreset: (id: string) => void
  offset: { dx: number; dy: number }
  onResetOffset: () => void
  sourceWidth: number
  sourceHeight: number
  engine: ReturnType<typeof useEngineStatus>
  cropping: boolean
  onExport: () => void
}) {
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

  // Group by aspect category so the user picks "vertical/square/wide" before
  // platform — same pattern as the studio's FormatRail.
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
    <>
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

      <RailHeader>Crop region</RailHeader>
      <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
        <Stat label="Output" value={`${output.width}×${output.height}`} />
        <Stat label="Source crop" value={`${box.w}×${box.h}`} />
        <Stat label="Offset" value={`${box.x},${box.y}`} />
      </div>

      {isOffset && (
        <button
          type="button"
          onClick={onResetOffset}
          className="self-start font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)] hover:text-[var(--ic-ink-2)]"
        >
          recenter crop
        </button>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-[var(--ic-ink-4)]">
        Drag inside the frame to reposition. Audio kept as-is.
      </p>

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={cropping || engine.kind === "loading"}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--ic-ink)] px-4 text-[13px] font-medium text-[var(--ic-bg)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cropping ? "Encoding…" : engine.kind === "loading" ? "Loading engine…" : "Export crop "}
        </button>
        <p className="text-center font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
          100% in your browser
        </p>
      </div>
    </>
  )
}


function CompressRail({
  target,
  onTargetChange,
  targetBytes,
  sourceBytes,
  outputBytes,
  engine,
  compressing,
  onExport,
}: {
  target: string
  onTargetChange: (v: string) => void
  targetBytes: number | null
  sourceBytes: number
  outputBytes: number | null
  engine: ReturnType<typeof useEngineStatus>
  compressing: boolean
  onExport: () => void
}) {
  const savedPct =
    outputBytes != null ? Math.max(0, Math.round((1 - outputBytes / sourceBytes) * 100)) : null
  return (
    <>
      <RailHeader>Target size</RailHeader>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={target}
          onChange={(e) => onTargetChange(e.target.value)}
          placeholder="10 MB"
          aria-label="Target size"
          className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-1.5 text-[13px] text-[var(--ic-ink)] placeholder:text-[var(--ic-ink-4)]"
        />
        <p className="text-[11px] text-[var(--ic-ink-4)]">
          Examples: 10 MB · 500 kB · 1024 kB
        </p>
      </div>

      <RailHeader>Result</RailHeader>
      <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
        <Stat label="Original" value={formatBytes(sourceBytes)} />
        <Stat
          label="Target"
          value={targetBytes != null ? formatBytes(targetBytes) : "—"}
        />
        <Stat
          label="Output"
          value={
            outputBytes != null
              ? formatBytes(outputBytes)
              : compressing
                ? "encoding…"
                : "—"
          }
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

      <p className="px-1 text-[11px] leading-relaxed text-[var(--ic-ink-4)]">
        Targets your size while keeping the picture quality reasonable. Audio kept where possible.
      </p>

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={compressing || engine.kind === "loading" || !targetBytes}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--ic-ink)] px-4 text-[13px] font-medium text-[var(--ic-bg)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {compressing
            ? "Compressing…"
            : engine.kind === "loading"
              ? "Loading engine…"
              : "Compress "}
        </button>
        <p className="text-center font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
          100% in your browser
        </p>
      </div>
    </>
  )
}

function GifRail({
  durationMs,
  inMs,
  outMs,
  fps,
  onFpsChange,
  width,
  onWidthChange,
  engine,
  working,
  onExport,
}: {
  durationMs: number
  inMs: number
  outMs: number
  onTrimChange: (next: { inMs: number; outMs: number }) => void
  fps: number
  onFpsChange: (v: number) => void
  width: number
  onWidthChange: (v: number) => void
  engine: ReturnType<typeof useEngineStatus>
  working: boolean
  onExport: () => void
}) {
  const FPS_OPTIONS = [10, 15, 24]
  const WIDTH_OPTIONS = [240, 360, 480, 640]
  const span = outMs - inMs
  const tooLong = span > 15000
  return (
    <>
      <RailHeader>GIF settings</RailHeader>
      <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
        <Stat label="In" value={formatTimeMs(inMs)} />
        <Stat label="Out" value={formatTimeMs(outMs)} />
        <div className="mt-1 flex items-baseline justify-between border-t border-[var(--ic-line)] pt-2">
          <span className="text-[12px] text-[var(--ic-ink-3)]">Duration</span>
          <span className="font-mono-geist text-[14px] font-semibold text-[var(--ic-accent)]">
            {formatTimeMs(span)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <RailHeader>Frame rate</RailHeader>
        <div
          role="radiogroup"
          aria-label="Frame rate"
          className="inline-flex w-full items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[11px] uppercase tracking-[0.12em]"
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
      </div>

      <div className="flex flex-col gap-1.5">
        <RailHeader>Width</RailHeader>
        <div
          role="radiogroup"
          aria-label="Width"
          className="inline-flex w-full items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[10.5px] uppercase tracking-[0.12em]"
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
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-[var(--ic-ink-4)]">
        {tooLong
          ? 'Tip: GIFs over 15s get huge. Trim tighter for sane file sizes.'
          : 'Two-pass palette generation for clean colors.'}
      </p>

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={working || engine.kind === 'loading' || outMs <= inMs || outMs - inMs < 100 || outMs - inMs >= durationMs}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--ic-ink)] px-4 text-[13px] font-medium text-[var(--ic-bg)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {working ? 'Rendering…' : engine.kind === 'loading' ? 'Loading engine…' : 'Export GIF '}
        </button>
        <p className="text-center font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
          100% in your browser
        </p>
      </div>
    </>
  )
}

function AudioRail({
  engine,
  working,
  onExtract,
  onMute,
  onReplace,
}: {
  engine: ReturnType<typeof useEngineStatus>
  working: boolean
  onExtract: () => void
  onMute: () => void
  onReplace: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const disabled = working || engine.kind === 'loading'
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
        <p className="text-center font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
          {engine.kind === 'loading' ? 'Loading engine…' : '100% in your browser'}
        </p>
      </div>
    </>
  )
}

