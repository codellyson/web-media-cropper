import { useCallback, useEffect, useRef, useState } from 'react'
import { loadImageFromBlob, loadImageFromFile, type LoadedImage } from '@/lib/loadImage'
import { loadVideoFromBlob, loadVideoFromFile, looksLikeVideo, type LoadedVideo } from '@/lib/loadVideo'

async function bitmapToPreviewBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode preview'))),
      'image/webp',
      0.9,
    )
  })
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; image: LoadedImage; objectUrl: string }
  | { status: 'video'; video: LoadedVideo; objectUrl: string }
  | { status: 'error'; message: string }

type Refs =
  | { kind: 'image'; image: LoadedImage; objectUrl: string }
  | { kind: 'video'; video: LoadedVideo; objectUrl: string }

const IMAGE_EXT = /\.(heic|heif|avif|webp|png|jpe?g|gif|bmp|tiff?)$/i

export function useImageSource() {
  const [state, setState] = useState<State>({ status: 'idle' })
  const lastRef = useRef<Refs | null>(null)

  const cleanup = useCallback(() => {
    if (lastRef.current) {
      if (lastRef.current.kind === 'image') {
        lastRef.current.image.bitmap.close?.()
      }
      URL.revokeObjectURL(lastRef.current.objectUrl)
      lastRef.current = null
    }
  }, [])

  useEffect(() => cleanup, [cleanup])

  const receive = useCallback(
    async (blob: Blob, name: string) => {
      const isVideo = looksLikeVideo(blob, name)
      const isImage =
        blob.type.startsWith('image/') || IMAGE_EXT.test(name)

      if (!isVideo && !isImage) {
        setState({ status: 'error', message: `Unsupported file: ${blob.type || name}` })
        return
      }

      setState({ status: 'loading' })
      try {
        if (isVideo) {
          const video =
            blob instanceof File ? await loadVideoFromFile(blob) : await loadVideoFromBlob(blob, name)
          const objectUrl = URL.createObjectURL(blob)
          cleanup()
          lastRef.current = { kind: 'video', video, objectUrl }
          setState({ status: 'video', video, objectUrl })
          return
        }
        const image =
          blob instanceof File ? await loadImageFromFile(blob) : await loadImageFromBlob(blob, name)
        const previewBlob =
          image.scale < 1 ? await bitmapToPreviewBlob(image.bitmap) : image.sourceBlob
        const objectUrl = URL.createObjectURL(previewBlob)
        cleanup()
        lastRef.current = { kind: 'image', image, objectUrl }
        setState({ status: 'ready', image, objectUrl })
      } catch (err) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load file',
        })
      }
    },
    [cleanup],
  )

  const loadFile = useCallback((file: File) => receive(file, file.name), [receive])
  const loadBlob = useCallback(
    (blob: Blob, name = 'pasted-media') => receive(blob, name),
    [receive],
  )
  const reset = useCallback(() => {
    cleanup()
    setState({ status: 'idle' })
  }, [cleanup])

  return { state, loadFile, loadBlob, reset }
}
