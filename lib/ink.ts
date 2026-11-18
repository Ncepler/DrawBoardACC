import { getStroke } from "perfect-freehand"
import type { Point, Stroke } from "./types"

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function strokeOptions(real: boolean, size: number, last: boolean, sharp = false) {
  if (sharp) {
    return { size, thinning: 0, smoothing: 0, streamline: 0, simulatePressure: false, start: { cap: true, taper: 0 }, end: { cap: true, taper: 0 }, last }
  }
  return {
    size,
    thinning: real ? 0.55 : 0.5,
    smoothing: 0.6,
    streamline: 0.45,
    simulatePressure: !real,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last,
  }
}

export function outlineToPath(outline: number[][]): Path2D | null {
  if (outline.length < 4) return null
  const path = new Path2D()
  let [px, py] = outline[0]
  path.moveTo(px, py)
  for (let i = 1; i < outline.length; i++) {
    const [x, y] = outline[i]
    path.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2)
    ;[px, py] = [x, y]
  }
  path.closePath()
  return path
}

export function strokePath(
  points: Point[],
  real: boolean,
  size: number,
  last: boolean,
  sharp = false,
): Path2D | null {
  const input = points.map((p) => ({ x: p.x, y: p.y, pressure: clamp(p.p, 0.05, 1) }))
  return outlineToPath(getStroke(input, strokeOptions(real, size, last, sharp)))
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const path = strokePath(s.points, s.real, s.width, true, s.shape)
  if (!path) {
    // single tap: draw a dot
    const p = s.points[0]
    if (!p) return
    ctx.fillStyle = s.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, s.width / 3, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.fillStyle = s.color
  ctx.fill(path)
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1)
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** True if the eraser segment a->b comes within `radius` of the stroke's geometry. */
export function segmentHitsStroke(
  s: Stroke,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
) {
  const reach = radius + s.width / 2
  const pts = s.points
  if (pts.length === 1) return distToSegment(pts[0].x, pts[0].y, ax, ay, bx, by) <= reach
  // coarse bbox reject
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (
    Math.max(ax, bx) < minX - reach || Math.min(ax, bx) > maxX + reach ||
    Math.max(ay, by) < minY - reach || Math.min(ay, by) > maxY + reach
  ) return false
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i]
    // segment-to-segment: check endpoints of each against the other
    if (
      distToSegment(p.x, p.y, ax, ay, bx, by) <= reach ||
      distToSegment(q.x, q.y, ax, ay, bx, by) <= reach ||
      distToSegment(ax, ay, p.x, p.y, q.x, q.y) <= reach ||
      distToSegment(bx, by, p.x, p.y, q.x, q.y) <= reach
    ) return true
  }
  return false
}
