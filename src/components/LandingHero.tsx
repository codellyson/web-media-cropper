import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { computeFocalDetection, type FocalPoint } from '@/lib/smartCrop'
import { SubjectStrip } from '@/components/SubjectStrip'

type LandingHeroProps = {
  onFile: (file: File) => void
  onBlob: (blob: Blob, name?: string) => void
}

type Preview = {
  bitmap: ImageBitmap
  width: number
  height: number
  file: File
  isVideo: boolean
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv|avi)$/i

async function extractFirstFrame(file: File): Promise<Preview> {
  const isVideo = file.type.startsWith('video/') || VIDEO_EXT.test(file.name)
  if (!isVideo) {
    const probe = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { bitmap: probe, width: probe.width, height: probe.height, file, isVideo: false }
  }
  const url = URL.createObjectURL(file)
  try {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.src = url
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res()
      v.onerror = () => rej(new Error('Could not decode video'))
    })
    if (v.duration > 0) v.currentTime = Math.min(0.1, v.duration / 2)
    await new Promise<void>((res) => {
      if (v.readyState >= 2 && v.currentTime > 0) return res()
      v.onseeked = () => res()
      setTimeout(() => res(), 1500)
    })
    const bitmap = await createImageBitmap(v)
    return {
      bitmap,
      width: v.videoWidth,
      height: v.videoHeight,
      file,
      isVideo: true,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function LandingHero({ onFile, onBlob: _onBlob }: LandingHeroProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [focal, setFocal] = useState<FocalPoint | null>(null)

  useEffect(() => {
    return () => preview?.bitmap.close?.()
  }, [preview])

  useEffect(() => {
    if (!preview) {
      setFocal(null)
      return
    }
    let cancelled = false
    computeFocalDetection(preview.bitmap)
      .then((det) => {
        if (!cancelled) setFocal(det.point)
      })
      .catch(() => {
        if (!cancelled) setFocal({ x: 0.5, y: 0.5 })
      })
    return () => {
      cancelled = true
    }
  }, [preview])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
          const blob = item.getAsFile()
          if (blob) {
            const name =
              blob.name || (item.type.startsWith('video/') ? 'pasted-video' : 'pasted-image')
            ingest(new File([blob], name, { type: blob.type }))
            e.preventDefault()
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/sample.jpg')
        if (!res.ok) return
        const blob = await res.blob()
        if (cancelled) return
        const file = new File([blob], 'sample.jpg', { type: blob.type || 'image/jpeg' })
        setBusy(true)
        const next = await extractFirstFrame(file)
        if (cancelled) {
          next.bitmap.close?.()
          return
        }
        setPreview(next)
      } catch {
        // sample is best-effort; if missing, leave hero empty
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const ingest = async (file: File) => {
    setBusy(true)
    setPreviewError(null)
    try {
      const next = await extractFirstFrame(file)
      setPreview((prev) => {
        prev?.bitmap.close?.()
        return next
      })
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Could not preview this file')
    } finally {
      setBusy(false)
    }
  }

  const triggerFilePicker = () => fileRef.current?.click()

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) ingest(file)
  }

  const continueToStudio = () => {
    if (!preview) return
    onFile(preview.file)
  }

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--ic-line) 1px, transparent 1px), linear-gradient(to bottom, var(--ic-line) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(0,0,0,0.5), transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(0,0,0,0.5), transparent 80%)',
          opacity: 0.6,
        }}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,.heic,.heif,.mp4,.mov,.webm,.mkv"
        className="sr-only"
        onChange={onFilePicked}
      />

      <header className="relative z-10">
        <div className="mx-auto max-w-[1100px] px-6 pt-14 pb-10 md:pt-20 md:pb-12">
          <div className="mb-7 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] px-3 py-1 font-mono-geist text-[10.5px] uppercase tracking-[0.14em] text-[var(--ic-ink-3)]">
              <span className="block h-1.5 w-1.5 rounded-full bg-[var(--ic-accent)]" />
              Subject-aware · in your browser
            </span>
          </div>

          <h1 className="text-center text-[clamp(40px,6.5vw,84px)] font-bold leading-[1.04] tracking-[-0.025em] text-[var(--ic-ink)]">
            Crop once,
            <br />
            <span className="font-semibold text-[var(--ic-ink-3)]">post everywhere.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-[560px] text-center text-[16px] leading-[1.55] text-[var(--ic-ink-2)]">
            Drop one image or video. WMC reframes it for every platform — with the focal
            point locked in shot at every aspect ratio. Drag the splitter below to see how.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            {preview ? (
              <button
                type="button"
                onClick={continueToStudio}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--ic-ink)] px-5 h-11 text-[14px] font-medium text-[var(--ic-bg)] transition hover:brightness-110"
              >
                Continue to studio <span aria-hidden></span>
              </button>
            ) : (
              <button
                type="button"
                onClick={triggerFilePicker}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--ic-ink)] px-5 h-11 text-[14px] font-medium text-[var(--ic-bg)] transition hover:brightness-110"
              >
                Drop a file
                <span
                  aria-hidden
                  className="font-mono-geist text-[10.5px] uppercase tracking-wider opacity-60"
                >
                  or paste
                </span>
              </button>
            )}
            <div className="flex items-center gap-2.5 font-mono-geist text-[11px] uppercase tracking-[0.12em] text-[var(--ic-ink-4)]">
              {preview && (
                <>
                  <button
                    type="button"
                    onClick={triggerFilePicker}
                    className="transition hover:text-[var(--ic-ink-2)]"
                  >
                    replace file
                  </button>
                  <Dot />
                </>
              )}
              <Link
                to="/batch"
                className="inline-flex items-center gap-1 transition hover:text-[var(--ic-ink-2)]"
              >
                batch many files <span aria-hidden></span>
              </Link>
            </div>
          </div>

          {previewError && (
            <p className="mt-3 text-center text-[12px] text-red-500">{previewError}</p>
          )}
        </div>

        <SubjectStrip
          preview={preview}
          focal={focal}
          busy={busy}
          onPick={triggerFilePicker}
          onIngest={ingest}
        />

        <div className="mx-auto max-w-[1100px] px-6 py-10">
          <div className="mx-auto flex max-w-[600px] flex-wrap items-center justify-center gap-x-3 gap-y-1.5 font-mono-geist text-[10.5px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
            <span>Free</span>
            <Dot />
            <span>100% in browser</span>
            <Dot />
            <span>No upload</span>
            <Dot />
            <span>Works offline</span>
          </div>
        </div>
      </header>
    </div>
  )
}

function Dot() {
  return (
    <span
      aria-hidden
      className="block h-[3px] w-[3px] rounded-full bg-[var(--ic-ink-4)]"
      style={{ opacity: 0.6 }}
    />
  )
}
