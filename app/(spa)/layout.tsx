import App from '@/App'

// All SPA routes share this layout, which hosts the single <App /> instance.
// Because Next.js App Router preserves layouts across navigations within the
// same group, App's state (loaded file, focal detection, selected preset)
// persists when the user moves between /, /studio, /studio/compress, etc.
//
// Each child page.tsx contributes URL + metadata only; the page's rendered
// `children` are intentionally ignored — App drives the UI itself based on
// usePathname().
export default function SpaLayout({ children: _children }: { children: React.ReactNode }) {
  return <App />
}
