# Execution Phases — web-media-cropper

Each phase is a shippable increment. If a phase exceeds its "done means" scope, cut — don't bloat. North star: drop → preset click → download, under 10 seconds, fully client-side.

## Phase 0 — Repo setup
Vite + React + TS + Tailwind v4 + shadcn/ui. Prettier + ESLint. Git init. Deploy target: Cloudflare Pages or Vercel.

**Done means:** `pnpm run dev` opens a styled shell. Push to main auto-deploys.

## Phase 1 — Skeleton flow (center-crop only)
The pipeline end-to-end, no intelligence yet.

- Dropzone: drag-drop, paste, file-picker
- Load image → `HTMLImageElement` with EXIF orientation honored
- Center-crop at a single hardcoded aspect (16:9)
- Canvas preview + download as PNG

**Done means:** drop an image, get a 16:9 PNG out. That's it.

## Phase 2 — Presets + dimensions (today's YouTube pain solved)
First version you'd actually use.

- Preset catalog: YouTube first (thumbnail 1280×720, Shorts 1080×1920, banner 2560×1440), then X, Instagram, LinkedIn, TikTok, OG / Twitter Card
- `PresetPicker` grouped by platform
- `CustomSizeInput` with smart parser: `1080x1350`, `1080×1350`, `1080 1350`, `1080, 1350`, `4:5 at 1080 wide`
- Output format (PNG / JPG) + quality slider

**Done means:** the YouTube situation that started this project is now a 10-second task.

## Phase 3 — Smart crop (the magic)
- `react-easy-crop` with an always-visible, draggable focal-point marker
- MediaPipe face detection: auto-center on faces when present
- U²-Net (or comparable) saliency model for non-face images
- Both models lazy-loaded in a Web Worker after first interaction — cold start stays instant

**Done means:** drop a screenshot, the UI focus is auto-centered. Drop a selfie, the face is. User can always drag to override.

## Phase 4 — Input breadth & output craft
- HEIC input via `libheif.js` (wasm) — iPhone users work directly
- AVIF / WebP input and output
- Lanczos resampling on downscale (not browser-default bilinear)
- EXIF stripped by default (privacy); toggle to preserve
- Live output file-size estimate

**Done means:** iPhone users drop HEIC with no conversion step. Output quality visibly beats every other free web cropper.

## Phase 5 — Performance & polish
- `OffscreenCanvas` + Web Worker pipeline — UI never jitters
- WebCodecs where supported
- Progressive downsampling for 50MB+ images so Safari doesn't OOM
- Keyboard: Enter applies, number keys jump presets, ⌘Z undoes focal point
- Dark mode (designed, not auto-inverted)
- PWA: installable, offline-ready
- Accessibility pass (keyboard nav, screen-reader labels)

**Done means:** smooth on an old MacBook Air and on mobile Safari. Installable.

## Phase 6 — Launch
- Landing page: <1s LCP, hero renders with zero JS
- SEO sub-pages per platform — `/youtube-thumbnail`, `/og-image`, `/instagram-post`, etc. Each ranks independently and funnels into the app.
- Honest "How it works" section leading with *your images never leave your browser*
- Plausible (privacy-respecting) analytics, or none
- Product Hunt / HN / X launch

**Done means:** live, fast, findable.

---

## After v1

- **Video.** Real v2 — you hit the pain today, so not speculative. WebCodecs + ffmpeg.wasm.
- **Batch mode.** Drop N images, get a zip of every preset. Build only if the requests show up.
