import type { OutputFormat } from './crop'
import type { BackdropType, FillMode } from './cropClient'

/**
 * A user-saved combination of presets + output settings. Loaded once at mount,
 * mutated through {@link saveBundles}. Persists in localStorage so the user's
 * "TikTok kit" or "Newsletter set" survives a refresh.
 */
export type Bundle = {
  id: string
  name: string
  presetIds: string[]
  format: OutputFormat
  quality: number
  fillMode: FillMode
  blurPx: number
  /** Backdrop kind for fit mode. Older bundles may not have this; treat missing as 'blur'. */
  backdropType?: BackdropType
  /** Hex color (#RRGGBB) used when backdropType === 'solid'. Optional. */
  backdropColor?: string
}

const STORAGE_KEY = 'wmc:batch:bundles'
const MAX_BUNDLES = 12
const MAX_NAME_LEN = 40

function isOutputFormat(v: unknown): v is OutputFormat {
  return v === 'png' || v === 'jpeg' || v === 'webp' || v === 'avif'
}

function isFillMode(v: unknown): v is FillMode {
  return v === 'crop' || v === 'fit'
}

function isBackdropType(v: unknown): v is BackdropType {
  return v === 'blur' || v === 'solid'
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())
}

/** Reads bundles from localStorage. Returns empty array on parse error / SSR. */
export function loadBundles(): Bundle[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (b): b is Bundle =>
          !!b &&
          typeof b === 'object' &&
          typeof b.id === 'string' &&
          typeof b.name === 'string' &&
          Array.isArray(b.presetIds) &&
          b.presetIds.every((p: unknown) => typeof p === 'string') &&
          isOutputFormat(b.format) &&
          typeof b.quality === 'number' &&
          isFillMode(b.fillMode) &&
          typeof b.blurPx === 'number' &&
          // backdropType / backdropColor are optional — older bundles predate the field.
          (b.backdropType === undefined || isBackdropType(b.backdropType)) &&
          (b.backdropColor === undefined || isHexColor(b.backdropColor)),
      )
      .slice(0, MAX_BUNDLES)
  } catch {
    return []
  }
}

/** Persists bundles. Silently no-ops on quota / disabled storage. */
export function saveBundles(bundles: Bundle[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bundles.slice(0, MAX_BUNDLES)))
  } catch {
    // ignore — quota or disabled storage is non-fatal
  }
}

/** Trims and bounds the user's chosen bundle name. Returns null if invalid. */
export function sanitizeBundleName(raw: string): string | null {
  const trimmed = raw.trim().slice(0, MAX_NAME_LEN)
  return trimmed.length > 0 ? trimmed : null
}

/** Generates an opaque bundle ID — ms-time + 4 random hex chars. */
export function newBundleId(): string {
  const t = Date.now().toString(36)
  const r = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0')
  return `b-${t}-${r}`
}
