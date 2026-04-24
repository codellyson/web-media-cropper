import { marked } from 'marked'
import type { Landing } from '../src/content/landings'

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function md(input: string): string {
  return marked.parse(input, { async: false }) as string
}

function mdToPlain(input: string): string {
  return md(input)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const INLINE_CSS = `
*,*::before,*::after { box-sizing: border-box; }
html,body { margin: 0; padding: 0; }
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #0a0a0a; --muted: #737373; --border: #e5e5e5;
  --card: #fafafa; --accent: #0a0a0a; --accent-fg: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0a0a0a; --fg: #fafafa; --muted: #a3a3a3; --border: #262626;
    --card: #171717; --accent: #fafafa; --accent-fg: #0a0a0a;
  }
}
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg); background: var(--bg);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
a { color: inherit; }
.container { max-width: 720px; margin: 0 auto; padding: 0 1.25rem; }
header { border-bottom: 1px solid var(--border); }
header .container { display: flex; align-items: center; justify-content: space-between; padding-block: 0.875rem; }
header a { text-decoration: none; font-weight: 500; font-size: 0.875rem; letter-spacing: -0.01em; }
header .hint { color: var(--muted); font-size: 0.75rem; }
main { padding-block: 3rem 4rem; }
h1 { font-size: clamp(2rem, 4.5vw, 3rem); font-weight: 600; letter-spacing: -0.025em; line-height: 1.1; margin: 0 0 1rem; text-wrap: balance; }
.lead { font-size: 1.125rem; color: var(--muted); margin: 0 0 2rem; max-width: 60ch; text-wrap: pretty; }
.cta {
  display: inline-flex; align-items: center; gap: 0.5rem;
  background: var(--accent); color: var(--accent-fg);
  padding: 0.625rem 1rem; border-radius: 0.5rem;
  text-decoration: none; font-weight: 500; font-size: 0.875rem;
  transition: opacity 120ms ease;
}
.cta:hover { opacity: 0.88; }
.cta + .meta { margin-top: 0.625rem; color: var(--muted); font-size: 0.75rem; }
section { margin-top: 3rem; }
section h2 { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.015em; margin: 0 0 0.75rem; }
section p { margin: 0 0 1rem; }
section ul, section ol { margin: 0 0 1rem; padding-left: 1.25rem; }
section li { margin-bottom: 0.25rem; }
section code { background: var(--card); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875em; }
.faq { margin-top: 3rem; }
.faq h2 { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.015em; margin: 0 0 1.25rem; }
.faq details { border-top: 1px solid var(--border); padding: 1rem 0; }
.faq details:last-child { border-bottom: 1px solid var(--border); }
.faq summary { font-weight: 500; cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary::after { content: '+'; font-weight: 400; color: var(--muted); transition: transform 120ms ease; }
.faq details[open] summary::after { transform: rotate(45deg); }
.faq details[open] summary { margin-bottom: 0.75rem; }
.faq .answer p { margin: 0 0 0.5rem; }
footer { border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; margin-top: 4rem; }
footer .container { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; padding-block: 1.25rem; }
`

export function renderLandingHtml(landing: Landing, siteUrl: string | null): string {
  const canonical = siteUrl ? `${siteUrl}/${landing.slug}/` : `/${landing.slug}/`
  const ctaHref = `/?preset=${encodeURIComponent(landing.ctaPresetId)}`

  const sectionsHtml = (landing.sections ?? [])
    .map(
      (s) =>
        `<section><h2>${esc(s.heading)}</h2>${md(s.body)}</section>`,
    )
    .join('\n')

  const faqHtml =
    landing.faq && landing.faq.length > 0
      ? `<section class="faq"><h2>FAQ</h2>${landing.faq
          .map(
            (f) =>
              `<details><summary>${esc(f.q)}</summary><div class="answer">${md(f.a)}</div></details>`,
          )
          .join('')}</section>`
      : ''

  const jsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: landing.title,
      description: landing.metaDescription,
      url: canonical,
    },
  ]
  if (landing.faq && landing.faq.length > 0) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: landing.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: mdToPlain(f.a) },
      })),
    })
  }

  const jsonLdBlock = jsonLd
    .map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(landing.title)}</title>
<meta name="description" content="${esc(landing.metaDescription)}" />
<meta name="theme-color" content="#0a0a0a" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />

<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(landing.title)}" />
<meta property="og:description" content="${esc(landing.metaDescription)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="/og.png" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(landing.title)}" />
<meta name="twitter:description" content="${esc(landing.metaDescription)}" />
<meta name="twitter:image" content="/og.png" />

${jsonLdBlock}

<style>${INLINE_CSS}</style>
</head>
<body>
<header>
  <div class="container">
    <a href="/">web-media-cropper</a>
    <span class="hint">100% in your browser — no upload</span>
  </div>
</header>

<main>
  <div class="container">
    <h1>${esc(landing.h1)}</h1>
    <p class="lead">${esc(landing.intro)}</p>
    <a class="cta" href="${esc(ctaHref)}">${esc(landing.ctaLabel)} →</a>
    <p class="meta">Free. No account. Nothing uploaded.</p>

    ${sectionsHtml}
    ${faqHtml}
  </div>
</main>

<footer>
  <div class="container">
    <span>Runs entirely in your browser. No upload, no tracking.</span>
    <span><a href="/">web-media-cropper</a></span>
  </div>
</footer>
</body>
</html>
`
}
