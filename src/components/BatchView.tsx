import { useEffect, useMemo, useRef, useState } from 'react'
import { runBatch, type BatchProgress } from '@/lib/batch'
import { PRESETS, type Preset } from '@/lib/presets'
import type { OutputFormat } from '@/lib/crop'
import type { BackdropType, FillMode } from '@/lib/cropClient'
import { downloadBlob } from '@/lib/download'
import {
  extractVideoFirstFrame,
  formatDuration,
  looksLikeVideo,
} from '@/lib/loadVideo'
import {
  loadBundles,
  newBundleId,
  sanitizeBundleName,
  saveBundles,
  type Bundle,
} from '@/lib/bundles'

const DEFAULT_PRESET_IDS = [
  'ig-square',
  'ig-portrait',
  'ig-story',
  'yt-thumbnail',
  'x-post',
  'li-post',
  'og',
]

const FORMATS: Array<{ value: OutputFormat; label: string }> = [
  { value: 'jpeg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
]

const STORAGE_KEY = 'wmc:batch:settings'
const VIDEO_DURATION_CAP_MS = 60_000
const ACCEPTED_FILE_REGEX = /\.(heic|heif|mp4|m4v|mov|webm|mkv|ogv|avi)$/i

type StoredSettings = {
  selected?: string[]
  format?: OutputFormat
  quality?: number
  fillMode?: FillMode
  blurPx?: number
  backdropType?: BackdropType
  backdropColor?: string
}

type VideoMeta = { durationMs: number }

function loadStoredSettings(): StoredSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as StoredSettings
  } catch {
    // ignore — fall through to defaults
  }
  return null
}

async function makeVideoThumbnail(
  file: File,
): Promise<{ url: string; durationMs: number } | null> {
  try {
    const frame = await extractVideoFirstFrame(file)
    const MAX = 200
    const a = frame.width / frame.height
    const w = a >= 1 ? MAX : Math.max(64, Math.round(MAX * a))
    const h = a >= 1 ? Math.max(64, Math.round(MAX / a)) : MAX
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      frame.bitmap.close?.()
      return null
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(frame.bitmap, 0, 0, w, h)
    frame.bitmap.close?.()
    return { url: canvas.toDataURL('image/jpeg', 0.7), durationMs: frame.durationMs }
  } catch {
    return null
  }
}

function isVideoExt(name: string): boolean {
  return /\.(mp4|m4v|mov|webm|mkv|ogv|avi)$/i.test(name)
}

export function BatchView() {
  const [files, setFiles] = useState<File[]>([])
  const [thumbs, setThumbs] = useState<Map<File, string>>(new Map())
  const [videoMeta, setVideoMeta] = useState<Map<File, VideoMeta>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(() => {
    const stored = loadStoredSettings()?.selected
    return Array.isArray(stored) && stored.length
      ? new Set(stored)
      : new Set(DEFAULT_PRESET_IDS)
  })
  const [format, setFormat] = useState<OutputFormat>(() => {
    const f = loadStoredSettings()?.format
    return f === 'jpeg' || f === 'png' || f === 'webp' ? f : 'jpeg'
  })
  const [quality, setQuality] = useState<number>(() => {
    const q = loadStoredSettings()?.quality
    return typeof q === 'number' && q >= 0.5 && q <= 1 ? q : 0.85
  })
  const [fillMode, setFillMode] = useState<FillMode>(() => {
    const m = loadStoredSettings()?.fillMode
    // Fit is the default; persisted 'crop' overrides only when explicitly set.
    return m === 'crop' ? 'crop' : 'fit'
  })
  const [blurPx, setBlurPx] = useState<number>(() => {
    const b = loadStoredSettings()?.blurPx
    return typeof b === 'number' && b >= 4 && b <= 48 ? b : 24
  })
  const [backdropType, setBackdropType] = useState<BackdropType>(() => {
    const t = loadStoredSettings()?.backdropType
    return t === 'solid' ? 'solid' : 'blur'
  })
  const [backdropColor, setBackdropColor] = useState<string>(() => {
    const c = loadStoredSettings()?.backdropColor
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#000000'
  })
  // User-saved combinations of presets + output settings. Persisted separately
  // from the live settings above so deleting your "current" doesn't nuke saved
  // recipes. Read once at mount; mutations go through saveBundles().
  const [bundles, setBundles] = useState<Bundle[]>(() => loadBundles())
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Persist settings whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          selected: Array.from(selected),
          format,
          quality,
          fillMode,
          blurPx,
          backdropType,
          backdropColor,
        }),
      )
    } catch {
      // ignore — quota or disabled storage is non-fatal
    }
  }, [selected, format, quality, fillMode, blurPx, backdropType, backdropColor])

  // Live settings drift detection: if the user tweaks any output setting after
  // applying a bundle, drop the active marker so the chip doesn't pretend the
  // saved recipe still matches what's on screen.
  useEffect(() => {
    if (!activeBundleId) return
    const active = bundles.find((b) => b.id === activeBundleId)
    if (!active) return
    const sameSelection =
      selected.size === active.presetIds.length &&
      active.presetIds.every((p) => selected.has(p))
    const activeBackdropType = active.backdropType ?? 'blur'
    const activeBackdropColor = active.backdropColor ?? '#000000'
    const sameSettings =
      active.format === format &&
      active.quality === quality &&
      active.fillMode === fillMode &&
      active.blurPx === blurPx &&
      activeBackdropType === backdropType &&
      activeBackdropColor === backdropColor
    if (!sameSelection || !sameSettings) setActiveBundleId(null)
  }, [
    activeBundleId,
    bundles,
    selected,
    format,
    quality,
    fillMode,
    blurPx,
    backdropType,
    backdropColor,
  ])

  // Track current files via ref so async video-thumbnail extraction can skip
  // setting state for files the user removed mid-flight.
  const filesRef = useRef<File[]>(files)
  useEffect(() => {
    filesRef.current = files
  }, [files])

  // Revoke any outstanding object URLs on unmount. (Data URLs from video
  // thumbnails don't need revoking — revokeObjectURL is a no-op on them.)
  const thumbsRef = useRef<Map<File, string>>(thumbs)
  useEffect(() => {
    thumbsRef.current = thumbs
  }, [thumbs])
  useEffect(() => {
    return () => {
      thumbsRef.current.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [])

  const groupedPresets = useMemo(() => {
    const map = new Map<string, Preset[]>()
    for (const p of PRESETS) {
      if (!map.has(p.platform)) map.set(p.platform, [])
      map.get(p.platform)!.push(p)
    }
    return Array.from(map.entries())
  }, [])

  const togglePreset = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    // Editing the selection invalidates the "active bundle" tag — what you
    // see no longer matches the saved recipe.
    setActiveBundleId(null)
  }

  const applyBundle = (bundle: Bundle) => {
    setSelected(new Set(bundle.presetIds))
    setFormat(bundle.format)
    setQuality(bundle.quality)
    setFillMode(bundle.fillMode)
    setBlurPx(bundle.blurPx)
    setBackdropType(bundle.backdropType ?? 'blur')
    setBackdropColor(bundle.backdropColor ?? '#000000')
    setActiveBundleId(bundle.id)
  }

  const saveCurrentAsBundle = () => {
    if (typeof window === 'undefined') return
    if (selected.size === 0) return
    const raw = window.prompt('Bundle name?', '')
    if (raw == null) return
    const name = sanitizeBundleName(raw)
    if (!name) return
    const next: Bundle = {
      id: newBundleId(),
      name,
      presetIds: Array.from(selected),
      format,
      quality,
      fillMode,
      blurPx,
      backdropType,
      backdropColor,
    }
    const updated = [...bundles, next]
    setBundles(updated)
    saveBundles(updated)
    setActiveBundleId(next.id)
  }

  const deleteBundle = (id: string) => {
    const updated = bundles.filter((b) => b.id !== id)
    setBundles(updated)
    saveBundles(updated)
    if (activeBundleId === id) setActiveBundleId(null)
  }

  const onFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list).filter(
      (f) =>
        f.type.startsWith('image/') ||
        f.type.startsWith('video/') ||
        ACCEPTED_FILE_REGEX.test(f.name),
    )
    if (incoming.length === 0) return

    // Object URLs synchronously for image files. Videos are handled async below.
    setThumbs((prev) => {
      const next = new Map(prev)
      for (const f of incoming) {
        if (next.has(f)) continue
        if (!looksLikeVideo(f, f.name) && !isVideoExt(f.name)) {
          next.set(f, URL.createObjectURL(f))
        }
      }
      return next
    })

    setFiles((prev) => [...prev, ...incoming])

    // Async first-frame extraction for videos.
    for (const f of incoming) {
      if (looksLikeVideo(f, f.name) || isVideoExt(f.name)) {
        makeVideoThumbnail(f).then((res) => {
          if (!res) return
          if (!filesRef.current.includes(f)) return // removed mid-flight
          setThumbs((prev) => {
            const next = new Map(prev)
            next.set(f, res.url)
            return next
          })
          setVideoMeta((prev) => {
            const next = new Map(prev)
            next.set(f, { durationMs: res.durationMs })
            return next
          })
        })
      }
    }
  }

  const removeFile = (idx: number) => {
    const target = files[idx]
    if (!target) return
    const url = thumbs.get(target)
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    setThumbs((prev) => {
      const next = new Map(prev)
      next.delete(target)
      return next
    })
    setVideoMeta((prev) => {
      if (!prev.has(target)) return prev
      const next = new Map(prev)
      next.delete(target)
      return next
    })
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const clearFiles = () => {
    thumbs.forEach((url) => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    })
    setThumbs(new Map())
    setVideoMeta(new Map())
    setFiles([])
  }

  const presets: Preset[] = PRESETS.filter((p) => selected.has(p.id))
  const totalOps = files.length * presets.length
  const hasVideos = files.some((f) => looksLikeVideo(f, f.name) || isVideoExt(f.name))

  const run = async () => {
    if (running || files.length === 0 || presets.length === 0) return
    setRunning(true)
    setProgress({ index: 0, total: totalOps, items: [] })
    try {
      const zip = await runBatch(files, presets, {
        format,
        quality,
        fillMode,
        blurPx,
        backdropType,
        backdropColor,
        onProgress: (p) => setProgress(p),
      })
      downloadBlob(zip, `wmc-batch-${new Date().toISOString().slice(0, 10)}.zip`)
    } catch (err) {
      console.error('[batch]', err)
    } finally {
      setRunning(false)
    }
  }

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.index / progress.total) * 100)
      : 0

  const errorItems = progress?.items.filter((it) => it.status === 'error') ?? []
  const doneCount = progress?.items.filter((it) => it.status === 'done').length ?? 0

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-6 py-12 md:py-16">
      <header className="max-w-[680px]">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] px-3 py-1 font-mono-geist text-[10.5px] uppercase tracking-[0.14em] text-[var(--ic-ink-3)]">
          <span className="block h-1.5 w-1.5 rounded-full bg-[var(--ic-accent)]" />
          Batch · subject-aware
        </span>
        <h1 className="mt-5 text-[clamp(32px,4.6vw,56px)] font-bold leading-[1.05] tracking-[-0.025em]">
          Crop many at once.
        </h1>
        <p className="mt-4 text-[15px] leading-[1.55] text-[var(--ic-ink-2)]">
          Drop images or short clips, pick presets, get every aspect ratio for every
          file with the subject locked. One zip out, nothing uploaded.
        </p>
      </header>

      {/* Section 01 — Files */}
      <Section
        kicker="01"
        title="Files"
        meta={`${files.length} ${files.length === 1 ? 'file' : 'files'}`}
        action={
          files.length > 0 ? (
            <button
              type="button"
              onClick={clearFiles}
              className="font-mono-geist text-[11px] uppercase tracking-[0.12em] text-[var(--ic-ink-4)] transition hover:text-[var(--ic-ink-2)]"
            >
              clear all
            </button>
          ) : null
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,.heic,.heif,.mp4,.m4v,.mov,.webm,.mkv"
          multiple
          className="sr-only"
          onChange={(e) => {
            onFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            onFiles(e.dataTransfer.files)
          }}
          className="group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--ic-accent)]"
          style={{
            minHeight: 180,
            borderColor: over ? 'var(--ic-accent)' : 'var(--ic-line-strong)',
            background: over ? 'var(--ic-accent-tint)' : 'var(--ic-card)',
          }}
        >
          <div
            className="grid h-11 w-11 place-items-center rounded-full text-white"
            style={{
              background: 'var(--ic-accent)',
              boxShadow: '0 6px 18px var(--ic-accent-glow)',
            }}
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3v12" />
              <path d="m6 9 6-6 6 6" />
              <rect x={3} y={15} width={18} height={6} rx={2} />
            </svg>
          </div>
          <span className="mt-3 text-[14px] font-medium text-[var(--ic-ink)]">
            {over
              ? 'Release to add'
              : files.length === 0
                ? 'Drop files or click'
                : 'Drop more or click'}
          </span>
          <span className="mt-1 font-mono-geist text-[11px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
            HEIC · WebP · PNG · JPG · MP4 · MOV — videos up to 60s
          </span>
        </button>

        {files.length > 0 && (
          <ul className="mt-4 grid gap-1.5">
            {files.map((f, i) => {
              const url = thumbs.get(f)
              const isVid = looksLikeVideo(f, f.name) || isVideoExt(f.name)
              const meta = videoMeta.get(f)
              const overCap = meta && meta.durationMs > VIDEO_DURATION_CAP_MS
              return (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-3 rounded-md border border-[var(--ic-line)] bg-[var(--ic-card)] px-2.5 py-2 text-[13px]"
                >
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-[var(--ic-bg-3)]">
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    {isVid && (
                      <span
                        aria-hidden
                        className="absolute inset-0 grid place-items-center bg-black/35 text-white"
                      >
                        <svg
                          width={11}
                          height={11}
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[var(--ic-ink-2)]">
                    {f.name}
                    {overCap && (
                      <span className="ml-2 font-mono-geist text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        over 60s · will skip
                      </span>
                    )}
                  </span>
                  <span className="font-mono-geist text-[11px] uppercase tracking-[0.1em] text-[var(--ic-ink-4)]">
                    {isVid && meta
                      ? formatDuration(meta.durationMs)
                      : `${(f.size / 1024).toFixed(0)} kB`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove ${f.name}`}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--ic-ink-4)] transition hover:bg-[var(--ic-bg-2)] hover:text-[var(--ic-ink)]"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {/* Section 02 — Presets */}
      <Section
        kicker="02"
        title="Presets"
        meta={`${presets.length} selected`}
        action={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelected(new Set(PRESETS.map((p) => p.id)))}
              className="font-mono-geist text-[11px] uppercase tracking-[0.12em] text-[var(--ic-ink-4)] transition hover:text-[var(--ic-ink-2)]"
            >
              all
            </button>
            <span aria-hidden className="text-[var(--ic-ink-4)]">
              ·
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="font-mono-geist text-[11px] uppercase tracking-[0.12em] text-[var(--ic-ink-4)] transition hover:text-[var(--ic-ink-2)]"
            >
              none
            </button>
          </div>
        }
      >
        {/* Bundles row — always visible so the save affordance is discoverable.
            Empty state guides the user toward saving their first one. */}
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono-geist text-[10.5px] uppercase tracking-[0.18em] text-[var(--ic-ink-3)]">
            Bundles
          </span>
          {bundles.map((b) => {
            const active = b.id === activeBundleId
            return (
              <span
                key={b.id}
                className={`group inline-flex h-7 items-center gap-1 rounded-full border px-1 pl-3 text-[12px] transition ${
                  active
                    ? 'border-[var(--ic-ink)] bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                    : 'border-[var(--ic-line)] bg-[var(--ic-card)] text-[var(--ic-ink-2)] hover:border-[var(--ic-ink-4)] hover:text-[var(--ic-ink)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => applyBundle(b)}
                  aria-pressed={active}
                  className="font-medium"
                  title={`Apply: ${b.presetIds.length} preset${b.presetIds.length === 1 ? '' : 's'} · ${b.fillMode === 'fit' ? 'Fit' : 'Crop'} · ${b.format.toUpperCase()}`}
                >
                  {b.name}
                </button>
                <span
                  className={`font-mono-geist text-[10px] ${
                    active ? 'opacity-60' : 'text-[var(--ic-ink-4)]'
                  }`}
                >
                  {b.presetIds.length}
                </span>
                <button
                  type="button"
                  onClick={() => deleteBundle(b.id)}
                  aria-label={`Delete bundle ${b.name}`}
                  className={`grid h-5 w-5 place-items-center rounded-full text-[14px] leading-none transition ${
                    active
                      ? 'text-[var(--ic-bg)]/70 hover:bg-white/10 hover:text-[var(--ic-bg)]'
                      : 'text-[var(--ic-ink-4)] hover:bg-[var(--ic-bg-3)] hover:text-[var(--ic-ink)]'
                  }`}
                >
                  ×
                </button>
              </span>
            )
          })}
          <button
            type="button"
            onClick={saveCurrentAsBundle}
            disabled={selected.size === 0}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-[var(--ic-line-strong)] bg-transparent px-3 text-[12px] text-[var(--ic-ink-3)] transition hover:border-[var(--ic-ink)] hover:bg-[var(--ic-card)] hover:text-[var(--ic-ink)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--ic-line-strong)] disabled:hover:bg-transparent disabled:hover:text-[var(--ic-ink-3)]"
            title={
              selected.size === 0
                ? 'Pick at least one preset to save a bundle'
                : 'Save current selection + output settings as a bundle'
            }
          >
            <span aria-hidden className="text-[14px] leading-none">
              +
            </span>
            <span>{bundles.length === 0 ? 'Save your first bundle' : 'Save current'}</span>
          </button>
        </div>

        <div className="space-y-5">
          {groupedPresets.map(([platform, items]) => {
            const allOn = items.every((p) => selected.has(p.id))
            const toggleGroup = () => {
              setSelected((prev) => {
                const next = new Set(prev)
                if (allOn) items.forEach((p) => next.delete(p.id))
                else items.forEach((p) => next.add(p.id))
                return next
              })
            }
            return (
              <div key={platform} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono-geist text-[10.5px] uppercase tracking-[0.18em] text-[var(--ic-ink-3)]">
                    {platform}
                  </span>
                  <button
                    type="button"
                    onClick={toggleGroup}
                    className="font-mono-geist text-[10.5px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)] transition hover:text-[var(--ic-ink-2)]"
                  >
                    {allOn ? 'clear' : 'select all'}
                  </button>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-3">
                  {items.map((p) => {
                    const on = selected.has(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePreset(p.id)}
                        aria-pressed={on}
                        className={`group inline-flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition ${
                          on
                            ? 'border-[var(--ic-ink)] bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                            : 'border-[var(--ic-line)] bg-[var(--ic-card)] text-[var(--ic-ink-2)] hover:border-[var(--ic-ink-4)] hover:text-[var(--ic-ink)]'
                        }`}
                      >
                        <span className="truncate font-medium">{p.name}</span>
                        <span
                          className={`font-mono-geist text-[10px] uppercase tracking-[0.1em] ${
                            on ? 'opacity-60' : 'text-[var(--ic-ink-4)]'
                          }`}
                        >
                          {p.width}×{p.height}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Section 03 — Output */}
      <Section
        kicker="03"
        title="Output"
        meta={hasVideos ? 'videos always mp4' : undefined}
      >
        <div className="flex flex-col gap-4">
          {/* Row 1: Mode */}
          <SettingRow label="Mode">
            <div
              role="radiogroup"
              aria-label="Fill mode"
              className="inline-flex items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[11px] uppercase tracking-[0.12em]"
            >
              {(['fit', 'crop'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={fillMode === m}
                  onClick={() => setFillMode(m)}
                  className={`h-7 rounded-full px-3 transition ${
                    fillMode === m
                      ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                      : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
                  }`}
                >
                  {m === 'fit' ? 'Fit' : 'Crop'}
                </button>
              ))}
            </div>
          </SettingRow>

          {/* Row 2: Backdrop (Fit only) */}
          {fillMode === 'fit' && (
            <SettingRow label="Backdrop">
              <div
                role="radiogroup"
                aria-label="Backdrop"
                className="inline-flex items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[11px] uppercase tracking-[0.12em]"
              >
                {(['blur', 'solid'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={backdropType === t}
                    onClick={() => setBackdropType(t)}
                    className={`h-7 rounded-full px-3 transition ${
                      backdropType === t
                        ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                        : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
                    }`}
                  >
                    {t === 'blur' ? 'Blur' : 'Solid'}
                  </button>
                ))}
              </div>
              {backdropType === 'solid' && (
                <label
                  className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-[var(--ic-line)] hover:border-[var(--ic-ink-4)]"
                  title={`Pick backdrop color (${backdropColor})`}
                  style={{ background: backdropColor }}
                >
                  <input
                    type="color"
                    value={backdropColor}
                    onChange={(e) => setBackdropColor(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Backdrop color"
                  />
                </label>
              )}
            </SettingRow>
          )}

          {/* Row 2b: Blur amount (Fit + Blur backdrop only) */}
          {fillMode === 'fit' && backdropType === 'blur' && (
            <SettingRow label="Blur">
              <input
                type="range"
                min={4}
                max={48}
                value={blurPx}
                onChange={(e) => setBlurPx(Number(e.target.value))}
                className="w-40 accent-[var(--ic-ink)]"
                aria-label="Bleed blur amount"
              />
              <span className="font-mono-geist text-[11px] tracking-[0.12em] text-[var(--ic-ink-3)]">
                {blurPx <= 12 ? 'soft' : blurPx <= 28 ? 'medium' : 'strong'}
              </span>
            </SettingRow>
          )}

          {/* Row 3: Format */}
          <SettingRow label={hasVideos ? 'Image format' : 'Format'}>
            <div
              role="radiogroup"
              aria-label="Output format"
              className="inline-flex items-center rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] p-0.5 font-mono-geist text-[11px] uppercase tracking-[0.12em]"
            >
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={format === f.value}
                  onClick={() => setFormat(f.value)}
                  className={`h-7 rounded-full px-3 transition ${
                    format === f.value
                      ? 'bg-[var(--ic-ink)] text-[var(--ic-bg)]'
                      : 'text-[var(--ic-ink-3)] hover:text-[var(--ic-ink)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </SettingRow>

          {/* Row 4: Quality */}
          {format !== 'png' && (
            <SettingRow label="Quality">
              <input
                type="range"
                min={50}
                max={100}
                value={Math.round(quality * 100)}
                onChange={(e) => setQuality(Number(e.target.value) / 100)}
                className="w-40 accent-[var(--ic-ink)]"
                aria-label="Output quality percentage"
              />
              <span className="font-mono-geist text-[11px] tracking-[0.12em] text-[var(--ic-ink-3)]">
                {Math.round(quality * 100)}%
              </span>
            </SettingRow>
          )}
        </div>

        {hasVideos && (
          <p className="mt-4 font-mono-geist text-[10.5px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
            Videos encode to MP4 H.264 at CRF 23 · audio passes through where possible · 60s cap.
          </p>
        )}
      </Section>

      {/* Run row */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--ic-line)] pt-6">
        <div className="font-mono-geist text-[11px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
          {running
            ? `Cropping · ${progress?.index ?? 0} / ${progress?.total ?? 0}`
            : totalOps > 0
              ? `${totalOps} crop${totalOps === 1 ? '' : 's'} queued · ${files.length}×${presets.length}`
              : 'Add files and pick at least one preset'}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || totalOps === 0}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--ic-ink)] px-5 text-[14px] font-medium text-[var(--ic-bg)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? 'Cropping…' : 'Run batch'}
          {!running && totalOps > 0 && (
            <span className="font-mono-geist text-[10.5px] uppercase tracking-wider opacity-60">
              {totalOps} crop{totalOps === 1 ? '' : 's'}
            </span>
          )}
          {!running && <span aria-hidden></span>}
        </button>
      </div>

      {progress && progress.total > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] p-4">
          <div className="mb-2 flex items-center justify-between font-mono-geist text-[11px] uppercase tracking-[0.12em] text-[var(--ic-ink-4)]">
            <span>
              {running
                ? 'Running'
                : errorItems.length > 0
                  ? `Done · ${doneCount} ok · ${errorItems.length} error${errorItems.length === 1 ? '' : 's'}`
                  : 'Done · zip downloaded'}
            </span>
            <span className="text-[var(--ic-ink-3)]">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ic-bg-3)]">
            <div
              className="h-full rounded-full bg-[var(--ic-ink)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {errorItems.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-0.5 overflow-y-auto font-mono-geist text-[11px] text-red-500">
              {errorItems.map((it, i) => (
                <li key={i}>
                  {it.fileName} · {it.presetId}: {it.message ?? 'failed'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function SettingRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-[88px] shrink-0 font-mono-geist text-[11px] uppercase tracking-[0.12em] text-[var(--ic-ink-4)]">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

function Section({
  kicker,
  title,
  meta,
  action,
  children,
}: {
  kicker: string
  title: string
  meta?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mt-12 border-t border-[var(--ic-line)] pt-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono-geist text-[11px] uppercase tracking-[0.18em] text-[var(--ic-accent)]">
            {kicker}
          </span>
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--ic-ink)]">
            {title}
          </h2>
          {meta && (
            <span className="font-mono-geist text-[11px] uppercase tracking-[0.12em] text-[var(--ic-ink-4)]">
              · {meta}
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
