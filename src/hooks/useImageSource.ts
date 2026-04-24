import { useCallback, useEffect, useRef, useState } from 'react'
import { loadImageFromBlob, loadImageFromFile, type LoadedImage } from '@/lib/loadImage'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; image: LoadedImage }
  | { status: 'error'; message: string }

export function useImageSource() {
  const [state, setState] = useState<State>({ status: 'idle' })
  const lastImageRef = useRef<LoadedImage | null>(null)

  useEffect(() => {
    return () => {
      lastImageRef.current?.bitmap.close?.()
    }
  }, [])

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && !/\.(heic|heif|avif|webp|png|jpe?g|gif)$/i.test(file.name)) {
      setState({ status: 'error', message: `Unsupported file: ${file.type || file.name}` })
      return
    }
    setState({ status: 'loading' })
    try {
      const image = await loadImageFromFile(file)
      lastImageRef.current?.bitmap.close?.()
      lastImageRef.current = image
      setState({ status: 'ready', image })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to load image',
      })
    }
  }, [])

  const loadBlob = useCallback(async (blob: Blob, name = 'pasted-image') => {
    setState({ status: 'loading' })
    try {
      const image = await loadImageFromBlob(blob, name)
      lastImageRef.current?.bitmap.close?.()
      lastImageRef.current = image
      setState({ status: 'ready', image })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to load image',
      })
    }
  }, [])

  const reset = useCallback(() => {
    lastImageRef.current?.bitmap.close?.()
    lastImageRef.current = null
    setState({ status: 'idle' })
  }, [])

  return { state, loadFile, loadBlob, reset }
}
