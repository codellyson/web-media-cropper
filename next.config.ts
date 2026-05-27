import type { NextConfig } from 'next'

// Cross-origin isolation only on /studio/* — required by ffmpeg-wasm's MT core
// (SharedArrayBuffer needs the page to be cross-origin-isolated, which only
// happens when COOP: same-origin + COEP: require-corp are on the document).
// Subresources from assets.kreativekorna.com need CORP: cross-origin set at
// the CDN level (Cloudflare Transform Rule); same-origin assets from /_next/*
// inherit COEP from the document automatically.
const ISOLATION_HEADERS = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
]

// Generic security/policy headers — moved here from vercel.json so the config
// lives next to the framework that owns it. Applied to every route.
const BASE_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'interest-cohort=()' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/:path*', headers: BASE_HEADERS },
      { source: '/studio', headers: ISOLATION_HEADERS },
      { source: '/studio/:path*', headers: ISOLATION_HEADERS },
      { source: '/batch', headers: ISOLATION_HEADERS },
      { source: '/batch/:path*', headers: ISOLATION_HEADERS },
    ]
  },
}

export default nextConfig
