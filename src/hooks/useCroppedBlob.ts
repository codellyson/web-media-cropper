import { useEffect, useState } from 'react'
import { cropImage, type CropBox, type OutputFormat, type OutputSize } from '@/lib/crop'

type Args = {
  bitmap: ImageBitmap | null
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
  bitmap,
  box,
  output,
  format,
  quality,
  debounceMs = 250,
}: Args): Result {
  const [state, setState] = useState<Result>({ blob: null, loading: false, error: null })

  useEffect(() => {
    if (!bitmap || !box || !output) {
      setState({ blob: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const timer = setTimeout(async () => {
      try {
        const blob = await cropImage(bitmap, box, output, { format, quality })
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
  }, [bitmap, box?.x, box?.y, box?.width, box?.height, output?.width, output?.height, format, quality, debounceMs])

  return state
}
