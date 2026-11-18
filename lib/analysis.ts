import { EXPORT_MAX_SIDE, INK_COLOR, MAX_ANSWER_WORDS } from "./config"
import { drawStroke } from "./ink"
import type { Answer, AnswerItem, Stroke } from "./types"

export type ExportRegion = { x: number; y: number; w: number; h: number }

/**
 * Renders ONLY the vector strokes (white bg, ink) to a PNG. The overlay is DOM,
 * so it can never end up in this image.
 */
export function exportInkPng(strokes: Stroke[], viewW: number, viewH: number) {
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
  // Thicker than on screen so thin strokes stay legible after downscaling.
  for (const s of strokes) drawStroke(ctx, { ...s, color: INK_COLOR, width: Math.max(s.width * 1.5, 4 / scale) })
  const dataUrl = canvas.toDataURL("image/png")
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), region }
}

export function truncateWords(text: string, max = MAX_ANSWER_WORDS) {
  return text.trim().split(/\s+/).slice(0, max).join(" ")
}

/**
 * Turns Gemini's normalized boxes into board-space answers. If a new "?" sits
 * on top of an existing answer, keep the old text so answers don't flicker.
 */
export function mergeAnswers(
  items: AnswerItem[],
  region: ExportRegion,
  existing: Answer[],
): Answer[] {
  const used = new Set<string>()
  return items.map((it) => {
    const [ymin, xmin, ymax, xmax] = it.box
    const box = {
      x: region.x + (xmin / 1000) * region.w,
      y: region.y + (ymin / 1000) * region.h,
      w: ((xmax - xmin) / 1000) * region.w,
      h: ((ymax - ymin) / 1000) * region.h,
    }
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const limit = Math.max(30, Math.max(box.w, box.h))
    let match: Answer | undefined
    let best = Infinity
    for (const a of existing) {
      if (used.has(a.id)) continue
      const d = Math.hypot(a.box.x + a.box.w / 2 - cx, a.box.y + a.box.h / 2 - cy)
      if (d < limit && d < best) {
        best = d
        match = a
      }
    }
    if (match) {
      used.add(match.id)
      return { ...match, box }
    }
    return {
      id: crypto.randomUUID(),
      box,
      text: truncateWords(it.answer),
      confidence: it.confidence,
      createdAt: Date.now(),
    }
  })
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
