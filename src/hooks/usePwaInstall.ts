import { useCallback, useEffect, useState } from 'react'

/**
 * Chromium-only event fired before the browser shows its native install prompt.
 * `prompt()` is the imperative trigger; `userChoice` resolves to the outcome.
 * Not exposed in lib.dom yet, so we narrow it locally.
 */
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type InstallState = {
  /** Browser has fired beforeinstallprompt and we have a deferred event to call. */
  canInstall: boolean
  /** App is already running in standalone / installed PWA mode. */
  installed: boolean
  /**
   * Triggers the native install prompt. Returns the user's choice ('accepted' |
   * 'dismissed') or null if no prompt is available.
   */
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>
}

/**
 * Captures `beforeinstallprompt` so we can show our own Install button at a
 * moment that makes sense (rather than relying on the browser's URL-bar UI).
 *
 * Notes on browser support:
 * - Chromium fires beforeinstallprompt and supports prompt(). Hook is fully active.
 * - Safari (desktop + iOS) doesn't fire beforeinstallprompt — `canInstall` stays
 *   false. The user installs via Share → Add to Home Screen. We don't surface
 *   anything in that case (instead of showing a misleading button).
 * - Firefox doesn't fire it either; same behavior as Safari.
 */
export function usePwaInstall(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    // Two ways the app can be considered "installed":
    //  - matchMedia('(display-mode: standalone)') is true (Chromium / installed PWA)
    //  - navigator.standalone is true (iOS Safari home-screen webclip)
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
    const nav = window.navigator as Navigator & { standalone?: boolean }
    return nav.standalone === true
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onBeforeInstallPrompt = (e: Event) => {
      // Stash the event so we can fire prompt() at our own moment.
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    const mql = window.matchMedia?.('(display-mode: standalone)')
    const onModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener)
    window.addEventListener('appinstalled', onAppInstalled)
    mql?.addEventListener?.('change', onModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener)
      window.removeEventListener('appinstalled', onAppInstalled)
      mql?.removeEventListener?.('change', onModeChange)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return null
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      // The deferred event is single-use — drop it once consumed regardless of
      // outcome. If the user dismisses, the browser may re-fire it later.
      setDeferred(null)
      return choice.outcome
    } catch {
      setDeferred(null)
      return null
    }
  }, [deferred])

  return {
    canInstall: deferred != null && !installed,
    installed,
    promptInstall,
  }
}
