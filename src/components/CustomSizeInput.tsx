import { useEffect, useState } from 'react'
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
    <div className="flex flex-col gap-3">
      <div>
        <label
          htmlFor="custom-dims-input"
          className="mb-1.5 block px-2.5 font-mono-geist text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ic-ink-4)]"
        >
          Custom dimensions
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            apply(raw)
          }}
          className="flex gap-1.5 px-0.5"
        >
          <input
            id="custom-dims-input"
            type="text"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="1080×1350 or 4:5"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-1.5 text-[13px] text-[var(--ic-ink)] outline-none transition placeholder:text-[var(--ic-ink-4)] focus:border-[var(--ic-ink-4)]"
          />
          <button
            type="submit"
            disabled={!parsed}
            className="inline-flex h-8 items-center rounded-md bg-[var(--ic-ink)] px-3 text-[12.5px] font-medium text-[var(--ic-bg)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Apply
          </button>
        </form>
        <p className="mt-1.5 h-4 px-2.5 font-mono-geist text-[10.5px] uppercase tracking-[0.12em] text-[var(--ic-ink-4)]">
          {parsed
            ? `${parsed.width} × ${parsed.height}`
            : raw
              ? 'enter two numbers or a ratio'
              : ''}
        </p>
      </div>

      {recent.length > 0 && (
        <div>
          <p className="mb-1.5 px-2.5 font-mono-geist text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
            Recent
          </p>
          <div className="flex flex-wrap gap-1 px-0.5">
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => apply(r)}
                className="inline-flex h-7 items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 font-mono-geist text-[11px] tracking-[0.04em] text-[var(--ic-ink-2)] transition hover:border-[var(--ic-ink-4)] hover:text-[var(--ic-ink)]"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
