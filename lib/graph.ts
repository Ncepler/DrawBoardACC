// Graph cards: blank axes drawn by the app, with curves plotted on top from formulas.
// The formulas are evaluated by the small parser below (no eval), so Gemini only supplies
// the equation and the plot itself is exact.
import type { Graph } from "./types"

export const GRAPH_W = 380
export const GRAPH_H = 330
export const GRAPH_HANDLE = 30

type Fn = (x: number) => number
const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

/** Compiles an expression in x ("x^2 - 4", "sin(x)/x", "2^x") into a function, or null if it can't be read. */
export function compileExpr(src: string): Fn | null {
  const text = src
    .toLowerCase()
    .replace(/^\s*(y|f\(x\))\s*=\s*/, "")
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
  const tokens = text.match(/\d+\.?\d*|\.\d+|[a-z]+|[-+*/^(),]|\S/g)
  if (!tokens) return null
  let i = 0
  const peek = () => tokens[i]
  const fail = () => {
    throw new Error("parse")
  }

  const num = (t: string | undefined) => !!t && /^[\d.]/.test(t)
  const ident = (t: string | undefined) => !!t && /^[a-z]+$/.test(t)

  // Each parse function returns a function of x.
  function expr(): Fn {
    let l = term()
    while (peek() === "+" || peek() === "-") {
      const op = tokens![i++]
      const r = term()
      const a = l
      l = op === "+" ? (x) => a(x) + r(x) : (x) => a(x) - r(x)
    }
    return l
  }
  function term(): Fn {
    let l = unary()
    for (;;) {
      const t = peek()
      if (t === "*" || t === "/") {
        i++
        const r = unary()
        const a = l
        l = t === "*" ? (x) => a(x) * r(x) : (x) => a(x) / r(x)
      } else if (num(t) || ident(t) || t === "(") {
        // implicit multiplication: 2x, 3(x+1), x sin(x)
        const r = unary()
        const a = l
        l = (x) => a(x) * r(x)
      } else return l
    }
  }
  function unary(): Fn {
    if (peek() === "-") {
      i++
      const f = unary()
      return (x) => -f(x)
    }
    if (peek() === "+") {
      i++
      return unary()
    }
    return power()
  }
  function power(): Fn {
    const base = atom()
    if (peek() === "^") {
      i++
      const exp = unary()
      return (x) => Math.pow(base(x), exp(x))
    }
    return base
  }
  function atom(): Fn {
    const t = tokens![i++]
    if (t === undefined) return fail()
    if (num(t)) {
      const v = Number(t)
      if (!Number.isFinite(v)) return fail()
      return () => v
    }
    if (t === "(") {
      const f = expr()
      if (tokens![i++] !== ")") fail()
      return f
    }
    if (t === "x") return (x) => x
    if (t in CONSTS) return () => CONSTS[t]
    if (t in FUNCS) {
      if (tokens![i++] !== "(") fail()
      const f = expr()
      if (tokens![i++] !== ")") fail()
      const fn = FUNCS[t]
      return (x) => fn(f(x))
    }
    return fail()
  }

  try {
    const f = expr()
    if (i !== tokens.length) return null
    return f
  } catch {
    return null
  }
}

/** True if the formula gives real numbers at several x in the window. */
export function plausibleCurve(expr: string, xmin: number, xmax: number) {
  const f = compileExpr(expr)
  if (!f) return false
  let ok = 0
  for (let k = 0; k <= 20; k++) if (Number.isFinite(f(xmin + ((xmax - xmin) * k) / 20))) ok++
  return ok >= 4
}

function niceStep(range: number) {
  const raw = range / 6
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / mag
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag
}
const fmt = (v: number) => {
  const r = Math.abs(v) < 1e-9 ? 0 : v
  return String(Number(r.toPrecision(4)))
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export type GraphColors = { axis: string; grid: string; text: string; curves: string[]; point: string }
export const GRAPH_COLORS: GraphColors = { axis: "#6e6e73", grid: "rgba(110,110,115,0.18)", text: "#6e6e73", curves: ["#007AFF", "#FF9500", "#34C759", "#AF52DE"], point: "#1d1d1f" }
export const GRAPH_COLORS_DARK: GraphColors = { axis: "#98989d", grid: "rgba(152,152,157,0.22)", text: "#98989d", curves: ["#0A84FF", "#FF9F0A", "#30D158", "#BF5AF2"], point: "#f2f2f7" }

/** SVG of the blank graph with the curves and labelled points drawn on it. All text is escaped. */
export function graphSvg(g: Graph, c: GraphColors): string {
  const L = 40, R = 16, T = 38, B = 30
  const pw = GRAPH_W - L - R
  const ph = GRAPH_H - T - B
  const sx = (x: number) => L + ((x - g.xmin) / (g.xmax - g.xmin)) * pw
  const sy = (y: number) => T + ph - ((y - g.ymin) / (g.ymax - g.ymin)) * ph
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${GRAPH_W}" height="${GRAPH_H}" viewBox="0 0 ${GRAPH_W} ${GRAPH_H}" font-family='-apple-system, "SF Pro Text", system-ui, sans-serif'>`)
  out.push(`<defs><clipPath id="gclip"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath></defs>`)
  out.push(`<text x="${GRAPH_W / 2}" y="20" text-anchor="middle" font-size="14" font-weight="600" fill="${c.curves[0]}">${esc(g.title)}</text>`)
  const xs = niceStep(g.xmax - g.xmin)
  const ys = niceStep(g.ymax - g.ymin)
  const axisX = g.ymin <= 0 && g.ymax >= 0 ? sy(0) : T + ph
  const axisY = g.xmin <= 0 && g.xmax >= 0 ? sx(0) : L
  for (let x = Math.ceil(g.xmin / xs) * xs; x <= g.xmax + 1e-9; x += xs) {
    out.push(`<line x1="${sx(x)}" y1="${T}" x2="${sx(x)}" y2="${T + ph}" stroke="${c.grid}"/>`)
    if (Math.abs(x) > 1e-9) out.push(`<text x="${sx(x)}" y="${Math.min(axisX + 14, T + ph + 14)}" text-anchor="middle" font-size="10" fill="${c.text}">${fmt(x)}</text>`)
  }
  for (let y = Math.ceil(g.ymin / ys) * ys; y <= g.ymax + 1e-9; y += ys) {
    out.push(`<line x1="${L}" y1="${sy(y)}" x2="${L + pw}" y2="${sy(y)}" stroke="${c.grid}"/>`)
    if (Math.abs(y) > 1e-9) out.push(`<text x="${Math.max(axisY - 5, L - 5)}" y="${sy(y) + 3}" text-anchor="end" font-size="10" fill="${c.text}">${fmt(y)}</text>`)
  }
  out.push(`<line x1="${L}" y1="${axisX}" x2="${L + pw}" y2="${axisX}" stroke="${c.axis}" stroke-width="1.5"/>`)
  out.push(`<line x1="${axisY}" y1="${T}" x2="${axisY}" y2="${T + ph}" stroke="${c.axis}" stroke-width="1.5"/>`)
  out.push(`<text x="${L + pw + 2}" y="${axisX - 4}" text-anchor="end" font-size="11" font-style="italic" fill="${c.text}">x</text>`)
  out.push(`<text x="${axisY + 5}" y="${T + 10}" font-size="11" font-style="italic" fill="${c.text}">y</text>`)

  const N = 480
  g.curves.forEach((cv, ci) => {
    const f = compileExpr(cv.expr)
    if (!f) return
    const color = c.curves[ci % c.curves.length]
    let d = ""
    let prev: number | null = null
    for (let k = 0; k <= N; k++) {
      const x = g.xmin + ((g.xmax - g.xmin) * k) / N
      const y = f(x)
      if (!Number.isFinite(y) || Math.abs(y) > 1e6) {
        prev = null
        continue
      }
      // a huge jump between neighbours is an asymptote, not a line
      const jump = prev !== null && Math.abs(y - prev) > 3 * (g.ymax - g.ymin)
      d += `${prev === null || jump ? "M" : "L"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`
      prev = y
    }
    if (d) out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" clip-path="url(#gclip)"/>`)
    if (cv.label) out.push(`<text x="${L + pw - 4}" y="${T + 14 + ci * 14}" text-anchor="end" font-size="11" fill="${color}">${esc(cv.label)}</text>`)
  })
  for (const p of g.points) {
    const f = compileExpr(g.curves[p.curve]?.expr ?? "")
    const y = f ? f(p.x) : NaN
    if (!Number.isFinite(y) || p.x < g.xmin || p.x > g.xmax || y < g.ymin || y > g.ymax) continue
    out.push(`<circle cx="${sx(p.x)}" cy="${sy(y)}" r="4" fill="${c.point}"/>`)
    if (p.label) out.push(`<text x="${sx(p.x) + 7}" y="${sy(y) - 7}" font-size="11" fill="${c.point}">${esc(p.label)}</text>`)
  }
  out.push("</svg>")
  return out.join("")
}
