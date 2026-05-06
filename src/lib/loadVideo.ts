export type LoadedVideo = {
  name: string
  mime: string
  sizeBytes: number
  durationMs: number
  width: number
  height: number
  sourceBlob: Blob
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv|avi)$/i

export function looksLikeVideo(blob: Blob, name: string): boolean {
  return blob.type.startsWith('video/') || VIDEO_EXT.test(name)
}

export async function loadVideoFromBlob(blob: Blob, name = 'video'): Promise<LoadedVideo> {
  const url = URL.createObjectURL(blob)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Failed to read video metadata'))
    })
    return {
      name,
      mime: blob.type || 'video/mp4',
      sizeBytes: blob.size,
      durationMs: Math.round(video.duration * 1000),
      width: video.videoWidth,
      height: video.videoHeight,
      sourceBlob: blob,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function loadVideoFromFile(file: File): Promise<LoadedVideo> {
  return loadVideoFromBlob(file, file.name)
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Decode just enough of a video to grab the first frame as a bitmap and read
 * dimensions + duration. Used by batch focal detection and by thumbnail
 * generation for the file list.
 */
export async function extractVideoFirstFrame(file: File): Promise<{
  bitmap: ImageBitmap
  width: number
  height: number
  durationMs: number
}> {
  const url = URL.createObjectURL(file)
  try {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.src = url
    await new Promise<void>((resolve, reject) => {
      v.onloadeddata = () => resolve()
      v.onerror = () => reject(new Error('Could not decode video'))
      setTimeout(() => reject(new Error('Video load timeout')), 8000)
    })
    if (v.duration > 0) v.currentTime = Math.min(0.1, v.duration / 2)
    await new Promise<void>((resolve) => {
      if (v.readyState >= 2 && v.currentTime > 0) return resolve()
      v.onseeked = () => resolve()
      setTimeout(() => resolve(), 1500)
    })
    const bitmap = await createImageBitmap(v)
    return {
      bitmap,
      width: v.videoWidth,
      height: v.videoHeight,
      durationMs: Math.round(v.duration * 1000),
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
