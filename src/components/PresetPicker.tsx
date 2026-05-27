import { presetsByPlatform, type Preset } from '@/lib/presets'

type PresetPickerProps = {
  value: string | null
  onSelect: (preset: Preset) => void
}

function ratioLabel(p: Preset): string {
  const r = p.width / p.height
  if (Math.abs(r - 9 / 16) < 0.01) return '9:16'
  if (Math.abs(r - 4 / 5) < 0.01) return '4:5'
  if (Math.abs(r - 1) < 0.01) return '1:1'
  if (Math.abs(r - 16 / 9) < 0.01) return '16:9'
  if (Math.abs(r - 3 / 1) < 0.01) return '3:1'
  if (Math.abs(r - 4 / 1) < 0.01) return '4:1'
  return `${Math.round(r * 100) / 100}:1`
}

function RatioIcon({ preset, active }: { preset: Preset; active: boolean }) {
  const r = preset.width / preset.height
  let w = 18,
    h = 18
  if (r < 0.7) {
    w = 11
    h = 18
  } else if (r < 0.95) {
    w = 14
    h = 18
  } else if (r < 1.05) {
    w = 16
    h = 16
  } else if (r < 2) {
    w = 20
    h = 12
  } else {
    w = 22
    h = 8
  }
  return (
    <span
      className="block flex-shrink-0 rounded-sm border-[1.4px]"
      style={{
        width: w,
        height: h,
        borderColor: active ? 'var(--ic-accent)' : 'currentColor',
        opacity: active ? 1 : 0.7,
      }}
    />
  )
}

export function PresetPicker({ value, onSelect }: PresetPickerProps) {
  const groups = presetsByPlatform()
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([platform, presets]) => (
        <section key={platform} className="space-y-1">
          <div className="px-0.5 pb-0.5 text-[13px] font-semibold text-[var(--ic-ink)]">
            {platform}
          </div>
          {presets.map((preset) => {
            const active = value === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelect(preset)}
                aria-pressed={active}
                aria-label={`${preset.platform} ${preset.name}, ${preset.width} by ${preset.height}`}
                className={`relative flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[13px] font-medium transition ${
                  active
                    ? 'border-[var(--ic-line)] bg-[var(--ic-card)] text-[var(--ic-ink)] shadow-[var(--ic-shadow-sm)]'
                    : 'border-transparent bg-transparent text-[var(--ic-ink-2)] hover:bg-[var(--ic-card)] hover:text-[var(--ic-ink)]'
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
                  <RatioIcon preset={preset} active={active} />
                  {preset.name}
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
        </section>
      ))}
    </div>
  )
}
