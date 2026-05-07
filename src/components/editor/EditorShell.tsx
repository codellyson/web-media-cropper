import { useEffect, useState, type ReactNode } from 'react'
import { Crop, Minimize2, Music, Scissors, Settings2, Square, X } from 'lucide-react'

export type EditorTool =
  | 'crop'
  | 'compress'
  | 'video-frame'
  | 'video-trim'
  | 'video-crop'
  | 'video-compress'
  | 'video-audio'

export type ToolbarMode = 'image' | 'video'

type EditorShellProps = {
  fileName: string
  fileMeta?: ReactNode
  toolbarMode?: ToolbarMode
  activeTool: EditorTool
  onToolChange: (t: EditorTool) => void
  leftRail: ReactNode
  rightRail?: ReactNode
  /** Primary action surfaced in the mobile bottom action bar (typically a Download button). */
  mobileAction?: ReactNode
  /** Horizontal preset/aspect strip surfaced below the toolbar on mobile only. */
  mobileAspects?: ReactNode
  children: ReactNode
}

export function EditorShell({
  fileName,
  fileMeta,
  toolbarMode = 'image',
  activeTool,
  onToolChange,
  leftRail,
  rightRail,
  mobileAction,
  mobileAspects,
  children,
}: EditorShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    if (!sheetOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sheetOpen])

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)] lg:max-h-[calc(100dvh-10rem)]">
      <Toolbar
        fileName={fileName}
        fileMeta={fileMeta}
        mode={toolbarMode}
        activeTool={activeTool}
        onToolChange={onToolChange}
      />
      {mobileAspects}
      {/* Single grid: at lg+ it's three columns; below lg it collapses to a flex
          column where only the canvas (and the mobile bottom bar) are visible. */}
      <div className="flex flex-1 flex-col lg:grid lg:min-h-[560px] lg:grid-cols-[230px_1fr_280px]">
        <aside className="hidden flex-col gap-5 border-r border-[var(--ic-line)] bg-[var(--ic-bg-2)] px-3 py-4 text-[13px] lg:flex">
          {leftRail}
        </aside>
        <div className="relative flex min-h-[420px] min-w-0 flex-1 flex-col">{children}</div>
        <aside
          className="hidden flex-col gap-4 overflow-y-auto border-l border-[var(--ic-line)] bg-[var(--ic-bg-2)] p-4 lg:flex"
          style={{ scrollbarGutter: 'stable' }}
        >
          {rightRail}
        </aside>
        {/* Mobile bottom action bar — sticky at the bottom of the editor card. */}
        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-2 border-t border-[var(--ic-line)] bg-[var(--ic-bg-2)]/95 px-3 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Open settings"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] px-3.5 text-[12.5px] font-medium text-[var(--ic-ink-2)] transition hover:text-[var(--ic-ink)]"
          >
            <Settings2 size={14} />
            Settings
          </button>
          <div className="flex min-w-0 items-center justify-end">{mobileAction}</div>
        </div>
      </div>

      {/* Mobile sheet drawer — only mounted while open. Renders the rail content
          stacked vertically. Tap the scrim or the close button to dismiss. */}
      {sheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Editor settings"
          className="fixed inset-0 z-50 lg:hidden"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheetOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-[var(--ic-line)] bg-[var(--ic-card)] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--ic-line)] bg-[var(--ic-card)] px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="block h-1 w-10 rounded-full bg-[var(--ic-ink-4)]"
                  style={{ opacity: 0.4 }}
                />
                <span className="font-mono-geist text-[11px] uppercase tracking-[0.14em] text-[var(--ic-ink-3)]">
                  Editor settings
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close settings"
                className="grid h-8 w-8 place-items-center rounded-full text-[var(--ic-ink-3)] transition hover:bg-[var(--ic-bg-2)] hover:text-[var(--ic-ink)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-6 px-4 py-4 text-[13px]">
              <section className="flex flex-col gap-5">{leftRail}</section>
              {rightRail && (
                <section className="flex flex-col gap-4 border-t border-[var(--ic-line)] pt-5">
                  {rightRail}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Toolbar({
  fileName,
  fileMeta,
  mode,
  activeTool,
  onToolChange,
}: {
  fileName: string
  fileMeta?: ReactNode
  mode: ToolbarMode
  activeTool: EditorTool
  onToolChange: (t: EditorTool) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--ic-line)] bg-[var(--ic-card)] px-3.5 py-2.5">
      {mode === 'image' ? (
        <>
          <Tool icon={<Crop />} label="Frame" on={activeTool === 'crop'} onClick={() => onToolChange('crop')} />
          <Tool
            icon={<Minimize2 />}
            label="Compress"
            on={activeTool === 'compress'}
            onClick={() => onToolChange('compress')}
          />
        </>
      ) : (
        // Order: most-used → least. Crop is the headline feature (default Fit
        // reframe), Trim and Compress cover most edit jobs, Frame and Audio
        // are utilities.
        <>
          <Tool
            icon={<Crop />}
            label="Crop"
            on={activeTool === 'video-crop'}
            onClick={() => onToolChange('video-crop')}
          />
          <Tool
            icon={<Scissors />}
            label="Trim"
            on={activeTool === 'video-trim'}
            onClick={() => onToolChange('video-trim')}
          />
          <Tool
            icon={<Minimize2 />}
            label="Compress"
            on={activeTool === 'video-compress'}
            onClick={() => onToolChange('video-compress')}
          />
          <Tool
            icon={<Square />}
            label="Frame"
            on={activeTool === 'video-frame'}
            onClick={() => onToolChange('video-frame')}
          />
          <Tool
            icon={<Music />}
            label="Audio"
            on={activeTool === 'video-audio'}
            onClick={() => onToolChange('video-audio')}
          />
        </>
      )}
      <span className="flex-1" />
      <span className="hidden items-center gap-2 truncate font-mono-geist text-[12px] text-[var(--ic-ink-3)] md:inline-flex">
        <span
          className="block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--ic-accent)]"
          style={{ animation: 'ic-pulse-soft 2s ease-in-out infinite' }}
        />
        <span className="max-w-[260px] truncate">{fileName}</span>
      </span>
      
      {fileMeta}
    </div>
  )
}

function Tool({
  icon,
  label,
  on,
  disabled,
  title,
  onClick,
}: {
  icon: ReactNode
  label?: string
  on?: boolean
  disabled?: boolean
  title?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label ?? title}
      aria-pressed={on}
      title={title ?? (disabled ? `${label ?? ''} (coming soon)` : label)}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition ${
        on
          ? 'border-[var(--ic-line)] bg-[var(--ic-bg-2)] text-[var(--ic-ink)]'
          : disabled
            ? 'border-transparent bg-transparent text-[var(--ic-ink-4)] cursor-not-allowed'
            : 'border-transparent bg-transparent text-[var(--ic-ink-2)] hover:bg-[var(--ic-bg-2)] hover:text-[var(--ic-ink)]'
      }`}
    >
      <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-70 [&>svg]:h-full [&>svg]:w-full">
        {icon}
      </span>
      {label}
    </button>
  )
}

export function RailHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 py-1 font-mono-geist text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--ic-ink-4)]">
      {children}
    </div>
  )
}

export function RailSlider({
  label,
  value,
  valueLabel,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  valueLabel: string
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-medium text-[var(--ic-ink-2)]">{label}</span>
        <span className="font-mono-geist text-[11px] text-[var(--ic-ink-3)]">{valueLabel}</span>
      </div>
      <div className="relative">
        <div className="h-1 rounded-full bg-[var(--ic-bg-3)]" />
        <div
          className="absolute left-0 top-0 h-1 rounded-full bg-[var(--ic-accent)]"
          style={{ width: `${pct}%` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-[var(--ic-card)] shadow-[var(--ic-shadow-sm)]"
          style={{ left: `${pct}%`, borderColor: 'var(--ic-accent)' }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  )
}
