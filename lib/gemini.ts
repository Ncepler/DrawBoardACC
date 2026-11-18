// Gemini access (server only). The key never leaves the server.
import { GoogleGenAI, type Part } from "@google/genai"
import { json } from "./server"

// The one place model ids live (checked against the current Gemini models page).
// Tried in order; a quota (429) or not-found (404) error moves on to the next one,
// since quotas are per model.
export const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]

export class GeminiError extends Error {
  constructor(public code: "quota" | "upstream" | "bad_output") {
    super(code)
  }
}

/** Calls Gemini with structured JSON output and returns the parsed object. */
export async function generateJson(opts: {
  system: string
  parts: Part[]
  schema: object
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<unknown> {
  // SDK default is 5 retries with long backoff, which blows past the function time limit.
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: opts.timeoutMs ?? 25_000, retryOptions: { attempts: 1 } },
  })
  let quotaHit = false
  for (const model of GEMINI_MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: opts.parts }],
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: opts.schema,
          temperature: 0.2,
          abortSignal: opts.signal,
        },
      })
      try {
        return JSON.parse(res.text ?? "")
      } catch {
        console.error(`gemini ${model} returned non-JSON output`)
        throw new GeminiError("bad_output")
      }
    } catch (err) {
      if (err instanceof GeminiError) throw err
      // Error details only: never the image, prompt, or any answer text.
      const m = String((err as Error)?.message ?? err)
      console.error(`gemini ${model} failed:`, m.slice(0, 900))
      if (/"code":\s*429|RESOURCE_EXHAUSTED/.test(m)) {
        quotaHit = true
        continue
      }
      if (/"code":\s*404|NOT_FOUND/.test(m)) continue
      throw new GeminiError("upstream")
    }
  }
  throw new GeminiError(quotaHit ? "quota" : "upstream")
}

export function geminiErrorResponse(err: unknown) {
  const code = err instanceof GeminiError ? err.code : "upstream"
  return json({ error: code }, code === "quota" ? 429 : 502)
}
