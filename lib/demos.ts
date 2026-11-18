// Ready-made demo boards. Ink is synthesized from the stroke glyph set, so a
// demo board looks like something a student wrote and works with Analyze.
import { builtinGlyphs } from "./glyphs"
import { INK_COLOR } from "./config"
import type { Diagram, Stroke } from "./types"

export type Demo = {
  id: string
  title: string
  you: string // what the student does
  get: string // what they get
  ink?: { text: string; x: number; y: number; h: number }[]
  diagram?: { diagram: Diagram; x: number; y: number }
  ask?: { prompt: string; x: number; y: number } // opens the Ask box prefilled
  hint: string // shown when the board opens
}

/** Turns text into pen strokes using the glyph set, with a little wobble so it looks hand-drawn. */
export function inkFromText(text: string, x: number, y: number, h: number): Stroke[] {
  const strokes: Stroke[] = []
  let cursor = x
  let seed = 7
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5) * h * 0.03
  for (const ch of text) {
    const g = builtinGlyphs.get(ch)
    if (!g) continue
    for (const st of g.strokes) {
      const t0 = Date.now()
      strokes.push({
        id: crypto.randomUUID(),
        points: st.map(([gx, gy], i) => ({ x: cursor + gx * h + rand(), y: y + gy * h + rand(), p: 0.5, t: t0 + i * 8 })),
        tool: "pen",
        width: 5,
        color: INK_COLOR,
        real: false,
        createdAt: t0,
      })
    }
    cursor += (g.width + 0.2) * h
  }
  return strokes
}

const CALVIN: Diagram = {
  title: "Calvin cycle (practice)",
  layout: "cycle",
  nodes: [
    { id: "co2", label: "CO₂ enters", blank: 0 },
    { id: "rubp", label: "RuBP", blank: 1 },
    { id: "3pg", label: "3-PGA", blank: 0 },
    { id: "atp", label: "ATP + NADPH used", blank: 0 },
    { id: "g3p", label: "G3P", blank: 2 },
    { id: "regen", label: "RuBP regenerated", blank: 3 },
  ].map((n) => (n.blank ? n : { id: n.id, label: n.label })),
  edges: [
    { from: "co2", to: "rubp", label: "fixation" },
    { from: "rubp", to: "3pg" },
    { from: "3pg", to: "atp", label: "reduction" },
    { from: "atp", to: "g3p" },
    { from: "g3p", to: "regen" },
    { from: "regen", to: "co2" },
  ],
}

export const DEMOS: Demo[] = [
  {
    id: "quick-math",
    title: "Quick math",
    you: "Write a sum without an equals sign",
    get: "The answer drawn next to it, with the “=”",
    ink: [{ text: "2500+10", x: 120, y: 160, h: 70 }],
    hint: "Tap Analyze",
  },
  {
    id: "finish-equation",
    title: "Finish the equation",
    you: "Write a problem ending in “=”",
    get: "Just the result, drawn in place",
    ink: [{ text: "144/12=", x: 120, y: 160, h: 70 }],
    hint: "Tap Analyze",
  },
  {
    id: "solve",
    title: "Solve for x",
    you: "Write an equation with an unknown",
    get: "x = …",
    ink: [{ text: "3x+5=20", x: 120, y: 160, h: 70 }],
    hint: "Tap Analyze",
  },
  {
    id: "check-work",
    title: "Check my work",
    you: "Write your own answer, right or wrong",
    get: "A ✗ and the correct answer when it’s wrong",
    ink: [{ text: "7×8=54", x: 120, y: 160, h: 70 }],
    hint: "Tap Analyze",
  },
  {
    id: "explain",
    title: "Explain a topic",
    you: "Write “Krebs cycle?” (or use Ask)",
    get: "A short, accurate explanation",
    ask: { prompt: "Explain the Krebs cycle", x: 120, y: 140 },
    hint: "Tap Create, or write a topic with “?” and tap Analyze",
  },
  {
    id: "diagram",
    title: "Diagram on demand",
    you: "Ask for a diagram anywhere on the board",
    get: "A clean diagram you can move around",
    ask: { prompt: "Diagram of photosynthesis: light reactions and the Calvin cycle", x: 120, y: 120 },
    hint: "Tap Create",
  },
  {
    id: "practice",
    title: "Practice with blanks",
    you: "Fill the numbered blanks with your pen",
    get: "✓ or the right term for each blank",
    diagram: { diagram: CALVIN, x: 120, y: 90 },
    hint: "Write in the numbered blanks, then tap Analyze",
  },
  {
    id: "make-practice",
    title: "Make a practice sheet",
    you: "Ask for any diagram with blanks",
    get: "A numbered fill-in diagram to study with",
    ask: { prompt: "Draw the Krebs cycle with 4 numbered blanks for me to fill in", x: 120, y: 120 },
    hint: "Tap Create, then fill in the blanks and tap Analyze",
  },
  {
    id: "photo",
    title: "Photo to diagram",
    you: "Take or pick a photo of notes or a textbook figure",
    get: "It rebuilt as a diagram on your board",
    hint: "Tap the camera button in the toolbar",
  },
]
