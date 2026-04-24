import { useEffect, useMemo, useState } from 'react'
import { Dropzone } from '@/components/Dropzone'
import { CropStage } from '@/components/CropStage'
import { PresetPicker } from '@/components/PresetPicker'
import { CustomSizeInput } from '@/components/CustomSizeInput'
import { ExportBar } from '@/components/ExportBar'
import { Button } from '@/components/ui/button'
import { useImageSource } from '@/hooks/useImageSource'
import { type CropBox, type OutputFormat } from '@/lib/crop'
import { downloadBlob, swapExtension } from '@/lib/download'
import { PRESETS, type Preset } from '@/lib/presets'
import { computeFocalPoint, type FocalPoint } from '@/lib/smartCrop'
import { useCroppedBlob } from '@/hooks/useCroppedBlob'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { ThemeToggle } from '@/components/ThemeToggle'

const DEFAULT_PRESET = PRESETS.find((p) => p.id === 'yt-thumbnail')!

export default function App() {
  const { state, loadFile, loadBlob, reset } = useImageSource()
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET.id)
  const [custom, setCustom] = useState<{ width: number; height: number } | null>(null)
  const [format, setFormat] = useState<OutputFormat>('png')
  const [quality, setQuality] = useState(0.92)
  const [focalPoint, setFocalPoint] = useState<FocalPoint | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [cropBox, setCropBox] = useState<CropBox | null>(null)

  const target = useMemo(() => {
    if (custom) return custom
    const preset = PRESETS.find((p) => p.id === presetId)
    if (preset) return { width: preset.width, height: preset.height }
    return null
  }, [custom, presetId])

  const aspect = target ? target.width / target.height : 16 / 9

  useEffect(() => {
    if (state.status !== 'ready') {
      setFocalPoint(null)
      setCropBox(null)
      return
    }
    let cancelled = false
    setAnalyzing(true)
    setFocalPoint(null)
    computeFocalPoint(state.image.bitmap)
      .then((fp) => {
        if (!cancelled) setFocalPoint(fp)
      })
      .catch(() => {
        if (!cancelled) setFocalPoint({ x: 0.5, y: 0.5 })
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false)
      })
    return () => {
      cancelled = true
    }
  }, [state])

  const handlePreset = (preset: Preset) => {
    setPresetId(preset.id)
    setCustom(null)
  }

  const handleCustom = (width: number, height: number) => {
    setCustom({ width, height })
    setPresetId(null)
  }

  const croppedBlob = useCroppedBlob({
    bitmap: state.status === 'ready' ? state.image.bitmap : null,
    box: cropBox,
    output: target,
    format,
    quality,
  })

  const handleDownload = () => {
    if (!croppedBlob.blob || !target || state.status !== 'ready') return
    const ext = format === 'jpeg' ? 'jpg' : format
    const base = swapExtension(state.image.name, ext).replace(
      `.${ext}`,
      `-${target.width}x${target.height}.${ext}`,
    )
    downloadBlob(croppedBlob.blob, base)
  }

  useKeyboardShortcuts({
    onDownload: state.status === 'ready' ? handleDownload : undefined,
    onClear: state.status === 'ready' ? reset : undefined,
  })

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <h1 className="text-sm font-medium tracking-tight">web-media-cropper</h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              100% in your browser — no upload
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {state.status !== 'ready' ? (
          <>
            {state.status === 'loading' ? (
              <div className="flex min-h-[60vh] items-center justify-center rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">Decoding image…</p>
              </div>
            ) : (
              <Dropzone onFile={loadFile} onBlob={loadBlob} />
            )}
            {state.status === 'error' && (
              <p className="mt-3 text-sm text-destructive">{state.message}</p>
            )}
          </>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="space-y-6">
              <PresetPicker value={presetId} onSelect={handlePreset} />
              <CustomSizeInput onApply={handleCustom} />
            </aside>

            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{state.image.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {state.image.width} × {state.image.height}
                    {analyzing && <span> · analyzing…</span>}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Clear
                </Button>
              </div>

              <div className="relative h-[440px] overflow-hidden rounded-lg border bg-muted/20">
                {focalPoint ? (
                  <CropStage
                    imageUrl={state.objectUrl}
                    sourceWidth={state.image.width}
                    sourceHeight={state.image.height}
                    aspect={aspect}
                    focalPoint={focalPoint}
                    onChange={setCropBox}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">Analyzing subject…</p>
                  </div>
                )}
              </div>

              <ExportBar
                format={format}
                onFormatChange={setFormat}
                quality={quality}
                onQualityChange={setQuality}
                output={target}
                sizeBytes={croppedBlob.blob?.size ?? null}
                estimating={croppedBlob.loading}
                onDownload={handleDownload}
                canDownload={!!croppedBlob.blob}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
