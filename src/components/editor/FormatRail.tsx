import { PRESETS, type Preset } from '@/lib/presets'
import { PlatformIcon } from '@/components/PlatformIcon'

type GroupId = 'portrait' | 'square' | 'landscape'

type CuratedEntry = {
  id: string
  display: string
}

type Group = {
  id: GroupId
  label: string
  entries: CuratedEntry[]
}

// Curated by aspect category — the user thinks "I want a vertical thing for
// Reels" before they think about specific platform dimensions.
const GROUPS: Group[] = [
  {
    id: 'portrait',
    label: 'Portrait',
    entries: [
      { id: 'ig-story', display: 'IG Reel / Story' },
      { id: 'tt-video', display: 'TikTok' },
      { id: 'yt-shorts', display: 'YT Shorts' },
      { id: 'ig-portrait', display: 'IG Portrait' },
    ],
  },
  {
    id: 'square',
    label: 'Square',
    entries: [{ id: 'ig-square', display: 'IG Square' }],
  },
  {
    id: 'landscape',
    label: 'Landscape',
    entries: [
      { id: 'yt-thumbnail', display: 'YT Thumbnail' },
      { id: 'x-post', display: 'X Post' },
      { id: 'li-post', display: 'LinkedIn' },
      { id: 'og', display: 'Open Graph' },
    ],
  },
]

function ratioLabel(p: Preset): string {
  const r = p.width / p.height
  if (Math.abs(r - 9 / 16) < 0.01) return '9:16'
  if (Math.abs(r - 4 / 5) < 0.01) return '4:5'
  if (Math.abs(r - 1) < 0.01) return '1:1'
  if (Math.abs(r - 16 / 9) < 0.01) return '16:9'
  if (Math.abs(r - 1.91) < 0.05) return '1.91:1'
  if (Math.abs(r - 3) < 0.01) return '3:1'
  if (Math.abs(r - 4) < 0.01) return '4:1'
  return `${Math.round(r * 100) / 100}:1`
}

type FormatRailProps = {
  value: string | null
  onSelect: (preset: Preset) => void
}

export function FormatRail({ value, onSelect }: FormatRailProps) {
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((group) => {
        const items = group.entries
          .map((e) => {
            const preset = PRESETS.find((p) => p.id === e.id)
            return preset ? { preset, display: e.display } : null
          })
          .filter((x): x is { preset: Preset; display: string } => !!x)
        if (!items.length) return null
        return (
          <div key={group.id} className="flex flex-col gap-1">
            <div className="px-2.5 pb-1 font-mono-geist text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
              {group.label}
            </div>
            {items.map(({ preset, display }) => {
              const active = value === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelect(preset)}
                  aria-pressed={active}
                  aria-label={`${preset.platform} ${preset.name}, ${preset.width} by ${preset.height}`}
                  className={`relative flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition ${
                    active
                      ? 'bg-[var(--ic-card)] text-[var(--ic-ink)]'
                      : 'bg-transparent text-[var(--ic-ink-2)] hover:bg-[var(--ic-card)] hover:text-[var(--ic-ink)]'
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -left-3 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-sm"
                      style={{ background: 'var(--ic-accent)' }}
                    />
                  )}
                  <span className="inline-flex items-center gap-2.5">
                    <PlatformIcon platform={preset.platform} size={16} />
                    {display}
                  </span>
                  <span
                    className={`font-mono-geist text-[11px] ${
                      active ? 'text-[var(--ic-ink-3)]' : 'text-[var(--ic-ink-4)]'
                    }`}
                  >
                    {ratioLabel(preset)}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
