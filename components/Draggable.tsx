"use client"

import { useRef, useState, type ReactNode } from "react"

/**
 * Wrapper for anything the AI puts on the board (answers, notes, diagrams):
 * tap selects it, drag moves it, the × button deletes it. Pointer events never
 * reach the canvas underneath, so grabbing an item never starts a pen stroke.
 */
export default function Draggable({
  x,
  y,
  w,
  h,
  scale = 1,
  keepSize = false,
  selected,
  onSelect,
  onMove,
  onDelete,
  handle,
  actions,
  children,
}: {
  x: number
  y: number
  w: number
  h: number
  /** Board zoom (screen px per board px): pointer movement is divided by it, and tap targets stay 44 screen px. */
  scale?: number
  /** When zoomed out, draw the item at its 100% size instead of shrinking it (positions still follow the zoom). */
  keepSize?: boolean
  selected: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onDelete: () => void
  /** If set, only a strip this tall along the top grabs the item; the rest lets the pen draw through. */
  handle?: number
  /** Shown at the top-left corner while selected (for example the typed/handwriting toggle). */
  actions?: ReactNode
  children: ReactNode
}) {
  const grab = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const left = drag?.x ?? x
  const top = drag?.y ?? y
  const f = keepSize && scale < 1 ? 1 / scale : 1 // content scale that cancels the zoom-out
  const es = scale * f // screen px per content px
  const hit = Math.max(8, (44 - Math.min(w, h) * es) / 2) / es

  const finish = (e: React.PointerEvent) => {
    e.stopPropagation()
    const g = grab.current
    grab.current = null
    if (g?.moved && drag) onMove(drag.x, drag.y)
    else if (g) onSelect()
    setDrag(null)
  }

  return (
    <div
      className={`${handle ? "pointer-events-none" : "pointer-events-auto"} absolute select-none [-webkit-touch-callout:none] [touch-action:none]`}
      style={{
        left,
        top,
        width: w,
        height: h,
        cursor: drag ? "grabbing" : "grab",
        transform: f === 1 ? undefined : `scale(${f})`,
        transformOrigin: "0 0",
        filter: drag ? "drop-shadow(0 6px 14px rgba(0,0,0,0.18))" : undefined,
        zIndex: drag || selected ? 5 : undefined,
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return
        // The enlarged grab area is for fingers; a pen or mouse is precise, so let it draw there.
        if (e.pointerType !== "touch" && (e.target as HTMLElement).dataset.pad) return
        e.stopPropagation() // don't start a pen stroke underneath
        ;(e.target as Element).setPointerCapture(e.pointerId)
        grab.current = { sx: e.clientX, sy: e.clientY, ox: x, oy: y, moved: false }
      }}
      onPointerMove={(e) => {
        const g = grab.current
        if (!g) return
        e.stopPropagation()
        const dx = e.clientX - g.sx
        const dy = e.clientY - g.sy
        if (!g.moved && Math.hypot(dx, dy) < 5) return // a tap isn't a move
        g.moved = true
        setDrag({ x: g.ox + dx / scale, y: g.oy + dy / scale })
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {/* enlarged invisible hit area so small items are still easy to grab */}
      {!handle && <div className="absolute" data-pad="1" style={{ inset: -hit }} />}
      {selected && (
        <div className="pointer-events-none absolute rounded-xl ring-2 ring-[#007AFF]/60" style={{ inset: -6 / es }} />
      )}
      <div className={handle ? "pointer-events-none" : undefined}>{children}</div>
      {handle ? (
        <div
          className="pointer-events-auto absolute inset-x-0 top-0 flex justify-center rounded-t-xl"
          style={{ height: Math.max(28 / es, handle) }}
          aria-label="Drag to move"
        >
          <span className="mt-1.5 h-1.5 w-10 rounded-full bg-[#007AFF]/30" />
        </div>
      ) : null}
      {selected && actions ? (
        <div
          className="pointer-events-auto absolute flex h-11 w-11 items-center justify-center [touch-action:manipulation]"
          style={{ left: -26, top: -26, transform: `scale(${1 / es})` }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
      {selected && (
        <button
          type="button"
          aria-label="Delete"
          className="pointer-events-auto absolute flex h-11 w-11 items-center justify-center [touch-action:manipulation]"
          style={{ right: -26, top: -26, transform: `scale(${1 / es})` }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1d1d1f]/85 text-white shadow">
            <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
