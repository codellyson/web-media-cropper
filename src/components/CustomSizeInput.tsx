import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { parseDimensions } from '@/lib/parseDimensions'

type CustomSizeInputProps = {
  onApply: (width: number, height: number) => void
}

export function CustomSizeInput({ onApply }: CustomSizeInputProps) {
  const [raw, setRaw] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('wmc:recent-dims')
      if (stored) setRecent(JSON.parse(stored))
    } catch {
      // ignore
    }
  }, [])

  const parsed = parseDimensions(raw)

  const apply = (value: string) => {
    const dims = parseDimensions(value)
    if (!dims) return
    onApply(dims.width, dims.height)
    setRaw(`${dims.width}×${dims.height}`)
    const key = `${dims.width}×${dims.height}`
    setRecent((prev) => {
      const next = [key, ...prev.filter((r) => r !== key)].slice(0, 6)
      try {
        localStorage.setItem('wmc:recent-dims', JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Paste dimensions
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            apply(raw)
          }}
          className="flex gap-2"
        >
          <Input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="1080×1350, 4:5 at 1080 wide, 1600 900…"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={!parsed}>
            Apply
          </Button>
        </form>
        <p className="mt-1.5 h-4 text-xs text-muted-foreground">
          {parsed ? `→ ${parsed.width} × ${parsed.height}` : raw ? 'Enter two numbers or a ratio.' : ' '}
        </p>
      </div>

      {recent.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <Button
                key={r}
                variant="outline"
                size="sm"
                onClick={() => apply(r)}
                className="font-normal"
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
