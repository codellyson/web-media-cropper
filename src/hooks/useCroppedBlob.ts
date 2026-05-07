import { useEffect, useState } from 'react'
import { cropInWorker, type BackdropType, type FillMode } from '@/lib/cropClient'
import type { CropBox, OutputFormat, OutputSize } from '@/lib/crop'

type Args = {
  sourceBlob: Blob | null
  scale?: number
  box: CropBox | null
  output: OutputSize | null
  format: OutputFormat
  quality: number
  fillMode?: FillMode
  /** CSS blur radius for fit-mode bleed, in pixels. Ignored when fillMode === 'crop'. */
  blurPx?: number
  /** Backdrop kind for fit mode. Default: 'blur'. */
  backdropType?: BackdropType
  /** Hex color (#RRGGBB) used when backdropType === 'solid'. */
  backdropColor?: string
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
  fillMode = 'crop',
  blurPx,
  backdropType,
  backdropColor,
  debounceMs = 250,
}: Args): Result {
  const [state, setState] = useState<Result>({ blob: null, loading: false, error: null })

  useEffect(() => {
    // Crop mode needs a box; fit mode renders the whole source so a box is optional.
    if (!sourceBlob || !output || (fillMode === 'crop' && !box)) {
      setState({ blob: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const timer = setTimeout(async () => {
      try {
        const safeBox: CropBox = box ?? { x: 0, y: 0, width: 1, height: 1 }
        const fullResBox: CropBox =
          scale < 1
            ? {
                x: safeBox.x / scale,
                y: safeBox.y / scale,
                width: safeBox.width / scale,
                height: safeBox.height / scale,
              }
            : safeBox
        const blob = await cropInWorker(sourceBlob, fullResBox, output, {
          format,
          quality,
          fillMode,
          blurPx,
          backdropType,
          backdropColor,
        })
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
    fillMode,
    blurPx,
    backdropType,
    backdropColor,
    debounceMs,
  ])

  return state
}
