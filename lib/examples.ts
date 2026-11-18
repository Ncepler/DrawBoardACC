// Ready-made example boards. Ink is synthesized from the stroke glyph set and the shape tool's
// geometry, so an example looks like something a student made and works with Analyze.
import { builtinGlyphs } from "./glyphs"
import { INK_COLOR } from "./config"
import { densify, shapePath, shapeStroke, type ShapeKind } from "./shapes"
import { TEXT_SIZE } from "./texts"
import type { Diagram, Stroke, TextBox } from "./types"

export type Example = {
  id: string
  title: string
  you: string // what the student does
  get: string // what they get
  ink?: { text: string; x: number; y: number; h: number }[]
  shapes?: { kind: ShapeKind; x0: number; y0: number; x1: number; y1: number }[]
  polygons?: [number, number][][] // open or closed outlines, as drawn by pen
  texts?: { text: string; x: number; y: number }[] // typed with the Text tool
  diagram?: { diagram: Diagram; x: number; y: number }
  create?: { prompt: string; x: number; y: number } // opens the Create box prefilled
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

/** A small circle, the degree sign. */
const degree = (x: number, y: number, r = 5) => ({ kind: "circle" as const, x0: x, y0: y, x1: x + 2 * r, y1: y + 2 * r })

export const EXAMPLES: Example[] = [
  {
    id: "math",
    title: "Math as you go",
    you: "Write a sum, a division, or an equation, with or without “=”",
    get: "The answer drawn next to each line",
    ink: [
      { text: "2500+10", x: 120, y: 100, h: 60 },
      { text: "144/12=", x: 120, y: 230, h: 60 },
      { text: "3x+5=20", x: 120, y: 360, h: 60 },
    ],
    hint: "Tap Analyze",
  },
  {
    id: "keep-going",
    title: "Keep going from an answer",
    you: "Analyze “3+3”, then write “÷ 2” under the answer",
    get: "The next step builds on the last answer",
    ink: [{ text: "3+3", x: 120, y: 160, h: 70 }],
    hint: "Tap Analyze, then write ÷ 2 under the blue answer and tap Analyze again",
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
    id: "angle",
    title: "Find the missing angle",
    you: "Draw a triangle, label two angles and put x on the third",
    get: "The answer drawn right at that angle",
    polygons: [[[160, 340], [500, 340], [298, 100], [160, 340]]],
    shapes: [degree(228, 296), degree(454, 304)],
    ink: [
      { text: "60", x: 180, y: 300, h: 28 },
      { text: "50", x: 405, y: 308, h: 28 },
      { text: "x", x: 276, y: 150, h: 34 },
    ],
    hint: "Tap Analyze. Try the Shapes tool to draw your own figure",
  },
  {
    id: "word-problem",
    title: "Word problem",
    you: "Type a question with the T tool, no drawing needed",
    get: "The answer right beside it",
    texts: [{ text: "A car drives 60 mph for 2.5 hours.\nHow far does it go?", x: 120, y: 140 }],
    hint: "Tap Analyze",
  },
  {
    id: "gap",
    title: "Fill the gap",
    you: "Draw boxes and arrows, put a ? where you forgot a name",
    get: "The missing term, written in the gap",
    shapes: [
      { kind: "rectangle", x0: 100, y0: 150, x1: 290, y1: 230 },
      { kind: "arrow", x0: 290, y0: 190, x1: 380, y1: 190 },
      { kind: "rectangle", x0: 380, y0: 150, x1: 570, y1: 230 },
      { kind: "arrow", x0: 570, y0: 190, x1: 660, y1: 190 },
      { kind: "rectangle", x0: 660, y0: 150, x1: 850, y1: 230 },
    ],
    texts: [
      { text: "Glycolysis", x: 130, y: 175 },
      { text: "?", x: 465, y: 175 },
      { text: "Krebs cycle", x: 690, y: 175 },
    ],
    hint: "Tap Analyze",
  },
  {
    id: "explain",
    title: "Explain a topic",
    you: "Write “Krebs cycle?” or use Create",
    get: "A short, accurate explanation",
    create: { prompt: "Explain the Krebs cycle", x: 120, y: 140 },
    hint: "Tap Create, or write a topic with “?” and tap Analyze",
  },
  {
    id: "diagram",
    title: "Diagram on demand",
    you: "Ask for a diagram, with or without blanks to fill in",
    get: "A clean diagram you can move and resize",
    create: { prompt: "Diagram of photosynthesis: light reactions and the Calvin cycle", x: 120, y: 120 },
    hint: "Tap Create. Add “with 4 blanks” to make a practice sheet",
  },
  {
    id: "practice",
    title: "Practice with blanks",
    you: "Type in the blanks with the T tool (or write with your pen)",
    get: "✓ or the right term for each blank",
    diagram: { diagram: CALVIN, x: 120, y: 90 },
    hint: "Pick T, click a blank and type, then Check answers (or write with the pen and tap Analyze)",
  },
  {
    id: "graph",
    title: "Graph a function",
    you: "Ask for a graph, or write “graph it” beside an equation",
    get: "Axes and the curve, with key points marked",
    create: { prompt: "Graph y = x^2 - 4 and mark where it crosses the x-axis", x: 120, y: 120 },
    hint: "Tap Create",
  },
  {
    id: "photo",
    title: "Use a photo",
    you: "Take or pick a photo of notes or a textbook figure",
    get: "Draw on it, or turn it into a diagram",
    hint: "Tap the camera button in the toolbar, then choose what to do with the photo",
  },
]

/** Strokes and typed text for an example board. */
export function buildExample(ex: Example): { strokes: Stroke[]; texts: TextBox[] } {
  const strokes: Stroke[] = [
    ...(ex.polygons ?? []).map((pts) => shapeStroke(densify(pts))),
    ...(ex.shapes ?? []).map((sh) => shapeStroke(shapePath(sh.kind, { x: sh.x0, y: sh.y0 }, { x: sh.x1, y: sh.y1 }))),
    ...(ex.ink ?? []).flatMap((t) => inkFromText(t.text, t.x, t.y, t.h)),
  ]
  const texts: TextBox[] = (ex.texts ?? []).map((t) => ({
    id: crypto.randomUUID(),
    pos: { x: t.x, y: t.y },
    text: t.text,
    size: TEXT_SIZE,
    createdAt: Date.now(),
  }))
  return { strokes, texts }
}
