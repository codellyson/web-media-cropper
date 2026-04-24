import { presetsByPlatform, type Preset } from '@/lib/presets'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PresetPickerProps = {
  value: string | null
  onSelect: (preset: Preset) => void
}

export function PresetPicker({ value, onSelect }: PresetPickerProps) {
  const groups = presetsByPlatform()
  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([platform, presets]) => (
        <section key={platform}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {platform}
          </h3>
          <div className="grid grid-cols-1 gap-1.5">
            {presets.map((preset) => {
              const active = value === preset.id
              return (
                <Button
                  key={preset.id}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onSelect(preset)}
                  className={cn('justify-between font-normal', active && 'font-medium')}
                >
                  <span>{preset.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {preset.width}×{preset.height}
                  </span>
                </Button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
