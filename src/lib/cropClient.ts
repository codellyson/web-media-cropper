import CropWorker from './cropWorker?worker'
import type { WorkerCropRequest, WorkerCropResponse } from './cropWorker'
import type { CropBox, OutputFormat, OutputSize } from './crop'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new CropWorker()
  worker.onmessage = (e: MessageEvent<WorkerCropResponse>) => {
    const entry = pending.get(e.data.id)
    if (!entry) return
    pending.delete(e.data.id)
    if (e.data.ok) entry.resolve(e.data.blob)
    else entry.reject(new Error(e.data.error))
  }
  worker.onerror = (e) => {
    const error = new Error(e.message || 'Crop worker crashed')
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export type FillMode = 'crop' | 'fit'
export type BackdropType = 'blur' | 'solid'

export function cropInWorker(
  blob: Blob,
  box: CropBox,
  output: OutputSize,
  options: {
    format: OutputFormat
    quality: number
    fillMode?: FillMode
    blurPx?: number
    backdropType?: BackdropType
    backdropColor?: string
  },
): Promise<Blob> {
  const id = nextId++
  const req: WorkerCropRequest = {
    id,
    blob,
    box,
    output,
    format: options.format,
    quality: options.quality,
    fillMode: options.fillMode,
    blurPx: options.blurPx,
    backdropType: options.backdropType,
    backdropColor: options.backdropColor,
  }
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage(req)
  })
}
