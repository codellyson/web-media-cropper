import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

// Dev-only fallback: serves the @ffmpeg/core-mt ESM bundle straight from
// node_modules so we don't need the CDN to be reachable to test MT locally.
// In prod, ffmpegEngine.ts swaps to the CDN URL (assets.kreativekorna.com)
// and this route handler isn't hit because the URL is absolute.
const ALLOWED = new Set(['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'])
const MT_DIR = path.resolve(process.cwd(), 'node_modules/@ffmpeg/core-mt/dist/esm')

type RouteContext = { params: Promise<{ file: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { file } = await params
  if (!ALLOWED.has(file)) return new NextResponse('Not found', { status: 404 })
  try {
    const data = await fs.readFile(path.join(MT_DIR, file))
    const contentType = file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        // Same-origin assets inherit COEP from the document, but the worker
        // bootstrap is strict about COEP being explicit on the response.
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
