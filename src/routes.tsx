import type { RouteRecord } from 'vite-react-ssg'
import App from '@/App'
import LandingPage from '@/pages/LandingPage'
import { LANDINGS } from '@/content/landings'

const landingRoutes: RouteRecord[] = LANDINGS.map((l) => ({
  path: `/${l.slug}`,
  element: <LandingPage slug={l.slug} />,
  entry: 'src/pages/LandingPage.tsx',
}))

export const routes: RouteRecord[] = [
  ...landingRoutes,
  // SPA-only paths. All resolve to App; App dispatches by URL + load state.
  { path: '/', element: <App /> },
  { path: '/studio', element: <App /> },
  { path: '/studio/compress', element: <App /> },
  { path: '/studio/video', element: <App /> },
  { path: '/batch', element: <App /> },
]

/** Paths that should be prerendered to static HTML at build time. */
export const SSG_INCLUDED = new Set<string>([
  '/',
  ...LANDINGS.map((l) => `/${l.slug}`),
])
