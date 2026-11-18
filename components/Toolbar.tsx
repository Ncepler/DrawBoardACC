"use client"

export type Tool = "pen" | "eraser" | "text" | "ask" | "hand"

const btn =
  "flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-150 [touch-action:manipulation] disabled:opacity-30"

const icon = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

export default function Toolbar({
  tool,
  onTool,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  canClear,
  onClear,
  onPhoto,
  onCreate,
  busy,
  onAnalyze,
}: {
  tool: Tool
  onTool: (t: Tool) => void
  canUndo: boolean
  onUndo: () => void
  canRedo: boolean
  onRedo: () => void
  canClear: boolean
  onClear: () => void
  onPhoto: () => void
  onCreate: () => void
  busy: boolean
  onAnalyze: () => void
}) {
  const active = "bg-[#007AFF] text-white"
  const idle = "text-[var(--text)] active:bg-[var(--press)]"
  return (
    <div
      className="absolute left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-[var(--hairline)] bg-[var(--chrome)] p-1 shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl select-none"
      style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
      role="toolbar"
      aria-label="Drawing tools"
    >
      <button type="button" aria-label="Pen" aria-pressed={tool === "pen"} className={`${btn} ${tool === "pen" ? active : idle}`} onClick={() => onTool("pen")}>
        <svg {...icon}>
          <path d="M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10L4 20z" />
          <path d="M13.5 7.5l3 3" />
        </svg>
      </button>
      <button type="button" aria-label="Eraser" aria-pressed={tool === "eraser"} className={`${btn} ${tool === "eraser" ? active : idle}`} onClick={() => onTool("eraser")}>
        <svg {...icon}>
          <path d="M9 19h10" />
          <path d="M5.5 15.5l8.8-8.8a2 2 0 012.8 0l1.2 1.2a2 2 0 010 2.8L11 19H8l-2.5-2.5a1.4 1.4 0 010-1z" />
        </svg>
      </button>
      <button type="button" aria-label="Move board" title="Drag to move around the board" aria-pressed={tool === "hand"} className={`${btn} ${tool === "hand" ? active : idle}`} onClick={() => onTool(tool === "hand" ? "pen" : "hand")}>
        <svg {...icon}>
          <path d="M8 12V6.5a1.5 1.5 0 013 0V11m0-1V5a1.5 1.5 0 013 0v6m0-3.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-.5a6 6 0 01-4.7-2.3L4.5 15.7a1.6 1.6 0 012.4-2L8 15" />
        </svg>
      </button>
      <button type="button" aria-label="Undo" disabled={!canUndo} className={`${btn} ${idle}`} onClick={onUndo}>
        <svg {...icon}>
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h10a6 6 0 010 12h-3" />
        </svg>
      </button>
      <button type="button" aria-label="Redo" disabled={!canRedo} className={`${btn} ${idle}`} onClick={onRedo}>
        <svg {...icon}>
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9H10a6 6 0 000 12h3" />
        </svg>
      </button>
      <button type="button" aria-label="Clear board" title="Clear board (Undo brings it back)" disabled={!canClear} className={`${btn} ${idle}`} onClick={onClear}>
        <svg {...icon}>
          <path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7M10.5 11v5M13.5 11v5" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Text: click to type on the board or in a blank"
        aria-pressed={tool === "text"}
        className={`${btn} ${tool === "text" ? active : idle}`}
        onClick={() => onTool(tool === "text" ? "pen" : "text")}
      >
        <svg {...icon}>
          <path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5" />
        </svg>
      </button>
      <div className="mx-0.5 h-6 w-px shrink-0 bg-[var(--hairline)]" />
      <button type="button" aria-label="Create: make a diagram, graph or note" title="Create" className={`${btn} ${idle}`} onClick={onCreate}>
        <svg {...icon}>
          <path d="M12 3C7 3 3 7 3 12s4 9 9 9c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H18c1.7 0 3-1.3 3-3C21 6.6 17 3 12 3z" />
          <circle cx="7.8" cy="11.5" r="1" fill="currentColor" />
          <circle cx="10.5" cy="7.6" r="1" fill="currentColor" />
          <circle cx="15" cy="7.6" r="1" fill="currentColor" />
        </svg>
      </button>
      <button type="button" aria-label="Add a photo" className={`${btn} ${idle}`} onClick={onPhoto}>
        <svg {...icon}>
          <path d="M3.5 8.5A2 2 0 015.5 6.5h2l1.5-2h6l1.5 2h2a2 2 0 012 2v9a2 2 0 01-2 2h-13a2 2 0 01-2-2v-9z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      </button>
      <div className="mx-0.5 h-6 w-px shrink-0 bg-[var(--hairline)]" />
      <button
        type="button"
        disabled={busy}
        onClick={onAnalyze}
        className="flex h-11 shrink-0 items-center rounded-full bg-[#007AFF] px-4 text-[15px] font-medium text-white transition-opacity [touch-action:manipulation] active:opacity-80 disabled:opacity-60"
      >
        {busy ? "Analyzing…" : "Analyze"}
      </button>
    </div>
  )
}
