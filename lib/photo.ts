// Prepares a user photo for Gemini: decoded by the browser (so EXIF rotation is
// applied), scaled so the long side is at most 1600px, re-encoded as JPEG.
export async function photoToJpeg(file: File, max = 1600): Promise<{ dataUrl: string; base64: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(img.naturalWidth * s))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * s))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no 2d context")
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
    return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Human-readable reason for a failed API call. */
export function failureText(status: number, error?: string) {
  if (error === "quota") return "Gemini quota exceeded, check API key billing"
  if (error === "rate_limited") return "too many requests, wait a minute"
  if (error === "too_large") return "image too large"
  if (error === "bad_image") return "unsupported image"
  return status ? String(status) : "network"
}
