"use client"

export type Tool = "pen" | "eraser" | "ask"

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
  onPhoto,
  busy,
  onAnalyze,
}: {
  tool: Tool
  onTool: (t: Tool) => void
  canUndo: boolean
  onUndo: () => void
  onPhoto: () => void
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
      <button type="button" aria-label="Undo" disabled={!canUndo} className={`${btn} ${idle}`} onClick={onUndo}>
        <svg {...icon}>
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h10a6 6 0 010 12h-3" />
        </svg>
      </button>
      <div className="mx-0.5 h-6 w-px shrink-0 bg-[var(--hairline)]" />
      <button
        type="button"
        aria-label="Ask: tap the board where the answer should go"
        aria-pressed={tool === "ask"}
        className={`${btn} ${tool === "ask" ? active : idle}`}
        onClick={() => onTool(tool === "ask" ? "pen" : "ask")}
      >
        <svg {...icon}>
          <path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 014 13.5v-8z" />
          <path d="M8.5 8h7M8.5 11.5h4.5" />
        </svg>
      </button>
      <button type="button" aria-label="Photo to diagram" className={`${btn} ${idle}`} onClick={onPhoto}>
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
