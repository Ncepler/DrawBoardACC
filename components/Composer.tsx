"use client"

import { useEffect, useRef, useState } from "react"

const W = 340

/**
 * Floating "Ask" box placed where the user tapped. Enter sends, Shift+Enter is a
 * new line, Escape cancels. A photo can ride along (from the Photo button).
 */
export default function Composer({
  x,
  y,
  bounds,
  initialPrompt,
  photo,
  onSubmit,
  onCancel,
}: {
  x: number
  y: number
  bounds: { w: number; h: number }
  initialPrompt: string
  photo: string | null // data URL preview
  onSubmit: (prompt: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialPrompt)
  const ref = useRef<HTMLTextAreaElement>(null)
  const w = Math.min(W, bounds.w - 24)
  const left = Math.min(Math.max(12, x), Math.max(12, bounds.w - w - 12))
  const top = Math.min(Math.max(12, y), Math.max(12, bounds.h - (photo ? 260 : 180)))

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const canSend = text.trim().length > 0 || !!photo
  const send = () => canSend && onSubmit(text.trim())

  return (
    <div
      className="absolute z-30 rounded-2xl border border-[var(--hairline)] bg-[var(--chrome-strong)] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl"
      style={{ left, top, width: w }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="Attached photo" className="mb-2 max-h-24 rounded-lg object-contain" />
      )}
      <textarea
        ref={ref}
        autoFocus
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            send()
          } else if (e.key === "Escape") {
            e.preventDefault()
            onCancel()
          }
        }}
        placeholder={photo ? "What should I make from this photo?" : "Ask anything, e.g. “Diagram of photosynthesis”"}
        className="block w-full resize-none rounded-xl bg-transparent px-2 py-1.5 text-[16px] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] select-text"
        style={{ WebkitUserSelect: "text", userSelect: "text" }}
      />
      <div className="mt-1 flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-full px-4 text-[15px] text-[var(--text)] [touch-action:manipulation] active:bg-[var(--press)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="h-11 rounded-full bg-[#007AFF] px-5 text-[15px] font-medium text-white [touch-action:manipulation] active:opacity-80 disabled:opacity-40"
        >
          Create
        </button>
      </div>
    </div>
  )
}
