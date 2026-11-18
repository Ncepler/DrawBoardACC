"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import AnswerOverlay from "./AnswerOverlay"
import Sidebar from "./Sidebar"
import Toolbar, { type Tool } from "./Toolbar"
import { exportInkPng, mergeAnswers, pruneAnswers } from "@/lib/analysis"
import { AUTO_ANALYZE, ERASER_RADIUS, IDLE_MS, INK_COLOR, PEN_REJECT_MS } from "@/lib/config"
import { drawStroke, segmentHitsStroke, strokePath } from "@/lib/ink"
import { initialState, loadState, newBoard, saveState } from "@/lib/storage"
import type { AnswerItem, AppState, Board, Point, Stroke } from "@/lib/types"

type UndoAction =
  | { type: "add"; stroke: Stroke }
  | { type: "erase"; items: { stroke: Stroke; index: number }[] }

type Drawing = {
  pointerId: number
  tool: Tool
  stroke: Stroke | null
  predicted: Point[]
  erased: { stroke: Stroke; index: number }[]
  lastX: number
  lastY: number
  touch: boolean
}

const MAX_BUFFER_PIXELS = 16_000_000

export default function Whiteboard() {
  const [state, setState] = useState<AppState | null>(null)
  const [tool, setTool] = useState<Tool>("pen")
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [canUndo, setCanUndo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const stateRef = useRef<AppState | null>(null)
  const toolRef = useRef<Tool>("pen")
  const sizeRef = useRef({ w: 0, h: 0 })
  const hostRef = useRef<HTMLDivElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const dprRef = useRef(1)
  const drawing = useRef<Drawing | null>(null)
  const frame = useRef(0)
  const touches = useRef(new Set<number>())
  const penDown = useRef(false)
  const penUntil = useRef(0)
  const undoStacks = useRef(new Map<string, UndoAction[]>())
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const commit = useCallback((next: AppState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const activeBoard = useCallback((): Board | null => {
    const s = stateRef.current
    return s ? (s.boards.find((b) => b.id === s.activeBoardId) ?? null) : null
  }, [])

  const patchBoard = useCallback(
    (id: string, fn: (b: Board) => Board) => {
      const s = stateRef.current
      if (!s) return
      commit({ ...s, boards: s.boards.map((b) => (b.id === id ? fn(b) : b)) })
    },
    [commit],
  )

  const syncUndo = useCallback(() => {
    const s = stateRef.current
    setCanUndo(!!s && (undoStacks.current.get(s.activeBoardId)?.length ?? 0) > 0)
  }, [])

  // ---------- canvas rendering ----------
  const redrawInk = useCallback(() => {
    const canvas = inkRef.current
    const ctx = canvas?.getContext("2d")
    const board = activeBoard()
    if (!canvas || !ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!board) return
    const d = dprRef.current
    ctx.setTransform(d, 0, 0, d, 0, 0)
    for (const s of board.strokes) drawStroke(ctx, s)
  }, [activeBoard])

  const clearLive = useCallback(() => {
    const c = liveRef.current
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height)
  }, [])

  const renderLive = useCallback(() => {
    frame.current = 0
    const canvas = liveRef.current
    const ctx = canvas?.getContext("2d")
    const d = drawing.current
    if (!canvas || !ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!d?.stroke) return
    const dpr = dprRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const pts = d.predicted.length ? [...d.stroke.points, ...d.predicted] : d.stroke.points
    const path = strokePath(pts, d.stroke.real, d.stroke.width, false)
    ctx.fillStyle = d.stroke.color
    if (path) ctx.fill(path)
    else {
      const p = pts[0]
      ctx.beginPath()
      ctx.arc(p.x, p.y, d.stroke.width / 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [])

  const scheduleLive = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(renderLive)
  }, [renderLive])

  // ---------- analysis loop ----------
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = useCallback((msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 3500)
  }, [])

  const cancelAnalysis = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = null
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
  }, [])

  const runAnalysis = useCallback(
    async (manual = false) => {
    idleTimer.current = null
    if (drawing.current) return
    const board = activeBoard()
    if (!board) return
    if (board.strokes.length === 0) {
      if (manual) flash("Draw something first")
      if (board.answers.length) patchBoard(board.id, (b) => ({ ...b, answers: [] }))
      return
    }
    // Enter forces a pass even if the ink hasn't changed since the last one.
    if (!manual && board.inkVersion === board.lastAnalyzedVersion) return

    const version = board.inkVersion
    const boardId = board.id
    const { w, h } = sizeRef.current
    let exported
    try {
      exported = exportInkPng(board.strokes, w, h)
    } catch {
      return
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(true)

    let items: AnswerItem[] | null = null
    let failure = "network"
    for (let attempt = 0; attempt < 2 && !ctrl.signal.aborted; attempt++) {
      try {
        const res = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: exported.base64 }),
          signal: ctrl.signal,
        })
        if (res.ok) {
          const data = (await res.json()) as { items?: AnswerItem[] }
          items = Array.isArray(data.items) ? data.items : []
          break
        }
        failure = String(res.status)
        try {
          const e = ((await res.json()) as { error?: string }).error
          if (e === "quota") failure = "Gemini quota exceeded, check API key billing"
          else if (e === "rate_limited") failure = "too many requests, wait a minute"
        } catch {}
        if (res.status < 500) break // client-side problem: retrying won't help
      } catch {
        if (ctrl.signal.aborted) break
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1000))
    }

    if (abortRef.current === ctrl) {
      abortRef.current = null
      setBusy(false)
    }
    if (ctrl.signal.aborted) return
    if (!items) {
      if (manual) flash(`Couldn't analyze: ${failure}`)
      return
    }
    if (manual && items.length === 0) flash("No question mark found")
    const now = stateRef.current
    const cur = now?.boards.find((b) => b.id === boardId)
    if (!now || now.activeBoardId !== boardId || !cur || cur.inkVersion !== version) return
    const got = items
    patchBoard(boardId, (b) => ({
      ...b,
      answers: mergeAnswers(got, exported.region, b.answers),
      lastAnalyzedVersion: version,
    }))
    },
    [activeBoard, patchBoard, flash],
  )

  const scheduleIdle = useCallback(() => {
    if (!AUTO_ANALYZE) return
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => void runAnalysis(), IDLE_MS)
  }, [runAnalysis])

  const analyzeNow = useCallback(() => {
    if (drawing.current) return
    if (idleTimer.current) clearTimeout(idleTimer.current)
    void runAnalysis(true)
  }, [runAnalysis])

  // Enter = analyze the board right now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || drawing.current) return
      e.preventDefault()
      analyzeNow()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [analyzeNow])

  // ---------- load / save ----------
  useEffect(() => {
    // localStorage is only readable on the client, so hydrate after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    commit(loadState() ?? initialState())
  }, [commit])

  useEffect(() => {
    if (!state) return
    const t = setTimeout(() => saveState(state), 400)
    const flush = () => saveState(stateRef.current ?? state)
    window.addEventListener("pagehide", flush)
    return () => {
      clearTimeout(t)
      window.removeEventListener("pagehide", flush)
    }
  }, [state])

  // ---------- sizing ----------
  const hydrated = state !== null
  useEffect(() => {
    const host = hostRef.current
    if (!host || !hydrated) return
    const layout = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      let dpr = Math.min(window.devicePixelRatio || 1, 3)
      while (dpr > 1 && w * dpr * h * dpr > MAX_BUFFER_PIXELS) dpr -= 0.5
      dprRef.current = dpr
      for (const c of [inkRef.current, liveRef.current]) {
        if (!c) continue
        c.width = Math.max(1, Math.round(w * dpr))
        c.height = Math.max(1, Math.round(h * dpr))
      }
      sizeRef.current = { w, h }
      setSize({ w, h })
      redrawInk()
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(host)
    const stop = (e: Event) => e.preventDefault()
    host.addEventListener("gesturestart", stop)
    host.addEventListener("gesturechange", stop)
    return () => {
      ro.disconnect()
      host.removeEventListener("gesturestart", stop)
      host.removeEventListener("gesturechange", stop)
    }
  }, [hydrated, redrawInk])

  const activeId = state?.activeBoardId
  useEffect(() => {
    redrawInk()
    syncUndo()
  }, [activeId, redrawInk, syncUndo])

  useEffect(() => () => cancelAnalysis(), [cancelAnalysis])

  // ---------- pointer input ----------
  const pointOf = (e: PointerEvent | React.PointerEvent, rect: DOMRect, real: boolean): Point => ({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    p: real ? e.pressure : 0.5,
    t: Math.round(e.timeStamp),
  })

  const cancelDrawing = () => {
    drawing.current = null
    clearLive()
  }

  const eraseAt = (d: Drawing, ax: number, ay: number, bx: number, by: number) => {
    const board = activeBoard()
    if (!board) return
    const hit: { stroke: Stroke; index: number }[] = []
    board.strokes.forEach((s, index) => {
      if (segmentHitsStroke(s, ax, ay, bx, by, ERASER_RADIUS)) hit.push({ stroke: s, index })
    })
    if (!hit.length) return
    const ids = new Set(hit.map((h) => h.stroke.id))
    d.erased.push(...hit)
    const gone = hit.map((h) => h.stroke)
    patchBoard(board.id, (b) => ({
      ...b,
      strokes: b.strokes.filter((s) => !ids.has(s.id)),
      answers: pruneAnswers(b.answers, gone),
    }))
    redrawInk()
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    const board = activeBoard()
    if (!board) return
    const now = performance.now()
    const isPen = e.pointerType === "pen"
    const isTouch = e.pointerType === "touch"

    if (isPen) {
      penDown.current = true
      if (drawing.current?.touch) cancelDrawing() // palm/finger stroke loses to the pen
    } else if (isTouch) {
      touches.current.add(e.pointerId)
      if (penDown.current || now < penUntil.current) return // palm rejection
      if (touches.current.size > 1) {
        if (drawing.current?.touch) cancelDrawing() // multi-touch gesture: not a stroke
        return
      }
    }
    if (drawing.current) return

    e.currentTarget.setPointerCapture(e.pointerId)
    cancelAnalysis()
    const rect = e.currentTarget.getBoundingClientRect()
    const pt = pointOf(e, rect, isPen)
    const d: Drawing = {
      pointerId: e.pointerId,
      tool: toolRef.current,
      stroke: null,
      predicted: [],
      erased: [],
      lastX: pt.x,
      lastY: pt.y,
      touch: isTouch,
    }
    if (d.tool === "pen") {
      d.stroke = {
        id: crypto.randomUUID(),
        points: [pt],
        tool: "pen",
        width: isPen ? 6 : 5,
        color: INK_COLOR,
        real: isPen,
        createdAt: Date.now(),
      }
    }
    drawing.current = d
    if (d.tool === "eraser") eraseAt(d, pt.x, pt.y, pt.x, pt.y)
    else scheduleLive()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "pen") penUntil.current = performance.now() + PEN_REJECT_MS // includes hover
    const d = drawing.current
    if (!d || d.pointerId !== e.pointerId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const native = e.nativeEvent
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : []
    const list = events.length ? events : [native]
    const real = e.pointerType === "pen"
    for (const ev of list) {
      const pt = pointOf(ev, rect, real)
      if (d.tool === "eraser") {
        eraseAt(d, d.lastX, d.lastY, pt.x, pt.y)
        d.lastX = pt.x
        d.lastY = pt.y
      } else if (d.stroke) {
        const last = d.stroke.points[d.stroke.points.length - 1]
        if (last.x === pt.x && last.y === pt.y) continue
        d.stroke.points.push(pt)
      }
    }
    if (d.stroke) {
      const predicted = typeof native.getPredictedEvents === "function" ? native.getPredictedEvents() : []
      d.predicted = predicted.map((ev) => pointOf(ev, rect, real)) // drawn, never stored
      scheduleLive()
    }
    scheduleIdle()
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "pen") {
      penDown.current = false
      penUntil.current = performance.now() + PEN_REJECT_MS
    }
    touches.current.delete(e.pointerId)
    const d = drawing.current
    if (!d || d.pointerId !== e.pointerId) return
    drawing.current = null
    const board = activeBoard()
    if (!board) return
    const stack = undoStacks.current.get(board.id) ?? []
    undoStacks.current.set(board.id, stack)

    if (d.tool === "pen" && d.stroke) {
      const stroke = d.stroke
      const ctx = inkRef.current?.getContext("2d")
      if (ctx) {
        ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0)
        drawStroke(ctx, stroke)
      }
      clearLive()
      stack.push({ type: "add", stroke })
      patchBoard(board.id, (b) => ({
        ...b,
        strokes: [...b.strokes, stroke],
        inkVersion: b.inkVersion + 1,
        updatedAt: Date.now(),
      }))
    } else if (d.tool === "eraser" && d.erased.length) {
      stack.push({ type: "erase", items: d.erased })
      patchBoard(board.id, (b) => ({ ...b, inkVersion: b.inkVersion + 1, updatedAt: Date.now() }))
    }
    syncUndo()
    scheduleIdle()
  }

  // ---------- actions ----------
  const undo = () => {
    const board = activeBoard()
    if (!board || drawing.current) return
    const action = undoStacks.current.get(board.id)?.pop()
    if (!action) return
    patchBoard(board.id, (b) => {
      let strokes = b.strokes
      let answers = b.answers
      if (action.type === "add") {
        strokes = strokes.filter((s) => s.id !== action.stroke.id)
        answers = pruneAnswers(answers, [action.stroke])
      } else {
        strokes = [...strokes]
        for (const it of [...action.items].sort((a, c) => a.index - c.index)) {
          strokes.splice(Math.min(it.index, strokes.length), 0, it.stroke)
        }
      }
      return { ...b, strokes, answers, inkVersion: b.inkVersion + 1, updatedAt: Date.now() }
    })
    redrawInk()
    syncUndo()
    scheduleIdle()
  }

  const selectBoard = (id: string) => {
    const s = stateRef.current
    if (!s || id === s.activeBoardId) return
    cancelAnalysis()
    cancelDrawing()
    commit({ ...s, activeBoardId: id })
  }

  const addBoard = () => {
    const s = stateRef.current
    if (!s) return
    cancelAnalysis()
    cancelDrawing()
    const b = newBoard(s.boards.length + 1)
    commit({ ...s, boards: [...s.boards, b], activeBoardId: b.id })
  }

  const moveAnswer = (id: string, x: number, y: number) => {
    const b = activeBoard()
    if (b) patchBoard(b.id, (bd) => ({ ...bd, answers: bd.answers.map((a) => (a.id === id ? { ...a, pos: { x, y } } : a)) }))
  }

  const toggleSidebar = () => {
    const s = stateRef.current
    if (s) commit({ ...s, sidebarOpen: !s.sidebarOpen })
  }

  const changeTool = (t: Tool) => {
    toolRef.current = t
    setTool(t)
  }

  if (!state) return <div className="fixed inset-0 bg-white" />
  const board = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0]

  return (
    <div className="fixed inset-0 overflow-hidden bg-white">
      <div
        ref={hostRef}
        className="absolute inset-0 [touch-action:none] select-none [-webkit-touch-callout:none]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={inkRef} className="absolute inset-0 h-full w-full" />
        <canvas ref={liveRef} className="absolute inset-0 h-full w-full" />
        <AnswerOverlay answers={board.answers} width={size.w} height={size.h} onMove={moveAnswer} />
      </div>

      <button
        type="button"
        aria-label={state.sidebarOpen ? "Hide boards" : "Show boards"}
        aria-pressed={state.sidebarOpen}
        onClick={toggleSidebar}
        className="absolute z-30 flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/70 text-[#1d1d1f] shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl [touch-action:manipulation] active:bg-black/10"
        style={{ left: "calc(12px + env(safe-area-inset-left))", top: "calc(12px + env(safe-area-inset-top))" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
          <path d="M9.5 4.5v15" />
        </svg>
      </button>

      <Sidebar
        boards={state.boards}
        activeId={state.activeBoardId}
        open={state.sidebarOpen}
        onSelect={selectBoard}
        onAdd={addBoard}
      />
      <Toolbar tool={tool} onTool={changeTool} canUndo={canUndo} onUndo={undo} busy={busy} onAnalyze={analyzeNow} />

      {notice && (
        <div
          className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[13px] text-[#1d1d1f] shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl"
          style={{ top: "calc(16px + env(safe-area-inset-top))" }}
        >
          {notice}
        </div>
      )}

      {busy && (
        <div
          className="pointer-events-none absolute z-10 h-2 w-2 animate-pulse rounded-full bg-[#007AFF]/60"
          style={{ right: "calc(16px + env(safe-area-inset-right))", top: "calc(16px + env(safe-area-inset-top))" }}
        />
      )}
    </div>
  )
}
