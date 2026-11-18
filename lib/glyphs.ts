import { getStroke } from "perfect-freehand"
import { outlineToPath } from "./ink"

/**
 * A glyph is a set of pen strokes in a unit box: y runs 0 (top) to 1 (bottom),
 * x runs 0..width. A GlyphSet maps characters to glyphs. The built-in set below
 * is a simple stroke set; a user's own handwriting set (captured at onboarding)
 * can implement the same interface and replace it.
 */
export type GlyphStroke = [number, number][]
export type Glyph = { width: number; strokes: GlyphStroke[] }
export interface GlyphSet {
  get(ch: string): Glyph | undefined
}

// ---------- stroke construction helpers ----------
type P = [number, number]

function line(a: P, b: P, n = 10): GlyphStroke {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
}

/** Smooth curve through points (Catmull-Rom), for hand-drawn curves. */
function curve(pts: P[], per = 8): GlyphStroke {
  const out: GlyphStroke = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let t = 0; t < per; t++) {
      const u = t / per, u2 = u * u, u3 = u2 * u
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

/** A loop starting at the top, slightly overshooting like a pen-drawn circle. */
function loop(cx: number, cy: number, rx: number, ry: number, start = -Math.PI / 2 - 0.25, turns = 1.04): GlyphStroke {
  const n = 40
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = start - (i / n) * Math.PI * 2 * turns
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
  })
}

const GLYPHS: Record<string, Glyph> = {
  "0": { width: 0.6, strokes: [loop(0.3, 0.5, 0.27, 0.5)] },
  "1": { width: 0.4, strokes: [curve([[0.04, 0.24], [0.2, 0.08], [0.3, 0]]), line([0.3, 0], [0.3, 1])] },
  "2": {
    width: 0.6,
    strokes: [
      curve([[0.04, 0.24], [0.14, 0.05], [0.32, 0], [0.5, 0.08], [0.56, 0.26], [0.46, 0.46], [0.04, 1]]),
      line([0.04, 1], [0.58, 1]),
    ],
  },
  "3": {
    width: 0.6,
    strokes: [
      curve([[0.05, 0.12], [0.2, 0.01], [0.4, 0.01], [0.52, 0.14], [0.46, 0.34], [0.24, 0.46]]),
      curve([[0.24, 0.46], [0.46, 0.54], [0.56, 0.72], [0.46, 0.93], [0.28, 1], [0.08, 0.93], [0.02, 0.82]]),
    ],
  },
  "4": {
    width: 0.62,
    strokes: [line([0.42, 0], [0.02, 0.68]), line([0.02, 0.68], [0.6, 0.68]), line([0.42, 0.28], [0.42, 1])],
  },
  "5": {
    width: 0.6,
    strokes: [
      line([0.54, 0], [0.14, 0]),
      line([0.14, 0], [0.09, 0.45]),
      curve([[0.09, 0.45], [0.28, 0.37], [0.48, 0.45], [0.58, 0.66], [0.5, 0.9], [0.3, 1], [0.1, 0.94], [0.02, 0.84]]),
    ],
  },
  "6": {
    width: 0.6,
    strokes: [
      curve([[0.5, 0.04], [0.3, 0.2], [0.12, 0.5], [0.05, 0.75], [0.14, 0.95], [0.3, 1], [0.48, 0.92], [0.55, 0.74], [0.46, 0.56], [0.28, 0.5], [0.12, 0.6], [0.07, 0.74]]),
    ],
  },
  "7": { width: 0.6, strokes: [line([0.04, 0], [0.56, 0]), line([0.56, 0], [0.2, 1])] },
  "8": { width: 0.6, strokes: [loop(0.3, 0.25, 0.2, 0.24), loop(0.3, 0.74, 0.26, 0.27, -Math.PI / 2 + 0.1, 1.04)] },
  "9": {
    width: 0.6,
    strokes: [loop(0.3, 0.3, 0.24, 0.3), curve([[0.54, 0.3], [0.52, 0.65], [0.4, 0.9], [0.15, 1]])],
  },
  "-": { width: 0.55, strokes: [line([0.04, 0.55], [0.5, 0.55])] },
  ".": { width: 0.14, strokes: [loop(0.07, 0.95, 0.035, 0.035, 0, 1.1)] },
}

export const builtinGlyphs: GlyphSet = { get: (ch) => GLYPHS[ch] }

const SPACING = 0.2

/** Width of a run of text in units of glyph height, or null if any character is unsupported. */
export function measureRun(text: string, set: GlyphSet = builtinGlyphs): number | null {
  let w = 0
  for (const ch of text) {
    const g = set.get(ch)
    if (!g) return null
    w += g.width + SPACING
  }
  return w - SPACING
}

/** Draws `text` as pen strokes with its top-left at (x, y); `h` is the glyph height in px. */
export function drawRun(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  color: string,
  set: GlyphSet = builtinGlyphs,
) {
  ctx.fillStyle = color
  let cursor = x
  for (const ch of text) {
    const g = set.get(ch)
    if (!g) continue
    for (const stroke of g.strokes) {
      const pts = stroke.map(([gx, gy]) => ({ x: cursor + gx * h, y: y + gy * h }))
      const outline = getStroke(pts, {
        size: h * 0.085,
        thinning: 0,
        smoothing: 0.5,
        streamline: 0.3,
        simulatePressure: false,
        start: { cap: true, taper: 0 },
        end: { cap: true, taper: h * 0.06 },
        last: true,
      })
      const path = outlineToPath(outline)
      if (path) ctx.fill(path)
    }
    cursor += (g.width + SPACING) * h
  }
}
