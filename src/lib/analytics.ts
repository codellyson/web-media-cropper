type EventPayload = Record<string, string | number | boolean>

// Google Analytics (gtag.js) is loaded by app/layout.tsx when NEXT_PUBLIC_GA_ID
// is set at build time. In dev, or when no measurement ID is configured, this
// is a no-op.
//
// The gtag('config', ...) call in app/layout.tsx fires the initial page_view;
// SPA route changes are picked up by GA4's Enhanced Measurement → Page views
// (history changes), which is enabled by default for new GA4 properties.
export function track(event: string, payload?: EventPayload) {
  if (process.env.NODE_ENV === 'development') return
  const gtag = (
    window as typeof window & { gtag?: (cmd: 'event', name: string, params?: EventPayload) => void }
  ).gtag
  if (gtag) gtag('event', event, payload)
}
