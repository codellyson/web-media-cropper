import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { EditorShell, RailSlider } from '@/components/editor/EditorShell'
import { avifEncodeSupported, formatBytes } from '@/lib/crop'
import {
  compressAtQuality,
  compressToTargetSize,
  parseTargetSize,
  type CompressFormat,
} from '@/lib/compress'
import { downloadBlob, swapExtension } from '@/lib/download'
import type { LoadedImage } from '@/lib/loadImage'

type Mode = 'quality' | 'target'

const BASE_FORMATS: { value: CompressFormat; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
  { value: 'png', label: 'PNG' },
]

type CompressViewProps = {
  image: LoadedImage
  objectUrl: string
  onClear: () => void
  onSwitchTool: () => void
}

export function CompressView({ image, objectUrl, onClear, onSwitchTool }: CompressViewProps) {
  const [mode, setMode] = useState<Mode>('quality')
  const [quality, setQuality] = useState(0.78)
  const [targetInput, setTargetInput] = useState('500 kB')
  const [format, setFormat] = useState<CompressFormat>('auto')
  const [output, setOutput] = useState<Blob | null>(null)
  const [running, setRunning] = useState(false)
  const [iterations, setIterations] = useState(0)
  const [avifOk, setAvifOk] = useState(false)
  useEffect(() => {
    let mounted = true
    avifEncodeSupported().then((ok) => mounted && setAvifOk(ok))
    return () => {
      mounted = false
    }
  }, [])
  const FORMATS = avifOk ? [...BASE_FORMATS, { value: 'avif' as CompressFormat, label: 'AVIF' }] : BASE_FORMATS

  const targetBytes = parseTargetSize(targetInput)

  useEffect(() => {
    let cancelled = false
    setOutput(null)
    setRunning(true)
    setIterations(0)
    const t = setTimeout(async () => {
      try {
        if (mode === 'quality') {
          const blob = await compressAtQuality(
            image.sourceBlob,
            image.width,
            image.height,
            format,
            quality,
          )
          if (!cancelled) {
            setOutput(blob)
            setIterations(1)
          }
        } else {
          if (!targetBytes) {
            setRunning(false)
            return
          }
          const result = await compressToTargetSize(
            image.sourceBlob,
            image.width,
            image.height,
            format,
            targetBytes,
            (iter) => {
              if (!cancelled) setIterations(iter)
            },
          )
          if (!cancelled) {
            setOutput(result.blob)
            setIterations(result.iterations)
          }
        }
      } catch (err) {
        console.error('[compress] failed', err)
      } finally {
        if (!cancelled) setRunning(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [image, mode, quality, targetBytes, format])

  const handleDownload = () => {
    if (!output) return
    const ext = format === 'auto' ? extFromMime(output.type) : format === 'jpeg' ? 'jpg' : format
    const name = swapExtension(image.name, ext).replace(`.${ext}`, `-compressed.${ext}`)
    downloadBlob(output, name)
  }

  const sourceBytes = image.sizeBytes
  const outBytes = output?.size ?? null
  const savedPct = outBytes != null ? Math.max(0, Math.round((1 - outBytes / sourceBytes) * 100)) : null

  return (
    <EditorShell
      fileName={image.name}
      activeTool="compress"
      onToolChange={(t) => {
        if (t === 'crop') onSwitchTool()
      }}
      fileMeta={
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      }
      leftRail={
        <>
          <RailHeader>Mode</RailHeader>
          <ModeToggle mode={mode} onChange={setMode} />

          {mode === 'quality' ? (
            <RailSlider
              label="Quality"
              value={Math.round(quality * 100)}
              valueLabel={`${Math.round(quality * 100)}`}
              min={10}
              max={100}
              onChange={(v) => setQuality(v / 100)}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-[var(--ic-ink-2)]">Target size</span>
                <span className="font-mono-geist text-[11px] text-[var(--ic-ink-3)]">
                  {targetBytes != null ? formatBytes(targetBytes) : '—'}
                </span>
              </div>
              <input
                type="text"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder="500 kB"
                aria-label="Target size"
                className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-1.5 text-[13px] text-[var(--ic-ink)] placeholder:text-[var(--ic-ink-4)]"
              />
              <p className="text-[11px] text-[var(--ic-ink-4)]">
                Examples: 500 kB · 2 MB · 1024 kB
              </p>
            </div>
          )}

          <div className="border-t border-[var(--ic-line)] pt-3">
            <RailHeader>Format</RailHeader>
            <div
              role="radiogroup"
              aria-label="Output format"
              className="mt-2 grid grid-cols-2 gap-1"
            >
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={format === f.value}
                  onClick={() => setFormat(f.value)}
                  className={`h-8 rounded-md border font-mono-geist text-[11px] uppercase tracking-[0.12em] transition ${
                    format === f.value
                      ? 'border-[var(--ic-ink)] bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                      : 'border-[var(--ic-line)] bg-[var(--ic-card)] text-[var(--ic-ink-2)] hover:border-[var(--ic-ink-4)] hover:text-[var(--ic-ink)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </>
      }
      rightRail={
        <>
          <RailHeader>Result</RailHeader>
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-3">
            <Stat label="Original" value={formatBytes(sourceBytes)} />
            <Stat
              label="Compressed"
              value={
                outBytes != null
                  ? formatBytes(outBytes)
                  : running
                    ? `iter ${iterations || 1}…`
                    : '—'
              }
              accent
            />
            {savedPct != null && outBytes != null && (
              <div className="mt-1 flex items-baseline justify-between border-t border-[var(--ic-line)] pt-2">
                <span className="text-[12px] text-[var(--ic-ink-3)]">Saved</span>
                <span className="font-mono-geist text-[14px] font-semibold text-[var(--ic-accent)]">
                  {savedPct}%
                </span>
              </div>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!output || running}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--ic-ink)] px-4 text-[13px] font-medium text-[var(--ic-bg)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download <span aria-hidden></span>
            </button>
            <p className="text-center font-mono-geist text-[10px] uppercase tracking-wider text-[var(--ic-ink-4)]">
              EXIF stripped · in your browser
            </p>
          </div>
        </>
      }
    >
      <CanvasView image={image} objectUrl={objectUrl} running={running} />
    </EditorShell>
  )
}

function CanvasView({
  image,
  objectUrl,
  running,
}: {
  image: LoadedImage
  objectUrl: string
  running: boolean
}) {
  const checker = `linear-gradient(45deg, var(--ic-bg-3) 25%, transparent 25%), linear-gradient(-45deg, var(--ic-bg-3) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--ic-bg-3) 75%), linear-gradient(-45deg, transparent 75%, var(--ic-bg-3) 75%)`
  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
      style={{
        background: checker,
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        backgroundColor: 'var(--ic-bg-2)',
      }}
    >
      <div className="absolute left-4 top-3.5 z-[5] flex items-center gap-2.5 font-mono-geist text-[11px] text-[var(--ic-ink-3)]">
        <span className="rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2 py-1">
          {image.width}×{image.height}
        </span>
      </div>
      <div className="grid flex-1 place-items-center p-6">
        <div className="relative max-h-full max-w-full">
          <img
            src={objectUrl}
            alt={image.name}
            className="block max-h-[460px] max-w-[600px] rounded-md object-contain"
            style={{
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
            }}
          />
          {running && (
            <div
              className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 font-mono-geist text-[11px] uppercase tracking-wider text-white"
              role="status"
              aria-live="polite"
            >
              Compressing…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Compression mode"
      className="inline-flex w-full items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[11px] uppercase tracking-[0.12em]"
    >
      {(['quality', 'target'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={`h-7 flex-1 rounded-full px-2.5 transition ${
            mode === m
              ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
              : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
          }`}
        >
          {m === 'quality' ? 'Quality' : 'Target'}
        </button>
      ))}
    </div>
  )
}

function RailHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-0.5 pt-1 font-mono-geist text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ic-ink-4)]">
      {children}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-[var(--ic-ink-3)]">{label}</span>
      <span
        className={`font-mono-geist text-[13px] font-semibold ${
          accent ? 'text-[var(--ic-accent)]' : 'text-[var(--ic-ink)]'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  return 'jpg'
}
