export type Preset = {
  id: string
  platform: string
  name: string
  width: number
  height: number
  note?: string
}

export const PRESETS: Preset[] = [
  // YouTube — the pain point that started the project
  { id: 'yt-thumbnail', platform: 'YouTube', name: 'Thumbnail', width: 1280, height: 720, note: '16:9' },
  { id: 'yt-shorts', platform: 'YouTube', name: 'Shorts', width: 1080, height: 1920, note: '9:16' },
  { id: 'yt-banner', platform: 'YouTube', name: 'Channel banner', width: 2560, height: 1440, note: '16:9, safe area center' },

  // X / Twitter
  { id: 'x-post', platform: 'X', name: 'Post image', width: 1600, height: 900, note: '16:9' },
  { id: 'x-header', platform: 'X', name: 'Header', width: 1500, height: 500, note: '3:1' },
  { id: 'x-card', platform: 'X', name: 'Summary card', width: 1200, height: 628, note: 'twitter:card summary_large_image' },

  // Instagram
  { id: 'ig-square', platform: 'Instagram', name: 'Feed square', width: 1080, height: 1080, note: '1:1' },
  { id: 'ig-portrait', platform: 'Instagram', name: 'Feed portrait', width: 1080, height: 1350, note: '4:5' },
  { id: 'ig-story', platform: 'Instagram', name: 'Story / Reel', width: 1080, height: 1920, note: '9:16' },

  // LinkedIn
  { id: 'li-post', platform: 'LinkedIn', name: 'Post image', width: 1200, height: 627, note: '~1.91:1' },
  { id: 'li-banner', platform: 'LinkedIn', name: 'Profile banner', width: 1584, height: 396, note: '4:1' },

  // TikTok
  { id: 'tt-video', platform: 'TikTok', name: 'Video / cover', width: 1080, height: 1920, note: '9:16' },

  // Open Graph / general web
  { id: 'og', platform: 'Web', name: 'Open Graph', width: 1200, height: 630, note: 'og:image, ~1.91:1' },
  { id: 'og-square', platform: 'Web', name: 'Square OG', width: 1200, height: 1200, note: '1:1 — Slack, some SMS previews' },
]

export const PLATFORMS = Array.from(new Set(PRESETS.map((p) => p.platform)))

export function presetsByPlatform(): Record<string, Preset[]> {
  const out: Record<string, Preset[]> = {}
  for (const p of PRESETS) {
    if (!out[p.platform]) out[p.platform] = []
    out[p.platform].push(p)
  }
  return out
}
