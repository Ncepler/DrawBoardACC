import { GoogleGenAI } from "@google/genai"

export const maxDuration = 30

// The one place model ids live (checked against the current Gemini models page).
// Tried in order; a quota (429) or not-found (404) error moves on to the next one,
// since quotas are per model.
const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]

const MAX_WORDS = 6
const MAX_BODY_BYTES = 4 * 1024 * 1024 // Vercel Hobby caps request bodies at 4.5MB
const MAX_ITEMS = 8
const RATE_LIMIT_PER_IP = 12 // per minute
const RATE_LIMIT_GLOBAL = 60 // per minute, per server instance
const WINDOW_MS = 60_000

const INSTRUCTION = `You read hand-drawn whiteboards. The image is a whiteboard with handwriting and diagrams.

Step 1: find EVERY question mark the user drew. Hand-drawn question marks are usually a hook on top of a short vertical stroke, often with the dot missing, tiny, or separated from the stroke. A question mark can be big, small, or slanted. Look carefully at the whole image, including the edges, and look especially after an "=" sign or at the end of a line of writing. If you see a shape like that, count it. Do not skip a question mark just because the handwriting is messy.

Step 2: for each question mark, read the line of writing it belongs to and put your transcription of that line in "reading" (for example "3x^2 + 6x + 9 = ?").

Step 3: give the answer in "answer": at most 6 words, a term, number, or short phrase, never a sentence. For a math problem, solve it and give the result (for example the simplified expression or the value). For a diagram with a missing label, use the surrounding labels, arrows and structure to name what belongs there. If you can read the question but cannot answer it confidently in 6 words, still return the item with your best short answer and confidence "low". Use "high" only when you are sure.

"box" is the tight bounding box of the question mark itself (hook, stem and dot together) as [ymin, xmin, ymax, xmax], normalized to 0-1000.

Return found=false with an empty items list only if there is truly no question mark anywhere in the image.`

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          reading: { type: "string" },
          box: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
          answer: { type: "string" },
          confidence: { type: "string", enum: ["high", "low"] },
        },
        required: ["reading", "box", "answer", "confidence"],
      },
    },
  },
  required: ["found", "items"],
}

// Basic in-memory limiter. Serverless instances don't share memory, so this is a
// speed bump, not a hard cap.
const hits = new Map<string, number[]>()
function limited(key: string, max: number) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= max) {
    hits.set(key, recent)
    return true
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const k of hits.keys()) if (!hits.get(k)!.some((t) => now - t < WINDOW_MS)) hits.delete(k)
  return false
}

function originOk(req: Request) {
  const origin = req.headers.get("origin")
  if (!origin) return false
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status })

function sanitize(raw: unknown) {
  const items: { box: number[]; answer: string; confidence: "high" | "low" }[] = []
  const list = (raw as { items?: unknown })?.items
  if (!Array.isArray(list)) return { found: false, items }
  for (const it of list.slice(0, MAX_ITEMS)) {
    const box = (it as { box?: unknown })?.box
    const answer = (it as { answer?: unknown })?.answer
    if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number" && Number.isFinite(n))) continue
    const [ymin, xmin, ymax, xmax] = box.map((n) => Math.min(1000, Math.max(0, n)))
    if (ymax <= ymin || xmax <= xmin) continue
    if (typeof answer !== "string") continue
    const text = answer.trim().split(/\s+/).slice(0, MAX_WORDS).join(" ")
    if (!text) continue
    const confidence = (it as { confidence?: unknown }).confidence === "high" ? "high" : "low"
    items.push({ box: [ymin, xmin, ymax, xmax], answer: text, confidence })
  }
  return { found: items.length > 0, items }
}

export async function POST(req: Request) {
  if (!originOk(req)) return json({ error: "forbidden" }, 403)

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()
  if (limited(`ip:${ip}`, RATE_LIMIT_PER_IP) || limited("global", RATE_LIMIT_GLOBAL)) {
    return json({ error: "rate_limited" }, 429)
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return json({ error: "not_configured" }, 500)

  const declared = Number(req.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) return json({ error: "too_large" }, 413)
  let text: string
  try {
    text = await req.text()
  } catch {
    return json({ error: "bad_request" }, 400)
  }
  if (text.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413)

  let image: unknown
  try {
    image = (JSON.parse(text) as { image?: unknown }).image
  } catch {
    return json({ error: "bad_request" }, 400)
  }
  // base64 PNG only: must be a base64 string starting with the PNG signature
  if (typeof image !== "string" || !image.startsWith("iVBORw0KGgo") || !/^[A-Za-z0-9+/]+=*$/.test(image)) {
    return json({ error: "bad_image" }, 400)
  }

  try {
    // SDK default is 5 retries with long backoff, which blows past the 30s function limit.
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 25_000, retryOptions: { attempts: 1 } },
    })
    let res
    let lastErr: unknown
    for (const model of GEMINI_MODELS) {
      try {
        res = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: "image/png", data: image } },
                { text: "Find every question mark on this whiteboard and answer each one." },
              ],
            },
          ],
          config: {
            systemInstruction: INSTRUCTION,
            responseMimeType: "application/json",
            responseJsonSchema: RESPONSE_SCHEMA,
            temperature: 0.2,
            abortSignal: req.signal,
          },
        })
        break
      } catch (err) {
        lastErr = err
        const m = String((err as Error)?.message ?? err)
        console.error(`gemini ${model} failed:`, m.slice(0, 900))
        if (!/"code":\s*(429|404)|RESOURCE_EXHAUSTED|NOT_FOUND/.test(m)) throw err
      }
    }
    if (!res) throw lastErr
    let parsed: unknown
    try {
      parsed = JSON.parse(res.text ?? "")
    } catch {
      console.error("gemini returned non-JSON output")
      return json({ error: "bad_model_output" }, 502)
    }
    return json(sanitize(parsed))
  } catch (err) {
    // Error details only: never the image or any answer text.
    const msg = String((err as Error)?.message ?? err)
    console.error("gemini call failed:", msg.slice(0, 900))
    if (/"code":\s*429|RESOURCE_EXHAUSTED/.test(msg)) return json({ error: "quota" }, 429)
    return json({ error: "upstream" }, 502)
  }
}
