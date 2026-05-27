import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'WMC | Crop once, post everywhere — multi-format video & image cropper',
  description:
    'Drop a clip or image — WMC reframes it for TikTok, Reels, Shorts, Feed, YouTube and X with subject-aware cropping. In your browser, no upload.',
  alternates: { canonical: '/' },
}

// Layout renders <App />; this page contributes only the URL + metadata.
export default function Page() {
  return null
}
