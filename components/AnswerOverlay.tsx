"use client"

import { useEffect, useRef, type ReactNode } from "react"
import Draggable from "./Draggable"
import { NOTE_BODY_PX, NOTE_LINE, NOTE_PAD, NOTE_TITLE_PX, NOTE_W, cardSize, noteLines } from "@/lib/cards"
import { DARK_SCREEN_COLORS, DIAGRAM_HANDLE, SCREEN_COLORS, diagramSvg, layoutDiagram } from "@/lib/diagram"
import { builtinGlyphs, drawRun, measureRun, type GlyphSet } from "@/lib/glyphs"
import { textWidth, wrapLines } from "@/lib/measure"
import type { Answer, Card } from "@/lib/types"

/**
 * Swap point for the future handwriting renderer: given an answer, report its
 * size and draw it. Detection and Gemini code never touch this.
 */
export type AnswerRenderer = {
  measure(answer: Answer, maxW: number): { w: number; h: number }
  renderAnswer(answer: Answer, maxW: number): ReactNode
}

const MAX_TEXT_PX = 44
const MAX_INK_PX = 110
const EXPLAIN_PX = 15
const EXPLAIN_LINE = 21
const EXPLAIN_PAD = 12

/** Font size following the handwriting (height of what was written), capped and fitted to the screen. */
function answerFontSize(a: Answer, maxW: number) {
  const ideal = Math.min(MAX_TEXT_PX, Math.max(14, a.box.h / 0.72))
  const natural = textWidth(a.text, ideal, 500) + ideal * 0.7
  const fit = natural > maxW - 8 ? ideal * ((maxW - 8) / natural) : ideal
  return Math.round(Math.max(10, fit))
}

export const textAnswerRenderer: AnswerRenderer = {
  measure(a, maxW) {
    const fs = answerFontSize(a, maxW)
    return { w: Math.ceil(textWidth(a.text, fs, 500) + fs * 0.7), h: Math.round(fs * 1.25) }
  },
  renderAnswer(a, maxW) {
    return (
      <div
        className="absolute left-0 top-0 whitespace-nowrap font-medium leading-none"
        style={{
          fontSize: answerFontSize(a, maxW),
          padding: "0.12em 0.35em",
          borderRadius: "0.3em",
          color: "var(--ai)",
          background: "var(--surface)",
          boxShadow: "0 0 0 0.5px var(--ai-ring), 0 1px 4px rgba(0,0,0,0.08)",
          opacity: a.confidence === "low" ? 0.5 : 1,
          fontStyle: a.confidence === "low" ? "italic" : "normal",
        }}
      >
        {a.text}
      </div>
    )
  },
}

/** Explanations: a few sentences, wrapped in a small card. */
const explainWidth = (maxW: number) => Math.min(320, maxW)
export const explainAnswerRenderer: AnswerRenderer = {
  measure(a, maxW) {
    const w = explainWidth(maxW)
    const lines = wrapLines(a.text, EXPLAIN_PX, w - 2 * EXPLAIN_PAD).length
    return { w, h: lines * EXPLAIN_LINE + 2 * EXPLAIN_PAD }
  },
  renderAnswer(a, maxW) {
    const w = explainWidth(maxW)
    return (
      <div
        className="absolute left-0 top-0 rounded-2xl"
        style={{
          width: w,
          padding: EXPLAIN_PAD,
          fontSize: EXPLAIN_PX,
          lineHeight: `${EXPLAIN_LINE}px`,
          color: "var(--ai-text)",
          background: "var(--surface)",
          boxShadow: "0 0 0 0.5px var(--ai-ring), 0 2px 10px rgba(0,0,0,0.08)",
          opacity: a.confidence === "low" ? 0.6 : 1,
        }}
      >
        {wrapLines(a.text, EXPLAIN_PX, w - 2 * EXPLAIN_PAD).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    )
  },
}

/** Glyph height matches the height of what was written. */
function inkHeight(a: Answer, maxW: number, set: GlyphSet) {
  const run = measureRun(a.text, set) ?? 1
  const fit = (maxW - 8) / (run + 0.24)
  return Math.round(Math.max(16, Math.min(MAX_INK_PX, Math.max(24, a.box.h * 0.8), fit)))
}

function inkSize(a: Answer, maxW: number, set: GlyphSet) {
  const gh = inkHeight(a, maxW, set)
  const run = measureRun(a.text, set) ?? 0
  const pad = gh * 0.12
  // extra room below for descenders (g, y, p) in the user's own handwriting
  return { w: Math.ceil(run * gh + 2 * pad), h: Math.ceil(gh * 1.25 + 2 * pad) }
}

function InkAnswer({ answer, maxW, set, color }: { answer: Answer; maxW: number; set: GlyphSet; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { w, h } = inkSize(answer, maxW, set)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const gh = inkHeight(answer, maxW, set)
    const pad = gh * 0.12
    drawRun(ctx, answer.text, pad, pad, gh, color, set)
  }, [answer, w, h, maxW, set, color])
  return (
    <canvas
      ref={ref}
      className="absolute left-0 top-0"
      style={{ width: w, height: h, opacity: answer.confidence === "low" ? 0.5 : 1 }}
    />
  )
}

/** Answers drawn as pen strokes: built-in strokes for math, or the user's own handwriting. */
export function makeInkRenderer(set: GlyphSet, color: string): AnswerRenderer {
  return {
    measure: (a, maxW) => inkSize(a, maxW, set),
    renderAnswer: (a, maxW) => <InkAnswer answer={a} maxW={maxW} set={set} color={color} />,
  }
}

/** Ink when every character has a glyph, a card for explanations, otherwise the text pill. */
export function makeDefaultRenderer(set: GlyphSet, color: string): AnswerRenderer {
  const ink = makeInkRenderer(set, color)
  const pick = (a: Answer): AnswerRenderer =>
    a.kind === "explain" ? explainAnswerRenderer : measureRun(a.text, set) !== null ? ink : textAnswerRenderer
  return {
    measure: (a, maxW) => pick(a).measure(a, maxW),
    renderAnswer: (a, maxW) => pick(a).renderAnswer(a, maxW),
  }
}

type Rect = { left: number; top: number; w: number; h: number }
const GAP = 8

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top

/** Prefer right of what it answers, then below, left, above; stay on-screen, avoid other items. */
function place(answers: Answer[], cards: Card[], vw: number, vh: number, renderer: AnswerRenderer) {
  const placed: Rect[] = cards.map((c) => ({ left: c.pos.x, top: c.pos.y, ...cardSize(c) }))
  const out = new Map<string, Rect>()
  for (const a of answers) {
    const { w, h: H } = renderer.measure(a, vw - 16)
    if (a.pos) {
      const r = { left: a.pos.x, top: a.pos.y, w, h: H }
      placed.push(r)
      out.set(a.id, r)
      continue
    }
    const { x, y, w: bw, h: bh } = a.box
    const midY = y + bh / 2 - H / 2
    const candidates: Rect[] = [
      { left: x + bw + GAP, top: midY, w, h: H },
      { left: x, top: y + bh + GAP, w, h: H },
      { left: x - GAP - w, top: midY, w, h: H },
      { left: x, top: y - GAP - H, w, h: H },
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
    out.set(a.id, chosen)
  }
  return out
}

function NoteCard({ card }: { card: Extract<Card, { type: "note" }> }) {
  const titleLines = wrapLines(card.title, NOTE_TITLE_PX, NOTE_W - 2 * NOTE_PAD, 600)
  return (
    <div
      className="absolute left-0 top-0 origin-top-left rounded-2xl"
      style={{
        width: NOTE_W,
        padding: NOTE_PAD,
        transform: `scale(${card.scale})`,
        background: "var(--surface)",
        boxShadow: "0 0 0 0.5px var(--ai-ring), 0 4px 18px rgba(0,0,0,0.10)",
      }}
    >
      <div style={{ fontSize: NOTE_TITLE_PX, lineHeight: "20px", fontWeight: 600, color: "var(--ai)" }}>
        {titleLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: NOTE_BODY_PX, lineHeight: `${NOTE_LINE}px`, color: "var(--ai-text)" }}>
        {noteLines(card.text).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  )
}

function DiagramCard({ card, dark }: { card: Extract<Card, { type: "diagram" }>; dark: boolean }) {
  const laid = layoutDiagram(card.diagram)
  return (
    <div
      className="absolute left-0 top-0 rounded-2xl"
      style={{
        width: laid.w * card.scale,
        height: laid.h * card.scale,
        // transparent so the student's ink underneath (e.g. in practice blanks) stays visible
      }}
      // Labels are escaped in diagramSvg.
      dangerouslySetInnerHTML={{ __html: diagramSvg(card.diagram, laid, dark ? DARK_SCREEN_COLORS : SCREEN_COLORS) }}
    />
  )
}

export type Selection = { type: "answer" | "card"; id: string } | null

export default function AnswerOverlay({
  answers,
  cards,
  pending,
  width,
  height,
  selected,
  onSelect,
  onMoveAnswer,
  onMoveCard,
  onDelete,
  glyphs = builtinGlyphs,
  aiColor = "#007AFF",
  dark = false,
}: {
  answers: Answer[]
  cards: Card[]
  pending: { id: string; x: number; y: number }[]
  width: number
  height: number
  selected: Selection
  onSelect: (s: Selection) => void
  onMoveAnswer: (id: string, x: number, y: number) => void
  onMoveCard: (id: string, x: number, y: number) => void
  onDelete: (s: NonNullable<Selection>) => void
  glyphs?: GlyphSet
  aiColor?: string
  dark?: boolean
}) {
  const renderer = makeDefaultRenderer(glyphs, aiColor)
  const positions = place(answers, cards, width, height, renderer)
  const maxW = width - 16
  const bounds = { w: width, h: height }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-live="polite">
      {cards.map((c) => {
        const { w, h } = cardSize(c)
        const sel = selected?.type === "card" && selected.id === c.id
        return (
          <Draggable
            key={c.id}
            x={c.pos.x}
            y={c.pos.y}
            w={w}
            h={h}
            bounds={bounds}
            selected={sel}
            onSelect={() => onSelect(sel ? null : { type: "card", id: c.id })}
            onMove={(x, y) => onMoveCard(c.id, x, y)}
            onDelete={() => onDelete({ type: "card", id: c.id })}
            handle={c.type === "diagram" ? DIAGRAM_HANDLE * c.scale : undefined}
          >
            {c.type === "note" ? <NoteCard card={c} /> : <DiagramCard card={c} dark={dark} />}
          </Draggable>
        )
      })}
      {answers.map((a) => {
        const r = positions.get(a.id)!
        const sel = selected?.type === "answer" && selected.id === a.id
        return (
          <Draggable
            key={a.id}
            x={r.left}
            y={r.top}
            w={r.w}
            h={r.h}
            bounds={bounds}
            selected={sel}
            onSelect={() => onSelect(sel ? null : { type: "answer", id: a.id })}
            onMove={(x, y) => onMoveAnswer(a.id, x, y)}
            onDelete={() => onDelete({ type: "answer", id: a.id })}
          >
            {renderer.renderAnswer(a, maxW)}
          </Draggable>
        )
      })}
      {pending.map((p) => (
        <div
          key={p.id}
          className="absolute flex items-center gap-2 rounded-full bg-[var(--chrome-strong)] px-3 py-2 text-[14px] text-[var(--ai-text)] shadow-[0_0_0_0.5px_var(--ai-ring),0_2px_10px_rgba(0,0,0,0.08)]"
          style={{ left: p.x, top: p.y }}
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#007AFF]" />
          Thinking…
        </div>
      ))}
    </div>
  )
}
