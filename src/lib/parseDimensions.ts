export type ParsedDimensions = { width: number; height: number }

const RATIO_AT_WIDTH = /(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s+at\s+(\d+)\s*(?:w|wide|px)?/i
const RATIO_AT_HEIGHT = /(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s+at\s+(\d+)\s*(?:h|high|tall)/i

/**
 * Accepts: 1080x1350, 1080×1350, 1080 1350, 1080, 1350, 1080 by 1350,
 *          4:5 at 1080 wide, 16:9 at 720 tall, "Dimensions: 1080x1350"
 * Returns null if it can't confidently produce a width/height.
 */
export function parseDimensions(input: string): ParsedDimensions | null {
  if (!input) return null
  const clean = input.replace(/×/g, 'x').replace(/✕/g, 'x').trim()

  const heightAt = clean.match(RATIO_AT_HEIGHT)
  if (heightAt) {
    const a = Number(heightAt[1])
    const b = Number(heightAt[2])
    const h = Number(heightAt[3])
    if (a > 0 && b > 0 && h > 0) {
      const w = Math.round((a / b) * h)
      return normalize(w, h)
    }
  }

  const widthAt = clean.match(RATIO_AT_WIDTH)
  if (widthAt) {
    const a = Number(widthAt[1])
    const b = Number(widthAt[2])
    const w = Number(widthAt[3])
    if (a > 0 && b > 0 && w > 0) {
      const h = Math.round((b / a) * w)
      return normalize(w, h)
    }
  }

  const numbers = clean.match(/\d+(?:\.\d+)?/g)?.map(Number).filter((n) => n > 0) ?? []
  if (numbers.length >= 2) {
    return normalize(Math.round(numbers[0]), Math.round(numbers[1]))
  }

  return null
}

function normalize(width: number, height: number): ParsedDimensions | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width < 1 || height < 1) return null
  if (width > 20000 || height > 20000) return null
  return { width, height }
}
