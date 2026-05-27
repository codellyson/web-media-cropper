// Migration scaffold checkpoint — replace with the landing route once App.tsx
// is ported from react-router-dom + vite-react-ssg to next/navigation + Next.js
// metadata API.
export default function LandingPlaceholder() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-20">
      <h1 className="text-3xl font-bold">Next.js scaffold is live</h1>
      <p className="mt-3 text-[var(--ic-ink-3)]">
        Migration in progress. The Vite app still runs via{' '}
        <code className="rounded bg-[var(--ic-bg-3)] px-1 py-0.5">pnpm dev:vite</code>; the Next
        scaffold runs via{' '}
        <code className="rounded bg-[var(--ic-bg-3)] px-1 py-0.5">pnpm dev</code>.
      </p>
    </main>
  )
}
