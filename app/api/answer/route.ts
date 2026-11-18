import { generateJson, geminiErrorResponse } from "@/lib/gemini"
import { formatAnswer } from "@/lib/format"
import { guardAndRead, imageType, json } from "@/lib/server"
import type { AnswerKind } from "@/lib/types"

export const maxDuration = 30

const MAX_ITEMS = 10

const INSTRUCTION = `You are a study assistant looking at a student's whiteboard. Black ink and black typed text are the student's. Gray printed diagrams are practice sheets the app placed there. BLUE text is an answer the app already gave earlier: treat it as part of the board, never re-answer it, and never answer something that already has a blue answer next to it.

Read the WHOLE board and decide what the student wants done. A question mark is NOT required. The student may ask a question OR give a command.

Respond to, with the matching "kind":
- "math": a math problem to evaluate or simplify, including an expression with no "=" after it ("2500+10"), one ending in "=" ("1+1="), or "= ?". Also an equation to solve ("3x+5=20" -> "x = 5").
  FOLLOW-UPS: the student may continue from a blue answer, for example writing "÷ 2" or "× 5 =" or "+ 4" under or next to a blue "6". Treat the blue answer as the starting value and answer the NEW step only (6 ÷ 2 -> "3"). The "box" is only the student's new writing, never the blue answer.
- "explain": the student asks to explain or describe something, or writes a topic followed by "?" or ":?" ("Krebs cycle:?", "Explain civil war", "what is osmosis"). Also any command that wants text back: define, list, summarize, translate, convert units, compare, write a sentence or short poem, name steps. Do what the command says in at most 60 words.
- "term": a blank, empty box, or "?" in a diagram or sentence where a name or value goes. Name what belongs there using the surrounding labels, arrows, and structure.
- "check": the student wrote their own answer and it is WRONG ("7x8=54"), or the student filled a blank in a gray practice diagram. For wrong work answer "✗ " plus the correct answer. For a correctly filled practice blank answer "✓". For a wrong practice blank answer "✗ " plus the correct term. Do not mark correct work outside practice diagrams.
- "create": the student commands you to MAKE a visual: a diagram, flowchart, cycle, chart, labeled figure, or a notes card ("write out a diagram for the photosynthesis equation", "draw the water cycle", "make notes on mitosis"). Put the request in "answer" as a clear instruction (for example "diagram of the photosynthesis equation: inputs and outputs"). Fix obvious typos. If the student asks for blanks or practice, keep that in the request.

Do NOT respond to: work that is already correct and complete, titles, headings, plain notes, labels that are filled in, doodles, blue answers, or the gray practice diagram's own empty blanks. If you are not sure the student wants a response, skip it. Never respond to the same thing twice.

Answer format:
- Plain text only. Never use LaTeX, "$", backslashes, markdown, "^" or "_". Write fractions with "/" and parentheses, powers with superscripts (x²), chemistry with subscripts (CO₂). Write π, √, ×, ÷ as symbols. If an exact answer would need a symbol that is awkward in plain text, give a rounded decimal instead.
- "math": only the result, without a leading "=" ("2510", "2510/(x² − 5)", "x = 5"). At most 10 words.
- "term": at most 6 words, a term or short phrase, never a sentence.
- "explain": at most 60 words, accurate and at a high school level.
- "check": at most 8 words.
- "create": the instruction, at most 40 words.

For each item:
- "reading": your transcription of the problem, command, or blank ("2500+10", "÷ 2", "write out a diagram for the photosynthesis equation").
- "box": the tight bounding box of what the student wrote that you respond to (the full line or region, not one symbol), as [ymin, xmin, ymax, xmax] normalized to 0-1000. The answer is shown to the right of it.
- "confidence": "high" only when you are sure; otherwise "low" with your best answer. A wrong answer is worse than a cautious one.

Return found=false with an empty items list only if there is nothing to respond to.`

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["math", "term", "explain", "check", "create"] },
          reading: { type: "string" },
          box: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
          answer: { type: "string" },
          confidence: { type: "string", enum: ["high", "low"] },
        },
        required: ["kind", "reading", "box", "answer", "confidence"],
      },
    },
  },
  required: ["found", "items"],
}

const KINDS: AnswerKind[] = ["math", "term", "explain", "check"]

function sanitize(raw: unknown) {
  const items: { kind: AnswerKind | "create"; reading: string; box: number[]; answer: string; confidence: "high" | "low" }[] = []
  const list = (raw as { items?: unknown })?.items
  if (!Array.isArray(list)) return { found: false, items }
  for (const it of list.slice(0, MAX_ITEMS)) {
    const o = it as Record<string, unknown>
    const box = o?.box
    if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number" && Number.isFinite(n))) continue
    const [ymin, xmin, ymax, xmax] = box.map((n) => Math.min(1000, Math.max(0, n)))
    if (ymax <= ymin || xmax <= xmin) continue
    if (typeof o.answer !== "string") continue
    const reading = typeof o.reading === "string" ? o.reading.trim().slice(0, 160) : ""
    if (o.kind === "create") {
      const request = o.answer.replace(/\s+/g, " ").trim().slice(0, 300)
      if (request) items.push({ kind: "create", reading, box: [ymin, xmin, ymax, xmax], answer: request, confidence: "high" })
      continue
    }
    const kind = KINDS.includes(o.kind as AnswerKind) ? (o.kind as AnswerKind) : "term"
    const answer = formatAnswer(kind, o.answer, reading)
    if (!answer || answer === "=") continue
    const confidence = o.confidence === "high" ? "high" : "low"
    items.push({ kind, reading, box: [ymin, xmin, ymax, xmax], answer, confidence })
  }
  return { found: items.length > 0, items }
}

export async function POST(req: Request) {
  const body = await guardAndRead(req)
  if (body instanceof Response) return body
  const image = body.image
  if (imageType(image) !== "image/png") return json({ error: "bad_image" }, 400)
  try {
    const raw = await generateJson({
      system: INSTRUCTION,
      parts: [
        { inlineData: { mimeType: "image/png", data: image as string } },
        { text: "Look at the whole whiteboard and respond to everything new the student wants answered, explained, solved, checked, or made." },
      ],
      schema: RESPONSE_SCHEMA,
      signal: req.signal,
    })
    return json(sanitize(raw))
  } catch (err) {
    return geminiErrorResponse(err)
  }
}
