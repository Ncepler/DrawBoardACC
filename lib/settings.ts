// User settings and the user's own handwriting glyphs, kept in this browser only.
import type { Glyph, GlyphSet } from "./glyphs"
import { builtinGlyphs } from "./glyphs"

export type Theme = "system" | "light" | "dark"
export type Settings = { theme: Theme; handwriting: boolean; autoAnalyze: boolean; version: 1 }

import { SETTINGS_KEY } from "./theme"
export { SETTINGS_KEY }
export const GLYPHS_KEY = "ai-whiteboard:glyphs:v1"

export const DEFAULT_SETTINGS: Settings = { theme: "system", handwriting: false, autoAnalyze: false, version: 1 }

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
export function glyphSetFor(user: UserGlyphs, handwriting: boolean): GlyphSet {
  if (!handwriting) return builtinGlyphs
  return { get: (ch) => user[ch] ?? builtinGlyphs.get(ch) }
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
