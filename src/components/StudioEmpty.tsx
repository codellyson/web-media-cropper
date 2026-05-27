import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Head } from 'vite-react-ssg'
import { NavBar } from '@/components/NavBar'

type StudioEmptyProps = {
  onFile: (f: File) => void
  onBlob: (b: Blob, name?: string) => void
  loading: boolean
  error: string | null
}

export function StudioEmpty({ onFile, onBlob, loading, error }: StudioEmptyProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
          const blob = item.getAsFile()
          if (blob) {
            const name =
              blob.name ||
              (item.type.startsWith('video/') ? 'pasted-video' : 'pasted-image')
            onBlob(blob, name)
            e.preventDefault()
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onBlob])

  const triggerFilePicker = () => fileRef.current?.click()
  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onFile(f)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--ic-bg)] text-[var(--ic-ink)]">
      <Head>
        <title>Studio · WMC</title>
        <meta
          name="description"
          content="Subject-aware multi-platform crop. Drop a file to start. In your browser, no upload."
        />
        <meta name="robots" content="noindex" />
      </Head>
      <NavBar />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,.heic,.heif,.mp4,.mov,.webm,.mkv"
        className="sr-only"
        onChange={onFilePicked}
      />

      {/* Match the editor's outer footprint so the post-clear transition is gentle. */}
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col px-8 py-8">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) onFile(f)
          }}
          onClick={triggerFilePicker}
          className="group flex flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--ic-accent)]"
          style={{
            minHeight: 480,
            borderColor: over ? 'var(--ic-accent)' : 'var(--ic-line-strong)',
            background: over ? 'var(--ic-accent-tint)' : 'var(--ic-card)',
          }}
        >
          <div className="w-full max-w-[560px] px-6 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ic-line)] bg-[var(--ic-bg)] px-3 py-1 text-[12px] font-medium text-[var(--ic-ink-3)]">
              <span className="block h-1.5 w-1.5 rounded-full bg-[var(--ic-accent)]" />
              Studio ready
            </span>

            <div
              className="mx-auto mt-7 grid h-14 w-14 place-items-center rounded-full text-white transition group-hover:scale-105"
              style={{
                background: 'var(--ic-accent)',
                boxShadow: '0 6px 22px var(--ic-accent-glow)',
              }}
            >
              <svg
                width={22}
                height={22}
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

            <h1 className="mt-5 text-[clamp(28px,3.6vw,40px)] font-bold leading-[1.1] tracking-[-0.025em] text-[var(--ic-ink)]">
              {over ? 'Release to upload' : 'Drop a file to start.'}
            </h1>
            <p className="mx-auto mt-3 max-w-[420px] text-[14px] leading-[1.55] text-[var(--ic-ink-2)]">
              HEIC, AVIF, WebP, PNG, JPG, MP4, MOV. Up to 4K.
            </p>
            <p className="mt-3 text-[12px] text-[var(--ic-ink-4)]">
              {loading ? 'Decoding…' : 'Click anywhere, drag a file, or paste with ⌘V.'}
            </p>

            {error && <p className="mt-4 text-[12px] text-red-500">{error}</p>}

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-[13px] text-[var(--ic-ink-3)]">
              <Link
                to="/"
                onClick={(e) => e.stopPropagation()}
                className="transition hover:text-[var(--ic-ink)]"
              >
                ← See how it works
              </Link>
              <span
                aria-hidden
                className="block h-[3px] w-[3px] rounded-full bg-[var(--ic-ink-4)]"
                style={{ opacity: 0.6 }}
              />
              <Link
                to="/batch"
                onClick={(e) => e.stopPropagation()}
                className="transition hover:text-[var(--ic-ink)]"
              >
                Batch many files
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[var(--ic-line)]">
        <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-5">
          <span className="text-[13px] text-[var(--ic-ink-3)]">
            Runs entirely in your browser. No upload, no tracking.
          </span>
          <span className="font-mono-geist text-[11px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)]">
            WMC · 2026
          </span>
        </div>
      </footer>
    </div>
  )
}

export default StudioEmpty
