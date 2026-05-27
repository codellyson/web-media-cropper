import type { RouteRecord } from 'vite-react-ssg'
import App from '@/App'
import LandingPage from '@/landing/LandingPage'
import { EngineBadge } from '@/components/EngineBadge'
import { LANDINGS } from '@/content/landings'

const landingRoutes: RouteRecord[] = LANDINGS.map((l) => ({
  path: `/${l.slug}`,
  element: <LandingPage slug={l.slug} />,
  entry: 'src/pages/LandingPage.tsx',
}))

// Wraps every SPA route so the dev-only engine badge is mounted alongside App
// without touching App's many return paths. EngineBadge renders null in prod.
const spa = (
  <>
    <App />
    <EngineBadge />
  </>
)

export const routes: RouteRecord[] = [
  ...landingRoutes,
  // SPA-only paths. All resolve to App; App dispatches by URL + load state.
  { path: '/', element: spa },
  { path: '/studio', element: spa },
  { path: '/studio/compress', element: spa },
  { path: '/studio/video', element: spa },
  { path: '/batch', element: spa },
]

/** Paths that should be prerendered to static HTML at build time. */
export const SSG_INCLUDED = new Set<string>([
  '/',
  ...LANDINGS.map((l) => `/${l.slug}`),
])
