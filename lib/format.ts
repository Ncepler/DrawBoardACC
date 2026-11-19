// Pure text helpers shared by the server routes and the client.
import type { AnswerKind } from "./types"

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "(": "⁽", ")": "⁾", n: "ⁿ", x: "ˣ", i: "ⁱ",
}
const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "(": "₍", ")": "₎",
}

function mapAll(s: string, table: Record<string, string>, fallback: (s: string) => string) {
  const chars = [...s.trim()]
  return chars.every((c) => table[c]) ? chars.map((c) => table[c]).join("") : fallback(s)
}
const sup = (e: string) => mapAll(e, SUP, (s) => `^(${s})`)
const sub = (e: string) => mapAll(e, SUB, (s) => `_${s}`)
const group = (a: string) => (/^[\w.²³]+$/.test(a.trim()) ? a.trim() : `(${a.trim()})`)

/** Turns LaTeX / caret math into plain readable text: \frac{a}{b} -> a/(b), x^2 -> x², CO_2 -> CO₂. */
export function toPlainMath(input: string): string {
  let t = input.replace(/\$+/g, "").replace(/\\\(|\\\)|\\\[|\\\]/g, "")
  for (let i = 0; i < 6; i++) {
    t = t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${group(a)}/${group(b)}`)
  }
  t = t
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => `√${group(a)}`)
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\pi/g, "π")
    .replace(/\\theta/g, "θ")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\leq?/g, "≤")
    .replace(/\\geq?/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\infty/g, "∞")
    .replace(/\\rightarrow|\\to/g, "→")
    .replace(/\\left|\\right/g, "")
    .replace(/\^\{([^{}]*)\}/g, (_, e) => sup(e))
    .replace(/\^(-?\d+|[a-z])/g, (_, e) => sup(e))
    .replace(/_\{([^{}]*)\}/g, (_, e) => sub(e))
    .replace(/_(\d+)/g, (_, e) => sub(e))
    .replace(/\\(text|mathrm|mathbf|operatorname)\s*/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}\\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/(\d)\s*\*\s*(\d)/g, "$1×$2")
  return t.replace(/\s+/g, " ").trim()
}

/** Strips markdown so explanations read as plain sentences. */
export function stripMarkdown(s: string) {
  return s
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*#+\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}

export const truncateWords = (text: string, max: number) => text.trim().split(/\s+/).slice(0, max).join(" ")

export const KIND_LIMITS: Record<AnswerKind, number> = { math: 10, term: 6, explain: 60, check: 8, circle: 6 }

/**
 * Final cleanup of one answer, by kind. For math: plain text (no LaTeX), and an "="
 * in front when the student didn't write one, so "2500+10" reads "2500+10 = 2510".
 */
export function formatAnswer(kind: AnswerKind, answer: string, reading: string): string {
  let a = toPlainMath(stripMarkdown(answer))
  if (kind === "math") {
    const r = reading.trim()
    a = a.replace(/^=\s*/, "")
    if (r && !r.includes("=")) a = `= ${a}`
  }
  return truncateWords(a, KIND_LIMITS[kind])
}
