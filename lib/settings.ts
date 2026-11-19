// User settings and the user's own handwriting glyphs, kept in this browser only.
import type { Glyph, GlyphSet } from "./glyphs"
import { builtinGlyphs } from "./glyphs"

export type Theme = "system" | "light" | "dark"
export type Settings = { theme: Theme; handwriting: boolean; autoAnalyze: boolean; snapShapes: boolean; penSize: number; version: 1 }

import { SETTINGS_KEY } from "./theme"
export { SETTINGS_KEY }
export const GLYPHS_KEY = "ai-whiteboard:glyphs:v1"

export const DEFAULT_SETTINGS: Settings = { theme: "system", handwriting: false, autoAnalyze: false, snapShapes: true, penSize: 6, version: 1 }

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null")
    if (s?.version === 1) return { ...DEFAULT_SETTINGS, ...s }
  } catch {}
  return DEFAULT_SETTINGS
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {}
}

export type UserGlyphs = Record<string, Glyph>

export function loadGlyphs(): UserGlyphs {
  try {
    const g = JSON.parse(localStorage.getItem(GLYPHS_KEY) ?? "null")
    if (g && typeof g === "object" && g.version === 1 && g.glyphs) return g.glyphs
  } catch {}
  return {}
}

export function saveGlyphs(glyphs: UserGlyphs) {
  try {
    localStorage.setItem(GLYPHS_KEY, JSON.stringify({ version: 1, glyphs }))
  } catch {}
}

/** The user's own glyphs first, the built-in stroke set for anything they haven't written. */
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹"
const SUB = "₀₁₂₃₄₅₆₇₈₉"

/** A user's digit, shrunk and raised (superscript) or lowered (subscript). */
function shifted(g: Glyph, dy: number): Glyph {
  return { width: g.width * 0.6, strokes: g.strokes.map((st) => st.map(([x, y]) => [x * 0.6, y * 0.55 + dy] as [number, number])) }
}

/** Closing marks the user never writes: each is the opening mark drawn backwards. */
const MIRROR: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<", "≥": "≤" }

function flipped(g: Glyph): Glyph {
  return { width: g.width, strokes: g.strokes.map((st) => st.map(([x, y]) => [+(g.width - x).toFixed(3), y] as [number, number])) }
}

export function glyphSetFor(user: UserGlyphs, handwriting: boolean): GlyphSet {
  if (!handwriting) return builtinGlyphs
  const cache = new Map<string, Glyph | undefined>()
  return {
    get: (ch) => {
      if (user[ch]) return user[ch]
      if (cache.has(ch)) return cache.get(ch)
      let g: Glyph | undefined
      const sup = SUP.indexOf(ch)
      const sub = SUB.indexOf(ch)
      if (sup >= 0 && user[String(sup)]) g = shifted(user[String(sup)], -0.08)
      else if (sub >= 0 && user[String(sub)]) g = shifted(user[String(sub)], 0.62)
      else if (ch === "−" && user["-"]) g = user["-"]
      else if (MIRROR[ch] && user[MIRROR[ch]]) g = flipped(user[MIRROR[ch]])
      else g = builtinGlyphs.get(ch)
      cache.set(ch, g)
      return g
    },
  }
}

export function resolveDark(theme: Theme) {
  if (theme === "dark") return true
  if (theme === "light") return false
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
}

/** Theme colors for canvas drawing (CSS variables don't reach canvas). */
export const THEME = {
  light: { board: "#ffffff", ink: "#1d1d1f", ai: "#007AFF" },
  dark: { board: "#1c1c1e", ink: "#f2f2f7", ai: "#0A84FF" },
}
