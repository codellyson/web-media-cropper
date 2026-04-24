import { useCallback, useEffect, useRef, useState } from 'react'
import { loadImageFromBlob, loadImageFromFile, type LoadedImage } from '@/lib/loadImage'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; image: LoadedImage; objectUrl: string }
  | { status: 'error'; message: string }

type Refs = {
  image: LoadedImage
  objectUrl: string
}

export function useImageSource() {
  const [state, setState] = useState<State>({ status: 'idle' })
  const lastRef = useRef<Refs | null>(null)

  const cleanup = useCallback(() => {
    if (lastRef.current) {
      lastRef.current.image.bitmap.close?.()
      URL.revokeObjectURL(lastRef.current.objectUrl)
      lastRef.current = null
    }
  }, [])

  useEffect(() => cleanup, [cleanup])

  const receive = useCallback(
    async (blob: Blob, name: string) => {
      if (!blob.type.startsWith('image/') && !/\.(heic|heif|avif|webp|png|jpe?g|gif)$/i.test(name)) {
        setState({ status: 'error', message: `Unsupported file: ${blob.type || name}` })
        return
      }
      setState({ status: 'loading' })
      try {
        const image =
          blob instanceof File ? await loadImageFromFile(blob) : await loadImageFromBlob(blob, name)
        const objectUrl = URL.createObjectURL(blob)
        cleanup()
        lastRef.current = { image, objectUrl }
        setState({ status: 'ready', image, objectUrl })
      } catch (err) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load image',
        })
      }
    },
    [cleanup],
  )

  const loadFile = useCallback((file: File) => receive(file, file.name), [receive])
  const loadBlob = useCallback(
    (blob: Blob, name = 'pasted-image') => receive(blob, name),
    [receive],
  )
  const reset = useCallback(() => {
    cleanup()
    setState({ status: 'idle' })
  }, [cleanup])

  return { state, loadFile, loadBlob, reset }
}
