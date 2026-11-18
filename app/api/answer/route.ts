import { generateJson, geminiErrorResponse } from "@/lib/gemini"
import { formatAnswer } from "@/lib/format"
import { guardAndRead, imageType, json } from "@/lib/server"
import type { AnswerKind } from "@/lib/types"

export const maxDuration = 30

const MAX_ITEMS = 10

const INSTRUCTION = `You are a study assistant looking at a student's whiteboard. Black ink is the student's handwriting, math, and drawings. Gray printed diagrams were placed there by the app as practice sheets.

Read the WHOLE board and decide what the student wants answered, explained, solved, or checked. A question mark is NOT required.

Respond to, with the matching "kind":
- "math": a math problem to evaluate or simplify, including an expression with no "=" after it (for example "2500+10"), one ending in "=" ("1+1="), or "= ?". Also an equation to solve ("3x+5=20" -> "x = 5").
- "explain": the student asks to explain or describe something, or writes a topic followed by "?" or ":?" (for example "Krebs cycle:?", "Explain civil war", "what is osmosis"). Give a real explanation.
- "term": a blank, empty box, or "?" in a diagram or sentence where a name or value goes. Name what belongs there using the surrounding labels, arrows, and structure.
- "check": the student wrote their own answer and it is WRONG (for example "7x8=54"), or the student filled a blank in a gray practice diagram. For wrong work answer "✗ " plus the correct answer. For a correctly filled practice blank answer "✓". For a wrong practice blank answer "✗ " plus the correct term. Do not mark correct work outside practice diagrams.

Do NOT respond to: work that is already correct and complete, titles, headings, plain notes, labels that are filled in, doodles, or the gray practice diagram's own empty blanks (the student fills those in). If you are not sure the student wants a response, skip it. Never respond to the same thing twice.

Answer format:
- Plain text only. Never use LaTeX, "$", backslashes, or markdown. Write fractions with "/" and parentheses, powers with superscripts (x²), chemistry with subscripts (CO₂).
- "math": only the result, without a leading "=" (for example "2510", "2510/(x² − 5)", "x = 5"). At most 10 words.
- "term": at most 6 words, a term or short phrase, never a sentence.
- "explain": 2 to 3 short sentences, at most 60 words, accurate and at a high school level.
- "check": at most 8 words.

For each item:
- "reading": your transcription of the problem, prompt, or blank (for example "2500+10", "Krebs cycle:?").
- "box": the tight bounding box of the whole problem or prompt you respond to (the full line or region, not one symbol), as [ymin, xmin, ymax, xmax] normalized to 0-1000. The answer is shown to the right of it.
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
          kind: { type: "string", enum: ["math", "term", "explain", "check"] },
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
  const items: { kind: AnswerKind; reading: string; box: number[]; answer: string; confidence: "high" | "low" }[] = []
  const list = (raw as { items?: unknown })?.items
  if (!Array.isArray(list)) return { found: false, items }
  for (const it of list.slice(0, MAX_ITEMS)) {
    const o = it as Record<string, unknown>
    const box = o?.box
    if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number" && Number.isFinite(n))) continue
    const [ymin, xmin, ymax, xmax] = box.map((n) => Math.min(1000, Math.max(0, n)))
    if (ymax <= ymin || xmax <= xmin) continue
    if (typeof o.answer !== "string") continue
    const kind = KINDS.includes(o.kind as AnswerKind) ? (o.kind as AnswerKind) : "term"
    const reading = typeof o.reading === "string" ? o.reading.trim().slice(0, 160) : ""
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
        { text: "Look at the whole whiteboard and respond to everything the student wants answered, explained, solved, or checked." },
      ],
      schema: RESPONSE_SCHEMA,
      signal: req.signal,
    })
    return json(sanitize(raw))
  } catch (err) {
    return geminiErrorResponse(err)
  }
}
