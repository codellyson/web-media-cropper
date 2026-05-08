import { Link, useParams } from 'react-router-dom'
import { Head } from 'vite-react-ssg'
import { marked } from 'marked'
import { LANDINGS, type Landing } from '@/content/landings'
import { NavBar } from '@/components/NavBar'

const SITE_URL =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SITE_URL as string | undefined)) ||
  'https://wmc.kreativekorna.com'

function md(input: string): string {
  return marked.parse(input, { async: false }) as string
}

function jsonLdFaq(landing: Landing): string {
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

export function LandingPage({ slug: slugProp }: { slug?: string }) {
  const params = useParams<{ slug: string }>()
  const slug = slugProp ?? params.slug
  const landing = LANDINGS.find((l) => l.slug === slug)

  if (!landing) {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-[var(--ic-ink-3)]">
          The landing <code>{slug}</code> doesn't exist.
        </p>
        <Link to="/" className="mt-6 inline-block text-[var(--ic-accent)] underline">
          Back to home
        </Link>
      </main>
    )
  }

  const canonical = `${SITE_URL}/${landing.slug}/`
  const ctaHref = `/studio?preset=${landing.ctaPresetId}`

  return (
    <>
      <Head>
        <title>{landing.title}</title>
        <meta name="description" content={landing.metaDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={landing.title} />
        <meta property="og:description" content={landing.metaDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE_URL}/og.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={landing.title} />
        <meta name="twitter:description" content={landing.metaDescription} />
        <meta name="twitter:image" content={`${SITE_URL}/og.png`} />
        {landing.faq?.length ? (
          <script type="application/ld+json">{jsonLdFaq(landing)}</script>
        ) : null}
      </Head>

      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <NavBar />

        <main className="mx-auto w-full max-w-[760px] flex-1 px-6 py-12">
          <h1 className="text-[clamp(32px,4vw,48px)] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--ic-ink)]">
            {landing.h1}
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-[var(--ic-ink-2)]">{landing.intro}</p>

          <div className="mt-8">
            <Link
              to={ctaHref}
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
              to="/"
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
