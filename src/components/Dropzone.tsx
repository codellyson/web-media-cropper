import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type DropzoneProps = {
  onFile: (file: File) => void
  onBlob: (blob: Blob, name?: string) => void
  className?: string
}

export function Dropzone({ onFile, onBlob, className }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      onFile(files[0])
    },
    [onFile],
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) {
            onBlob(blob, blob.name || 'pasted-image')
            e.preventDefault()
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onBlob])

  return (
    <label
      htmlFor="dropzone-input"
      onDragOver={(e) => {
        e.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsOver(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={cn(
        'group flex min-h-[60vh] cursor-pointer items-center justify-center rounded-lg border border-dashed transition-colors',
        isOver ? 'border-primary bg-accent/40' : 'hover:bg-accent/20',
        className,
      )}
    >
      <div className="text-center">
        <p className="text-lg font-medium">Drop an image</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {'Drag & drop, paste, or click to choose. Everything stays in your browser.'}
        </p>
      </div>
      <input
        ref={inputRef}
        id="dropzone-input"
        type="file"
        accept="image/*,video/*,.heic,.heif,.mp4,.mov,.webm,.mkv"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </label>
  )
}
