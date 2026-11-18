// Typed text boxes (Text tool): sizing shared by the overlay and the export.
import { textWidth } from "./measure"
import type { TextBox } from "./types"

export const TEXT_SIZE = 22
export const TEXT_PAD = 6
export const TEXT_LINE = 1.25

export function textBoxSize(t: TextBox) {
  const lines = t.text.split("\n")
  const w = Math.max(24, ...lines.map((l) => textWidth(l, t.size, 500)))
  return { w: Math.ceil(w + 2 * TEXT_PAD), h: Math.ceil(lines.length * t.size * TEXT_LINE + 2 * TEXT_PAD) }
}
