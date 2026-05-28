import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wmc.kreativekorna.com'
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? ''

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'WMC | Crop once, post everywhere',
    template: '%s · WMC',
  },
  description:
    'Drop a clip or image — WMC reframes it for TikTok, Reels, Shorts, Feed, YouTube and X with subject-aware cropping. In your browser, no upload.',
  applicationName: 'WMC',
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    title: 'WMC | Crop once, post everywhere — every platform, one file',
    description:
      'Drop a clip or image — WMC reframes it for TikTok, Reels, Shorts, Feed, YouTube and X. In your browser, no upload.',
    images: [`${SITE_URL}/og.png`],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WMC | Crop once, post everywhere — every platform, one file',
    description:
      'Drop a clip or image — WMC reframes it for every platform. In your browser, no upload.',
    images: [`${SITE_URL}/og.png`],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply persisted theme before paint to prevent FOUC. Mirrors
            src/hooks/useTheme.ts STORAGE_KEY. */}
        <Script id="theme-preboot" strategy="beforeInteractive">{`
          try {
            var t = localStorage.getItem('wmc:theme')
            if (t !== 'light' && t !== 'dark') {
              t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
            }
            if (t === 'dark') document.documentElement.classList.add('dark')
          } catch (e) {}
        `}</Script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {GA_ID ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga-init" strategy="afterInteractive">{`
              window.dataLayer = window.dataLayer || []
              function gtag(){dataLayer.push(arguments)}
              gtag('js', new Date())
              gtag('config', '${GA_ID}')
            `}</Script>
          </>
        ) : null}
      </body>
    </html>
  )
}
