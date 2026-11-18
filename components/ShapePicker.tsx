"use client"

import { SHAPES, shapePath, type ShapeKind } from "@/lib/shapes"

const iconPath = (kind: ShapeKind) => {
  const diagonal = kind === "line" || kind === "arrow"
  const wide = kind === "rectangle" || kind === "oval"
  const pts = shapePath(
    kind,
    diagonal ? { x: 6, y: 26 } : wide ? { x: 3, y: 9 } : { x: 5, y: 5 },
    diagonal ? { x: 26, y: 6 } : wide ? { x: 29, y: 23 } : { x: 27, y: 27 },
  )
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("")
}

/** Small palette above the toolbar while the Shapes tool is on. */
export default function ShapePicker({ value, onPick }: { value: ShapeKind; onPick: (k: ShapeKind) => void }) {
  return (
    <div
      className="absolute left-1/2 z-20 grid max-w-[calc(100%-24px)] -translate-x-1/2 grid-cols-6 gap-1 rounded-2xl border border-[var(--hairline)] bg-[var(--chrome)] p-1 shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl select-none"
      style={{ bottom: "calc(16px + 44px + 20px + env(safe-area-inset-bottom))" }}
      role="toolbar"
      aria-label="Shapes"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {SHAPES.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-label={s.label}
          title={s.label}
          aria-pressed={value === s.id}
          onClick={() => onPick(s.id)}
          className={`flex h-11 w-11 items-center justify-center rounded-xl [touch-action:manipulation] ${
            value === s.id ? "bg-[#007AFF] text-white" : "text-[var(--text)] active:bg-[var(--press)]"
          }`}
        >
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={iconPath(s.id)} />
          </svg>
        </button>
      ))}
    </div>
  )
}
