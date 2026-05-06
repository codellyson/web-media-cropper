type EventPayload = Record<string, string | number | boolean>

// Plausible is loaded by index.html when VITE_PLAUSIBLE_DOMAIN is set at build time.
// In dev or when no domain is configured, this is a no-op.
export function track(event: string, payload?: EventPayload) {
  if (import.meta.env.DEV) return
  const plausible = (window as typeof window & { plausible?: (e: string, o?: { props?: EventPayload }) => void })
    .plausible
  if (plausible) {
    plausible(event, payload ? { props: payload } : undefined)
  }
}
