export function LandingHero() {
  return (
    <div className="mb-8 text-center">
      <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        Crop any image for any platform.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground">
        Drop an image, click a preset, download. Smart face-aware crop and a dimensions
        input that parses anything you paste. Your images never leave your browser.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span>No upload</span>
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-muted-foreground/40" />
        <span>No account</span>
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-muted-foreground/40" />
        <span>No tracking</span>
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-muted-foreground/40" />
        <span>Works offline</span>
      </div>
    </div>
  )
}
