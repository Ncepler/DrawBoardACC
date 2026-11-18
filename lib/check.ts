// Checks a typed practice-blank answer against the correct label.
// Strict about content (numbers/coefficients must match exactly), forgiving about
// case, spacing, punctuation, sub/superscripts and small spelling slips.

const SUBSUP: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
}

function norm(s: string) {
  return [...s.normalize("NFKC")]
    .map((c) => SUBSUP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/alpha|α/g, "a")
    .replace(/beta|β/g, "b")
    .replace(/[^a-z0-9+]/g, "")
}

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

export function isCorrect(typed: string, answer: string): boolean {
  const a = norm(typed)
  const b = norm(answer)
  if (!a) return false
  if (a === b) return true
  // numbers carry meaning (coefficients, counts): they must match exactly
  if (a.replace(/[^0-9+]/g, "") !== b.replace(/[^0-9+]/g, "")) return false
  const la = a.replace(/[^a-z]/g, "")
  const lb = b.replace(/[^a-z]/g, "")
  const allowed = lb.length >= 8 ? 2 : lb.length >= 5 ? 1 : 0
  return lev(la, lb) <= allowed
}
