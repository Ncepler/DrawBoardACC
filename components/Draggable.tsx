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
  selected,
  onSelect,
  onMove,
  onDrag,
  onDelete,
  handle,
  actions,
  resize,
  children,
}: {
  x: number
  y: number
  w: number
  h: number
  /** Board zoom (screen px per board px): pointer movement is divided by it, and tap targets stay 44 screen px. */
  scale?: number
  selected: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  /** Live position while dragging (null when the drag ends), for things drawn elsewhere that must follow. */
  onDrag?: (pos: { x: number; y: number } | null) => void
  onDelete: () => void
  /** If set, only a strip this tall along the top grabs the item; the rest lets the pen draw through. */
  handle?: number
  /** Shown at the top-left corner while selected (for example the typed/handwriting toggle). */
  actions?: ReactNode
  /** Corner handle (shown while selected) that scales the item: onLive while dragging, onDone with the old and new scale. */
  resize?: { scale: number; onLive: (scale: number) => void; onDone: (prev: number, next: number) => void }
  children: ReactNode
}) {
  const rz = useRef<{ ox: number; oy: number; d0: number; s0: number; cur: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const grab = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const left = drag?.x ?? x
  const top = drag?.y ?? y
  const es = scale // screen px per board px
  const hit = Math.max(8, (44 - Math.min(w, h) * es) / 2) / es

  const finish = (e: React.PointerEvent) => {
    e.stopPropagation()
    const g = grab.current
    grab.current = null
    if (g?.moved && drag) onMove(drag.x, drag.y)
    else if (g) onSelect()
    onDrag?.(null)
    setDrag(null)
  }

  return (
    <div
      ref={rootRef}
      className={`${handle ? "pointer-events-none" : "pointer-events-auto"} absolute select-none [-webkit-touch-callout:none] [touch-action:none]`}
      style={{
        left,
        top,
        width: w,
        height: h,
        cursor: drag ? "grabbing" : "grab",
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
        const next = { x: g.ox + dx / scale, y: g.oy + dy / scale }
        setDrag(next)
        onDrag?.(next)
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
      {selected && resize && (
        <div
          role="button"
          aria-label="Drag to resize"
          className="pointer-events-auto absolute flex h-11 w-11 cursor-nwse-resize items-center justify-center [touch-action:none]"
          style={{ right: -26, bottom: -26, transform: `scale(${1 / es})` }}
          onPointerDown={(e) => {
            e.stopPropagation()
            const r = rootRef.current?.getBoundingClientRect()
            if (!r) return
            e.currentTarget.setPointerCapture(e.pointerId)
            const d0 = Math.max(20, Math.hypot(e.clientX - r.left, e.clientY - r.top))
            rz.current = { ox: r.left, oy: r.top, d0, s0: resize.scale, cur: resize.scale }
          }}
          onPointerMove={(e) => {
            const g = rz.current
            if (!g) return
            e.stopPropagation()
            g.cur = Math.min(4, Math.max(0.2, (g.s0 * Math.hypot(e.clientX - g.ox, e.clientY - g.oy)) / g.d0))
            resize.onLive(g.cur)
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            const g = rz.current
            rz.current = null
            if (g) resize.onDone(g.s0, g.cur)
          }}
          onPointerCancel={(e) => {
            e.stopPropagation()
            const g = rz.current
            rz.current = null
            if (g) resize.onDone(g.s0, g.cur)
          }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#007AFF] text-white shadow">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
            </svg>
          </span>
        </div>
      )}
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
