import { generateJson, geminiErrorResponse } from "@/lib/gemini"
import { stripMarkdown, toPlainMath, truncateWords } from "@/lib/format"
import { guardAndRead, imageType, json } from "@/lib/server"
import { plausibleCurve } from "@/lib/graph"
import type { CardPayload, DiagramEdge, DiagramNode, Graph } from "@/lib/types"

// Diagrams take longer than single answers.
export const maxDuration = 60

const INSTRUCTION = `You make study material that appears on a student's whiteboard. You get a request, and sometimes a photo.

Return a "graph", a "diagram", or a "note":
- "graph" when the request asks to graph, plot, or sketch a function, equation, parabola, line, or curve. The app draws blank axes and plots the formulas itself, so you only supply the formulas and the window.
- "diagram" when the request asks for a diagram, cycle, process, pathway, flow, structure, map, timeline, or comparison of parts, or when the photo shows a diagram, process, or structured notes.
- "note" for explanations, definitions, summaries, and answers to questions.

Graph rules:
- "curves": 1 to 3 items. "expr" is a formula in x only, using + - * / ^ ( ), numbers, pi, e, and the functions sin cos tan sqrt abs ln log exp. Write multiplication explicitly (2*x). Example: "x^2 - 4". For a relation like x² + y² = 9, give the explicit halves as two curves ("sqrt(9 - x^2)" and "-sqrt(9 - x^2)"). For a system of equations, one curve per equation. "label" is the equation as the student would write it (plain text, for example "y = x² − 4").
- "xmin", "xmax", "ymin", "ymax": a window that shows every key feature (intercepts, vertex, asymptote neighborhood) with some margin. Make it roughly square when possible.
- "points": key points to mark (x-intercepts, vertex, y-intercept, intersections) as the x value, the index of the curve (0 based) it lies on, and a short label such as "(2, 0)". Only points you are sure of; the app computes the height from the formula.
- Give a short "title" such as "y = x² − 4 (parabola)". For non-graph answers use xmin=xmax=ymin=ymax=0, curves and points empty.

Diagram rules:
- 3 to 14 nodes. Node labels are short: at most 5 words, plain text. Use subscripts for chemistry (CO₂, H₂O, NADPH, ATP).
- "layout": "cycle" for cycles (Krebs cycle, Calvin cycle, water cycle, cell cycle), "tree" for hierarchies and classifications, "flow" for processes, pathways, and timelines.
- "edges" give the order or relations (from node id to node id). Edge labels are optional, at most 4 words, for inputs/outputs or relations ("CO₂ in", "releases").
- Practice: only when the student asks for blanks, practice, a quiz, or to fill in, set "blank" to 1, 2, 3... on the nodes whose label the student should fill in (still put the correct label in "label"). Otherwise "blank" is 0 for every node. Use the number of blanks the student asks for, or about a third of the nodes.
- For a photo, convert what the photo actually shows. Do not invent content that is not there.

Note rules: "text" is at most 120 words, plain sentences, no markdown, no LaTeX. Use a short "title".

Accuracy matters more than anything: this is for studying, and a wrong label teaches the wrong thing. Fill unused fields with empty values (empty string, empty lists).`

const SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["diagram", "note", "graph"] },
    xmin: { type: "number" },
    xmax: { type: "number" },
    ymin: { type: "number" },
    ymax: { type: "number" },
    curves: {
      type: "array",
      items: { type: "object", properties: { expr: { type: "string" }, label: { type: "string" } }, required: ["expr", "label"] },
    },
    points: {
      type: "array",
      items: {
        type: "object",
        properties: { x: { type: "number" }, curve: { type: "integer" }, label: { type: "string" } },
        required: ["x", "curve", "label"],
      },
    },
    title: { type: "string" },
    text: { type: "string" },
    layout: { type: "string", enum: ["cycle", "flow", "tree"] },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, label: { type: "string" }, blank: { type: "integer" } },
        required: ["id", "label", "blank"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } },
        required: ["from", "to", "label"],
      },
    },
  },
  required: ["type", "title", "text", "layout", "nodes", "edges", "xmin", "xmax", "ymin", "ymax", "curves", "points"],
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

function sanitize(raw: unknown): CardPayload | null {
  const o = (raw ?? {}) as Record<string, unknown>
  const title = toPlainMath(stripMarkdown(str(o.title, 80)))
  const text = truncateWords(stripMarkdown(toPlainMath(str(o.text, 2000))), 120)
  if (o.type === "graph") {
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e6 ? v : null)
    const xmin = num(o.xmin), xmax = num(o.xmax), ymin = num(o.ymin), ymax = num(o.ymax)
    if (xmin === null || xmax === null || ymin === null || ymax === null || xmax <= xmin || ymax <= ymin) return null
    const curves: Graph["curves"] = []
    for (const c of (Array.isArray(o.curves) ? o.curves : []).slice(0, 3)) {
      const r = c as Record<string, unknown>
      const expr = str(r.expr, 120)
      // a formula the app can't read or that has no real values in the window is dropped, never guessed at
      if (!expr || !plausibleCurve(expr, xmin, xmax)) continue
      const label = toPlainMath(str(r.label, 60))
      curves.push(label ? { expr, label } : { expr })
    }
    if (!curves.length) return null
    const points: Graph["points"] = []
    for (const p of (Array.isArray(o.points) ? o.points : []).slice(0, 8)) {
      const r = p as Record<string, unknown>
      const x = num(r.x)
      const curve = Number.isInteger(r.curve) ? (r.curve as number) : -1
      if (x === null || curve < 0 || curve >= curves.length) continue
      const label = toPlainMath(str(r.label, 24))
      points.push(label ? { x, curve, label } : { x, curve })
    }
    return { type: "graph", graph: { title: title || "Graph", xmin, xmax, ymin, ymax, curves, points } }
  }
  if (o.type === "diagram" && Array.isArray(o.nodes)) {
    const nodes: DiagramNode[] = []
    const ids = new Set<string>()
    for (const n of o.nodes.slice(0, 16)) {
      const r = n as Record<string, unknown>
      const id = str(r.id, 40)
      const label = toPlainMath(stripMarkdown(str(r.label, 60)))
      if (!id || !label || ids.has(id)) continue
      ids.add(id)
      const blank = Number.isInteger(r.blank) && (r.blank as number) > 0 && (r.blank as number) <= 30 ? (r.blank as number) : 0
      nodes.push(blank ? { id, label, blank } : { id, label })
    }
    const edges: DiagramEdge[] = []
    for (const e of (Array.isArray(o.edges) ? o.edges : []).slice(0, 30)) {
      const r = e as Record<string, unknown>
      const from = str(r.from, 40)
      const to = str(r.to, 40)
      if (!ids.has(from) || !ids.has(to) || from === to) continue
      const label = toPlainMath(stripMarkdown(str(r.label, 40)))
      edges.push(label ? { from, to, label } : { from, to })
    }
    const layout = o.layout === "cycle" || o.layout === "tree" ? o.layout : "flow"
    if (nodes.length >= 2) return { type: "diagram", diagram: { title, layout, nodes, edges } }
  }
  if (text) return { type: "note", title: title || "Note", text }
  return null
}

export async function POST(req: Request) {
  const body = await guardAndRead(req)
  if (body instanceof Response) return body
  const prompt = str(body.prompt, 500)
  const mime = body.image === undefined ? null : imageType(body.image)
  if (body.image !== undefined && !mime) return json({ error: "bad_image" }, 400)
  if (!prompt && !mime) return json({ error: "bad_request" }, 400)
  try {
    const raw = await generateJson({
      system: INSTRUCTION,
      parts: [
        ...(mime ? [{ inlineData: { mimeType: mime, data: body.image as string } }] : []),
        { text: prompt || "Turn this photo into a clear diagram for my whiteboard." },
      ],
      schema: SCHEMA,
      signal: req.signal,
      timeoutMs: 50_000,
    })
    const card = sanitize(raw)
    if (!card) return json({ error: "bad_model_output" }, 502)
    return json({ card })
  } catch (err) {
    return geminiErrorResponse(err)
  }
}
