import type { MetadataRoute } from 'next'
import { LANDINGS } from '@/content/landings'

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wmc.kreativekorna.com'
).replace(/\/$/, '')

// Next.js renders this to /sitemap.xml at build time. Lists the landing
// route plus every per-platform SEO landing under src/content/landings.ts.
// Studio routes are intentionally omitted — they're app surfaces, not
// indexable content.
export default function sitemap(): MetadataRoute.Sitemap {
  const today = new Date()
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: today,
      changeFrequency: 'weekly',
    },
    ...LANDINGS.map((l) => ({
      url: `${SITE_URL}/${l.slug}/`,
      lastModified: today,
      changeFrequency: 'weekly' as const,
    })),
  ]
}
