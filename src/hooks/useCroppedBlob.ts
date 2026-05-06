import { useEffect, useState } from 'react'
import { cropInWorker } from '@/lib/cropClient'
import type { CropBox, OutputFormat, OutputSize } from '@/lib/crop'

type Args = {
  sourceBlob: Blob | null
  scale?: number
  box: CropBox | null
  output: OutputSize | null
  format: OutputFormat
  quality: number
  debounceMs?: number
}

type Result = {
  blob: Blob | null
  loading: boolean
  error: string | null
}

export function useCroppedBlob({
  sourceBlob,
  scale = 1,
  box,
  output,
  format,
  quality,
  debounceMs = 250,
}: Args): Result {
  const [state, setState] = useState<Result>({ blob: null, loading: false, error: null })

  useEffect(() => {
    if (!sourceBlob || !box || !output) {
      setState({ blob: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const timer = setTimeout(async () => {
      try {
        const fullResBox: CropBox =
          scale < 1
            ? {
                x: box.x / scale,
                y: box.y / scale,
                width: box.width / scale,
                height: box.height / scale,
              }
            : box
        const blob = await cropInWorker(sourceBlob, fullResBox, output, { format, quality })
        if (!cancelled) setState({ blob, loading: false, error: null })
      } catch (err) {
        if (!cancelled) {
          setState({
            blob: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Crop failed',
          })
        }
      }
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    sourceBlob,
    scale,
    box?.x,
    box?.y,
    box?.width,
    box?.height,
    output?.width,
    output?.height,
    format,
    quality,
    debounceMs,
  ])

  return state
}
