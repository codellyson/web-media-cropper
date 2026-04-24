import { useMemo, useState } from 'react'
import { Dropzone } from '@/components/Dropzone'
import { CropPreview } from '@/components/CropPreview'
import { PresetPicker } from '@/components/PresetPicker'
import { CustomSizeInput } from '@/components/CustomSizeInput'
import { ExportBar } from '@/components/ExportBar'
import { Button } from '@/components/ui/button'
import { useImageSource } from '@/hooks/useImageSource'
import { centerCropBox, cropImage, type OutputFormat } from '@/lib/crop'
import { downloadBlob, swapExtension } from '@/lib/download'
import { PRESETS, type Preset } from '@/lib/presets'

const DEFAULT_PRESET = PRESETS.find((p) => p.id === 'yt-thumbnail')!

export default function App() {
  const { state, loadFile, loadBlob, reset } = useImageSource()
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET.id)
  const [custom, setCustom] = useState<{ width: number; height: number } | null>(null)
  const [format, setFormat] = useState<OutputFormat>('png')
  const [quality, setQuality] = useState(0.92)
  const [downloading, setDownloading] = useState(false)

  const target = useMemo(() => {
    if (custom) return custom
    const preset = PRESETS.find((p) => p.id === presetId)
    if (preset) return { width: preset.width, height: preset.height }
    return null
  }, [custom, presetId])

  const cropBox = useMemo(() => {
    if (state.status !== 'ready' || !target) return null
    return centerCropBox(state.image.width, state.image.height, target.width / target.height)
  }, [state, target])

  const chooseFormat = (next: OutputFormat) => setFormat(next)

  const handlePreset = (preset: Preset) => {
    setPresetId(preset.id)
    setCustom(null)
  }

  const handleCustom = (width: number, height: number) => {
    setCustom({ width, height })
    setPresetId(null)
  }

  const handleDownload = async () => {
    if (state.status !== 'ready' || !cropBox || !target) return
    setDownloading(true)
    try {
      const blob = await cropImage(state.image.bitmap, cropBox, target, { format, quality })
      const ext = format === 'jpeg' ? 'jpg' : format
      const suffix = `-${target.width}x${target.height}`
      const base = swapExtension(state.image.name, ext).replace(`.${ext}`, `${suffix}.${ext}`)
      downloadBlob(blob, base)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <h1 className="text-sm font-medium tracking-tight">web-media-cropper</h1>
          <span className="text-xs text-muted-foreground">
            100% in your browser — no upload
          </span>
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
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Clear
                </Button>
              </div>

              <div className="flex min-h-[300px] items-center justify-center rounded-lg border bg-muted/20 p-4">
                {cropBox && (
                  <CropPreview
                    bitmap={state.image.bitmap}
                    box={cropBox}
                    maxWidth={720}
                    maxHeight={440}
                  />
                )}
              </div>

              <ExportBar
                format={format}
                onFormatChange={chooseFormat}
                quality={quality}
                onQualityChange={setQuality}
                output={target}
                onDownload={handleDownload}
                downloading={downloading}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
