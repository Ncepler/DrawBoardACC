// Exponent markup for answers: "3^(π/2)" and "x^n" show the exponent raised and small.
// Pure helpers, shared by the glyph (ink) renderer and the text renderer.

export const SUP_OPEN = ""
export const SUP_CLOSE = ""

/** Replaces ^(…) and ^token with open/close markers (spaces inside an exponent are dropped). Safe to run twice. */
export function markSupers(text: string): string {
  return text.replace(/\^\(([^()]*)\)|\^(-?[A-Za-z0-9π]+)/g, (_, a, b) => SUP_OPEN + String(a ?? b).replace(/\s+/g, "") + SUP_CLOSE)
}

export type Token = { ch: string; sup: boolean }

export function tokens(text: string): Token[] {
  const out: Token[] = []
  let sup = false
  for (const ch of markSupers(text)) {
    if (ch === SUP_OPEN) sup = true
    else if (ch === SUP_CLOSE) sup = false
    else out.push({ ch, sup })
  }
  return out
}

export type Run = { t: string; sup: boolean }

export function richRuns(text: string): Run[] {
  const runs: Run[] = []
  for (const { ch, sup } of tokens(text)) {
    const last = runs[runs.length - 1]
    if (last && last.sup === sup) last.t += ch
    else runs.push({ t: ch, sup })
  }
  return runs
}
