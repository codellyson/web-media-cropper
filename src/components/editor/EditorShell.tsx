import type { ReactNode } from 'react'
import { Crop, FileImage, Minimize2, Music, Scissors, Square } from 'lucide-react'

export type EditorTool =
  | 'crop'
  | 'compress'
  | 'video-frame'
  | 'video-trim'
  | 'video-crop'
  | 'video-compress'
  | 'video-gif'
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
  children,
}: EditorShellProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--ic-line)] bg-[var(--ic-card)]">
      <Toolbar
        fileName={fileName}
        fileMeta={fileMeta}
        mode={toolbarMode}
        activeTool={activeTool}
        onToolChange={onToolChange}
      />
      <div className="grid min-h-[560px] flex-1 lg:grid-cols-[230px_1fr_280px]">
        <aside className="flex flex-col gap-5 border-r border-[var(--ic-line)] bg-[var(--ic-bg-2)] px-3 py-4 text-[13px]">
          {leftRail}
        </aside>
        <div className="relative flex min-w-0 flex-col">{children}</div>
        <aside
          className="hidden flex-col gap-4 overflow-y-auto border-l border-[var(--ic-line)] bg-[var(--ic-bg-2)] p-4 lg:flex"
          style={{ scrollbarGutter: 'stable' }}
        >
          {rightRail}
        </aside>
      </div>
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
        <>
          <Tool
            icon={<Square />}
            label="Frame"
            on={activeTool === 'video-frame'}
            onClick={() => onToolChange('video-frame')}
          />
          <Tool
            icon={<Scissors />}
            label="Trim"
            on={activeTool === 'video-trim'}
            onClick={() => onToolChange('video-trim')}
          />
          <Tool
            icon={<Crop />}
            label="Crop"
            on={activeTool === 'video-crop'}
            onClick={() => onToolChange('video-crop')}
          />
          <Tool
            icon={<Minimize2 />}
            label="Compress"
            on={activeTool === 'video-compress'}
            onClick={() => onToolChange('video-compress')}
          />
          <Tool
            icon={<FileImage />}
            label="GIF"
            on={activeTool === 'video-gif'}
            onClick={() => onToolChange('video-gif')}
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
