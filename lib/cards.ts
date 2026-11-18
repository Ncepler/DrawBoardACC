// Sizing for AI cards (notes and diagrams) on the overlay.
import { layoutDiagram } from "./diagram"
import { GRAPH_H, GRAPH_W } from "./graph"
import { wrapLines } from "./measure"
import type { Card, CardPayload } from "./types"

export const NOTE_W = 320
export const NOTE_PAD = 16
export const NOTE_TITLE_PX = 15
export const NOTE_BODY_PX = 15
export const NOTE_LINE = 21

export function noteLines(text: string) {
  return wrapLines(text, NOTE_BODY_PX, NOTE_W - 2 * NOTE_PAD)
}

/** Natural (unscaled) size of a card's content. */
export function naturalSize(c: CardPayload): { w: number; h: number } {
  if (c.type === "diagram") {
    const l = layoutDiagram(c.diagram)
    return { w: l.w, h: l.h }
  }
  if (c.type === "graph") return { w: GRAPH_W, h: GRAPH_H }
  const titleLines = wrapLines(c.title, NOTE_TITLE_PX, NOTE_W - 2 * NOTE_PAD, 600).length
  return { w: NOTE_W, h: NOTE_PAD * 2 + titleLines * 20 + 6 + noteLines(c.text).length * NOTE_LINE }
}

export function cardSize(c: Card) {
  const n = naturalSize(c)
  return { w: n.w * c.scale, h: n.h * c.scale }
}

/** Scale so a new card fits comfortably on screen. */
export function fitScale(c: CardPayload, vw: number, vh: number) {
  const n = naturalSize(c)
  return Math.min(1, (vw - 32) / n.w, (vh - 140) / n.h)
}
