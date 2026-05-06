import { PRESETS } from '@/lib/presets'

function ratioFor(p: { width: number; height: number }): string {
  const r = p.width / p.height
  if (Math.abs(r - 9 / 16) < 0.01) return '9:16'
  if (Math.abs(r - 4 / 5) < 0.01) return '4:5'
  if (Math.abs(r - 1) < 0.01) return '1:1'
  if (Math.abs(r - 16 / 9) < 0.01) return '16:9'
  if (Math.abs(r - 3) < 0.01) return '3:1'
  if (Math.abs(r - 4) < 0.01) return '4:1'
  if (Math.abs(r - 1.91) < 0.05) return '1.91:1'
  return `${Math.round(r * 100) / 100}:1`
}

const ITEMS = PRESETS.map((p) => `${p.platform} · ${p.name} · ${ratioFor(p)}`)

export function FormatMarquee() {
  const row = [...ITEMS, ...ITEMS]
  return (
    <section
      aria-label="Supported preset list"
      className="overflow-hidden border-y border-white/10 bg-black text-white"
    >
      <div
        className="flex w-max gap-10 whitespace-nowrap py-4 font-mono-geist text-[12px] uppercase tracking-[0.16em]"
        style={{ animation: 'ic-marquee 36s linear infinite' }}
      >
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-10">
            {t}
            <span aria-hidden style={{ opacity: 0.3 }}>
              /
            </span>
          </span>
        ))}
      </div>
    </section>
  )
}
