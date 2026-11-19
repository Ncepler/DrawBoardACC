"use client"

import { PEN_SIZES } from "@/lib/config"

const LABELS = ["Fine", "Medium", "Bold", "Marker"]

/** Small card above the toolbar, opened by tapping the pen while it is already selected. */
export default function PenTray({ value, onPick }: { value: number; onPick: (size: number) => void }) {
  return (
    <div
      className="absolute left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-2xl border border-[var(--hairline)] bg-[var(--chrome)] p-1 shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl select-none"
      style={{ bottom: "calc(16px + 44px + 20px + env(safe-area-inset-bottom))" }}
      role="toolbar"
      aria-label="Pen thickness"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {PEN_SIZES.map((s, i) => (
        <button
          key={s}
          type="button"
          aria-label={`${LABELS[i]} pen`}
          title={LABELS[i]}
          aria-pressed={value === s}
          onClick={() => onPick(s)}
          className={`flex h-11 w-11 items-center justify-center rounded-xl [touch-action:manipulation] ${
            value === s ? "bg-[#007AFF] text-white" : "text-[var(--text)] active:bg-[var(--press)]"
          }`}
        >
          <span className="block rounded-full bg-current" style={{ width: 6 + s * 1.1, height: 6 + s * 1.1 }} />
        </button>
      ))}
    </div>
  )
}
