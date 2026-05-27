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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/studio', headers: ISOLATION_HEADERS },
      { source: '/studio/:path*', headers: ISOLATION_HEADERS },
      { source: '/batch', headers: ISOLATION_HEADERS },
      { source: '/batch/:path*', headers: ISOLATION_HEADERS },
    ]
  },
}

export default nextConfig
