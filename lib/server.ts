// Shared guards for the API routes (server only).

export const MAX_BODY_BYTES = 4 * 1024 * 1024 // Vercel Hobby caps request bodies at 4.5MB
const WINDOW_MS = 60_000
const RATE_LIMIT_PER_IP = 12 // per minute
const RATE_LIMIT_GLOBAL = 60 // per minute, per server instance

// In-memory limiter. Serverless instances don't share memory, so this is a speed bump, not a hard cap.
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

export const json = (body: unknown, status = 200) => Response.json(body, { status })

/** Origin check, rate limit and body size cap. Returns the parsed JSON body, or an error Response. */
export async function guardAndRead(req: Request): Promise<Record<string, unknown> | Response> {
  if (!originOk(req)) return json({ error: "forbidden" }, 403)
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()
  if (limited(`ip:${ip}`, RATE_LIMIT_PER_IP) || limited("global", RATE_LIMIT_GLOBAL)) {
    return json({ error: "rate_limited" }, 429)
  }
  if (!process.env.GEMINI_API_KEY) return json({ error: "not_configured" }, 500)
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ error: "too_large" }, 413)
  let text: string
  try {
    text = await req.text()
  } catch {
    return json({ error: "bad_request" }, 400)
  }
  if (text.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413)
  try {
    const body = JSON.parse(text)
    return body && typeof body === "object" ? body : json({ error: "bad_request" }, 400)
  } catch {
    return json({ error: "bad_request" }, 400)
  }
}

const B64 = /^[A-Za-z0-9+/]+=*$/

/** Validates a base64 image; returns its mime type or null. */
export function imageType(data: unknown): "image/png" | "image/jpeg" | null {
  if (typeof data !== "string" || !B64.test(data)) return null
  if (data.startsWith("iVBORw0KGgo")) return "image/png"
  if (data.startsWith("/9j/")) return "image/jpeg"
  return null
}
