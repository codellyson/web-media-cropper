import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Head } from 'vite-react-ssg'
import { NavBar } from '@/components/NavBar'
import { CropStage } from '@/components/CropStage'
import { CustomSizeInput } from '@/components/CustomSizeInput'
import { EditorShell, RailHeader, type EditorTool } from '@/components/editor/EditorShell'
import { RailRight } from '@/components/editor/RailRight'
import { CompressView } from '@/components/CompressView'
import { VideoView } from '@/components/VideoView'
import { BatchView } from '@/components/BatchView'
import { FormatRail } from '@/components/editor/FormatRail'
import { MobileAspectStrip, type MobileAspectEntry } from '@/components/editor/MobileAspectStrip'
import { PreviewCanvas } from '@/components/editor/PreviewCanvas'
import { LandingHero } from '@/components/LandingHero'
import { HowItWorks } from '@/components/HowItWorks'
import { FormatMarquee } from '@/components/FormatMarquee'
import { StudioEmpty } from '@/components/StudioEmpty'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import { useImageSource } from '@/hooks/useImageSource'
import { type CropBox, type OutputFormat } from '@/lib/crop'
import { downloadBlob, swapExtension } from '@/lib/download'
import { extractExif, insertExifIntoJpeg, looksLikeJpeg } from '@/lib/exif'
import { PRESETS, type Preset } from '@/lib/presets'
import { computeFocalDetection, type FocalDetection, type FocalPoint } from '@/lib/smartCrop'
import { TrackerOverlay } from '@/components/editor/TrackerOverlay'
import { useCroppedBlob } from '@/hooks/useCroppedBlob'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { track } from '@/lib/analytics'

const DEFAULT_PRESET = PRESETS.find((p) => p.id === 'yt-thumbnail')!

const MOBILE_ASPECT_ENTRIES: MobileAspectEntry[] = [
  { id: 'ig-story', platform: 'Instagram', display: 'IG Reel', ratio: '9:16' },
  { id: 'tt-video', platform: 'TikTok', display: 'TikTok', ratio: '9:16' },
  { id: 'yt-shorts', platform: 'YouTube', display: 'YT Shorts', ratio: '9:16' },
  { id: 'ig-portrait', platform: 'Instagram', display: 'IG Portrait', ratio: '4:5' },
  { id: 'ig-square', platform: 'Instagram', display: 'IG Square', ratio: '1:1' },
  { id: 'yt-thumbnail', platform: 'YouTube', display: 'YT Thumb', ratio: '16:9' },
  { id: 'x-post', platform: 'X', display: 'X Post', ratio: '16:9' },
  { id: 'li-post', platform: 'LinkedIn', display: 'LinkedIn', ratio: '1.91:1' },
  { id: 'og', platform: 'Web', display: 'OG', ratio: '1.91:1' },
]

function readInitialPreset(): string {
  if (typeof window === 'undefined') return DEFAULT_PRESET.id
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('preset')
  if (fromUrl && PRESETS.some((p) => p.id === fromUrl)) return fromUrl
  return DEFAULT_PRESET.id
}

export default function App() {
  const { state, loadFile, loadBlob, reset } = useImageSource()
  const [tool, setToolInternal] = useState<EditorTool>('crop')
  const navigate = useNavigate()
  const location = useLocation()
  const path = location.pathname
  const batchMode = path === '/batch'

  const setTool = (next: EditorTool) => {
    setToolInternal(next)
    if (state.status === 'ready') {
      if (next === 'compress' && path !== '/studio/compress') navigate('/studio/compress')
      else if (next === 'crop' && path !== '/studio') navigate('/studio')
    }
  }

  useEffect(() => {
    if (batchMode) return
    if (state.status === 'video' && path !== '/studio/video') {
      navigate('/studio/video', { replace: true })
    } else if (state.status === 'ready') {
      if (tool === 'compress' && path !== '/studio/compress')
        navigate('/studio/compress', { replace: true })
      else if (tool !== 'compress' && !path.startsWith('/studio'))
        navigate('/studio', { replace: true })
    } else if (
      (state.status === 'idle' || state.status === 'error') &&
      (path === '/studio/compress' || path === '/studio/video')
    ) {
      // Sub-route fall-through: no file means we drop back to bare /studio empty state.
      navigate('/studio', { replace: true })
    }
  }, [state.status, batchMode, path, tool, navigate])
  const [presetId, setPresetId] = useState<string | null>(() => readInitialPreset())
  const [custom, setCustom] = useState<{ width: number; height: number } | null>(null)
  const [format, setFormat] = useState<OutputFormat>('png')
  const [quality, setQuality] = useState(0.92)
  const [preserveExif, setPreserveExif] = useState(false)
  const [sourceExif, setSourceExif] = useState<unknown | null>(null)
  const [detection, setDetection] = useState<FocalDetection | null>(null)
  const [trackerLayerOn, setTrackerLayerOn] = useState(true)
  const [cropBox, setCropBox] = useState<CropBox | null>(null)
  const [resetSeq, setResetSeq] = useState(0)
  const [userMoved, setUserMoved] = useState(false)
  const [subjectLock, setSubjectLock] = useState(78)
  const [padding, setPadding] = useState(12)
  const [holdOnFaces, setHoldOnFaces] = useState(true)

  const focalPoint = useMemo<FocalPoint | null>(() => {
    if (!detection) return null
    const lock = subjectLock / 100
    const x = 0.5 + (detection.point.x - 0.5) * lock
    let y = 0.5 + (detection.point.y - 0.5) * lock
    y = Math.max(0, Math.min(1, y - (padding / 100) * 0.3))
    return { x, y }
  }, [detection, subjectLock, padding])
  const loadedRef = useRef(false)

  const target = useMemo(() => {
    if (custom) return custom
    const preset = PRESETS.find((p) => p.id === presetId)
    if (preset) return { width: preset.width, height: preset.height }
    return null
  }, [custom, presetId])

  const aspect = target ? target.width / target.height : 16 / 9

  useEffect(() => {
    if (state.status !== 'ready') {
      setCropBox(null)
      setDetection(null)
      setSourceExif(null)
      loadedRef.current = false
      return
    }
    if (!loadedRef.current) {
      loadedRef.current = true
      track('image_loaded', { mime: state.image.mime })
    }
    let cancelled = false
    setDetection(null)
    setUserMoved(false)
    if (looksLikeJpeg(state.image.sourceBlob, state.image.name)) {
      extractExif(state.image.sourceBlob).then((exif) => {
        if (!cancelled) setSourceExif(exif)
      })
    } else {
      setSourceExif(null)
    }
    computeFocalDetection(state.image.bitmap)
      .then((det) => {
        if (!cancelled) setDetection(det)
      })
      .catch(() => {
        if (!cancelled) {
          setDetection({ point: { x: 0.5, y: 0.5 }, source: 'variance', confidence: 0.5 })
        }
      })
    return () => {
      cancelled = true
    }
  }, [state])

  const handlePreset = (preset: Preset) => {
    setPresetId(preset.id)
    setCustom(null)
    track('preset_selected', { id: preset.id })
  }

  const handleCustom = (width: number, height: number) => {
    setCustom({ width, height })
    setPresetId(null)
    track('custom_dims', { width, height })
  }

  const croppedBlob = useCroppedBlob({
    sourceBlob: state.status === 'ready' ? state.image.sourceBlob : null,
    scale: state.status === 'ready' ? state.image.scale : 1,
    box: cropBox,
    output: target,
    format,
    quality,
  })

  const handleDownload = async () => {
    if (!croppedBlob.blob || !target || state.status !== 'ready') return
    const ext = format === 'jpeg' ? 'jpg' : format
    const base = swapExtension(state.image.name, ext).replace(
      `.${ext}`,
      `-${target.width}x${target.height}.${ext}`,
    )
    let out = croppedBlob.blob
    if (format === 'jpeg' && preserveExif && sourceExif) {
      out = await insertExifIntoJpeg(out, sourceExif)
    }
    downloadBlob(out, base)
    track('download', { format, w: target.width, h: target.height, exif: preserveExif && !!sourceExif })
  }

  const handlePresetByIndex = (index: number) => {
    const preset = PRESETS[index]
    if (preset) handlePreset(preset)
  }

  const handleUndoFocal = () => {
    if (!userMoved) return
    setUserMoved(false)
    setResetSeq((n) => n + 1)
  }

  const handleCropBoxChange = (box: CropBox) => {
    if (cropBox) setUserMoved(true)
    setCropBox(box)
  }

  useKeyboardShortcuts({
    onDownload: state.status === 'ready' ? handleDownload : undefined,
    onClear: state.status === 'ready' ? reset : undefined,
    onPresetByIndex: state.status === 'ready' ? handlePresetByIndex : undefined,
    onUndoFocal: state.status === 'ready' ? handleUndoFocal : undefined,
  })

  if (batchMode) {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--ic-bg)] text-[var(--ic-ink)]">
        <Head>
          <title>Batch crop · WMC</title>
          <meta
            name="description"
            content="Drop multiple files, pick presets, download a zip with every (file × preset) crop. Subject-aware, in your browser."
          />
          <meta name="robots" content="noindex" />
        </Head>
        <NavBar />
        <main className="flex flex-1 flex-col">
          <BatchView />
        </main>
        <footer className="border-t border-[var(--ic-line)]">
          <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-5">
            <span className="text-[13px] text-[var(--ic-ink-3)]">
              Runs entirely in your browser. No upload, no tracking.
            </span>
            <span className="font-mono-geist text-[11px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
              WMC · 2026
            </span>
          </div>
        </footer>
      </div>
    )
  }

  if (state.status === 'video') {
    return (
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Head>
          <title>Video editor · WMC</title>
          <meta name="description" content="Trim, crop, compress, GIF, and audio extract — for video, in your browser." />
          <meta name="robots" content="noindex" />
        </Head>
        <NavBar />

        <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col px-8 py-8">
          <VideoView video={state.video} objectUrl={state.objectUrl} onClear={reset} />
        </main>

        <footer className="border-t border-[var(--ic-line)]">
          <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-5">
            <span className="text-[13px] text-[var(--ic-ink-3)]">
              Runs entirely in your browser. No upload, no tracking.
            </span>
            <span className="font-mono-geist text-[11px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
              WMC · 2026
            </span>
          </div>
        </footer>
      </div>
    )
  }

  if (state.status !== 'ready') {
    if (path.startsWith('/studio')) {
      return (
        <StudioEmpty
          onFile={loadFile}
          onBlob={loadBlob}
          loading={state.status === 'loading'}
          error={state.status === 'error' ? state.message : null}
        />
      )
    }
    return (
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Head>
          <title>WMC — Smart Multi-Format Video & Image Resizer with Subject-Aware Cropping. Free Online Tool</title>
          <meta name="description" content="Drop a clip or image — WMC reframes it for TikTok, Reels, Shorts, Feed, YouTube and X with subject-aware cropping. In your browser, no upload." />
          <link rel="canonical" href="https://cropper.kreativekorna.com/" />
          <meta property="og:type" content="website" />
          <meta property="og:url" content="https://cropper.kreativekorna.com/" />
          <meta property="og:title" content="WMC — Smart Multi-Format Video & Image Resizer with Subject-Aware Cropping" />
          <meta property="og:description" content="Drop a clip or image — WMC reframes it for TikTok, Reels, Shorts, Feed, YouTube and X. In your browser, no upload." />
          <meta property="og:image" content="https://cropper.kreativekorna.com/og.png" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="WMC — Smart Multi-Format Video & Image Resizer" />
          <meta name="twitter:description" content="Drop a clip or image — WMC reframes it for every platform. In your browser, no upload." />
          <meta name="twitter:image" content="https://cropper.kreativekorna.com/og.png" />
        </Head>
        <NavBar />
        <LandingHero onFile={loadFile} onBlob={loadBlob} />
        {state.status === 'loading' && (
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full border bg-background px-4 py-2 shadow-lg"
          >
            <p className="text-sm text-muted-foreground">Decoding…</p>
          </div>
        )}
        {state.status === 'error' && (
          <p className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full border bg-background px-4 py-2 text-sm text-destructive shadow-lg">
            {state.message}
          </p>
        )}
        <div className="mx-auto w-full max-w-[1100px] px-6">
          <HowItWorks />
        </div>
        <FormatMarquee />
        <footer className="border-t border-[var(--ic-line)]">
          <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-5">
            <span className="text-[13px] text-[var(--ic-ink-3)]">
              Runs entirely in your browser. No upload, no tracking.
            </span>
            <span className="font-mono-geist text-[11px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
              WMC · 2026
            </span>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <NavBar />

      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col px-8 py-8">
        {tool === 'compress' ? (
          <CompressView
            image={state.image}
            objectUrl={state.objectUrl}
            onClear={reset}
            onSwitchTool={() => setTool('crop')}
          />
        ) : (
        <EditorShell
          fileName={state.image.name}
          activeTool="crop"
          onToolChange={setTool}
          fileMeta={
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear
            </Button>
          }
          rightRail={
            <RailRight
              subjectLock={subjectLock}
              onSubjectLockChange={setSubjectLock}
              padding={padding}
              onPaddingChange={setPadding}
              holdOnFaces={holdOnFaces}
              onHoldOnFacesChange={setHoldOnFaces}
              format={format}
              onFormatChange={setFormat}
              quality={quality}
              onQualityChange={setQuality}
              output={target}
              sizeBytes={croppedBlob.blob?.size ?? null}
              estimating={croppedBlob.loading}
              canDownload={!!croppedBlob.blob}
              onDownload={handleDownload}
              preserveExif={preserveExif}
              onPreserveExifChange={setPreserveExif}
              exifSupported={!!sourceExif}
            />
          }
          leftRail={
            <>
              <FormatRail value={presetId} onSelect={handlePreset} />
              <div className="border-t border-[var(--ic-line)] pt-4">
                <CustomSizeInput onApply={handleCustom} />
              </div>
              <div className="flex flex-col gap-1.5 border-t border-[var(--ic-line)] pt-3">
                <RailHeader>Layers</RailHeader>
                <LayerToggle
                  label="Subject tracker"
                  thumbStyle={{ background: 'var(--ic-accent)' }}
                  on={trackerLayerOn}
                  onClick={() => setTrackerLayerOn((v) => !v)}
                />
              </div>
            </>
          }
          mobileAction={
            <button
              type="button"
              onClick={handleDownload}
              disabled={!croppedBlob.blob}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--ic-ink)] px-4 text-[13px] font-medium text-[var(--ic-bg)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download
              {target && (
                <span className="font-mono-geist text-[10.5px] uppercase tracking-wider opacity-60">
                  {target.width}×{target.height}
                </span>
              )}
            </button>
          }
          mobileAspects={
            <MobileAspectStrip
              entries={MOBILE_ASPECT_ENTRIES}
              value={presetId}
              onSelect={(id) => {
                const p = PRESETS.find((pp) => pp.id === id)
                if (p) handlePreset(p)
              }}
            />
          }
        >
          <PreviewCanvas
            aspect={aspect}
            ratioLabel={target ? `${target.width}:${target.height} · ${state.image.name.replace(/\.[^.]+$/, '')}` : ''}
            dimsLabel={
              target
                ? `${target.width}×${target.height}`
                : `${state.image.width}×${state.image.height}`
            }
          >
            {focalPoint ? (
              <>
                <CropStage
                  imageUrl={state.objectUrl}
                  sourceWidth={state.image.width}
                  sourceHeight={state.image.height}
                  aspect={aspect}
                  focalPoint={focalPoint}
                  resetSeq={resetSeq}
                  onChange={handleCropBoxChange}
                />
                {detection && (
                  <TrackerOverlay
                    detection={detection}
                    sourceWidth={state.image.width}
                    sourceHeight={state.image.height}
                    aspect={aspect}
                    visible={trackerLayerOn && !userMoved}
                  />
                )}
              </>
            ) : (
              <div
                role="status"
                aria-live="polite"
                className="flex h-full items-center justify-center bg-black/40"
              >
                <p className="text-sm text-white/80">Analyzing subject…</p>
              </div>
            )}
          </PreviewCanvas>
        </EditorShell>
        )}
      </main>

      <footer className="border-t border-[var(--ic-line)]">
        <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-5">
          <span className="text-[13px] text-[var(--ic-ink-3)]">
            Runs entirely in your browser. No upload, no tracking.
          </span>
          <span className="font-mono-geist text-[11px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
            WMC · 2026
          </span>
        </div>
      </footer>
    </div>
  )
}

function LayerToggle({
  label,
  thumbStyle,
  on,
  disabled,
  hint,
  onClick,
}: {
  label: string
  thumbStyle?: React.CSSProperties
  on?: boolean
  disabled?: boolean
  hint?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!!on}
      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] transition ${
        disabled
          ? 'cursor-not-allowed text-[var(--ic-ink-4)]'
          : 'text-[var(--ic-ink-2)] hover:bg-[var(--ic-card)] hover:text-[var(--ic-ink)]'
      }`}
    >
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="block h-3.5 w-[22px] rounded-sm border border-[var(--ic-line)]"
          style={thumbStyle}
        />
        {label}
        {hint && (
          <span className="font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
            {hint}
          </span>
        )}
      </span>
      <span
        className="grid h-[18px] w-[18px] place-items-center text-[var(--ic-ink-3)] transition"
        style={{ opacity: on ? 1 : 0.45 }}
      >
        {on ? <Eye size={14} /> : <EyeOff size={14} />}
      </span>
    </button>
  )
}
