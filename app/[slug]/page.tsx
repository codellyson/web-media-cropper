import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LANDINGS } from '@/content/landings'
import { LandingPage, landingBySlug, landingCanonical } from '@/landing/LandingPage'

// Build-time only — every slug listed in src/content/landings.ts becomes a
// statically-rendered HTML page. `dynamicParams: false` ensures any URL not
// in this list 404s instead of being lazily generated.
export async function generateStaticParams() {
  return LANDINGS.map((l) => ({ slug: l.slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const landing = landingBySlug(slug)
  if (!landing) return { title: 'Not found' }
  const canonical = landingCanonical(slug)
  const ogImage = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wmc.kreativekorna.com'}/og.png`
  return {
    title: landing.title,
    description: landing.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      url: canonical,
      title: landing.title,
      description: landing.metaDescription,
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: landing.title,
      description: landing.metaDescription,
      images: [ogImage],
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!landingBySlug(slug)) notFound()
  return <LandingPage slug={slug} />
}
