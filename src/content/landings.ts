export type LandingFaq = { q: string; a: string }

export type LandingSection = {
  heading: string
  /** Markdown. Rendered at build time via `marked`. */
  body: string
}

export type Landing = {
  /** URL slug — will be served at /<slug>/ */
  slug: string
  /** <title> tag (also used as OG title) */
  title: string
  /** meta description + og:description + twitter:description */
  metaDescription: string
  /** On-page H1 */
  h1: string
  /** Lead paragraph under the H1 */
  intro: string
  /** Preset ID from src/lib/presets.ts — the CTA links to /?preset=<id> */
  ctaPresetId: string
  /** CTA button text */
  ctaLabel: string
  /** Long-form content sections */
  sections?: LandingSection[]
  /** FAQ block — rendered into <details> and also into a JSON-LD FAQPage schema */
  faq?: LandingFaq[]
}

/**
 * Landing pages are generated as static HTML by scripts/gen-landings.ts.
 * Each entry becomes dist/<slug>/index.html — JS-free, inline CSS, fast LCP.
 *
 * Bar for a page to live here: roughly 800+ words of real content, current
 * spec sourced from the platform, at least 3 FAQs. Anything thinner won't
 * rank and dilutes the domain's topical authority.
 *
 * The YouTube entry below is a starter so the pipeline generates something
 * end-to-end. Its sections are explicitly placeholder — replace them before
 * this page is used for real SEO.
 */
export const LANDINGS: Landing[] = [
  {
    slug: 'youtube-thumbnail',
    title: 'YouTube Thumbnail Generator — crop any image to 1280×720, in your browser',
    metaDescription:
      'Free YouTube thumbnail cropper. Drop an image, get the exact 1280×720 (16:9) size YouTube wants. Smart face-aware crop. Nothing uploaded.',
    h1: 'Crop any image to a YouTube thumbnail.',
    intro:
      'YouTube wants thumbnails at 1280×720 pixels — 16:9 aspect ratio, minimum 640 wide, under 2 MB. Drop an image, get the exact size. Nothing uploaded.',
    ctaPresetId: 'yt-thumbnail',
    ctaLabel: 'Open the thumbnail cropper',
    sections: [
      {
        heading: 'Placeholder section — replace this with real content.',
        body:
          '**This is a starter entry** so the generator has something to build. Replace the ' +
          '`sections` and add more `faq` items before relying on this page for SEO. ' +
          'Body is markdown: `**bold**`, `[links](https://example.com)`, lists, code, all work.\n\n' +
          'Worth covering: the current official spec (with source), common mistakes (file too big, ' +
          'wrong aspect on re-upload), thumbnail best practices (face zoom, contrast, text legibility ' +
          'at small sizes), and a concrete example walkthrough.',
      },
    ],
    faq: [
      {
        q: 'What size is a YouTube thumbnail?',
        a: 'YouTube recommends **1280×720 pixels** in a 16:9 aspect ratio, minimum 640 pixels wide. The file must be under 2 MB and in JPG, GIF, or PNG format.',
      },
      {
        q: 'Does YouTube re-crop my thumbnail?',
        a: 'YouTube may letterbox or crop if your image is not 16:9. Submitting at 1280×720 exactly avoids any surprises.',
      },
    ],
  },
]
