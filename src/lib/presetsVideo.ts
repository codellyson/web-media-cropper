export type VideoPreset = {
  id: string
  platform: string
  name: string
  width: number
  height: number
  short?: string
}

export const VIDEO_PRESETS: VideoPreset[] = [
  { id: 'tt-reel', platform: 'TikTok', name: 'Video / Reel', width: 1080, height: 1920, short: 'TikTok / Reels' },
  { id: 'yt-short', platform: 'YouTube', name: 'Shorts', width: 1080, height: 1920, short: 'YT Shorts' },
  { id: 'ig-reel', platform: 'Instagram', name: 'Reel', width: 1080, height: 1920, short: 'IG Reel' },
  { id: 'ig-square', platform: 'Instagram', name: 'Feed square', width: 1080, height: 1080, short: 'IG Feed' },
  { id: 'ig-portrait', platform: 'Instagram', name: 'Feed portrait', width: 1080, height: 1350, short: 'IG Portrait' },
  { id: 'yt-1080p', platform: 'YouTube', name: '1080p', width: 1920, height: 1080, short: 'YouTube' },
  { id: 'x-post', platform: 'X', name: 'Post video', width: 1920, height: 1080, short: 'X / Twitter' },
  { id: 'li-feed', platform: 'LinkedIn', name: 'Feed', width: 1920, height: 1080, short: 'LinkedIn' },
]

export function ratioLabel(p: VideoPreset): string {
  const r = p.width / p.height
  if (Math.abs(r - 9 / 16) < 0.01) return '9:16'
  if (Math.abs(r - 4 / 5) < 0.01) return '4:5'
  if (Math.abs(r - 1) < 0.01) return '1:1'
  if (Math.abs(r - 16 / 9) < 0.01) return '16:9'
  return `${Math.round(r * 100) / 100}:1`
}

export function centeredCropBox(
  sourceW: number,
  sourceH: number,
  targetAspect: number,
): { x: number; y: number; w: number; h: number } {
  const sourceAspect = sourceW / sourceH
  let w: number, h: number
  if (sourceAspect > targetAspect) {
    h = sourceH
    w = Math.round(h * targetAspect)
  } else {
    w = sourceW
    h = Math.round(w / targetAspect)
  }
  const x = Math.round((sourceW - w) / 2)
  const y = Math.round((sourceH - h) / 2)
  return { x, y, w, h }
}

/**
 * Clamp preset output dimensions to the source crop so we never upscale.
 * Returns dims at the preset's aspect, no larger than the source crop.
 */
export function outputForCrop(
  preset: VideoPreset,
  cropW: number,
  cropH: number,
): { width: number; height: number; upscaled: boolean } {
  const scale = Math.min(1, cropW / preset.width, cropH / preset.height)
  return {
    width: Math.round(preset.width * scale),
    height: Math.round(preset.height * scale),
    upscaled: scale < 1,
  }
}
