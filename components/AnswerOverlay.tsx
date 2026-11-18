"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { ANSWER_COLOR } from "@/lib/config"
import { drawRun, measureRun } from "@/lib/glyphs"
import type { Answer } from "@/lib/types"

/**
 * Swap point for the future handwriting renderer: given an answer and where it
 * should sit, return what to draw. Detection and Gemini code never touch this.
 */
export type AnswerRenderer = {
  /** Size the answer will occupy, used for placement. */
  measure(answer: Answer): { w: number; h: number }
  renderAnswer(answer: Answer, pos: { left: number; top: number }): ReactNode
}

/** Font size that matches the handwriting: scales with the height of the drawn "?". */
export function answerFontSize(answer: Answer) {
  return Math.round(Math.min(120, Math.max(14, answer.box.h / 0.72)))
}

export const textAnswerRenderer: AnswerRenderer = {
  measure(a) {
    const fs = answerFontSize(a)
    return { w: Math.round(a.text.length * fs * 0.58 + fs * 0.7), h: Math.round(fs * 1.25) }
  },
  renderAnswer(answer, pos) {
    return (
      <div
        key={answer.id}
        className="absolute whitespace-nowrap font-medium leading-none"
        style={{
          left: pos.left,
          top: pos.top,
          fontSize: answerFontSize(answer),
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
const inkHeight = (a: Answer) => Math.round(Math.min(160, Math.max(24, a.box.h)))

function InkAnswer({ answer, pos }: { answer: Answer; pos: { left: number; top: number } }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { w, h } = inkAnswerRenderer.measure(answer)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const gh = inkHeight(answer)
    const pad = gh * 0.12
    drawRun(ctx, answer.text, pad, pad, gh, ANSWER_COLOR)
  }, [answer, w, h])
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
  measure(a) {
    const gh = inkHeight(a)
    const run = measureRun(a.text) ?? 0
    const pad = gh * 0.12
    return { w: Math.ceil(run * gh + 2 * pad), h: Math.ceil(gh + 2 * pad) }
  },
  renderAnswer: (answer, pos) => <InkAnswer key={answer.id} answer={answer} pos={pos} />,
}

/** Ink when every character has a glyph, otherwise the text pill. */
export const defaultAnswerRenderer: AnswerRenderer = {
  measure: (a) => (measureRun(a.text) !== null ? inkAnswerRenderer : textAnswerRenderer).measure(a),
  renderAnswer: (a, pos) =>
    (measureRun(a.text) !== null ? inkAnswerRenderer : textAnswerRenderer).renderAnswer(a, pos),
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
    const { w, h: H } = renderer.measure(a)
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
  renderer = defaultAnswerRenderer,
}: {
  answers: Answer[]
  width: number
  height: number
  renderer?: AnswerRenderer
}) {
  const positions = place(answers, width, height, renderer)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-live="polite">
      {answers.map((a) => renderer.renderAnswer(a, positions.get(a.id)!))}
    </div>
  )
}
