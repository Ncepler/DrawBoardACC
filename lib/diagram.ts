// Lays out an AI diagram (nodes + edges) and renders it to an SVG string.
// The same SVG is shown on the overlay and, in gray, drawn into the image sent
// to Gemini so it can check practice blanks the student filled in.
import { FONT_STACK, textWidth, wrapLines } from "./measure"
import type { Diagram } from "./types"

const FONT = 14
const LINE = 18
const PAD_X = 12
const PAD_Y = 9
const MAX_TEXT_W = 150
const MARGIN = 20
const TITLE_H = 34
/** Height of the title strip that doubles as the drag handle. */
export const DIAGRAM_HANDLE = MARGIN + TITLE_H - 6

type Box = {
  id: string
  x: number
  y: number
  w: number
  h: number
  lines: string[]
  blank?: number
  fill?: string
  result?: "right" | "wrong"
  answer?: string
}
export const BLANK_W = 120
export const BLANK_H = 40
export type Laid = { w: number; h: number; boxes: Box[]; title: string }

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function sizeNodes(d: Diagram): Box[] {
  return d.nodes.map((n) => {
    // fixed size, so typing in a blank never moves anything the student wrote around it
    if (n.blank)
      return { id: n.id, x: 0, y: 0, w: BLANK_W, h: BLANK_H, lines: [], blank: n.blank, fill: n.fill, result: n.result, answer: n.label }
    const lines = wrapLines(n.label, FONT, MAX_TEXT_W, 500)
    const w = Math.max(70, Math.max(...lines.map((l) => textWidth(l, FONT, 500))) + 2 * PAD_X)
    return { id: n.id, x: 0, y: 0, w, h: lines.length * LINE + 2 * PAD_Y, lines }
  })
}

/** Layer index per node: longest path from the roots, ignoring edges that close a cycle. */
function layers(d: Diagram): Map<string, number> {
  const out = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const n of d.nodes) {
    out.set(n.id, [])
    indeg.set(n.id, 0)
  }
  // drop back edges (found by DFS in node order) so the rest is acyclic
  const state = new Map<string, number>()
  const keep: { from: string; to: string }[] = []
  const adj = new Map<string, string[]>()
  for (const n of d.nodes) adj.set(n.id, [])
  for (const e of d.edges) adj.get(e.from)?.push(e.to)
  const dfs = (u: string) => {
    state.set(u, 1)
    for (const v of adj.get(u) ?? []) {
      if (state.get(v) === 1) continue // back edge
      keep.push({ from: u, to: v })
      if (!state.get(v)) dfs(v)
    }
    state.set(u, 2)
  }
  for (const n of d.nodes) if (!state.get(n.id)) dfs(n.id)
  for (const e of keep) {
    out.get(e.from)!.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  const layer = new Map<string, number>()
  const queue = d.nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id)
  for (const id of queue) layer.set(id, 0)
  while (queue.length) {
    const u = queue.shift()!
    for (const v of out.get(u)!) {
      layer.set(v, Math.max(layer.get(v) ?? 0, layer.get(u)! + 1))
      indeg.set(v, indeg.get(v)! - 1)
      if (!indeg.get(v)) queue.push(v)
    }
  }
  for (const n of d.nodes) if (!layer.has(n.id)) layer.set(n.id, 0)
  return layer
}

/** Order nodes around a cycle by following edges from the first node. */
function cycleOrder(d: Diagram): string[] {
  const next = new Map<string, string[]>()
  for (const e of d.edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to])
  const order: string[] = []
  const seen = new Set<string>()
  let cur: string | undefined = d.nodes[0]?.id
  while (cur && !seen.has(cur)) {
    order.push(cur)
    seen.add(cur)
    cur = (next.get(cur) ?? []).find((v) => !seen.has(v))
  }
  for (const n of d.nodes) if (!seen.has(n.id)) order.push(n.id)
  return order
}

export function layoutDiagram(d: Diagram): Laid {
  const boxes = sizeNodes(d)
  const byId = new Map(boxes.map((b) => [b.id, b]))

  if (d.layout === "cycle") {
    const order = cycleOrder(d)
    const n = order.length
    const perim = boxes.reduce((s, b) => s + Math.max(b.w, b.h * 2) + 40, 0)
    const r = Math.max(120, perim / (2 * Math.PI))
    order.forEach((id, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2
      const b = byId.get(id)!
      b.x = r * 1.25 * Math.cos(a) - b.w / 2
      b.y = r * 0.9 * Math.sin(a) - b.h / 2
    })
  } else {
    const L = layers(d)
    const groups: Box[][] = []
    for (const b of boxes) (groups[L.get(b.id)!] ??= []).push(b)
    const horizontal = d.layout === "flow"
    let offset = 0
    for (const g of groups.filter(Boolean)) {
      const thick = Math.max(...g.map((b) => (horizontal ? b.w : b.h)))
      const total = g.reduce((s, b) => s + (horizontal ? b.h : b.w), 0) + (g.length - 1) * (horizontal ? 22 : 24)
      let along = -total / 2
      for (const b of g) {
        if (horizontal) {
          b.x = offset + (thick - b.w) / 2
          b.y = along
          along += b.h + 22
        } else {
          b.x = along
          b.y = offset + (thick - b.h) / 2
          along += b.w + 24
        }
      }
      offset += thick + (horizontal ? 70 : 56)
    }
  }

  // normalize into a box with margin and room for the title
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  for (const b of boxes) {
    b.x += MARGIN - minX
    b.y += MARGIN + TITLE_H - minY
  }
  const titleW = d.title ? textWidth(d.title, 16, 600) + 2 * MARGIN : 0
  const w = Math.max(titleW, Math.max(...boxes.map((b) => b.x + b.w)) + MARGIN)
  const h = Math.max(...boxes.map((b) => b.y + b.h)) + MARGIN
  return { w: Math.ceil(w), h: Math.ceil(h), boxes, title: d.title }
}

/** Point where the segment from a box's center toward (tx, ty) leaves the box. */
function exitPoint(b: Box, tx: number, ty: number, pad = 4) {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = tx - cx
  const dy = ty - cy
  const sx = dx === 0 ? Infinity : (b.w / 2 + pad) / Math.abs(dx)
  const sy = dy === 0 ? Infinity : (b.h / 2 + pad) / Math.abs(dy)
  const s = Math.min(sx, sy, 1)
  return { x: cx + dx * s, y: cy + dy * s }
}

export type DiagramColors = { stroke: string; text: string; edge: string; fill: string; blank: string; halo: string; student: string }

export const SCREEN_COLORS: DiagramColors = {
  stroke: "#007AFF",
  text: "#0a4fae",
  edge: "#6b8fc4",
  fill: "rgba(255,255,255,0.92)",
  blank: "#007AFF",
  halo: "#ffffff",
  student: "#1d1d1f",
}
export const DARK_SCREEN_COLORS: DiagramColors = {
  stroke: "#0A84FF",
  text: "#64b5ff",
  edge: "#5d7fae",
  fill: "rgba(28,28,30,0.92)",
  blank: "#0A84FF",
  halo: "#1c1c1e",
  student: "#f2f2f7",
}
// Gray, so Gemini can tell the printed practice sheet from the student's black ink.
export const EXPORT_COLORS: DiagramColors = {
  stroke: "#a1a1a6",
  text: "#8e8e93",
  edge: "#b0b0b5",
  fill: "#ffffff",
  blank: "#a1a1a6",
  halo: "#ffffff",
  student: "#000000",
}

export function diagramSvg(d: Diagram, laid: Laid, c: DiagramColors): string {
  const byId = new Map(laid.boxes.map((b) => [b.id, b]))
  const parts: string[] = []
  const cx = laid.w / 2
  const cy = (laid.h + TITLE_H) / 2
  const labels: string[] = []

  for (const e of d.edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) continue
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    // curve cycle edges outward, keep others straight
    let ctrl = { x: (ac.x + bc.x) / 2, y: (ac.y + bc.y) / 2 }
    if (d.layout === "cycle") {
      const mx = ctrl.x - cx
      const my = ctrl.y - cy
      const len = Math.hypot(mx, my) || 1
      const chord = Math.hypot(bc.x - ac.x, bc.y - ac.y)
      ctrl = { x: ctrl.x + (mx / len) * chord * 0.22, y: ctrl.y + (my / len) * chord * 0.22 }
    }
    const p1 = exitPoint(a, ctrl.x, ctrl.y)
    const p2 = exitPoint(b, ctrl.x, ctrl.y, 6)
    parts.push(
      `<path d="M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" fill="none" stroke="${c.edge}" stroke-width="1.6" stroke-linecap="round"/>`,
    )
    // arrowhead along the curve's end tangent
    const ang = Math.atan2(p2.y - ctrl.y, p2.x - ctrl.x)
    const s = 8
    const l = { x: p2.x - s * Math.cos(ang - 0.45), y: p2.y - s * Math.sin(ang - 0.45) }
    const r = { x: p2.x - s * Math.cos(ang + 0.45), y: p2.y - s * Math.sin(ang + 0.45) }
    parts.push(
      `<path d="M${l.x.toFixed(1)} ${l.y.toFixed(1)} L${p2.x.toFixed(1)} ${p2.y.toFixed(1)} L${r.x.toFixed(1)} ${r.y.toFixed(1)}" fill="none" stroke="${c.edge}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    if (e.label) {
      const mid = { x: 0.25 * p1.x + 0.5 * ctrl.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * ctrl.y + 0.25 * p2.y }
      labels.push(
        `<text x="${mid.x.toFixed(1)}" y="${(mid.y + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="${c.text}" stroke="${c.halo}" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${esc(e.label)}</text>`,
      )
    }
  }

  for (const b of laid.boxes) {
    if (b.blank) {
      parts.push(
        // no fill: the student's ink underneath must show through
        `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="none" stroke="${c.blank}" stroke-width="1.5" stroke-dasharray="5 4"/>`,
      )
      const badge = b.result === "right" ? "#34C759" : b.result === "wrong" ? "#FF3B30" : c.blank
      const mark = b.result === "right" ? "✓" : b.result === "wrong" ? "✗" : String(b.blank)
      parts.push(
        `<circle cx="${b.x}" cy="${b.y}" r="10" fill="${badge}"/>`,
        `<text x="${b.x}" y="${b.y + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${mark}</text>`,
      )
      if (b.fill) {
        const fs = Math.min(FONT, Math.max(9, ((b.w - 16) / Math.max(1, textWidth(b.fill, FONT, 500))) * FONT))
        parts.push(
          `<text x="${(b.x + b.w / 2).toFixed(1)}" y="${b.y + b.h / 2 + fs * 0.35}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="500" fill="${c.student}">${esc(b.fill)}</text>`,
        )
      }
      if (b.result === "wrong" && b.answer) {
        labels.push(
          `<text x="${(b.x + b.w / 2).toFixed(1)}" y="${b.y + b.h + 14}" text-anchor="middle" font-size="12" font-weight="600" fill="#FF3B30" stroke="${c.halo}" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${esc(b.answer)}</text>`,
        )
      }
      continue
    }
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.w.toFixed(1)}" height="${b.h}" rx="10" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`,
    )
    b.lines.forEach((ln, i) => {
      parts.push(
        `<text x="${(b.x + b.w / 2).toFixed(1)}" y="${b.y + PAD_Y + LINE * i + 13}" text-anchor="middle" font-size="${FONT}" font-weight="500" fill="${c.text}">${esc(ln)}</text>`,
      )
    })
  }

  const title = laid.title
    ? `<text x="${MARGIN}" y="${MARGIN + 8}" font-size="16" font-weight="600" fill="${c.text}">${esc(laid.title)}</text>`
    : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${laid.w} ${laid.h}" width="100%" height="100%" font-family='${FONT_STACK}'>${title}${parts.join("")}${labels.join("")}</svg>`
}
