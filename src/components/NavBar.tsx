import { Link, NavLink, useLocation } from 'react-router-dom'
import { Download } from 'lucide-react'
import { LANDINGS } from '@/content/landings'
import { ThemeToggle } from '@/components/ThemeToggle'
import { usePwaInstall } from '@/hooks/usePwaInstall'

const SHORT_LABEL: Record<string, string> = {
  'youtube-thumbnail': 'YouTube',
  'instagram-post': 'IG',
  'instagram-reel': 'Reel',
  tiktok: 'TikTok',
  'x-post': 'X',
  'linkedin-post': 'LinkedIn',
  'og-image': 'OG',
}

export function NavBar() {
  const location = useLocation()
  const onStudio = location.pathname.startsWith('/studio')
  const { canInstall, promptInstall } = usePwaInstall()
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--ic-line)] bg-[var(--ic-bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-6 px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-[var(--ic-ink)]"
        >
          <span
            aria-hidden
            className="block h-4 w-4 rounded-[4px] bg-[var(--ic-ink)]"
          />
          WMC
        </Link>

        <nav className="hidden items-center gap-5 md:flex" aria-label="Platform presets">
          {LANDINGS.map((l) => (
            <NavLink
              key={l.slug}
              to={`/${l.slug}`}
              className={({ isActive }) =>
                `font-mono-geist text-[11px] uppercase tracking-[0.14em] transition ${
                  isActive
                    ? 'text-[var(--ic-ink)]'
                    : 'text-[var(--ic-ink-4)] hover:text-[var(--ic-ink)]'
                }`
              }
            >
              {SHORT_LABEL[l.slug] ?? l.slug}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          {canInstall && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              aria-label="Install app"
              title="Install Cropper as a standalone app"
              className="hidden h-8 items-center gap-1.5 rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] px-3 text-[12px] font-medium text-[var(--ic-ink-2)] transition hover:border-[var(--ic-ink-4)] hover:text-[var(--ic-ink)] sm:inline-flex"
            >
              <Download size={13} aria-hidden />
              Install
            </button>
          )}
          <ThemeToggle />
          {onStudio ? (
            <Link
              to="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--ic-line)] bg-[var(--ic-card)] px-3.5 text-[12.5px] font-medium text-[var(--ic-ink-2)] transition hover:border-[var(--ic-ink-4)] hover:text-[var(--ic-ink)]"
            >
              <span aria-hidden></span> Home
            </Link>
          ) : (
            <Link
              to="/studio"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--ic-ink)] px-3.5 text-[12.5px] font-medium text-[var(--ic-bg)] transition hover:brightness-110"
            >
              Open studio <span aria-hidden></span>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

export default NavBar
