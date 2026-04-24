export default function App() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <h1 className="text-sm font-medium tracking-tight">web-media-cropper</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="flex min-h-[60vh] items-center justify-center rounded-lg border border-dashed">
          <div className="text-center">
            <p className="text-lg font-medium">Drop an image</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Phase 0 shell. Real flow lands in Phase 1.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
