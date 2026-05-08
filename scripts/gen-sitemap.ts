import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LANDINGS } from '../src/content/landings'

const SITE_URL = (process.env.VITE_SITE_URL ?? 'https://wmc.kreativekorna.com').replace(/\/$/, '')

const paths = ['/', ...LANDINGS.map((l) => `/${l.slug}/`)]

const today = new Date().toISOString().slice(0, 10)

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths
  .map(
    (p) =>
      `  <url><loc>${SITE_URL}${p}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>`,
  )
  .join('\n')}
</urlset>
`

const out = resolve(process.cwd(), 'dist', 'sitemap.xml')
writeFileSync(out, xml, 'utf8')
console.log(`[gen-sitemap] wrote ${out} (${paths.length} urls)`)
