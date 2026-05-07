import { PlatformIcon } from '@/components/PlatformIcon'

export type MobileAspectEntry = {
  id: string
  platform: string
  display: string
  ratio: string
}

type MobileAspectStripProps = {
  entries: MobileAspectEntry[]
  value: string | null
  onSelect: (id: string) => void
}

/**
 * Horizontal-scroll strip of aspect/preset chips, surfaced just below the
 * toolbar on mobile so the user doesn't have to open the Settings sheet to
 * switch aspect ratio. Hidden on lg+ (the desktop rails carry this).
 */
export function MobileAspectStrip({ entries, value, onSelect }: MobileAspectStripProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--ic-line)] bg-[var(--ic-bg-2)] px-3 py-2 lg:hidden"
      style={{ scrollbarWidth: 'none' }}
      aria-label="Aspect ratio presets"
    >
      {entries.map((e) => {
        const active = value === e.id
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onSelect(e.id)}
            aria-pressed={active}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] transition ${
              active
                ? 'border-[var(--ic-ink)] bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                : 'border-[var(--ic-line)] bg-[var(--ic-card)] text-[var(--ic-ink-2)] hover:border-[var(--ic-ink-4)] hover:text-[var(--ic-ink)]'
            }`}
          >
            <PlatformIcon platform={e.platform} size={14} />
            <span className="font-medium">{e.display}</span>
            <span
              className={`font-mono-geist text-[10.5px] ${
                active ? 'opacity-60' : 'text-[var(--ic-ink-4)]'
              }`}
            >
              {e.ratio}
            </span>
          </button>
        )
      })}
    </div>
  )
}
