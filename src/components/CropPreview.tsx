import { useEffect, useRef } from 'react'
import type { CropBox } from '@/lib/crop'

type CropPreviewProps = {
  bitmap: ImageBitmap
  box: CropBox
  maxWidth?: number
  maxHeight?: number
}

export function CropPreview({ bitmap, box, maxWidth = 720, maxHeight = 480 }: CropPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const aspect = box.width / box.height
    let width = Math.min(box.width, maxWidth)
    let height = width / aspect
    if (height > maxHeight) {
      height = maxHeight
      width = height * aspect
    }
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(
      bitmap,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      canvas.width,
      canvas.height,
    )
  }, [bitmap, box.x, box.y, box.width, box.height, maxWidth, maxHeight])

  return <canvas ref={canvasRef} className="block rounded-md border shadow-sm" />
}
