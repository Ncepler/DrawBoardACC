"use client"

import type { ReactNode } from "react"
import { ANSWER_COLOR } from "@/lib/config"
import type { Answer } from "@/lib/types"

/**
 * Swap point for the future handwriting renderer: given an answer and where it
 * should sit, return what to draw. Detection and Gemini code never touch this.
 */
export type AnswerRenderer = {
  renderAnswer(answer: Answer, pos: { left: number; top: number }): ReactNode
}

/** Font size that matches the handwriting: scales with the height of the drawn "?". */
export function answerFontSize(answer: Answer) {
  return Math.round(Math.min(120, Math.max(14, answer.box.h / 0.72)))
}

export const textAnswerRenderer: AnswerRenderer = {
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

type Rect = { left: number; top: number; w: number; h: number }
const GAP = 8

function estimateSize(a: Answer) {
  const fs = answerFontSize(a)
  return { w: Math.round(a.text.length * fs * 0.58 + fs * 0.7), h: Math.round(fs * 1.25) }
}

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top

/** Prefer right of the "?", then below, left, above; stay on-screen, avoid other answers. */
function place(answers: Answer[], vw: number, vh: number) {
  const placed: Rect[] = []
  const out = new Map<string, { left: number; top: number }>()
  for (const a of answers) {
    const { w, h: H } = estimateSize(a)
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
  renderer = textAnswerRenderer,
}: {
  answers: Answer[]
  width: number
  height: number
  renderer?: AnswerRenderer
}) {
  const positions = place(answers, width, height)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-live="polite">
      {answers.map((a) => renderer.renderAnswer(a, positions.get(a.id)!))}
    </div>
  )
}
