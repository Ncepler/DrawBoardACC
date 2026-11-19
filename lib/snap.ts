// "Draw and hold" shape snapping (Notability-style): a rough line, circle, oval or polygon becomes a clean one.
// Returns a dense polyline, or null when the stroke doesn't clearly look like a shape (so ordinary writing is never changed).
import { densify, shapePath } from "./shapes"

type Pt = { x: number; y: number }
type P = [number, number]

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

function pathLength(pts: Pt[]) {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i])
  return L
}

function perpDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return dist(p, a)
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len
}

/** Ramer–Douglas–Peucker: keeps only the points where the path really turns. */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts
  let max = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > max) {
      max = d
      idx = i
    }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]]
  const left = simplify(pts.slice(0, idx + 1), eps)
  return [...left.slice(0, -1), ...simplify(pts.slice(idx), eps)]
}

export type Snapped = { kind: "line" | "closed"; pts: P[]; a?: Pt; b?: Pt }

export function recognizeShape(points: Pt[]): Snapped | null {
  if (points.length < 8) return null
  const first = points[0]
  const last = points[points.length - 1]
  const L = pathLength(points)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const w = maxX - minX
  const h = maxY - minY
  const diag = Math.hypot(w, h)
  if (diag < 24) return null

  // Straight line: every point stays close to the chord.
  const chord = dist(first, last)
  if (chord > 24 && L < chord * 1.25) {
    const worst = Math.max(...points.map((p) => perpDist(p, first, last)))
    if (worst < chord * 0.07 + 2) return { kind: "line", pts: densify([[first.x, first.y], [last.x, last.y]]), a: first, b: last }
  }

  // Closed figures: the end must come back near the start.
  if (chord > L * 0.22 || chord > diag * 0.45) return null

  const corners = simplify([...points, first], diag * 0.09)
  // closed polyline → drop the repeated last point
  const verts = corners.slice(0, -1)

  // Ellipse: points sit at a steady distance from the center when scaled by the box.
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const rx = w / 2
  const ry = h / 2
  if (rx > 8 && ry > 8) {
    const rs = points.map((p) => Math.hypot((p.x - cx) / rx, (p.y - cy) / ry))
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length
    const dev = Math.sqrt(rs.reduce((a, r) => a + (r - mean) ** 2, 0) / rs.length)
    if (verts.length >= 5 && dev < 0.09 && mean > 0.8 && mean < 1.15) {
      const round = Math.abs(w - h) < Math.max(w, h) * 0.15
      const s = round ? (w + h) / 2 : 0
      const a = round ? { x: cx - s / 2, y: cy - s / 2 } : { x: minX, y: minY }
      const b = round ? { x: cx + s / 2, y: cy + s / 2 } : { x: maxX, y: maxY }
      return { kind: "closed", pts: shapePath(round ? "circle" : "oval", a, b) }
    }
  }

  // Triangle or four-sided figure: snap to the corners that were found.
  if (verts.length === 3) return { kind: "closed", pts: densify([...verts, verts[0]].map((p) => [p.x, p.y] as P)) }
  if (verts.length === 4) {
    // nearly axis-aligned → a true rectangle (a square when the sides match)
    const aligned = verts.every((v, i) => {
      const n = verts[(i + 1) % 4]
      const ang = Math.abs((Math.atan2(n.y - v.y, n.x - v.x) * 180) / Math.PI) % 90
      return ang < 10 || ang > 80
    })
    if (aligned) {
      const sq = Math.abs(w - h) < Math.max(w, h) * 0.12
      const side = (w + h) / 2
      const a = sq ? { x: cx - side / 2, y: cy - side / 2 } : { x: minX, y: minY }
      const b = sq ? { x: cx + side / 2, y: cy + side / 2 } : { x: maxX, y: maxY }
      return { kind: "closed", pts: shapePath(sq ? "square" : "rectangle", a, b) }
    }
    return { kind: "closed", pts: densify([...verts, verts[0]].map((p) => [p.x, p.y] as P)) }
  }
  return null
}
