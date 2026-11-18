"use client"

import type { Board } from "@/lib/types"

export default function Sidebar({
  boards,
  activeId,
  open,
  onSelect,
  onAdd,
}: {
  boards: Board[]
  activeId: string
  open: boolean
  onSelect: (id: string) => void
  onAdd: () => void
}) {
  return (
    <aside
      inert={!open}
      aria-hidden={!open}
      className="absolute z-20 flex w-[220px] flex-col rounded-2xl border border-[var(--hairline)] bg-[var(--chrome)] p-2 shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl select-none transition-[transform,opacity] duration-200 ease-out"
      style={{
        left: "calc(12px + env(safe-area-inset-left))",
        top: "calc(72px + env(safe-area-inset-top))",
        maxHeight: "calc(100% - 96px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
        transform: open ? "translateX(0)" : "translateX(-24px)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <div className="px-3 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Boards</div>
      <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain">
        {boards.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            className={`flex h-11 shrink-0 items-center rounded-xl px-3 text-left text-[15px] [touch-action:manipulation] ${
              b.id === activeId ? "bg-[#007AFF] font-medium text-white" : "text-[var(--text)] active:bg-[var(--press)]"
            }`}
          >
            {b.name}
          </button>
        ))}
      </nav>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-[15px] text-[var(--ai)] [touch-action:manipulation] active:bg-[var(--press)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add board
      </button>
      <a
        href="/examples"
        className="flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-[15px] text-[var(--text)] [touch-action:manipulation] active:bg-[var(--press)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3z" />
        </svg>
        Examples
      </a>
    </aside>
  )
}
