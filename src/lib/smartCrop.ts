import type { FaceDetector } from '@mediapipe/tasks-vision'

export type FocalPoint = { x: number; y: number } // normalized 0..1 in source image space

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

let detectorPromise: Promise<FaceDetector> | null = null

function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const mp = await import('@mediapipe/tasks-vision')
      const vision = await mp.FilesetResolver.forVisionTasks(WASM_BASE)
      return mp.FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL },
        runningMode: 'IMAGE',
      })
    })().catch((err) => {
      detectorPromise = null
      throw err
    })
  }
  return detectorPromise
}

type Rect = { x: number; y: number; w: number; h: number }

async function detectFaces(bitmap: ImageBitmap): Promise<Rect[]> {
  try {
    const MAX = 1024
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    ctx.drawImage(bitmap, 0, 0, w, h)
    const detector = await getDetector()
    const result = detector.detect(canvas)
    return result.detections
      .map((d) => {
        const bb = d.boundingBox
        if (!bb) return null
        return {
          x: bb.originX / scale,
          y: bb.originY / scale,
          w: bb.width / scale,
          h: bb.height / scale,
        }
      })
      .filter((r): r is Rect => r !== null)
  } catch (err) {
    console.warn('[smartCrop] face detection failed, falling back', err)
    return []
  }
}

function varianceFocalPoint(bitmap: ImageBitmap): FocalPoint {
  const S = 64
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')
  if (!ctx) return { x: 0.5, y: 0.5 }
  ctx.drawImage(bitmap, 0, 0, S, S)
  const data = ctx.getImageData(0, 0, S, S).data

  const lum = new Float32Array(S * S)
  for (let i = 0; i < S * S; i++) {
    const o = i * 4
    lum[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
  }

  const CELLS = 8
  const CELL = S / CELLS
  let bestVar = -1
  let bestX = 0.5
  let bestY = 0.5
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      let sum = 0
      let sum2 = 0
      let n = 0
      for (let y = cy * CELL; y < (cy + 1) * CELL; y++) {
        for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
          const v = lum[y * S + x]
          sum += v
          sum2 += v * v
          n++
        }
      }
      const mean = sum / n
      const variance = sum2 / n - mean * mean
      if (variance > bestVar) {
        bestVar = variance
        bestX = (cx + 0.5) / CELLS
        bestY = (cy + 0.5) / CELLS
      }
    }
  }
  return { x: bestX, y: bestY }
}

export async function computeFocalPoint(bitmap: ImageBitmap): Promise<FocalPoint> {
  const faces = await detectFaces(bitmap)
  if (faces.length > 0) {
    const minX = Math.min(...faces.map((f) => f.x))
    const minY = Math.min(...faces.map((f) => f.y))
    const maxX = Math.max(...faces.map((f) => f.x + f.w))
    const maxY = Math.max(...faces.map((f) => f.y + f.h))
    return {
      x: ((minX + maxX) / 2) / bitmap.width,
      y: ((minY + maxY) / 2) / bitmap.height,
    }
  }
  return varianceFocalPoint(bitmap)
}

export function cropBoxFromFocalPoint(
  sourceW: number,
  sourceH: number,
  aspect: number,
  focal: FocalPoint,
): { x: number; y: number; width: number; height: number } {
  const sourceAspect = sourceW / sourceH
  let width: number
  let height: number
  if (sourceAspect > aspect) {
    height = sourceH
    width = height * aspect
  } else {
    width = sourceW
    height = width / aspect
  }
  let x = focal.x * sourceW - width / 2
  let y = focal.y * sourceH - height / 2
  x = Math.max(0, Math.min(sourceW - width, x))
  y = Math.max(0, Math.min(sourceH - height, y))
  return { x, y, width, height }
}
