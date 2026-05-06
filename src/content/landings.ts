
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
        heading: 'The exact size YouTube wants',
        body:
          'YouTube\'s spec for custom thumbnails is narrow:\n\n' +
          '- **1280×720 pixels** — 16:9 aspect ratio, the same shape as the player.\n' +
          '- **Minimum width 640 pixels.** Smaller uploads get rejected.\n' +
          '- **Under 2 MB.** Anything bigger fails to attach.\n' +
          '- **JPG, PNG, GIF, or BMP.** WebP and AVIF are not accepted.\n\n' +
          'Source: [YouTube Help — Custom thumbnails](https://support.google.com/youtube/answer/72431).\n\n' +
          'The 1280-wide cap means there\'s no benefit to uploading a 4K still — YouTube downscales server-side using its default resampler. Pre-cropping at exactly 1280×720 keeps you in control of the resampling quality and stays under the 2 MB limit comfortably for most photos.',
      },
      {
        heading: 'Common mistakes',
        body:
          '**Wrong aspect, ugly letterbox.** Uploading a 1080×1080 square (Instagram cover screenshot, designer mockup) gets center-cropped to 16:9 — top and bottom of your subject vanish. The thumbnail you actually wanted is gone before it ever rendered.\n\n' +
          '**Subject too small.** Thumbnails render at ~120 wide in the suggested-videos rail and ~246 wide on mobile. If a face is below 25% of the thumbnail height, it disappears at thumbnail size. Fill the frame.\n\n' +
          '**Tiny text.** At 120 wide, anything under 60-70 pixels of headline height is illegible. If your text is "readable on desktop preview," it\'s probably already too small for the rail.\n\n' +
          '**Upload over 2 MB.** Photo-quality 1280×720 JPG comes in around 200-400 KB. If you\'re hitting 2 MB, you\'re saving uncompressed PNG of a photograph — switch to JPG.',
      },
      {
        heading: 'Best practices for thumbnails that get clicked',
        body:
          '**Face zoom.** Single subject, eyes near the rule-of-thirds line, framed shoulder-up or chest-up. Face fills 30-45% of the frame.\n\n' +
          '**High contrast.** Light subject on dark background, or vice versa. Avoid mid-tone backgrounds — they wash out in the rail.\n\n' +
          '**Title overlap, not duplication.** Your video title sits next to the thumbnail in most surfaces. The thumbnail text should add — an emotion, a number, a counterpoint — not repeat the title.\n\n' +
          '**Test at 120 wide.** Resize the thumbnail to 120 pixels wide on your desk and ask if you can still tell what it is. If not, simplify.',
      },
      {
        heading: 'Walkthrough: cropping a 4032×3024 phone photo',
        body:
          '1. **Drop the photo in.** It loads locally — no server round-trip.\n' +
          '2. **Pick the YouTube preset** (1280×720, 16:9). The crop box auto-centers on the detected face.\n' +
          '3. **Drag to fine-tune.** Pull the box up if you want headroom; pull down to zoom into the subject.\n' +
          '4. **Pick JPG, quality 85-90.** Comes out around 250 KB for a typical photo.\n' +
          '5. **Download.** Drag the file straight into YouTube\'s thumbnail upload.\n\n' +
          'Total time: under 30 seconds for a single thumbnail. The file never leaves your device.',
      },
    ],
    faq: [
      {
        q: 'What size is a YouTube thumbnail?',
        a: 'YouTube recommends **1280×720 pixels** in a 16:9 aspect ratio, minimum 640 pixels wide. The file must be under 2 MB and in JPG, PNG, GIF, or BMP format.',
      },
      {
        q: 'Does YouTube re-crop my thumbnail?',
        a: 'YouTube may letterbox or crop if your image is not 16:9. Submitting at 1280×720 exactly avoids any surprises and keeps the resampling under your control.',
      },
      {
        q: 'Why does YouTube reject my thumbnail?',
        a: 'Three usual reasons: file is over 2 MB, format is WebP or AVIF (neither supported), or width is below 640 pixels. Saving as JPG at 1280×720 with quality 85 lands inside all three limits.',
      },
      {
        q: 'Can I use a screenshot from my video as the thumbnail?',
        a: 'Yes — drop the screenshot in, pick the 1280×720 preset, and the crop will auto-center on the most visually salient region. Drag to reframe if the auto-pick missed the moment you wanted.',
      },
    ],
  },
  {
    slug: 'instagram-post',
    title: 'Instagram Post Cropper — 1080×1080 square in your browser',
    metaDescription:
      'Free Instagram post cropper. Drop an image, get the exact 1080×1080 (1:1) square Instagram wants for the feed. Face-aware crop. Nothing uploaded.',
    h1: 'Crop any image to an Instagram post.',
    intro:
      'Instagram\'s feed is built around three crop sizes: a 1:1 square, a 4:5 portrait, and a 1.91:1 landscape. Drop an image, get the exact pixels Instagram wants. Nothing leaves your browser.',
    ctaPresetId: 'ig-square',
    ctaLabel: 'Open the Instagram cropper',
    sections: [
      {
        heading: 'The exact sizes Instagram uses for feed posts',
        body:
          'Instagram supports three image aspects in the feed, and the app re-crops anything that does not match. Here are the working sizes:\n\n' +
          '- **Square (1:1) — 1080×1080.** Safe default. Always renders edge-to-edge in the grid and the feed.\n' +
          '- **Portrait (4:5) — 1080×1350.** Tallest image Instagram allows in the feed. Takes up more screen, often gets more attention.\n' +
          '- **Landscape (1.91:1) — 1080×566.** The widest the feed accepts. Anything wider gets letterboxed or cropped.\n\n' +
          'Instagram caps the **stored** image at 1080 pixels wide. Uploading larger does not give you sharper output — Instagram downscales server-side. Match the target exactly and you skip a re-encode.\n\n' +
          'Source: Meta\'s [supported aspect ratios for feed](https://help.instagram.com/1631821640426723) doc, current as of the most recent update.',
      },
      {
        heading: 'Common mistakes',
        body:
          '**Wrong aspect, then surprise crop in the feed.** A 16:9 phone photo dropped into Instagram\'s 4:5 feed slot loses about 30% of the frame — usually the top and bottom. If the subject is off-center, faces or text disappear. Crop *before* upload so you control what stays.\n\n' +
          '**Uploading at full camera resolution.** A 4032×3024 iPhone shot gets downscaled to 1080 wide on Instagram\'s servers using their default resampler. You lose control over the resampling quality. Pre-cropping at 1080 means you pick the resampler.\n\n' +
          '**Forgetting the safe zone.** Instagram\'s grid view shows a center-cropped 1:1 thumbnail of every post, even portrait ones. If your subject is off-center in a 4:5 portrait, it will be cut off in the grid preview.\n\n' +
          '**Mixing aspects in a carousel.** Instagram locks the carousel to the aspect of the *first* image. If image 1 is square and image 2 is portrait, image 2 gets center-cropped to square. Decide the aspect before you build the carousel.',
      },
      {
        heading: 'How to crop without losing the subject',
        body:
          'Drop your image into the cropper and pick the Instagram preset that matches the slot you\'re posting to. The crop box auto-centers on the detected subject — a face for portraits, the visual focal point for screenshots and product photos. Drag the box if you want a different framing; the exported pixels match what you see.\n\n' +
          'A few practical defaults that work for most feed posts:\n\n' +
          '- **Square (1:1)** for product shots, quotes, and anything that needs to read in the grid.\n' +
          '- **Portrait (4:5)** for selfies, full-body shots, and anything where vertical space adds context. This is the highest-engagement aspect for most accounts because it takes up more screen.\n' +
          '- **Landscape (1.91:1)** for wide scenes — landscapes, group shots, screenshots — where cropping to square would cut something important.\n\n' +
          'When you export, the file lands at exactly 1080 wide, encoded as JPG or WebP. Under 200 KB for most photos, well below Instagram\'s 30 MB upload cap.',
      },
      {
        heading: 'Privacy: nothing leaves your browser',
        body:
          'Every image you drop in stays on your device. The crop runs in a Web Worker using the browser\'s built-in canvas APIs and Pica for high-quality resampling. No upload, no server, no analytics on the image itself. EXIF metadata is stripped from the output by default — useful when you don\'t want GPS coordinates riding along with your post.\n\n' +
          'You can verify this by opening DevTools  Network and watching as you crop. There are no requests.',
      },
    ],
    faq: [
      {
        q: 'What size is an Instagram post?',
        a: 'Instagram supports three sizes in the feed: **1080×1080** (1:1 square), **1080×1350** (4:5 portrait), and **1080×566** (1.91:1 landscape). The square is the safest default; the portrait gets the most screen real estate.',
      },
      {
        q: 'Why does Instagram crop my photo?',
        a: 'Instagram only accepts images between 1.91:1 and 4:5. Anything wider gets letterboxed; anything taller gets center-cropped. Pre-cropping to one of the three supported aspects avoids the surprise.',
      },
      {
        q: 'Does Instagram compress my image?',
        a: 'Yes. Instagram re-encodes any upload above 1080 pixels wide and applies its own JPEG quality. Uploading at exactly 1080×1080 (or 1080×1350) skips the resize step, so the only re-encode is Instagram\'s. The output looks visibly cleaner.',
      },
      {
        q: 'Will this work on my iPhone HEIC photos?',
        a: 'Yes. HEIC is decoded in-browser via libheif (wasm) — drop the file straight from your camera roll, no conversion step.',
      },
    ],
  },
  {
    slug: 'og-image',
    title: 'Open Graph Image Generator — 1200×630 og:image, in your browser',
    metaDescription:
      'Free Open Graph image cropper. Drop an image, get the exact 1200×630 (1.91:1) size used by Slack, iMessage, Twitter/X, LinkedIn, and Discord previews. Nothing uploaded.',
    h1: 'Crop any image to a 1200×630 og:image.',
    intro:
      'When someone pastes your link into Slack, iMessage, Twitter/X, LinkedIn, or Discord, they see the image you set in your `og:image` meta tag. Every one of those previews crops to 1.91:1 at 1200 wide. Drop an image, get the exact pixels.',
    ctaPresetId: 'og',
    ctaLabel: 'Open the og:image cropper',
    sections: [
      {
        heading: 'The size every link preview wants',
        body:
          'There is no single "Open Graph spec" — Facebook, Twitter, LinkedIn, Slack, and Discord all read `<meta property="og:image">` but each crops to its own aspect. The shape they all share is **1200×630 (1.91:1)**.\n\n' +
          '- **Facebook / Open Graph:** 1200×630 recommended, minimum 600×315. Source: [Facebook Sharing best practices](https://developers.facebook.com/docs/sharing/best-practices/#images).\n' +
          '- **Twitter / X (`summary_large_image`):** 1200×628 recommended, accepts 2:1.\n' +
          '- **LinkedIn:** 1200×627 (effectively 1.91:1).\n' +
          '- **Slack / iMessage / Discord:** read `og:image` and render at the source aspect, but crop to ~1.91:1 in their preview cards.\n\n' +
          'Submitting one 1200×630 image satisfies every one of those surfaces. File should be under 8 MB for the widest compatibility (Facebook\'s cap).',
      },
      {
        heading: 'Common mistakes',
        body:
          '**Square or portrait og:image.** A 1080×1080 source gets cropped to 1.91:1 by every consumer of `og:image` — top and bottom of the frame disappear. Cropping in advance keeps you in control.\n\n' +
          '**Subject in the corner.** Some platforms crop slightly differently (Twitter is closer to 2:1; LinkedIn is closer to 1.91:1). If your subject is dead-center, every crop renders correctly. If it\'s in the corner, one of the platforms will clip it.\n\n' +
          '**Text too small.** Link previews render at small sizes — typically 360-480 pixels wide on desktop, 320 on mobile. If your text fills less than ~10% of the image height, it disappears. Headline text should be 80-120 pixels tall in the source.\n\n' +
          '**Missing dimensions in the meta tag.** Specify `og:image:width` and `og:image:height` in your meta tags. Without them, Twitter Cards and Facebook may fall back to a smaller card style. Set both to 1200 and 630 respectively.',
      },
      {
        heading: 'Best practices',
        body:
          'A good `og:image` is a billboard, not a thumbnail. It needs to read at a glance in a feed where the user has not yet decided whether to click.\n\n' +
          '- **Headline first.** Most click-through comes from the og:image, not the title. Treat it like the title.\n' +
          '- **High contrast text.** Dark text on a light background (or vice versa) survives JPEG compression. Mid-tone gradients lose definition after the platform re-encode.\n' +
          '- **Center-safe.** Keep critical content within the central 1200×600 region. Outside edges may get cropped on some platforms.\n' +
          '- **JPG at 80-85% quality.** Lands around 150-300 KB for a typical photo+text image. Well under the 8 MB cap and faster to fetch on the link-preview crawler\'s timeout window (most crawlers give up after 5-10 seconds).',
      },
      {
        heading: 'Walkthrough: turning a screenshot into an og:image',
        body:
          '1. **Drop your screenshot in.** Whatever the source resolution.\n' +
          '2. **Pick the `og:image` preset** (1200×630). The crop auto-centers; drag if you want different framing.\n' +
          '3. **Pick JPG, 85% quality.** Most photo+text screenshots land around 200 KB.\n' +
          '4. **Download.** Drop into your `public/` directory.\n' +
          '5. **Set the meta tag:**\n\n' +
          '```html\n' +
          '<meta property="og:image" content="https://yoursite.com/og.jpg" />\n' +
          '<meta property="og:image:width" content="1200" />\n' +
          '<meta property="og:image:height" content="630" />\n' +
          '<meta name="twitter:card" content="summary_large_image" />\n' +
          '<meta name="twitter:image" content="https://yoursite.com/og.jpg" />\n' +
          '```\n\n' +
          '6. **Validate.** Run the URL through [Twitter Card Validator](https://cards-dev.twitter.com/validator) and [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) to confirm the preview renders right.',
      },
    ],
    faq: [
      {
        q: 'What size should an og:image be?',
        a: 'The shape every major preview uses is **1.91:1**. The recommended size is **1200×630 pixels** — Facebook\'s recommendation, and within Twitter\'s and LinkedIn\'s acceptable ranges.',
      },
      {
        q: 'Does Twitter use a different size?',
        a: 'Twitter\'s `summary_large_image` card prefers 1200×628 (closer to 2:1 than 1.91:1). The difference is two pixels in height — 1200×630 renders correctly on Twitter and on every other platform.',
      },
      {
        q: 'Why does my og:image not show up in Slack/iMessage?',
        a: 'Three usual reasons: the meta tag uses a relative URL (it must be absolute), the image is over 5 MB (some preview crawlers time out), or the image is behind authentication (the crawler can\'t fetch it). Using a `https://` absolute URL on a public path fixes all three.',
      },
      {
        q: 'Can I use the same image for og:image and twitter:image?',
        a: 'Yes. Both render at 1.91:1 at 1200 wide. Set both meta tags to the same URL — that\'s the standard pattern.',
      },
    ],
  },
  {
    slug: 'instagram-reel',
    title: 'Instagram Reel Cropper — 1080×1920 (9:16) in your browser',
    metaDescription:
      'Free Instagram Reel cropper. Drop a clip or image, get the exact 1080×1920 (9:16) Reels size. Subject-aware framing, safe zones, no upload.',
    h1: 'Crop any clip or image to an Instagram Reel.',
    intro:
      'Instagram Reels are 1080×1920 — a 9:16 portrait built for phone-vertical viewing. Drop a clip or image in, get the exact pixels, with the subject framed correctly for the Reel\'s safe zones.',
    ctaPresetId: 'ig-story',
    ctaLabel: 'Open the Reel cropper',
    sections: [
      {
        heading: 'The Reel size and the safe zones',
        body:
          'Instagram Reels render at **1080×1920 pixels**, 9:16 aspect ratio. That\'s the same shape as Stories, TikTok, and YouTube Shorts — submitting one clip at this size works across all four surfaces with only metadata differences.\n\n' +
          'But the *visible* area inside a Reel is smaller than the full 1080×1920. Two zones get covered by the Instagram UI:\n\n' +
          '- **Top ~250 px**: status bar + author handle + "Reel" label.\n' +
          '- **Bottom ~340 px**: caption + like/comment/share buttons + audio attribution.\n\n' +
          'That leaves roughly **1080×1330** in the safe-content zone, centered vertically. If your subject lands inside that band, it stays visible regardless of caption length or interaction overlays.\n\n' +
          'Source: [Meta — Reels best practices](https://creators.instagram.com/grow/reels) and Instagram\'s in-app Reels editor guidelines.',
      },
      {
        heading: 'Common mistakes',
        body:
          '**Subject at the bottom.** Anything in the bottom 340 pixels gets covered by the caption and interaction buttons. Faces, captions burned in, key text — all hidden behind UI chrome.\n\n' +
          '**Wrong source aspect.** Cropping a 16:9 horizontal clip to 9:16 means losing 75% of the frame width. If the subject was off-center horizontally, the auto-center crop will miss it. Pre-cropping with a subject-aware tool keeps the focal point centered.\n\n' +
          '**Sub-1080 width.** Instagram won\'t reject your upload at 720 wide, but it stores at the source resolution and re-renders for everyone — including high-DPI phones that show the loss. 1080 wide is the floor for sharp playback in 2025+.\n\n' +
          '**Letterboxing on a square video.** Posting a 1:1 video to Reels gives you black bars on top and bottom. The Reel still plays, but it looks lazy in the feed. Crop or pad with a designed background instead.',
      },
      {
        heading: 'Best practices',
        body:
          '**Subject in the upper-middle third.** Frame so the visual focal point sits between roughly 30% and 60% of the height — squarely in the safe zone, comfortably above the caption block.\n\n' +
          '**Hook in the first 1.5 seconds.** Reels autoplay muted, and the average viewer decides whether to keep watching in under 2 seconds. The thumbnail (which Instagram picks from the first frame by default) is half the battle — make frame 1 a strong frame.\n\n' +
          '**Burn-in captions.** Most Reels are watched muted. Burned-in captions in the safe zone (not the bottom UI overlay) read on every device. Position around 60-80% of the frame height.\n\n' +
          '**MP4 over MOV.** Instagram accepts both, but MP4 (H.264 + AAC) re-renders cleaner on their server-side encode. MOV often gets a quality hit in the conversion.',
      },
      {
        heading: 'Walkthrough: turning a 16:9 clip into a Reel',
        body:
          '1. **Drop the clip in.** A typical 16:9 horizontal clip from a phone or screen recording.\n' +
          '2. **Pick the Reel preset** (1080×1920, 9:16). The crop box auto-centers and maintains the 9:16 frame.\n' +
          '3. **Drag to reposition.** If the speaker is left of center, drag the crop right so they land in the middle of the Reel.\n' +
          '4. **Trim if needed.** Reels work best at 7-15 seconds for completion rate, up to 90 seconds for substance. Use the trim tool to cut the clip down before export.\n' +
          '5. **Export as MP4.** Audio is preserved without re-encoding, video re-encodes to H.264.\n' +
          '6. **Upload from the Instagram app.** Drop the file into the Reel composer and post.',
      },
    ],
    faq: [
      {
        q: 'What size is an Instagram Reel?',
        a: '**1080×1920 pixels** in a 9:16 portrait aspect ratio. The same size as Stories, TikTok, and YouTube Shorts.',
      },
      {
        q: 'Why does Instagram crop my Reel?',
        a: 'If your video isn\'t 9:16, Instagram center-crops to fit. Pre-cropping to 1080×1920 puts the subject exactly where you want it.',
      },
      {
        q: 'How long can a Reel be?',
        a: 'Up to 90 seconds in 2025+, though completion rate drops sharply after 30 seconds. The trim tool here lets you cut to the right length before export.',
      },
      {
        q: 'Can I crop a vertical phone video for a Reel?',
        a: 'Yes — most modern phones already shoot at 9:16 (1080×1920 or 1080×2340 with safe-area letterboxing). Drop it in and the preset matches your source aspect, so no content gets cropped.',
      },
    ],
  },
  {
    slug: 'x-post',
    title: 'X (Twitter) Image Cropper — 1600×900 (16:9) in your browser',
    metaDescription:
      'Free X / Twitter post image cropper. Drop an image, get the exact 16:9 size X uses for in-feed previews. Subject-aware crop, no upload.',
    h1: 'Crop any image for X (Twitter).',
    intro:
      'X crops every image attached to a post into a 16:9 preview in the timeline. Submitting at 1600×900 (or any 16:9 size) means the preview shows what you intended — not what X cropped to.',
    ctaPresetId: 'x-post',
    ctaLabel: 'Open the X cropper',
    sections: [
      {
        heading: 'How X handles attached images',
        body:
          'X displays attached images differently depending on context, but the in-feed preview is consistent: **16:9 aspect ratio**, cropped from the center if your source isn\'t already 16:9.\n\n' +
          'Common sizes that all map to 16:9:\n\n' +
          '- **1600×900** — recommended sweet spot for sharp display on desktop and mobile.\n' +
          '- **1200×675** — minimum for crisp display on retina screens.\n' +
          '- **800×450** — bare minimum; visibly soft on high-DPI devices.\n\n' +
          'X re-encodes uploads above ~5 MB and converts everything to JPEG (transparency in PNG uploads is replaced with black). Submitting at exactly 1600×900 JPG at 85% quality typically lands at 250-400 KB and skips re-encode.\n\n' +
          'Source: [X Help — Photos on X](https://help.twitter.com/en/using-x/x-photos).',
      },
      {
        heading: 'Common mistakes',
        body:
          '**Square images get cropped to 16:9.** A 1080×1080 Instagram-shaped image loses 30%+ of its height in the X timeline preview. Pre-cropping to 16:9 keeps the subject visible.\n\n' +
          '**Subject in the corner.** X expands to a higher aspect (closer to 5:4) when the user taps the image, but the *timeline preview* is always 16:9. If your subject was framed for the expanded view, it disappears in the preview.\n\n' +
          '**PNG with transparency.** X converts PNG to JPEG and replaces transparent pixels with black. If your design assumed a transparent background sitting on the X feed background, the result is a black box on every device.\n\n' +
          '**Multiple images, mixed aspects.** X shows a 4-image grid for the first four attached images. If they\'re mixed aspects, each gets cropped to a different shape inside the grid — looks chaotic. Standardize all four at 16:9 (or 1:1 for square grid mode).',
      },
      {
        heading: 'Best practices',
        body:
          '**16:9 if it\'s a photo or screenshot.** Photos crop cleanly to 16:9 since most cameras and phones shoot in similar aspect ratios. Screenshots fit fine if they have horizontal slack.\n\n' +
          '**Center-safe.** Critical content stays in the middle 1200×675 region. Outside that band, expect cropping in some viewer contexts.\n\n' +
          '**Text big enough for the preview.** The timeline preview is ~500-600 pixels wide on desktop, ~360 on mobile. Text under 60-70 pixels of headline height in the source becomes illegible at preview size.\n\n' +
          '**JPG at 85%.** Comes in around 200-350 KB for a typical 1600×900 image. Well below X\'s effective re-encode threshold and fast on a slow connection.',
      },
      {
        heading: 'Walkthrough: cropping a screenshot for an X post',
        body:
          '1. **Drop the screenshot in.** Screenshots are usually wide-aspect already, so the crop won\'t lose much.\n' +
          '2. **Pick the X preset** (1600×900). Crop auto-centers; drag to reposition.\n' +
          '3. **Pick JPG, 85% quality.** Comes out around 250 KB.\n' +
          '4. **Download.** Drag straight into the X composer.\n' +
          '5. **Compose your post.** The preview shows exactly the 16:9 frame you cropped — no surprise re-cropping.',
      },
    ],
    faq: [
      {
        q: 'What size should an X post image be?',
        a: '**1600×900 pixels** (16:9) is the recommended size. Anything in 16:9 between 800×450 and 4096×2304 works; 1600×900 is the sweet spot for sharpness without wasted bytes.',
      },
      {
        q: 'Does X crop my image in the timeline?',
        a: 'Yes — every attached image gets cropped to 16:9 for the in-feed preview, expanding only when the user taps. Submitting at 16:9 means the preview shows exactly what you cropped.',
      },
      {
        q: 'Can I post a portrait image to X?',
        a: 'You can attach it, but the timeline preview will center-crop to 16:9. Most of your portrait image will be hidden until someone taps to expand. Cropping to 16:9 in advance gives you control over what shows in the feed.',
      },
      {
        q: 'Should I use Twitter Card meta tags?',
        a: 'For links, yes — `twitter:card`, `twitter:image`, etc. control what shows when your link gets shared. For directly-attached post images, the meta tags do not apply; the upload itself is what shows.',
      },
    ],
  },
  {
    slug: 'linkedin-post',
    title: 'LinkedIn Post Image Cropper — 1200×627 in your browser',
    metaDescription:
      'Free LinkedIn post image cropper. Drop an image, get the exact 1200×627 (1.91:1) size LinkedIn uses for in-feed posts. Subject-aware crop, no upload.',
    h1: 'Crop any image for a LinkedIn post.',
    intro:
      'LinkedIn feed images render at 1.91:1 — wider than Instagram, narrower than X. The recommended size is 1200×627. Drop an image, get the exact pixels framed for the LinkedIn feed.',
    ctaPresetId: 'li-post',
    ctaLabel: 'Open the LinkedIn cropper',
    sections: [
      {
        heading: 'LinkedIn\'s post image spec',
        body:
          'LinkedIn supports several image surfaces, each with a different aspect:\n\n' +
          '- **In-feed post image:** 1200×627 (1.91:1). The most common attachment.\n' +
          '- **Article cover image:** 1200×627. Same shape, used for LinkedIn-published articles.\n' +
          '- **Profile banner:** 1584×396 (4:1).\n' +
          '- **Company page logo:** 300×300 (1:1).\n\n' +
          'For a post image, the **1200×627** size lands at 1.91:1 — within a couple of pixels of the og:image standard, which is convenient: one image works for both the LinkedIn upload and the link\'s og:image meta tag if you happen to be sharing your own URL.\n\n' +
          'LinkedIn accepts JPG, PNG, and GIF. WebP and AVIF are not supported. File size cap is 5 MB.\n\n' +
          'Source: [LinkedIn Help — Sharing photos](https://www.linkedin.com/help/linkedin/answer/a558259).',
      },
      {
        heading: 'Common mistakes',
        body:
          '**Square or portrait crop.** LinkedIn doesn\'t auto-letterbox; it crops. A 1080×1080 attached image gets center-cropped to 1.91:1 in the feed. Anything important near the top or bottom is lost.\n\n' +
          '**Sub-1200 width.** LinkedIn upscales smaller images and the result looks soft on retina displays. 1200 wide is the comfortable floor.\n\n' +
          '**Heavy text in the image.** LinkedIn\'s organic algorithm reportedly down-ranks posts with high text-to-image ratios (similar to Facebook\'s old "20% rule" era). Keep text light. Reserve detail for the post body.\n\n' +
          '**WebP from a screenshot tool.** macOS Preview and modern screenshot apps default to PNG, but some Windows tools save WebP by default. LinkedIn rejects WebP — re-export as JPG or PNG.',
      },
      {
        heading: 'Best practices',
        body:
          '**Faces over text.** LinkedIn\'s feed algorithm consistently rewards posts with human faces over text-heavy graphics. If the image features a person, frame them shoulder-up filling 30-45% of the frame.\n\n' +
          '**High-information left half.** LinkedIn truncates long captions with "see more" — the image becomes the primary attention pull until they expand. The left half of the image is the strongest position because Western eyes scan left-to-right.\n\n' +
          '**Brand-safe contrast.** LinkedIn\'s feed background is light gray. Pure white backgrounds blend in and look like blank space. Add a subtle border or non-white background fill.\n\n' +
          '**JPG at 85-90%.** Photos and screenshots both compress well. A 1200×627 JPG typically lands at 150-300 KB.',
      },
      {
        heading: 'Walkthrough: cropping a webinar screenshot for LinkedIn',
        body:
          '1. **Drop the screenshot in.** Often a 1920×1080 capture from Zoom or Riverside.\n' +
          '2. **Pick the LinkedIn post preset** (1200×627). Auto-centers on the subject.\n' +
          '3. **Drag to reposition.** Pull the crop down if the subject is in the upper half; pull up if you want to include the lower-third name plate.\n' +
          '4. **Pick JPG, 85% quality.** Lands around 200 KB.\n' +
          '5. **Download.** Drop straight into the LinkedIn composer.',
      },
    ],
    faq: [
      {
        q: 'What size should a LinkedIn post image be?',
        a: '**1200×627 pixels** (1.91:1) is the recommended size for in-feed post images. Same aspect as the og:image standard, so one image can serve both purposes if you\'re sharing your own URL.',
      },
      {
        q: 'Does LinkedIn crop my image?',
        a: 'Yes — non-1.91:1 images get center-cropped in the feed. Pre-cropping at 1200×627 keeps the subject exactly where you placed it.',
      },
      {
        q: 'Can I post a vertical image to LinkedIn?',
        a: 'You can attach a vertical image; LinkedIn will display it center-cropped to 1.91:1 in the feed and the full vertical version on the post detail page. Most users only see the feed crop, so plan for that.',
      },
      {
        q: 'Why does my LinkedIn post upload fail?',
        a: 'Three common reasons: file is over 5 MB, format is WebP or AVIF (neither supported), or the image has a corrupt color profile (rare; happens with some legacy CMYK exports). Saving as RGB JPG at 1200×627 fixes all three.',
      },
    ],
  },
  {
    slug: 'tiktok',
    title: 'TikTok Video Cropper — 1080×1920 (9:16) in your browser',
    metaDescription:
      'Free TikTok video cropper. Drop a clip, get the exact 1080×1920 (9:16) size TikTok wants, with the subject inside the safe zone. No upload.',
    h1: 'Crop any video for TikTok.',
    intro:
      'TikTok renders at 1080×1920 — 9:16 portrait, full-screen on mobile. Drop a clip in, get the exact pixels with the subject framed inside TikTok\'s safe content zone. No server, no upload.',
    ctaPresetId: 'tt-video',
    ctaLabel: 'Open the TikTok cropper',
    sections: [
      {
        heading: 'TikTok\'s spec and the UI overlay',
        body:
          'TikTok videos play at **1080×1920**, 9:16 aspect ratio. Same as Reels and YouTube Shorts.\n\n' +
          'But the *visible* zone — the area not covered by TikTok\'s UI chrome — is smaller. Three regions of the frame have UI on top:\n\n' +
          '- **Top ~150 px**: status bar + "Following / For You" tab.\n' +
          '- **Right ~140 px column** in the bottom half: like, comment, share, profile icons.\n' +
          '- **Bottom ~480 px**: caption + sound attribution + "+" follow button.\n\n' +
          'That leaves a roughly **920×1290 safe zone**, offset slightly left of center. Important content — faces, on-screen text, key visual — should land inside that zone or risk being covered.\n\n' +
          'Source: [TikTok Creator Portal — Specs](https://www.tiktok.com/creators/creator-portal/en-us/) and TikTok\'s in-app upload guidelines.',
      },
      {
        heading: 'Common mistakes',
        body:
          '**Subject in the bottom-right.** Worst position on the platform — gets covered by both the action column AND the caption block. Center-left of the frame is the safest.\n\n' +
          '**Horizontal source clip.** A 1920×1080 horizontal clip cropped to 9:16 keeps only the central 608 pixels of width — about 32% of the original. Off-center subjects vanish. Pre-cropping with subject-aware framing keeps the focal point centered.\n\n' +
          '**60 fps source dropped to 30 fps by TikTok.** TikTok re-encodes uploads at 30 fps regardless of source. If your clip relies on 60 fps motion (gameplay, action), expect motion judder after re-encode. Render at 30 fps before upload to control the temporal sampling.\n\n' +
          '**Loud peaks at -3 dB or higher.** TikTok\'s loudness normalization brings everything to roughly -14 LUFS. Hot mixes get pulled down hard, which makes them sound dull next to other clips. Aim for -14 LUFS in the source.',
      },
      {
        heading: 'Best practices',
        body:
          '**Hook in the first 1.5 seconds.** TikTok\'s for-you feed scroll rewards completion rate. The first frame and first beat are the most important parts of the video.\n\n' +
          '**Caption text in the upper third.** Burned-in captions in the safe zone (around 25-40% of the frame height) read on every device. Below that, the caption block can cover them.\n\n' +
          '**Square subject in 9:16.** If your source is 1:1 (a square video from a brand asset library), don\'t letterbox to 9:16 with black bars — it looks like an ad. Either crop tighter into the square, or use a designed background fill that bleeds the subject into the surrounding 9:16 frame.\n\n' +
          '**MP4 + AAC.** TikTok accepts most containers but re-encodes everything to MP4 (H.264 + AAC) on the server. Submitting MP4 to start avoids one round of conversion.',
      },
      {
        heading: 'Walkthrough: cropping a horizontal clip for TikTok',
        body:
          '1. **Drop the clip in.** A 16:9 horizontal source.\n' +
          '2. **Pick the TikTok preset** (1080×1920, 9:16). Crop centers automatically.\n' +
          '3. **Drag to reframe.** If your subject was off-center horizontally in the source, drag the crop box to put them on the centerline.\n' +
          '4. **Trim.** Cut to under 60 seconds for organic reach (the algorithm rewards completion). Use the trim tool before export.\n' +
          '5. **Export as MP4.** Audio is preserved without re-encoding, video re-encodes to H.264.\n' +
          '6. **Upload from the TikTok app.** Drop the file into the upload composer and post.',
      },
    ],
    faq: [
      {
        q: 'What size is a TikTok video?',
        a: '**1080×1920 pixels** in a 9:16 portrait aspect ratio. Same shape as Instagram Reels and YouTube Shorts — one cropped clip can post to all three.',
      },
      {
        q: 'How long can a TikTok be?',
        a: 'TikTok supports up to 10 minutes, but completion rate (the strongest ranking signal) drops sharply after 30 seconds. The trim tool lets you cut to length before upload.',
      },
      {
        q: 'Why does TikTok make my video look worse?',
        a: 'TikTok re-encodes every upload at fairly aggressive bitrates (typically 1.5-3 Mbps for video). Submitting at exactly 1080×1920, MP4, well-mixed audio at -14 LUFS minimizes the visible/audible loss in the re-encode.',
      },
      {
        q: 'Can I post a horizontal video to TikTok?',
        a: 'Yes, but it gets letterboxed with black bars top and bottom — looks dated and reduces watch-through. Cropping to 9:16 in advance keeps the video full-screen and the algorithm happier.',
      },
    ],
  },
]
