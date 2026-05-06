import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBytes, type OutputFormat } from '@/lib/crop'

const FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
]

type ExportBarProps = {
  format: OutputFormat
  onFormatChange: (format: OutputFormat) => void
  quality: number
  onQualityChange: (quality: number) => void
  output: { width: number; height: number } | null
  sizeBytes: number | null
  estimating: boolean
  onDownload: () => void
  canDownload: boolean
}

export function ExportBar({
  format,
  onFormatChange,
  quality,
  onQualityChange,
  output,
  sizeBytes,
  estimating,
  onDownload,
  canDownload,
}: ExportBarProps) {
  const showQuality = format !== 'png'
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Format
        </p>
        <div role="radiogroup" aria-label="Output format" className="inline-flex rounded-md border p-0.5">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={format === f.value}
              onClick={() => onFormatChange(f.value)}
              className={cn(
                'rounded-[3px] px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                format === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {showQuality && (
        <div className="min-w-[160px]">
          <p className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Quality</span>
            <span className="normal-case tracking-normal text-foreground/80">
              {Math.round(quality * 100)}
            </span>
          </p>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={quality}
            onChange={(e) => onQualityChange(Number(e.target.value))}
            aria-label="Output quality"
            aria-valuetext={`${Math.round(quality * 100)} percent`}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
          />
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        <div className="text-right">
          {output && (
            <p className="text-xs text-muted-foreground">
              {output.width}×{output.height}
              {sizeBytes != null && <> · {formatBytes(sizeBytes)}</>}
              {estimating && sizeBytes == null && <> · …</>}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">EXIF stripped</p>
        </div>
        <Button onClick={onDownload} disabled={!canDownload}>
          Download
        </Button>
      </div>
    </div>
  )
}
