type Feature = {
  kicker: string
  title: string
  body: string
}

const FEATURES: Feature[] = [
  {
    kicker: '01',
    title: 'Nothing leaves your machine',
    body: 'Crop NDA footage, screen-recordings, anything sensitive — nothing uploaded, nothing logged. Works offline once loaded.',
  },
  {
    kicker: '02',
    title: 'One source, every platform',
    body: 'Drop a 4K master once. Pull Reels, TikTok, IG, YouTube, X, LinkedIn, OG — each with the subject in the right place. Single export, or batch the lot to a zip.',
  },
  {
    kicker: '03',
    title: 'Ready to publish',
    body: 'Sharp at the actual export size, not the blurry resample most browser tools ship. Strip EXIF when you don’t want location tags following an asset onto Twitter. Reads HEIC and AVIF, outputs JPG/PNG/WebP/MP4.',
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
