"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ANSWER_COLOR } from "@/lib/config"
import { drawRun, measureRun } from "@/lib/glyphs"
import type { Answer } from "@/lib/types"

/**
 * Swap point for the future handwriting renderer: given an answer and where it
 * should sit, return what to draw. Detection and Gemini code never touch this.
 */
export type AnswerRenderer = {
  /** Size the answer will occupy, used for placement. */
  measure(answer: Answer, maxW: number): { w: number; h: number }
  renderAnswer(answer: Answer, pos: { left: number; top: number }, maxW: number): ReactNode
}

const MAX_TEXT_PX = 44
const MAX_INK_PX = 110

/**
 * Font size that follows the handwriting (height of the drawn "?"), capped so a
 * loose box from the model can't produce giant text, and shrunk to fit the screen.
 */
export function answerFontSize(answer: Answer, maxW: number) {
  const ideal = Math.min(MAX_TEXT_PX, Math.max(14, answer.box.h / 0.72))
  const fit = (maxW - 8) / (answer.text.length * 0.58 + 0.7)
  return Math.round(Math.max(10, Math.min(ideal, fit)))
}

export const textAnswerRenderer: AnswerRenderer = {
  measure(a, maxW) {
    const fs = answerFontSize(a, maxW)
    return { w: Math.round(a.text.length * fs * 0.58 + fs * 0.7), h: Math.round(fs * 1.25) }
  },
  renderAnswer(answer, pos, maxW) {
    return (
      <div
        key={answer.id}
        className="absolute whitespace-nowrap font-medium leading-none"
        style={{
          left: pos.left,
          top: pos.top,
          fontSize: answerFontSize(answer, maxW),
          padding: "0.12em 0.35em",
          borderRadius: "0.3em",
          color: ANSWER_COLOR,
          background: "rgba(255,255,255,0.88)",
          boxShadow: "0 0 0 0.5px rgba(0,122,255,0.35), 0 1px 4px rgba(0,0,0,0.08)",
          opacity: answer.confidence === "low" ? 0.5 : 1,
          fontStyle: answer.confidence === "low" ? "italic" : "normal",
        }}
      >
        {answer.text}
      </div>
    )
  },
}

/** Digit height matches the height of the drawn "?". */
function inkHeight(a: Answer, maxW: number) {
  const run = measureRun(a.text) ?? 1
  const fit = (maxW - 8) / (run + 0.24)
  return Math.round(Math.max(16, Math.min(MAX_INK_PX, Math.max(24, a.box.h), fit)))
}

function InkAnswer({ answer, pos, maxW }: { answer: Answer; pos: { left: number; top: number }; maxW: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { w, h } = inkAnswerRenderer.measure(answer, maxW)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const gh = inkHeight(answer, maxW)
    const pad = gh * 0.12
    drawRun(ctx, answer.text, pad, pad, gh, ANSWER_COLOR)
  }, [answer, w, h, maxW])
  return (
    <canvas
      ref={ref}
      className="absolute"
      style={{ left: pos.left, top: pos.top, width: w, height: h, opacity: answer.confidence === "low" ? 0.5 : 1 }}
    />
  )
}

/** Answers drawn as pen strokes (numbers only for now). */
export const inkAnswerRenderer: AnswerRenderer = {
  measure(a, maxW) {
    const gh = inkHeight(a, maxW)
    const run = measureRun(a.text) ?? 0
    const pad = gh * 0.12
    return { w: Math.ceil(run * gh + 2 * pad), h: Math.ceil(gh + 2 * pad) }
  },
  renderAnswer: (answer, pos, maxW) => <InkAnswer key={answer.id} answer={answer} pos={pos} maxW={maxW} />,
}

/** Ink when every character has a glyph, otherwise the text pill. */
export const defaultAnswerRenderer: AnswerRenderer = {
  measure: (a, maxW) => (measureRun(a.text) !== null ? inkAnswerRenderer : textAnswerRenderer).measure(a, maxW),
  renderAnswer: (a, pos, maxW) =>
    (measureRun(a.text) !== null ? inkAnswerRenderer : textAnswerRenderer).renderAnswer(a, pos, maxW),
}

type Rect = { left: number; top: number; w: number; h: number }
const GAP = 8


const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top

/** Prefer right of the "?", then below, left, above; stay on-screen, avoid other answers. */
function place(answers: Answer[], vw: number, vh: number, renderer: AnswerRenderer) {
  const placed: Rect[] = []
  const out = new Map<string, { left: number; top: number }>()
  for (const a of answers) {
    const { w, h: H } = renderer.measure(a, vw - 16)
    if (a.pos) {
      placed.push({ left: a.pos.x, top: a.pos.y, w, h: H })
      out.set(a.id, { left: a.pos.x, top: a.pos.y })
      continue
    }
    const { x, y, w: bw, h: bh } = a.box
    const midY = y + bh / 2 - H / 2
    const midX = x + bw / 2 - w / 2
    const candidates: Rect[] = [
      { left: x + bw + GAP, top: midY, w, h: H },
      { left: midX, top: y + bh + GAP, w, h: H },
      { left: x - GAP - w, top: midY, w, h: H },
      { left: midX, top: y - GAP - H, w, h: H },
    ]
    const inBounds = (r: Rect) => r.left >= 4 && r.top >= 4 && r.left + r.w <= vw - 4 && r.top + r.h <= vh - 4
    let chosen = candidates.find((r) => inBounds(r) && !placed.some((p) => overlaps(r, p)))
    if (!chosen) {
      const c = candidates[0]
      chosen = {
        ...c,
        left: Math.min(Math.max(4, c.left), Math.max(4, vw - w - 4)),
        top: Math.min(Math.max(4, c.top), Math.max(4, vh - H - 4)),
      }
    }
    placed.push(chosen)
    out.set(a.id, { left: chosen.left, top: chosen.top })
  }
  return out
}

export default function AnswerOverlay({
  answers,
  width,
  height,
  onMove,
  renderer = defaultAnswerRenderer,
}: {
  answers: Answer[]
  width: number
  height: number
  onMove: (id: string, x: number, y: number) => void
  renderer?: AnswerRenderer
}) {
  const positions = place(answers, width, height, renderer)
  const layer = useRef<HTMLDivElement>(null)
  const grab = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const maxW = width - 16

  const pointerXY = (e: React.PointerEvent) => {
    const r = layer.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 overflow-hidden" aria-live="polite">
      {answers.map((a) => {
        const { w, h } = renderer.measure(a, maxW)
        const base = positions.get(a.id)!
        const dragging = drag?.id === a.id
        const left = dragging ? drag.x : base.left
        const top = dragging ? drag.y : base.top
        const finish = (e: React.PointerEvent) => {
          e.stopPropagation()
          const g = grab.current
          grab.current = null
          if (dragging && g?.moved) onMove(a.id, drag.x, drag.y)
          setDrag(null)
        }
        const hit = Math.max(8, (44 - Math.min(w, h)) / 2)
        return (
          <div
            key={a.id}
            className="pointer-events-auto absolute select-none [-webkit-touch-callout:none] [touch-action:none]"
            style={{
              left,
              top,
              width: w,
              height: h,
              cursor: dragging ? "grabbing" : "grab",
              filter: dragging ? "drop-shadow(0 4px 10px rgba(0,0,0,0.2))" : undefined,
              zIndex: dragging ? 5 : undefined,
            }}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse" && e.button !== 0) return
              e.stopPropagation() // don't start a pen stroke underneath
              e.currentTarget.setPointerCapture(e.pointerId)
              const p = pointerXY(e)
              grab.current = { dx: p.x - base.left, dy: p.y - base.top, sx: p.x, sy: p.y, moved: false }
              setDrag({ id: a.id, x: base.left, y: base.top })
            }}
            onPointerMove={(e) => {
              const g = grab.current
              if (!g || !dragging) return
              e.stopPropagation()
              const p = pointerXY(e)
              if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) < 4) return // a tap isn't a move
              g.moved = true
              setDrag({
                id: a.id,
                x: Math.min(Math.max(0, p.x - g.dx), Math.max(0, width - w)),
                y: Math.min(Math.max(0, p.y - g.dy), Math.max(0, height - h)),
              })
            }}
            onPointerUp={finish}
            onPointerCancel={finish}
          >
            {/* enlarged invisible hit area so small answers are still easy to grab */}
            <div className="absolute" style={{ inset: -hit }} />
            {renderer.renderAnswer(a, { left: 0, top: 0 }, maxW)}
          </div>
        )
      })}
    </div>
  )
}
