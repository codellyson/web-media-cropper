import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANDINGS } from '../src/content/landings'
import { renderLandingHtml } from './landing-template'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

const DEFAULT_SITE_URL = 'https://cropper.kreativekorna.com'
const RAW_SITE_URL = process.env.SITE_URL?.trim() || DEFAULT_SITE_URL
const SITE_URL = RAW_SITE_URL.replace(/\/+$/, '')

async function ensureDist() {
  try {
    await fs.access(DIST)
  } catch {
    throw new Error(
      `dist/ not found at ${DIST}. Run \`vite build\` before this script.`,
    )
  }
}

async function writeLanding(slug: string, html: string) {
  const dir = path.join(DIST, slug)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8')
}

async function writeSitemap() {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>']
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  const today = new Date().toISOString().slice(0, 10)

  const rootLoc = SITE_URL ? `${SITE_URL}/` : '/'
  lines.push(`  <url><loc>${rootLoc}</loc><lastmod>${today}</lastmod></url>`)
  for (const landing of LANDINGS) {
    const loc = SITE_URL ? `${SITE_URL}/${landing.slug}/` : `/${landing.slug}/`
    lines.push(`  <url><loc>${loc}</loc><lastmod>${today}</lastmod></url>`)
  }
  lines.push('</urlset>')
  await fs.writeFile(path.join(DIST, 'sitemap.xml'), lines.join('\n') + '\n', 'utf8')
}

async function main() {
  await ensureDist()

  if (LANDINGS.length === 0) {
    console.log('[gen-landings] No landings defined — skipping.')
    await writeSitemap()
    return
  }

  console.log(`[gen-landings] using SITE_URL=${SITE_URL}`)

  for (const landing of LANDINGS) {
    const html = renderLandingHtml(landing, SITE_URL)
    await writeLanding(landing.slug, html)
    console.log(`[gen-landings] wrote dist/${landing.slug}/index.html`)
  }
  await writeSitemap()
  console.log(`[gen-landings] wrote dist/sitemap.xml (${LANDINGS.length + 1} urls)`)
}

main().catch((err) => {
  console.error('[gen-landings] failed:', err)
  process.exit(1)
})
