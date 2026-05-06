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

## Phase 7 — Editor UI adoption

Pull the editor mockup's chrome (titlebar, ratio-icon format rail, checker canvas, tracker overlay, right-rail sliders) into the actual cropper. The marketing-page editor and the tool become visually the same thing — what you see on the landing is what you use.

Three sub-phases. Each ships independently and leaves the cropper in a working state.

### 7.1 — Shell + format rail

Replace the cropper's chrome without changing any behavior. Old `PresetPicker` retired.

- Editor titlebar: traffic lights, file label, share/⋯ icons.
- Toolbar with single visible tool ("Frame"). Placeholders for Magic / Track / Captions / Audio stay hidden until they mean something.
- Three-column body: `[left rail | canvas | right rail]`. Right rail can be empty for now.
- Left rail: format list with the mockup's ratio icons (9:16 narrow, 4:5 medium, 1:1 square, 16:9 wide), active indicator bar, dimensions in mono.
- `CustomSizeInput` relocates below the format list.
- Canvas: checker pattern background, floating dims badge top-left, zoom badge top-right (display only — no real zoom yet).
- `CropStage` (`react-easy-crop`) stays inside the canvas. `ExportBar` stays below temporarily.

**Done means:** the cropper looks like the landing-page editor. Every existing function still works (preset select, custom dims, crop, format/quality, download).

### 7.2 — Tracker overlay

Wire MediaPipe's real face bbox to the pulsing tracker visual. The "smart" claim becomes visible.

- Detected face → `SUBJECT · NN%` box overlaid on the source image, transitions when re-detected.
- No face detected → variance-based focal point shown as a smaller targeting reticle (different visual, honest about confidence).
- Layers panel in left rail with one toggle: "Subject tracker" on/off.
- Tracker box does not interfere with `react-easy-crop` drag handles.

**Done means:** drop a portrait, see the face tracked with a confidence percentage. Drop a screenshot, see the focal-point reticle. Toggling the layer hides/shows it cleanly.

### 7.3 — Right rail + retire ExportBar

Move all output controls into a polished right rail. Add real subject-aware controls.

- **Subject lock** slider — biases the auto-crop box to keep the detected subject closer to centered (high lock = strict centering, low lock = honor the source aspect more).
- **Padding** slider — margin around the detected subject before the crop frame snaps.
- **Hold on faces** toggle — prefer face detection over variance even when face confidence is mid-range.
- **Output**: format selector (PNG / JPG / WebP) and quality slider, in the rail.
- **Download** CTA at the bottom of the rail (replaces `ExportBar`).
- Sliders re-compute the crop box in real time as the user drags.

**Done means:** every control in the right rail does something user-visible on the canvas. `ExportBar` deleted.

---

## Phase 8 — Image compression (image toolkit, second tool)

First non-cropping tool. Reuses the worker pipeline + encoders already in place; new UI surface.

- Separate route / mode: drop → set target → download. No preset picker, no crop UI.
- Two target modes: **quality** (slider, like today) and **target size** (e.g. "≤ 500 kB"). Target-size mode binary-searches quality in the worker.
- Format passthrough by default; opt-in re-encode to WebP / AVIF for size wins.
- Show before/after byte count and % saved. Strip EXIF on by default, toggle to preserve.

**Done means:** drop a 6 MB photo, ask for ≤ 500 kB, get a visually-equivalent file out.

---

## Phase 9 — Video toolkit

Sub-phased like Phase 7. Each sub-phase ships independently and leaves the app in a working state.

### 9.1 — Video loading + native preview

Drop a video, see it. No ffmpeg yet. Proves the routing and shell.

- `useMediaSource` hook (refactored from `useImageSource`) returns a discriminated state: `image | video`.
- Video files (mp4/mov/webm) detected at drop, loaded into a native `<video>` element.
- New `VideoView` component using `EditorShell` with a video-specific toolbar (Trim / Frame / Crop / Compress, all stubbed).
- Canvas: native `<video>` with default controls inside the same shadowed preview frame as the image canvas.
- Metadata sidebar: duration, source dims, container/codec heuristic.

**Done means:** drop an mp4, see a native preview running in the editor shell. No editing yet.

### 9.2 — ffmpeg.wasm integration + frame extractor

Wire up the engine, ship the simplest exporting feature first.

- Lazy-load `ffmpeg.wasm` on first export action ("Loading video engine…" pill).
- Frame extractor: scrubber sets a timestamp, "Extract frame" runs `ffmpeg -ss <t> -frames:v 1` and downloads a PNG at native resolution.
- Arrow keys step ±1 frame at the source frame rate (read via `requestVideoFrameCallback` if available, else `currentTime` deltas as fallback).

**Done means:** scrub to any moment, export pixel-accurate PNG.

### 9.3 — Trimmer (lossless)

The signature feature: lossless near-instant cuts.

- Two-handle scrubbable timeline (in/out).
- Export via `ffmpeg -ss IN -to OUT -c copy out.mp4` — no re-encode.
- Snap visualization: in/out points snap to nearest keyframe, UI shows the snapped boundary.
- "Frame-accurate trim" toggle hands off to the compression path (re-encode).

**Done means:** trim a 30s segment from a 10-minute clip in ~1s, lossless.

### 9.4 — Compression + presets + crop

Re-encode pipeline. Platform presets land here.

- Crop UI: `react-easy-crop` on a paused frame; applied via `-vf crop=W:H:X:Y` at export.
- Target-size compression: CRF sweep (~3 passes max) until size lands.
- Target-format compression: explicit codec + bitrate.
- Platform presets: YouTube 1080p (H.264 ~8 Mbps), Shorts/Reels/TikTok (9:16 1080×1920), X (1080p H.264, 2:20 cap), LinkedIn (16:9 1080p).
- Audio: passthrough re-mux by default; AAC re-encode only when forced by container/codec change.
- Progress: parse ffmpeg stderr for `time=` → live progress bar. Cancellable.

**Done means:** drop a phone clip, pick "Instagram Reel," get a file Instagram won't reject. Drop a 4K screen recording, pick "Twitter," size lands under 512 MB without manual fiddling.

---

The full v2 surface in one ship. Reuses worker + dropzone + preset patterns from the image side.

**Engine.** `ffmpeg.wasm` only. One engine handles every feature: lossless trim (`-c copy`), accurate frame extraction (`-ss <time> -frames:v 1`), crop (`-vf crop=...`), compression (CRF / bitrate), audio re-mux. Lazy-loaded on first video drop so first-paint stays fast. WebCodecs reserved as a later perf optimization if encode speed becomes the user complaint — not v1.

**UX.** Native `<video>` for preview and scrubbing — instant, GPU-accelerated, zero ffmpeg cost. ffmpeg only runs at export.

**Features.**

- **Load** `.mp4` / `.mov` / `.webm`. Preview via `<video>` element.
- **Frame extractor (accurate):** ffmpeg seeks to exact timestamp, exports a single PNG at native resolution. Arrow keys step ±1 frame at the source frame rate.
- **Trimmer:** scrubbable timeline, in/out handles. `-c copy` for lossless bitstream copy — near-instant, no quality loss. Cuts snap to nearest keyframe; UI shows the snapped boundary so the user isn't surprised.
- **Cropping:** `react-easy-crop`-style stage on a paused frame; applied to every frame at encode time via `-vf crop`.
- **Compression:** target-size mode (CRF sweep until file size lands) and target-format mode (H.264 / VP9 / AV1).
- **Platform presets:** YouTube 1080p (H.264, ~8 Mbps), YouTube Shorts (9:16, 1080×1920), X (≤ 2:20, 1080p, H.264), Instagram Reels (9:16, ≤ 60s), TikTok (9:16, ≤ 60s, H.264), LinkedIn (16:9, 1080p).
- Audio: re-mux passthrough by default; re-encode AAC only when target format requires it.
- Progress: live ffmpeg log → progress bar. Cancellable.

**Done means:** drop a 4K MP4 → trim a 30s clip losslessly in ~1s. Drop a phone clip → pick "Instagram Reel" → get a file Instagram won't reject. Scrub to one frame and export it pixel-accurate.

---

## After v2

- **Batch mode** (image and video): drop N files, get a zip of every preset.
- **Audio extraction / replacement** for video.
- **GIF export** from video selection.
