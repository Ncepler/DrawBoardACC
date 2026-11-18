"use client"

import { useEffect, useRef, useState } from "react"
import type { Glyph } from "@/lib/glyphs"
import { strokePath } from "@/lib/ink"
import type { UserGlyphs } from "@/lib/settings"
import type { Point } from "@/lib/types"

const SETS = [
  { id: "num", label: "Numbers & symbols", chars: [..."0123456789+-=×/().,?!%"] },
  { id: "lower", label: "Lowercase", chars: [..."abcdefghijklmnopqrstuvwxyz"] },
  { id: "upper", label: "Uppercase", chars: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"] },
  { id: "sym", label: "More symbols", chars: [..."÷π√^<>≤≥≠≈±°∞Δθ→:;'\"[]{}*_&"] },
]
export const HANDWRITING_CHAR_COUNT = SETS.reduce((n, s) => n + s.chars.length, 0)

// Cell geometry (CSS px). Glyph units: the top guide is y=0, the baseline is y=1.
const CW = 92
const CH = 116
const TOP = 24
const BASE = 84
const UNIT = BASE - TOP
const PEN = 4

/** Cell strokes (px) -> glyph (units). */
function toGlyph(strokes: Point[][]): Glyph | null {
  const pts = strokes.flat()
  if (!pts.length) return null
  const minX = Math.min(...pts.map((p) => p.x))
  const maxX = Math.max(...pts.map((p) => p.x))
  return {
    width: Math.max(0.15, (maxX - minX) / UNIT) + 0.04,
    strokes: strokes.map((st) =>
      st
        .filter((_, i) => i % 2 === 0 || i === st.length - 1) // halve the points; smoothing restores the shape
        .map((p) => [+((p.x - minX) / UNIT + 0.02).toFixed(3), +((p.y - TOP) / UNIT).toFixed(3)] as [number, number]),
    ),
  }
}

/** Glyph (units) -> cell strokes (px), to show what was saved. */
function fromGlyph(g: Glyph): Point[][] {
  const x0 = (CW - g.width * UNIT) / 2
  return g.strokes.map((st) => st.map(([x, y]) => ({ x: x0 + x * UNIT, y: TOP + y * UNIT, p: 0.5, t: 0 })))
}

function Cell({ ch, glyph, onChange }: { ch: string; glyph?: Glyph; onChange: (g: Glyph | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Point[][]>(glyph ? fromGlyph(glyph) : [])
  const live = useRef<{ id: number; pts: Point[] } | null>(null)

  const paint = () => {
    const c = ref.current
    const ctx = c?.getContext("2d")
    if (!c || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    if (c.width !== CW * dpr) {
      c.width = CW * dpr
      c.height = CH * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, CW, CH)
    const ink = getComputedStyle(c).color
    ctx.fillStyle = ink
    for (const st of [...strokes.current, ...(live.current ? [live.current.pts] : [])]) {
      const path = strokePath(st, false, PEN, true)
      if (path) ctx.fill(path)
      else if (st[0]) {
        ctx.beginPath()
        ctx.arc(st[0].x, st[0].y, PEN / 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  useEffect(paint)

  const pt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: 0.5, t: Math.round(e.timeStamp) }
  }

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative rounded-xl bg-[var(--card)] shadow-[0_0_0_0.5px_var(--hairline)]" style={{ width: CW, height: CH }}>
        <div className="pointer-events-none absolute inset-x-2 border-t border-dashed border-[var(--hairline)]" style={{ top: TOP }} />
        <div className="pointer-events-none absolute inset-x-2 border-t border-[var(--ai-ring)]" style={{ top: BASE }} />
        <span className="pointer-events-none absolute left-2 top-1 text-[12px] text-[var(--text-muted)]">{ch}</span>
        <canvas
          ref={ref}
          className="absolute inset-0 text-[var(--text)] [touch-action:none]"
          style={{ width: CW, height: CH }}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return
            if (live.current) return
            e.currentTarget.setPointerCapture(e.pointerId)
            live.current = { id: e.pointerId, pts: [pt(e)] }
            paint()
          }}
          onPointerMove={(e) => {
            const l = live.current
            if (!l || l.id !== e.pointerId) return
            const evs = e.nativeEvent.getCoalescedEvents?.() ?? []
            for (const ev of evs.length ? evs : [e.nativeEvent]) {
              const r = e.currentTarget.getBoundingClientRect()
              l.pts.push({ x: ev.clientX - r.left, y: ev.clientY - r.top, p: 0.5, t: Math.round(ev.timeStamp) })
            }
            paint()
          }}
          onPointerUp={(e) => {
            const l = live.current
            if (!l || l.id !== e.pointerId) return
            live.current = null
            strokes.current = [...strokes.current, l.pts]
            onChange(toGlyph(strokes.current))
            paint()
          }}
          onPointerCancel={() => {
            live.current = null
            paint()
          }}
        />
      </div>
      {glyph && (
        <button
          type="button"
          aria-label={`Clear ${ch}`}
          className="absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center [touch-action:manipulation]"
          onClick={() => {
            strokes.current = []
            onChange(null)
            paint()
          }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--text-muted)] text-[var(--board)]">
            <svg width="10" height="10" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}

/**
 * Full-screen sheet where the student writes each character once. Answers can then
 * be drawn in their own handwriting. Characters they skip fall back to the
 * built-in strokes (numbers) or to text.
 */
export default function HandwritingSetup({
  glyphs,
  onChange,
  onClose,
}: {
  glyphs: UserGlyphs
  onChange: (g: UserGlyphs) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState(SETS[0].id)
  const set = SETS.find((s) => s.id === tab)!
  const done = SETS.flatMap((s) => s.chars).filter((c) => glyphs[c]).length

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--page)]" onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--chrome)] px-4 pb-3 backdrop-blur-xl"
        style={{ paddingTop: "calc(12px + env(safe-area-inset-top))" }}
      >
        <div>
          <h2 className="text-[17px] font-semibold text-[var(--text)]">Your handwriting</h2>
          <p className="text-[13px] text-[var(--text-muted)]">
            Write each character between the lines. {done} of {HANDWRITING_CHAR_COUNT} done.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-11 shrink-0 rounded-full bg-[#007AFF] px-5 text-[15px] font-medium text-white [touch-action:manipulation] active:opacity-80"
        >
          Done
        </button>
      </div>
      <div className="flex gap-1 px-4 pt-3">
        {SETS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setTab(s.id)}
            className={`h-11 rounded-full px-4 text-[15px] [touch-action:manipulation] ${
              s.id === tab ? "bg-[var(--text)] text-[var(--board)]" : "text-[var(--text)] active:bg-[var(--press)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4" style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom))" }}>
        <div className="grid justify-center gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, ${CW}px)` }}>
          {set.chars.map((ch) => (
            <Cell
              key={ch}
              ch={ch}
              glyph={glyphs[ch]}
              onChange={(g) => {
                const next = { ...glyphs }
                if (g) next[ch] = g
                else delete next[ch]
                onChange(next)
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
