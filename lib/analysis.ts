import { cardSize } from "./cards"
import { EXPORT_MAX_SIDE, INK_COLOR } from "./config"
import { EXPORT_COLORS, diagramSvg, layoutDiagram } from "./diagram"
import { truncateWords, KIND_LIMITS } from "./format"
import { drawStroke } from "./ink"
import { FONT_STACK, wrapLines } from "./measure"
import { TEXT_LINE, TEXT_PAD, textBoxSize } from "./texts"
import type { Answer, AnswerItem, AnswerKind, Card, Stroke, TextBox } from "./types"

export type ExportRegion = { x: number; y: number; w: number; h: number }

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** An answer as it sits on screen (from placeAnswers), so the export can draw it where the student sees it. */
export type AnswerRect = { text: string; kind?: AnswerKind; left: number; top: number; w: number; h: number }

/** The app's own answers are drawn in this blue; the Gemini prompt says what it means. */
const ANSWER_BLUE = "#007AFF"

/**
 * Renders everything on the board to a PNG: the student's strokes and typed text
 * in black, practice diagrams in gray, and the app's earlier answers in blue so a
 * follow-up ("÷ 2" under an answer) can build on them. AI notes and non-practice
 * cards are left out.
 */
export async function exportBoardPng(
  strokes: Stroke[],
  cards: Card[],
  texts: TextBox[],
  answers: AnswerRect[],
  viewW: number,
  viewH: number,
) {
  const pad = 24
  let x0 = 0, y0 = 0, x1 = viewW, y1 = viewH
  for (const s of strokes) {
    for (const p of s.points) {
      x0 = Math.min(x0, p.x - pad)
      y0 = Math.min(y0, p.y - pad)
      x1 = Math.max(x1, p.x + pad)
      y1 = Math.max(y1, p.y + pad)
    }
  }
  const diagrams = cards.filter((c) => c.type === "diagram")
  for (const c of diagrams) {
    const { w, h } = cardSize(c)
    x0 = Math.min(x0, c.pos.x - pad)
    y0 = Math.min(y0, c.pos.y - pad)
    x1 = Math.max(x1, c.pos.x + w + pad)
    y1 = Math.max(y1, c.pos.y + h + pad)
  }
  for (const t of texts) {
    const { w, h } = textBoxSize(t)
    x0 = Math.min(x0, t.pos.x - pad)
    y0 = Math.min(y0, t.pos.y - pad)
    x1 = Math.max(x1, t.pos.x + w + pad)
    y1 = Math.max(y1, t.pos.y + h + pad)
  }
  for (const a of answers) {
    x0 = Math.min(x0, a.left - pad)
    y0 = Math.min(y0, a.top - pad)
    x1 = Math.max(x1, a.left + a.w + pad)
    y1 = Math.max(y1, a.top + a.h + pad)
  }
  const region: ExportRegion = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  const scale = Math.min(1, EXPORT_MAX_SIDE / Math.max(region.w, region.h))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(region.w * scale))
  canvas.height = Math.max(1, Math.round(region.h * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d context")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale)
  ctx.translate(-region.x, -region.y)
  for (const c of diagrams) {
    if (c.type !== "diagram") continue
    try {
      // Typed answers are checked locally ("Check answers"), so Gemini sees empty blanks.
      const bare = { ...c.diagram, nodes: c.diagram.nodes.map((n) => ({ id: n.id, label: n.label, blank: n.blank })) }
      const laid = layoutDiagram(bare)
      const img = await loadSvg(diagramSvg(bare, laid, EXPORT_COLORS))
      ctx.drawImage(img, c.pos.x, c.pos.y, laid.w * c.scale, laid.h * c.scale)
    } catch {
      // a diagram that fails to rasterize is skipped, the ink still goes
    }
  }
  ctx.fillStyle = INK_COLOR
  ctx.textBaseline = "top"
  for (const t of texts) {
    ctx.font = `500 ${t.size}px ${FONT_STACK}`
    t.text.split("\n").forEach((line, i) => ctx.fillText(line, t.pos.x + TEXT_PAD, t.pos.y + TEXT_PAD + i * t.size * TEXT_LINE))
  }
  ctx.fillStyle = ANSWER_BLUE
  for (const a of answers) {
    if (a.kind === "explain") {
      ctx.font = `400 14px ${FONT_STACK}`
      wrapLines(a.text, 14, Math.max(40, a.w - 16)).forEach((line, i) => ctx.fillText(line, a.left + 8, a.top + 8 + i * 18))
    } else {
      const size = Math.min(44, Math.max(14, a.h * 0.7))
      ctx.font = `500 ${size}px ${FONT_STACK}`
      ctx.fillText(a.text, a.left + 4, a.top + Math.max(0, (a.h - size) / 2))
    }
  }
  // Thicker than on screen so thin strokes stay legible after downscaling.
  for (const s of strokes) drawStroke(ctx, { ...s, color: INK_COLOR, width: Math.max(s.width * 1.5, 4 / scale) })
  const dataUrl = canvas.toDataURL("image/png")
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), region }
}

const norm = (t: string | undefined) => (t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

/** Gemini's normalized 0-1000 box -> board coordinates. */
export function boxToBoard(box: [number, number, number, number], region: ExportRegion) {
  const [ymin, xmin, ymax, xmax] = box
  return {
    x: region.x + (xmin / 1000) * region.w,
    y: region.y + (ymin / 1000) * region.h,
    w: ((xmax - xmin) / 1000) * region.w,
    h: ((ymax - ymin) / 1000) * region.h,
  }
}

/**
 * Adds new answers to the board's existing ones. Gemini sees the old answers (in
 * blue) and only returns new things, so nothing is replaced: a follow-up written
 * under an answer ("÷ 2") becomes its own answer. An item that repeats an existing
 * answer's problem in the same spot is dropped, so the old one (and wherever the
 * user dragged it) stays.
 */
export function mergeAnswers(items: AnswerItem[], region: ExportRegion, existing: Answer[]): Answer[] {
  const out = [...existing]
  for (const it of items) {
    const box = boxToBoard(it.box, region)
    const source = it.reading ?? ""
    const kind = (it.kind ?? "term") as AnswerKind
    const text = truncateWords(it.answer, KIND_LIMITS[kind])
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const dup = existing.some((a) => {
      const dx = Math.abs(a.box.x + a.box.w / 2 - cx)
      const dy = Math.abs(a.box.y + a.box.h / 2 - cy)
      const near = dx <= 0.5 * Math.max(a.box.w, box.w) + 30 && dy <= 0.5 * Math.max(a.box.h, box.h) + 15
      const sameProblem = norm(a.source) === norm(source) && norm(source) !== ""
      return near && (sameProblem || norm(a.text) === norm(text))
    })
    if (dup) continue
    out.push({ id: crypto.randomUUID(), box, kind, text, confidence: it.confidence, source, createdAt: Date.now() })
  }
  return out
}

/**
 * Drops answers whose surroundings lost ink (erased or undone). An answer is
 * derived from the "?" and the ink around it, so once that ink is gone the
 * answer is stale and wrong answers are worse than none.
 */
export function pruneAnswers(answers: Answer[], removed: Stroke[]): Answer[] {
  if (!answers.length || !removed.length) return answers
  const boxes = removed.map((s) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of s.points) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
    }
    return { x0, y0, x1, y1 }
  })
  return answers.filter((a) => {
    const m = Math.max(100, 1.5 * Math.max(a.box.w, a.box.h))
    const ax0 = a.box.x - m, ay0 = a.box.y - m
    const ax1 = a.box.x + a.box.w + m, ay1 = a.box.y + a.box.h + m
    return !boxes.some((b) => b.x0 <= ax1 && b.x1 >= ax0 && b.y0 <= ay1 && b.y1 >= ay0)
  })
}
