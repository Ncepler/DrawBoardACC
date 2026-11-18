// Basic shapes for the Shapes tool. Each shape is one closed (or open) polyline, so it is stored as an
// ordinary stroke: it can be erased, undone, zoomed and read by Analyze like anything the student draws.
import type { Point, Stroke } from "./types"
import { INK_COLOR } from "./config"

export type ShapeKind =
  | "square"
  | "rectangle"
  | "circle"
  | "oval"
  | "triangle"
  | "right-triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "line"
  | "arrow"

export const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "rectangle", label: "Rectangle" },
  { id: "circle", label: "Circle" },
  { id: "oval", label: "Oval" },
  { id: "triangle", label: "Triangle" },
  { id: "right-triangle", label: "Right triangle" },
  { id: "diamond", label: "Diamond" },
  { id: "pentagon", label: "Pentagon" },
  { id: "hexagon", label: "Hexagon" },
  { id: "star", label: "Star" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
]

type P = [number, number]
const SPACING = 6

/** Adds points along each edge so the stroke renderer keeps corners sharp. */
export function densify(pts: P[]): P[] {
  const out: P[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / SPACING))
    for (let j = 0; j < n; j++) out.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n])
  }
  out.push(pts[pts.length - 1])
  return out
}

const closed = (v: P[]): P[] => [...v, v[0]]

/** Corners of a shape dragged from `a` to `b` (board coordinates). */
function vertices(kind: ShapeKind, a: { x: number; y: number }, b: { x: number; y: number }): P[] {
  let dx = b.x - a.x
  let dy = b.y - a.y
  if (kind === "square" || kind === "circle") {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * side
    dy = Math.sign(dy || 1) * side
  }
  const x0 = Math.min(a.x, a.x + dx)
  const x1 = Math.max(a.x, a.x + dx)
  const y0 = Math.min(a.y, a.y + dy)
  const y1 = Math.max(a.y, a.y + dy)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rx = (x1 - x0) / 2
  const ry = (y1 - y0) / 2
  const ring = (n: number, start: number, inner = 1): P[] =>
    Array.from({ length: n }, (_, i) => {
      const ang = start + (i / n) * Math.PI * 2
      const k = inner !== 1 && i % 2 === 1 ? inner : 1
      return [cx + rx * k * Math.cos(ang), cy + ry * k * Math.sin(ang)] as P
    })
  switch (kind) {
    case "square":
    case "rectangle":
      return closed([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    case "circle":
    case "oval":
      return closed(ring(64, -Math.PI / 2))
    case "triangle":
      return closed([[cx, y0], [x1, y1], [x0, y1]])
    case "right-triangle":
      return closed([[x0, y0], [x0, y1], [x1, y1]])
    case "diamond":
      return closed([[cx, y0], [x1, cy], [cx, y1], [x0, cy]])
    case "pentagon":
      return closed(ring(5, -Math.PI / 2))
    case "hexagon":
      return closed(ring(6, 0))
    case "star":
      return closed(ring(10, -Math.PI / 2, 0.4))
    case "line":
      return [[a.x, a.y], [b.x, b.y]]
    case "arrow": {
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const head = Math.min(26, len * 0.4)
      const wing = (s: number): P => [b.x - head * Math.cos(ang + s * 0.5), b.y - head * Math.sin(ang + s * 0.5)]
      return [[a.x, a.y], [b.x, b.y], wing(1), [b.x, b.y], wing(-1)]
    }
  }
}

/** Dense polyline for a shape dragged from `a` to `b`. */
export function shapePath(kind: ShapeKind, a: { x: number; y: number }, b: { x: number; y: number }): P[] {
  return densify(vertices(kind, a, b))
}

export const SHAPE_WIDTH = 4

export function shapeStroke(pts: P[], t0 = Date.now()): Stroke {
  return {
    id: crypto.randomUUID(),
    points: pts.map(([x, y], i): Point => ({ x, y, p: 0.5, t: t0 + i })),
    tool: "pen",
    width: SHAPE_WIDTH,
    color: INK_COLOR,
    real: false,
    shape: true,
    createdAt: t0,
  }
}

/** Bounding-box size of a polyline, to drop accidental taps. */
export function pathExtent(pts: { x: number; y: number }[]) {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}
