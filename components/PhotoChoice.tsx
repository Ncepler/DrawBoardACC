"use client"

import { useEffect } from "react"

/** Shown when a photo is pasted, dropped or picked: draw on it, or make something from it. */
export default function PhotoChoice({
  preview,
  onAdd,
  onCreate,
  onCancel,
}: {
  preview: string
  onAdd: () => void
  onCreate: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  const choice =
    "flex min-h-[88px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-3 text-center [touch-action:manipulation] active:opacity-80"
  return (
    <div
      className="absolute left-1/2 top-1/2 z-40 w-[min(420px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[var(--hairline)] bg-[var(--chrome-strong)] p-3 shadow-[0_8px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl"
      role="dialog"
      aria-label="What do you want to do with this photo?"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 px-1 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        <div className="flex-1 text-[16px] font-semibold text-[var(--text)]">What do you want to do with this photo?</div>
        <button
          type="button"
          aria-label="Cancel"
          onClick={onCancel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] [touch-action:manipulation] active:bg-[var(--press)]"
        >
          <svg width="14" height="14" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onAdd} className={`${choice} bg-[var(--press)] text-[var(--text)]`}>
          <span className="text-[16px] font-semibold">Draw on it</span>
          <span className="text-[13px] text-[var(--text-muted)]">Put the photo on the board</span>
        </button>
        <button type="button" onClick={onCreate} className={`${choice} bg-[#007AFF] text-white`}>
          <span className="text-[16px] font-semibold">Make a diagram</span>
          <span className="text-[13px] opacity-85">AI turns the photo into something new</span>
        </button>
      </div>
    </div>
  )
}
