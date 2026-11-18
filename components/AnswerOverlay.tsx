"use client"

import { useEffect, useRef, type ReactNode } from "react"
import Draggable from "./Draggable"
import { NOTE_BODY_PX, NOTE_LINE, NOTE_PAD, NOTE_TITLE_PX, NOTE_W, cardSize, noteLines } from "@/lib/cards"
import { DARK_SCREEN_COLORS, DIAGRAM_HANDLE, SCREEN_COLORS, diagramSvg, layoutDiagram } from "@/lib/diagram"
import { GRAPH_COLORS, GRAPH_COLORS_DARK, GRAPH_HANDLE, graphSvg } from "@/lib/graph"
import { builtinGlyphs, drawRun, measureRun, wrapRun, type GlyphSet } from "@/lib/glyphs"
import { HAND_FONT, textWidth, wrapLines } from "@/lib/measure"
import { richRuns } from "@/lib/rich"
import { TEXT_LINE, TEXT_PAD, textBoxSize } from "@/lib/texts"
import type { Answer, Card, TextBox } from "@/lib/types"

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

const SUP_PX = 0.65 // exponent size relative to the line

/** Width of text with raised exponents (^(…)). */
const richWidth = (text: string, px: number, weight = 400, font?: string) =>
  richRuns(text).reduce((w, r) => w + textWidth(r.t, r.sup ? px * SUP_PX : px, weight, font), 0)

/** Text with exponents drawn raised and small. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {richRuns(text).map((r, i) =>
        r.sup ? (
          <sup key={i} style={{ fontSize: `${SUP_PX}em`, lineHeight: 0, verticalAlign: "0.55em" }}>
            {r.t}
          </sup>
        ) : (
          <span key={i}>{r.t}</span>
        ),
      )}
    </>
  )
}

/** Font size following the handwriting (height of what was written), capped and fitted to the screen. */
function answerFontSize(a: Answer, maxW: number, font?: string) {
  const ideal = Math.min(MAX_TEXT_PX, Math.max(14, a.box.h / 0.72))
  const natural = richWidth(a.text, ideal, font ? 400 : 500, font) + ideal * 0.7
  const fit = natural > maxW - 8 ? ideal * ((maxW - 8) / natural) : ideal
  return Math.round(Math.max(10, fit))
}

/** A short answer in a pill. `font` is the system font (typed) or a handwriting-looking one. */
const makeTextRenderer = (font?: string): AnswerRenderer => ({
  measure(a, maxW) {
    const fs = answerFontSize(a, maxW, font)
    return { w: Math.ceil(richWidth(a.text, fs, font ? 400 : 500, font) + fs * 0.7), h: Math.round(fs * 1.25) }
  },
  renderAnswer(a, maxW) {
    return (
      <div
        className={`absolute left-0 top-0 whitespace-nowrap leading-none ${font ? "" : "font-medium"}`}
        style={{
          fontSize: answerFontSize(a, maxW, font),
          fontFamily: font,
          padding: a.text.includes("^") ? "0.3em 0.35em 0.06em" : "0.12em 0.35em",
          borderRadius: "0.3em",
          color: "var(--ai)",
          background: "var(--surface)",
          boxShadow: "0 0 0 0.5px var(--ai-ring), 0 1px 4px rgba(0,0,0,0.08)",
          opacity: a.confidence === "low" ? 0.5 : 1,
          fontStyle: a.confidence === "low" ? "italic" : "normal",
        }}
      >
        <Rich text={a.text} />
      </div>
    )
  },
})
export const textAnswerRenderer = makeTextRenderer()
const handTextRenderer = makeTextRenderer(HAND_FONT)

/** Explanations: a few sentences, wrapped in a small card. Typed by default; `hand` uses a handwriting-looking font. */
const explainWidth = (maxW: number) => Math.min(320, maxW)
const makeExplainRenderer = (hand: boolean): AnswerRenderer => {
  const px = hand ? 18 : EXPLAIN_PX
  const line = hand ? 24 : EXPLAIN_LINE
  const font = hand ? HAND_FONT : undefined
  return {
    measure(a, maxW) {
      const w = explainWidth(maxW)
      const lines = wrapLines(a.text, px, w - 2 * EXPLAIN_PAD, 400, font).length
      return { w, h: lines * line + 2 * EXPLAIN_PAD }
    },
    renderAnswer(a, maxW) {
      const w = explainWidth(maxW)
      return (
        <div
          className="absolute left-0 top-0 rounded-2xl"
          style={{
            width: w,
            padding: EXPLAIN_PAD,
            fontSize: px,
            fontFamily: font,
            lineHeight: `${line}px`,
            color: "var(--ai-text)",
            background: "var(--surface)",
            boxShadow: "0 0 0 0.5px var(--ai-ring), 0 2px 10px rgba(0,0,0,0.08)",
            opacity: a.confidence === "low" ? 0.6 : 1,
          }}
        >
          {wrapLines(a.text, px, w - 2 * EXPLAIN_PAD, 400, font).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )
    },
  }
}
export const explainAnswerRenderer = makeExplainRenderer(false)
const handExplainRenderer = makeExplainRenderer(true)

type InkLayout = { gh: number; pad: number; lines: string[]; w: number; h: number }
const LINE_GAP = 1.45 // line height in glyph heights

/**
 * Layout for a drawn answer. Short answers: glyph height follows what was written,
 * shrunk to fit the screen. Explanations (and anything too wide): wrapped onto
 * several lines like real handwriting.
 */
function inkLayout(a: Answer, maxW: number, set: GlyphSet): InkLayout {
  const explain = a.kind === "explain"
  let gh = explain
    ? Math.round(Math.min(32, Math.max(22, a.box.h * 0.45)))
    : Math.round(Math.max(16, Math.min(MAX_INK_PX, Math.max(24, a.box.h * 0.8))))
  const lineMax = explain ? Math.min(560, maxW) : maxW
  let pad = gh * 0.15
  const run = measureRun(a.text, set, true) ?? 0
  let lines: string[]
  if (!explain && run * gh + 2 * pad > lineMax) {
    // try to keep a short answer on one line by shrinking it a little
    const fit = (lineMax - 2 * pad) / run
    if (fit >= Math.max(16, gh * 0.6)) gh = Math.floor(fit)
  }
  pad = gh * 0.15
  if (run * gh + 2 * pad <= lineMax) lines = [a.text]
  else lines = wrapRun(a.text, set, (lineMax - 2 * pad) / gh)
  const widest = Math.max(...lines.map((l) => measureRun(l, set, true) ?? 0))
  return {
    gh,
    pad,
    lines,
    w: Math.ceil(widest * gh + 2 * pad),
    h: Math.ceil((lines.length - 1) * gh * LINE_GAP + gh * 1.3 + 2 * pad),
  }
}

function InkAnswer({ answer, maxW, set, color }: { answer: Answer; maxW: number; set: GlyphSet; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const L = inkLayout(answer, maxW, set)
  const { w, h } = L
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const lay = inkLayout(answer, maxW, set)
    lay.lines.forEach((line, i) => drawRun(ctx, line, lay.pad, lay.pad + i * lay.gh * LINE_GAP, lay.gh, color, set))
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
    measure: (a, maxW) => {
      const L = inkLayout(a, maxW, set)
      return { w: L.w, h: L.h }
    },
    renderAnswer: (a, maxW) => <InkAnswer answer={a} maxW={maxW} set={set} color={color} />,
  }
}

/** How an answer is shown: "text" (typed), "hand" (handwriting) or "auto" (strokes for math, handwriting-looking text otherwise). */
export function answerMode(a: Answer, handwritingOn: boolean): "text" | "hand" | "auto" {
  return a.style ?? (a.kind === "explain" ? "text" : handwritingOn ? "hand" : "auto")
}

/**
 * Default look: explanations are a typed card; math is drawn as pen strokes; other answers are text in a
 * handwriting-looking font; with "my handwriting" on, short answers are drawn with the user's glyphs.
 * The per-answer toggle (`style`) overrides this: "hand" uses the user's glyphs if they made any
 * (otherwise a handwriting-looking font), "text" is plain typed text.
 */
export function makeDefaultRenderer(set: GlyphSet, color: string, handwriting = false, mine: GlyphSet | null = null): AnswerRenderer {
  const ink = makeInkRenderer(set, color)
  const mineInk = mine ? makeInkRenderer(mine, color) : null
  const pick = (a: Answer): AnswerRenderer => {
    const mode = answerMode(a, handwriting)
    if (mode === "text") return a.kind === "explain" ? explainAnswerRenderer : textAnswerRenderer
    if (mode === "hand") {
      if (handwriting) return ink
      return mineInk ?? (a.kind === "explain" ? handExplainRenderer : handTextRenderer)
    }
    return a.kind === "explain" ? explainAnswerRenderer : measureRun(a.text, set) !== null ? ink : handTextRenderer
  }
  return {
    measure: (a, maxW) => pick(a).measure(a, maxW),
    renderAnswer: (a, maxW) => pick(a).renderAnswer(a, maxW),
  }
}

type Rect = { left: number; top: number; w: number; h: number }
const GAP = 8

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top

/** Prefer right of what it answers, then below, left, above; avoid other items. */
export function placeAnswers(answers: Answer[], cards: Card[], maxW: number, renderer: AnswerRenderer) {
  const placed: Rect[] = cards.map((c) => ({ left: c.pos.x, top: c.pos.y, ...cardSize(c) }))
  const out = new Map<string, Rect>()
  for (const a of answers) {
    const { w, h: H } = renderer.measure(a, maxW)
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
    // The board is unbounded, so there is no screen edge to stay inside: take the first free side.
    const chosen = candidates.find((r) => !placed.some((p) => overlaps(r, p))) ?? candidates[0]
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

function GraphCard({ card, dark }: { card: Extract<Card, { type: "graph" }>; dark: boolean }) {
  const { w, h } = cardSize(card)
  return (
    <div
      className="absolute left-0 top-0 origin-top-left"
      style={{ width: w, height: h }}
      // Transparent so the student's ink on the graph stays visible. Text is escaped in graphSvg.
      dangerouslySetInnerHTML={{
        __html: graphSvg(card.graph, dark ? GRAPH_COLORS_DARK : GRAPH_COLORS).replace("<svg ", `<svg style="width:${w}px;height:${h}px" `),
      }}
    />
  )
}

export type Selection = { type: "answer" | "card" | "text"; id: string } | null

/** Text the student typed: same color as their ink, not AI blue. */
function TypedText({ t }: { t: TextBox }) {
  return (
    <div
      className="absolute left-0 top-0 whitespace-pre font-medium text-[var(--text)]"
      style={{ fontSize: t.size, lineHeight: TEXT_LINE, padding: TEXT_PAD }}
    >
      {t.text}
    </div>
  )
}

export default function AnswerOverlay({
  answers,
  cards,
  texts,
  editingTextId,
  pending,
  width,
  scale,
  selected,
  onSelect,
  onMoveAnswer,
  onMoveCard,
  onDelete,
  onMoveText,
  onEditText,
  onCheck,
  textTool,
  glyphs = builtinGlyphs,
  aiColor = "#007AFF",
  dark = false,
  handwriting = false,
  mineGlyphs = null,
  onToggleStyle,
}: {
  answers: Answer[]
  cards: Card[]
  texts: TextBox[]
  editingTextId: string | null
  pending: { id: string; x: number; y: number }[]
  width: number // screen width, used only to cap answer size
  scale: number // board zoom
  selected: Selection
  onSelect: (s: Selection) => void
  onMoveAnswer: (id: string, x: number, y: number) => void
  onMoveCard: (id: string, x: number, y: number) => void
  onDelete: (s: NonNullable<Selection>) => void
  onMoveText: (id: string, x: number, y: number) => void
  onEditText: (id: string) => void
  onCheck: (cardId: string) => void
  textTool: boolean
  glyphs?: GlyphSet
  aiColor?: string
  dark?: boolean
  handwriting?: boolean
  mineGlyphs?: GlyphSet | null
  onToggleStyle: (id: string) => void
}) {
  const renderer = makeDefaultRenderer(glyphs, aiColor, handwriting, mineGlyphs)
  const positions = placeAnswers(answers, cards, width - 16, renderer)
  const maxW = width - 16
  return (
    <div className="pointer-events-none absolute left-0 top-0" aria-live="polite">
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
            scale={scale}
            selected={sel}
            onSelect={() => onSelect(sel ? null : { type: "card", id: c.id })}
            onMove={(x, y) => onMoveCard(c.id, x, y)}
            onDelete={() => onDelete({ type: "card", id: c.id })}
            handle={c.type === "diagram" ? DIAGRAM_HANDLE * c.scale : c.type === "graph" ? GRAPH_HANDLE * c.scale : undefined}
          >
            {c.type === "note" ? <NoteCard card={c} /> : c.type === "graph" ? <GraphCard card={c} dark={dark} /> : <DiagramCard card={c} dark={dark} />}
            {c.type === "diagram" && c.diagram.nodes.some((n) => n.blank && n.fill) && (
              <button
                type="button"
                className="pointer-events-auto absolute left-0 flex h-11 items-center rounded-full bg-[#007AFF] px-4 text-[15px] font-medium text-white shadow [touch-action:manipulation] active:opacity-80"
                style={{ top: h + 8, transform: `scale(${1 / scale})`, transformOrigin: "0 0" }}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onCheck(c.id)
                }}
              >
                Check answers
              </button>
            )}
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
            scale={scale}
            selected={sel}
            keepSize
            onSelect={() => onSelect(sel ? null : { type: "answer", id: a.id })}
            onMove={(x, y) => onMoveAnswer(a.id, x, y)}
            onDelete={() => onDelete({ type: "answer", id: a.id })}
            actions={
              <button
                type="button"
                aria-label={answerMode(a, handwriting) === "text" ? "Show in handwriting" : "Show as typed text"}
                title={answerMode(a, handwriting) === "text" ? "Show in handwriting" : "Show as typed text"}
                className="flex h-11 w-11 items-center justify-center [touch-action:manipulation]"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleStyle(a.id)
                }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#007AFF] text-white shadow">
                  {answerMode(a, handwriting) === "text" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10L4 20z" />
                    </svg>
                  ) : (
                    <span className="text-[12px] font-semibold leading-none">Aa</span>
                  )}
                </span>
              </button>
            }
          >
            {renderer.renderAnswer(a, maxW)}
          </Draggable>
        )
      })}
      {texts.map((t) => {
        if (t.id === editingTextId) return null
        const { w, h } = textBoxSize(t)
        const sel = selected?.type === "text" && selected.id === t.id
        return (
          <Draggable
            key={t.id}
            x={t.pos.x}
            y={t.pos.y}
            w={w}
            h={h}
            scale={scale}
            selected={sel}
            keepSize
            // tap a selected box (or any box with the Text tool) to edit it
            onSelect={() => (sel || textTool ? onEditText(t.id) : onSelect({ type: "text", id: t.id }))}
            onMove={(x, y) => onMoveText(t.id, x, y)}
            onDelete={() => onDelete({ type: "text", id: t.id })}
          >
            <TypedText t={t} />
          </Draggable>
        )
      })}
      {pending.map((p) => (
        <div
          key={p.id}
          className="absolute flex items-center gap-2 rounded-full bg-[var(--chrome-strong)] px-3 py-2 text-[14px] text-[var(--ai-text)] shadow-[0_0_0_0.5px_var(--ai-ring),0_2px_10px_rgba(0,0,0,0.08)]"
          style={{ left: p.x, top: p.y, transform: `scale(${1 / scale})`, transformOrigin: "0 0" }}
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#007AFF]" />
          Thinking…
        </div>
      ))}
    </div>
  )
}
