import { useMemo, useState } from 'react'
import { Dropzone } from '@/components/Dropzone'
import { CropPreview } from '@/components/CropPreview'
import { Button } from '@/components/ui/button'
import { useImageSource } from '@/hooks/useImageSource'
import { centerCropBox, cropImage } from '@/lib/crop'
import { downloadBlob, swapExtension } from '@/lib/download'

const PHASE_1_ASPECT = 16 / 9

export default function App() {
  const { state, loadFile, loadBlob, reset } = useImageSource()
  const [downloading, setDownloading] = useState(false)

  const cropBox = useMemo(() => {
    if (state.status !== 'ready') return null
    return centerCropBox(state.image.width, state.image.height, PHASE_1_ASPECT)
  }, [state])

  const handleDownload = async () => {
    if (state.status !== 'ready' || !cropBox) return
    setDownloading(true)
    try {
      const blob = await cropImage(state.image.bitmap, cropBox, {
        width: cropBox.width,
        height: cropBox.height,
      })
      downloadBlob(blob, swapExtension(state.image.name, 'png'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <h1 className="text-sm font-medium tracking-tight">web-media-cropper</h1>
          <span className="text-xs text-muted-foreground">
            100% in your browser — no upload
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        {state.status === 'idle' || state.status === 'error' ? (
          <>
            <Dropzone onFile={loadFile} onBlob={loadBlob} />
            {state.status === 'error' && (
              <p className="mt-3 text-sm text-destructive">{state.message}</p>
            )}
          </>
        ) : state.status === 'loading' ? (
          <div className="flex min-h-[60vh] items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">Decoding image…</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-sm font-medium">{state.image.name}</p>
                <p className="text-xs text-muted-foreground">
                  {state.image.width} × {state.image.height} · cropped to 16:9 (Phase 1)
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                Clear
              </Button>
            </div>

            {cropBox && (
              <div className="flex justify-center">
                <CropPreview bitmap={state.image.bitmap} box={cropBox} />
              </div>
            )}

            <div className="flex justify-center">
              <Button onClick={handleDownload} disabled={downloading}>
                {downloading ? 'Preparing…' : 'Download PNG'}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
