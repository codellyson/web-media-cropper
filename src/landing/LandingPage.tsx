import Link from 'next/link'
import { marked } from 'marked'
import { LANDINGS, type Landing } from '@/content/landings'
import { NavBar } from '@/components/NavBar'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wmc.kreativekorna.com'

function md(input: string): string {
  return marked.parse(input, { async: false }) as string
}

export function jsonLdFaq(landing: Landing): string {
  if (!landing.faq?.length) return ''
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: landing.faq.map((q) => ({
      '@type': 'Question',
      name: q.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.a,
      },
    })),
  }
  return JSON.stringify(data)
}

export function landingBySlug(slug: string): Landing | undefined {
  return LANDINGS.find((l) => l.slug === slug)
}

export function landingCanonical(slug: string): string {
  return `${SITE_URL}/${slug}/`
}

export function LandingPage({ slug }: { slug: string }) {
  const landing = landingBySlug(slug)

  if (!landing) {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-[var(--ic-ink-3)]">
          The landing <code>{slug}</code> doesn't exist.
        </p>
        <Link href="/" className="mt-6 inline-block text-[var(--ic-accent)] underline">
          Back to home
        </Link>
      </main>
    )
  }

  const ctaHref = `/studio?preset=${landing.ctaPresetId}`

  return (
    <>
      {landing.faq?.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdFaq(landing) }}
        />
      ) : null}

      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <NavBar />

        <main className="mx-auto w-full max-w-[760px] flex-1 px-6 py-12">
          <h1 className="text-[clamp(32px,4vw,48px)] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--ic-ink)]">
            {landing.h1}
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-[var(--ic-ink-2)]">{landing.intro}</p>

          <div className="mt-8">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--ic-accent)] px-5 py-3 text-[14px] font-semibold text-white transition hover:brightness-110"
              style={{ boxShadow: '0 4px 14px var(--ic-accent-glow)' }}
            >
              {landing.ctaLabel} <span>→</span>
            </Link>
          </div>

          {landing.sections?.map((section, i) => (
            <section key={i} className="mt-12">
              <h2 className="text-[22px] font-bold tracking-[-0.01em] text-[var(--ic-ink)]">
                {section.heading}
              </h2>
              <div
                className="prose mt-3 max-w-none text-[15px] leading-relaxed text-[var(--ic-ink-2)] [&>p]:mt-3 [&>ul]:mt-3 [&>ul]:list-disc [&>ul]:pl-6 [&>ol]:mt-3 [&>ol]:list-decimal [&>ol]:pl-6 [&_a]:text-[var(--ic-accent)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--ic-bg-2)] [&_code]:px-1 [&_code]:py-0.5 [&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[var(--ic-bg-2)] [&_pre]:p-3 [&_strong]:font-semibold [&_strong]:text-[var(--ic-ink)]"
                dangerouslySetInnerHTML={{ __html: md(section.body) }}
              />
            </section>
          ))}

          {landing.faq?.length ? (
            <section className="mt-14 border-t border-[var(--ic-line)] pt-8">
              <h2 className="text-[22px] font-bold tracking-[-0.01em] text-[var(--ic-ink)]">
                Frequently asked
              </h2>
              <div className="mt-4 flex flex-col divide-y divide-[var(--ic-line)] rounded-xl border border-[var(--ic-line)]">
                {landing.faq.map((q, i) => (
                  <details key={i} className="group p-4">
                    <summary className="cursor-pointer list-none text-[15px] font-semibold text-[var(--ic-ink)]">
                      {q.q}
                    </summary>
                    <div
                      className="mt-2 text-[14px] leading-relaxed text-[var(--ic-ink-2)] [&_a]:text-[var(--ic-accent)] [&_a]:underline [&_strong]:font-semibold [&_strong]:text-[var(--ic-ink)]"
                      dangerouslySetInnerHTML={{ __html: md(q.a) }}
                    />
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </main>

        <footer className="border-t border-[var(--ic-line)]">
          <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-5">
            <span className="text-[13px] text-[var(--ic-ink-3)]">
              Runs entirely in your browser. No upload, no tracking.
            </span>
            <Link
              href="/"
              className="font-mono-geist text-[11px] uppercase tracking-[0.14em] text-[var(--ic-ink-4)] transition hover:text-[var(--ic-ink-2)]"
            >
              WMC · 2026
            </Link>
          </div>
        </footer>
      </div>
    </>
  )
}

export default LandingPage
