import { useEffect, useState } from 'react'
import type { OutputFormat } from '@/lib/crop'
import type { BackdropType, FillMode } from '@/lib/cropClient'
import { avifEncodeSupported, formatBytes } from '@/lib/crop'
import {
  RailExportButton,
  RailFooterNote,
  RailHeader,
  RailSlider,
} from '@/components/editor/EditorShell'

const BASE_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
]

type RailRightProps = {
  fillMode: FillMode
  onFillModeChange: (m: FillMode) => void
  blurPx: number
  onBlurPxChange: (v: number) => void
  backdropType: BackdropType
  onBackdropTypeChange: (t: BackdropType) => void
  backdropColor: string
  onBackdropColorChange: (c: string) => void
  subjectLock: number
  onSubjectLockChange: (v: number) => void
  padding: number
  onPaddingChange: (v: number) => void
  holdOnFaces: boolean
  onHoldOnFacesChange: (v: boolean) => void
  format: OutputFormat
  onFormatChange: (f: OutputFormat) => void
  quality: number
  onQualityChange: (q: number) => void
  output: { width: number; height: number } | null
  sizeBytes: number | null
  estimating: boolean
  canDownload: boolean
  onDownload: () => void
  preserveExif: boolean
  onPreserveExifChange: (v: boolean) => void
  exifSupported: boolean
}

function blurLabel(px: number): string {
  if (px <= 12) return 'soft'
  if (px <= 28) return 'medium'
  return 'strong'
}

export function RailRight({
  fillMode,
  onFillModeChange,
  blurPx,
  onBlurPxChange,
  backdropType,
  onBackdropTypeChange,
  backdropColor,
  onBackdropColorChange,
  subjectLock,
  onSubjectLockChange,
  padding,
  onPaddingChange,
  holdOnFaces,
  onHoldOnFacesChange,
  format,
  onFormatChange,
  quality,
  onQualityChange,
  output,
  sizeBytes,
  estimating,
  canDownload,
  onDownload,
  preserveExif,
  onPreserveExifChange,
  exifSupported,
}: RailRightProps) {
  const isFit = fillMode === 'fit'
  const showQuality = format !== 'png'
  const [avifOk, setAvifOk] = useState(false)
  useEffect(() => {
    let mounted = true
    avifEncodeSupported().then((ok) => mounted && setAvifOk(ok))
    return () => {
      mounted = false
    }
  }, [])
  const FORMATS = avifOk ? [...BASE_FORMATS, { value: 'avif' as OutputFormat, label: 'AVIF' }] : BASE_FORMATS
  const lockLabel = subjectLock > 75 ? 'strong' : subjectLock > 35 ? 'medium' : 'soft'
  return (
    <>
      <RailHeader>Mode</RailHeader>
      <div
        role="radiogroup"
        aria-label="Fill mode"
        className="inline-flex items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 text-[12px] font-medium"
      >
        {(['fit', 'crop'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={fillMode === m}
            onClick={() => onFillModeChange(m)}
            className={`h-7 flex-1 rounded-full px-2.5 transition ${
              fillMode === m
                ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
            }`}
          >
            {m === 'fit' ? 'Fit' : 'Crop'}
          </button>
        ))}
      </div>

      {isFit ? (
        <>
          <RailHeader>Backdrop</RailHeader>
          <BackdropPicker
            type={backdropType}
            onTypeChange={onBackdropTypeChange}
            color={backdropColor}
            onColorChange={onBackdropColorChange}
          />
          {backdropType === 'blur' && (
            <RailSlider
              label="Blur"
              value={blurPx}
              valueLabel={blurLabel(blurPx)}
              min={4}
              max={48}
              onChange={onBlurPxChange}
            />
          )}
        </>
      ) : (
        <>
          <RailHeader>Subject</RailHeader>
          <RailSlider
            label="Subject lock"
            value={subjectLock}
            valueLabel={lockLabel}
            min={0}
            max={100}
            onChange={onSubjectLockChange}
          />
          <RailSlider
            label="Padding"
            value={padding}
            valueLabel={`${padding}%`}
            min={0}
            max={30}
            onChange={onPaddingChange}
          />
          <Switch label="Hold on faces" on={holdOnFaces} onChange={onHoldOnFacesChange} />
        </>
      )}

      <RailHeader>Output</RailHeader>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="font-medium text-[var(--ic-ink-2)]">Format</span>
        </div>
        <div
          role="radiogroup"
          aria-label="Output format"
          className="inline-flex items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 text-[12px] font-medium"
        >
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={format === f.value}
              onClick={() => onFormatChange(f.value)}
              className={`h-7 flex-1 rounded-full px-2.5 transition ${
                format === f.value
                  ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                  : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {showQuality && (
        <RailSlider
          label="Quality"
          value={Math.round(quality * 100)}
          valueLabel={`${Math.round(quality * 100)}`}
          min={10}
          max={100}
          onChange={(v) => onQualityChange(v / 100)}
        />
      )}

      {format === 'jpeg' && (
        <Switch
          label="Preserve EXIF"
          on={preserveExif && exifSupported}
          disabled={!exifSupported}
          onChange={onPreserveExifChange}
          hint={exifSupported ? undefined : 'JPEG source only'}
        />
      )}

      <div className="mt-auto flex flex-col gap-2.5 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
        <div className="flex flex-col gap-0.5 text-[12px] text-[var(--ic-ink-3)]">
          <div className="flex justify-between">
            <b className="text-[13px] font-semibold text-[var(--ic-ink)]">Export</b>
            <span>{output ? `${output.width}×${output.height}` : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>{format.toUpperCase()}</span>
            <span>
              {sizeBytes != null ? formatBytes(sizeBytes) : estimating ? 'estimating…' : '—'}
            </span>
          </div>
        </div>
        <RailExportButton onClick={onDownload} disabled={!canDownload}>
          Download <span aria-hidden></span>
        </RailExportButton>
        <RailFooterNote>
          {format === 'jpeg' && preserveExif && exifSupported
            ? 'EXIF preserved. Runs in your browser.'
            : 'EXIF stripped. Runs in your browser.'}
        </RailFooterNote>
      </div>
    </>
  )
}

/**
 * Two-state backdrop picker for fit mode: Blur (existing default, tracks Blur
 * slider) or Solid (color swatch + native color input). Inline color input
 * uses a translucent overlay so the OS color picker pops on click without us
 * shipping a custom picker.
 */
function BackdropPicker({
  type,
  onTypeChange,
  color,
  onColorChange,
}: {
  type: BackdropType
  onTypeChange: (t: BackdropType) => void
  color: string
  onColorChange: (c: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Backdrop"
        className="inline-flex flex-1 items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 text-[12px] font-medium"
      >
        {(['blur', 'solid'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => onTypeChange(t)}
            className={`h-7 flex-1 rounded-full px-2.5 transition ${
              type === t
                ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
            }`}
          >
            {t === 'blur' ? 'Blur' : 'Solid'}
          </button>
        ))}
      </div>
      {type === 'solid' && (
        <label
          className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-[var(--ic-line)] hover:border-[var(--ic-ink-4)]"
          title={`Pick backdrop color (${color})`}
          style={{ background: color }}
        >
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Backdrop color"
          />
        </label>
      )}
    </div>
  )
}

function Switch({
  label,
  on,
  onChange,
  disabled,
  hint,
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex items-center justify-between py-1 text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex items-center gap-1.5 font-medium text-[var(--ic-ink-2)]">
        {label}
        {hint && (
          <span className="text-[11px] text-[var(--ic-ink-4)]">
            {hint}
          </span>
        )}
      </span>
      <span
        className="relative h-[17px] w-[30px] flex-shrink-0 cursor-pointer rounded-full border transition"
        style={{
          background: on ? 'var(--ic-accent)' : 'var(--ic-bg-3)',
          borderColor: on ? 'var(--ic-accent)' : 'var(--ic-line)',
        }}
      >
        <span
          className="absolute top-px h-[13px] w-[13px] rounded-full shadow-[var(--ic-shadow-sm)] transition-all"
          style={{
            left: on ? '14px' : '1px',
            background: on ? '#fff' : 'var(--ic-card)',
          }}
        />
      </span>
    </button>
  )
}
