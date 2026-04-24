import { PRESETS } from '@/lib/presets'

const PLATFORMS = Array.from(new Set(PRESETS.map((p) => p.platform)))

export function HowItWorks() {
  return (
    <section className="mt-16 space-y-12 border-t pt-12">
      <div className="grid gap-8 md:grid-cols-3">
        <Step
          n={1}
          title="Drop or paste."
          body="Drag an image in, paste from clipboard, or click to pick a file. HEIC, AVIF, WebP, PNG, JPG all work."
        />
        <Step
          n={2}
          title="Pick a size."
          body="Click a platform preset or paste any dimensions — 1080×1350, 4:5 at 1080 wide, all parsed."
        />
        <Step
          n={3}
          title="Download."
          body="The crop auto-centers on the subject. Drag to adjust. Lanczos-resampled output, EXIF stripped."
        />
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Covers
        </p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <span
              key={p}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold">Your images never leave your browser.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Everything runs locally in your tab — decoding, smart-crop detection, resampling,
          and export. No server, no upload, no account. Once the page has loaded, you could
          pull the Wi-Fi cable and the tool would still work. Face detection uses a model
          downloaded from Google&apos;s CDN on first use and cached; after that it runs entirely
          on your device.
        </p>
      </div>
    </section>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div>
      <div className="mb-3 flex size-7 items-center justify-center rounded-full border text-xs font-medium">
        {n}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}
