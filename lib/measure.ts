// Text measurement for layout (client only), using the same font stack as the page.
export const FONT_STACK = '-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif'

/** Handwriting-looking fonts that ship with iPadOS/macOS/Windows/Android, so no download is needed. */
export const HAND_FONT = '"Bradley Hand", "Noteworthy", "Segoe Print", "Chalkboard SE", "Comic Sans MS", cursive'

let ctx: CanvasRenderingContext2D | null = null

export function textWidth(text: string, px: number, weight = 400, font = FONT_STACK) {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return text.length * px * 0.55
  ctx.font = `${weight} ${px}px ${font}`
  return ctx.measureText(text).width
}

/** Greedy word wrap to maxW; long words are broken by character. */
export function wrapLines(text: string, px: number, maxW: number, weight = 400, font = FONT_STACK): string[] {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (textWidth(next, px, weight, font) <= maxW) {
      line = next
      continue
    }
    if (line) lines.push(line)
    if (textWidth(word, px, weight, font) <= maxW) {
      line = word
      continue
    }
    let chunk = ""
    for (const ch of word) {
      if (textWidth(chunk + ch, px, weight, font) > maxW && chunk) {
        lines.push(chunk)
        chunk = ""
      }
      chunk += ch
    }
    line = chunk
  }
  if (line) lines.push(line)
  return lines.length ? lines : [""]
}
