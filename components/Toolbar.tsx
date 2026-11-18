"use client"

export type Tool = "pen" | "eraser"

const btn =
  "flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-150 [touch-action:manipulation] disabled:opacity-30"

export default function Toolbar({
  tool,
  onTool,
  canUndo,
  onUndo,
}: {
  tool: Tool
  onTool: (t: Tool) => void
  canUndo: boolean
  onUndo: () => void
}) {
  const active = "bg-[#007AFF] text-white"
  const idle = "text-[#1d1d1f] active:bg-black/10"
  return (
    <div
      className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/10 bg-white/70 p-1 shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl select-none"
      style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
      role="toolbar"
      aria-label="Drawing tools"
    >
      <button
        type="button"
        aria-label="Pen"
        aria-pressed={tool === "pen"}
        className={`${btn} ${tool === "pen" ? active : idle}`}
        onClick={() => onTool("pen")}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10L4 20z" />
          <path d="M13.5 7.5l3 3" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Eraser"
        aria-pressed={tool === "eraser"}
        className={`${btn} ${tool === "eraser" ? active : idle}`}
        onClick={() => onTool("eraser")}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 19h10" />
          <path d="M5.5 15.5l8.8-8.8a2 2 0 012.8 0l1.2 1.2a2 2 0 010 2.8L11 19H8l-2.5-2.5a1.4 1.4 0 010-1z" />
        </svg>
      </button>
      <button type="button" aria-label="Undo" disabled={!canUndo} className={`${btn} ${idle}`} onClick={onUndo}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h10a6 6 0 010 12h-3" />
        </svg>
      </button>
    </div>
  )
}
