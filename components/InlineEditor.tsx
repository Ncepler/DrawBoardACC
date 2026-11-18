"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

/**
 * In-place text field for the Text tool: typing on the board or into a practice
 * blank. Enter saves (Shift+Enter = new line on the board), Escape cancels,
 * clicking away saves.
 */
export default function InlineEditor({
  x,
  y,
  width,
  fontSize,
  initial,
  placeholder,
  multiline,
  onCommit,
  onCancel,
}: {
  x: number
  y: number
  width?: number
  fontSize: number
  initial: string
  placeholder: string
  multiline: boolean
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)

  // Grow with the content (wrapped lines too) so nothing is cut off.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const commit = () => {
    if (done.current) return
    done.current = true
    onCommit(text.trim())
  }

  return (
    <textarea
      ref={ref}
      autoFocus
      value={text}
      rows={1}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
          e.preventDefault()
          commit()
        } else if (e.key === "Escape") {
          e.preventDefault()
          done.current = true
          onCancel()
        }
      }}
      className="absolute z-30 resize-none overflow-hidden rounded-lg border border-[var(--ai)] bg-[var(--surface)] font-medium text-[var(--text)] outline-none shadow-[0_0_0_3px_var(--ai-ring)] placeholder:text-[var(--text-muted)]"
      style={{
        left: x,
        top: y,
        width: width ?? Math.max(160, Math.min(520, (text.length + 2) * fontSize * 0.6)),
        fontSize,
        lineHeight: 1.25,
        padding: "4px 6px",
        WebkitUserSelect: "text",
        userSelect: "text",
      }}
    />
  )
}
