type Feature = {
  kicker: string
  title: string
  body: string
}

const FEATURES: Feature[] = [
  {
    kicker: '01',
    title: 'Stays on your device',
    body: 'Mediapipe, ffmpeg, libheif, and Pica all run in the browser via WebAssembly. Files never leave your machine — sensitive content stays sensitive.',
  },
  {
    kicker: '02',
    title: 'Every preset, one click',
    body: 'Reels, TikTok, IG, YouTube, X, LinkedIn, OG. Export one or batch them all to a zip. Drop a 4K video and get every aspect ratio with the subject centered.',
  },
  {
    kicker: '03',
    title: 'Pixel-perfect output',
    body: 'Lanczos resampling via Pica. EXIF preserved or stripped on demand. HEIC and AVIF in, JPG/PNG/WebP/MP4 out. Built for delivery, not previews.',
  },
]

export function HowItWorks() {
  return (
    <section className="border-t border-[var(--ic-line)] py-16 md:py-20">
      <div className="grid gap-10 md:grid-cols-3 md:gap-12">
        {FEATURES.map((f) => (
          <article key={f.kicker} className="space-y-2">
            <div className="font-mono-geist text-[11px] uppercase tracking-[0.18em] text-[var(--ic-accent)]">
              {f.kicker}
            </div>
            <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--ic-ink)]">
              {f.title}
            </h3>
            <p className="text-[14.5px] leading-[1.6] text-[var(--ic-ink-2)]">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
