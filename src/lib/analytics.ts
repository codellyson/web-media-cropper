type EventPayload = Record<string, string | number | boolean>

// No-op by default. To enable Plausible, set VITE_PLAUSIBLE_DOMAIN and ship
// the script via index.html, then wire the global `plausible` call below.
export function track(event: string, payload?: EventPayload) {
  if (import.meta.env.DEV) return
  const plausible = (window as typeof window & { plausible?: (e: string, o?: { props?: EventPayload }) => void })
    .plausible
  if (plausible) {
    plausible(event, payload ? { props: payload } : undefined)
  }
}
