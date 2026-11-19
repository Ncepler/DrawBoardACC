// Renders the pages of a PDF to JPEGs so they can sit on the board as pages to write on.
export const PDF_MAX_PAGES = 12

export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)

export async function pdfToPages(file: File, width = 1200, quality = 0.75): Promise<{ dataUrl: string; w: number; h: number }[]> {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  const pages: { dataUrl: string; w: number; h: number }[] = []
  try {
    for (let n = 1; n <= Math.min(doc.numPages, PDF_MAX_PAGES); n++) {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("no 2d context")
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      pages.push({ dataUrl: canvas.toDataURL("image/jpeg", quality), w: canvas.width, h: canvas.height })
    }
  } finally {
    void task.destroy()
  }
  return pages
}
