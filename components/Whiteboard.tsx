"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import AnswerOverlay, { type Selection } from "./AnswerOverlay"
import Composer from "./Composer"
import InlineEditor from "./InlineEditor"
import HandwritingSetup from "./HandwritingSetup"
import SettingsPanel from "./SettingsPanel"
import Sidebar from "./Sidebar"
import Toolbar, { type Tool } from "./Toolbar"
import { exportBoardPng, mergeAnswers, pruneAnswers } from "@/lib/analysis"
import { cardSize, fitScale, naturalSize } from "@/lib/cards"
import { isCorrect } from "@/lib/check"
import { BLANK_H, BLANK_W, layoutDiagram } from "@/lib/diagram"
import { TEXT_PAD, TEXT_SIZE } from "@/lib/texts"
import { ERASER_RADIUS, IDLE_MS, INK_COLOR, PEN_REJECT_MS } from "@/lib/config"
import { DEMOS, inkFromText } from "@/lib/demos"
import { drawStroke, segmentHitsStroke, strokePath } from "@/lib/ink"
import { failureText, photoToJpeg } from "@/lib/photo"
import {
  DEFAULT_SETTINGS,
  THEME,
  glyphSetFor,
  loadGlyphs,
  loadSettings,
  resolveDark,
  saveGlyphs,
  saveSettings,
  type Settings,
  type UserGlyphs,
} from "@/lib/settings"
import { initialState, loadState, newBoard, saveState } from "@/lib/storage"
import type { Answer, AnswerItem, AppState, Board, Card, CardPayload, Point, Stroke, TextBox } from "@/lib/types"

type UndoAction =
  | { type: "add"; stroke: Stroke }
  | { type: "erase"; items: { stroke: Stroke; index: number }[] }
  | { type: "card-add"; card: Card }
  | { type: "card-del"; card: Card; index: number }
  | { type: "answer-del"; answer: Answer; index: number }
  | { type: "text-add"; text: TextBox }
  | { type: "text-del"; text: TextBox; index: number }
  | { type: "text-edit"; id: string; prev: string }
  | { type: "fill"; cardId: string; nodeId: string; prev?: string }
  | { type: "clear"; strokes: Stroke[]; answers: Answer[]; cards: Card[]; texts: TextBox[] }

/** Open Text-tool editor: a new box, an existing box, or a practice blank. */
type EditorState =
  | { kind: "new"; x: number; y: number }
  | { kind: "edit"; id: string }
  | { kind: "blank"; cardId: string; nodeId: string; x: number; y: number; w: number; h: number; fs: number }

type ComposerState = { x: number; y: number; prompt: string; photo: { dataUrl: string; base64: string } | null }

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

/** Nearest spot to `at` (spiralling out) where a w×h card overlaps no other card or answer. */
function freeSpot(at: { x: number; y: number }, w: number, h: number, vw: number, vh: number, board?: Board) {
  const clampX = (x: number) => Math.min(Math.max(8, x), Math.max(8, vw - w - 8))
  const clampY = (y: number) => Math.min(Math.max(8, y), Math.max(8, vh - h - 90))
  const taken = [
    ...(board?.cards ?? []).map((c) => ({ x: c.pos.x, y: c.pos.y, ...cardSize(c) })),
    ...(board?.answers ?? []).map((a) => (a.pos ? { ...a.box, x: a.pos.x, y: a.pos.y } : a.box)),
  ]
  const free = (x: number, y: number) =>
    !taken.some((r) => x < r.x + r.w + 12 && x + w + 12 > r.x && y < r.y + r.h + 12 && y + h + 12 > r.y)
  for (let radius = 0; radius <= 600; radius += 40) {
    const steps = radius === 0 ? 1 : 16
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      const x = clampX(at.x + radius * Math.cos(a))
      const y = clampY(at.y + radius * Math.sin(a))
      if (free(x, y)) return { x, y }
    }
  }
  return { x: clampX(at.x), y: clampY(at.y) }
}

/** Ink-like changes bump inkVersion so auto-analyze notices them. */
const isBlank = (b: Board) => !b.strokes.length && !b.answers.length && !b.cards?.length && !b.texts?.length

const bump = (b: Board): Board => ({ ...b, inkVersion: b.inkVersion + 1, updatedAt: Date.now() })

/** Sets (or clears) a practice blank's typed answer; editing clears its old check mark. */
function setFill(cards: Card[], cardId: string, nodeId: string, fill: string | undefined): Card[] {
  return cards.map((c) =>
    c.id === cardId && c.type === "diagram"
      ? {
          ...c,
          diagram: {
            ...c.diagram,
            nodes: c.diagram.nodes.map((n) => (n.id === nodeId ? { ...n, fill, result: undefined } : n)),
          },
        }
      : c,
  )
}

function editorProps(ed: EditorState, board: Board) {
  if (ed.kind === "blank") {
    const card = board.cards?.find((c) => c.id === ed.cardId)
    const node = card?.type === "diagram" ? card.diagram.nodes.find((n) => n.id === ed.nodeId) : undefined
    return { x: ed.x, y: ed.y + (ed.h - ed.fs * 1.25 - 10) / 2, width: ed.w, fontSize: Math.max(13, ed.fs), initial: node?.fill ?? "", placeholder: `Blank ${node?.blank ?? ""}`, multiline: false }
  }
  if (ed.kind === "edit") {
    const t = board.texts?.find((x) => x.id === ed.id)
    return { x: (t?.pos.x ?? 0) - 1, y: (t?.pos.y ?? 0) - 1, fontSize: t?.size ?? TEXT_SIZE, initial: t?.text ?? "", placeholder: "Type…", multiline: true }
  }
  return { x: Math.max(0, ed.x - TEXT_PAD), y: Math.max(0, ed.y - TEXT_SIZE * 0.7), fontSize: TEXT_SIZE, initial: "", placeholder: "Type…", multiline: true }
}

export default function Whiteboard() {
  const [state, setState] = useState<AppState | null>(null)
  const [tool, setTool] = useState<Tool>("pen")
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [canUndo, setCanUndo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<Selection>(null)
  const [composer, setComposer] = useState<ComposerState | null>(null)
  const [pending, setPending] = useState<{ id: string; boardId: string; x: number; y: number }[]>([])
  const photoInput = useRef<HTMLInputElement>(null)
  const askTap = useRef<{ pointerId: number; x: number; y: number; tool: "ask" | "text" } | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS)
  const [userGlyphs, setUserGlyphs] = useState<UserGlyphs>({})
  const [panel, setPanel] = useState<"settings" | "handwriting" | null>(null)
  const [dark, setDark] = useState(false)
  const inkColor = useRef(THEME.light.ink)

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
    for (const s of board.strokes) drawStroke(ctx, { ...s, color: inkColor.current })
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
    ctx.fillStyle = inkColor.current
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
  const flash = useCallback((msg: string, ms = 3500) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), ms)
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
    const practice = (board.cards ?? []).some((c) => c.type === "diagram")
    if (board.strokes.length === 0 && !practice && !(board.texts ?? []).length) {
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
      exported = await exportBoardPng(board.strokes, board.cards ?? [], board.texts ?? [], w, h)
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
          failure = failureText(res.status, ((await res.json()) as { error?: string }).error)
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
    if (manual && items.length === 0) flash("Nothing to answer found")
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
    if (!settingsRef.current.autoAnalyze) return
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => void runAnalysis(), IDLE_MS)
  }, [runAnalysis])

  const analyzeNow = useCallback(() => {
    if (drawing.current) return
    if (idleTimer.current) clearTimeout(idleTimer.current)
    void runAnalysis(true)
  }, [runAnalysis])

  // Keyboard: Enter analyzes, Delete removes the selected item, Escape deselects.
  // Ignored while typing in the Ask box.
  const deleteRef = useRef<(s: NonNullable<Selection>) => void>(() => {})
  const selectedRef = useRef<Selection>(null)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return
      if (e.key === "Enter" && !e.repeat && !drawing.current) {
        e.preventDefault()
        analyzeNow()
      } else if ((e.key === "Backspace" || e.key === "Delete") && selectedRef.current) {
        e.preventDefault()
        deleteRef.current(selectedRef.current)
      } else if (e.key === "Escape") {
        setSelected(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [analyzeNow])

  // ---------- load / save ----------
  useEffect(() => {
    // localStorage is only readable on the client, so hydrate after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    commit(loadState() ?? initialState())
    const st = loadSettings()
    settingsRef.current = st
    setSettingsState(st)
    setUserGlyphs(loadGlyphs())
  }, [commit])

  const updateSettings = (next: Settings) => {
    settingsRef.current = next
    setSettingsState(next)
    saveSettings(next)
  }

  // Theme: class on <html> drives the CSS variables; the canvas ink color follows.
  useEffect(() => {
    const apply = () => {
      const d = !!resolveDark(settings.theme)
      document.documentElement.classList.toggle("dark", d)
      inkColor.current = d ? THEME.dark.ink : THEME.light.ink
      setDark(d)
    }
    apply()
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)")
    mq?.addEventListener?.("change", apply)
    return () => mq?.removeEventListener?.("change", apply)
  }, [settings.theme])

  const glyphs = useMemo(() => glyphSetFor(userGlyphs, settings.handwriting), [userGlyphs, settings.handwriting])

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

  // ---------- demo boards (/?demo=<id> from the demo page) ----------
  const demoDone = useRef(false)
  useEffect(() => {
    if (!hydrated || demoDone.current) return
    demoDone.current = true
    const id = new URLSearchParams(window.location.search).get("demo")
    if (!id) return
    window.history.replaceState(null, "", window.location.pathname)
    const demo = DEMOS.find((d) => d.id === id)
    const s = stateRef.current
    if (!demo || !s) return
    const b = newBoard(s.boards.length + 1)
    b.name = `Demo: ${demo.title}`
    b.strokes = (demo.ink ?? []).flatMap((t) => inkFromText(t.text, t.x, t.y, t.h))
    b.inkVersion = b.strokes.length ? 1 : 0
    if (demo.diagram) {
      const payload: CardPayload = { type: "diagram", diagram: demo.diagram.diagram }
      const { w, h } = sizeRef.current
      b.cards = [
        { ...payload, id: crypto.randomUUID(), pos: { x: demo.diagram.x, y: demo.diagram.y }, scale: fitScale(payload, w, h), createdAt: Date.now() },
      ]
    }
    commit({ ...s, boards: [...s.boards, b], activeBoardId: b.id, sidebarOpen: false })
    if (demo.ask) setComposer({ x: demo.ask.x, y: demo.ask.y, prompt: demo.ask.prompt, photo: null })
    flash(demo.hint, 7000)
  }, [hydrated, commit, flash])

  const activeId = state?.activeBoardId
  useEffect(() => {
    redrawInk()
    syncUndo()
  }, [activeId, dark, redrawInk, syncUndo])

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

  /** Practice blank under a point, with its on-screen rect, if any. */
  const blankAt = (x: number, y: number): EditorState | null => {
    const b = activeBoard()
    for (const c of [...(b?.cards ?? [])].reverse()) {
      if (c.type !== "diagram") continue
      const laid = layoutDiagram(c.diagram)
      for (const box of laid.boxes) {
        if (!box.blank) continue
        const bx = c.pos.x + box.x * c.scale
        const by = c.pos.y + box.y * c.scale
        const pad = 6
        if (x >= bx - pad && x <= bx + box.w * c.scale + pad && y >= by - pad && y <= by + box.h * c.scale + pad) {
          return { kind: "blank", cardId: c.id, nodeId: box.id, x: bx, y: by, w: BLANK_W * c.scale, h: BLANK_H * c.scale, fs: 14 * c.scale }
        }
      }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    const board = activeBoard()
    if (!board) return
    const now = performance.now()
    const isPen = e.pointerType === "pen"
    const isTouch = e.pointerType === "touch"
    setSelected(null)

    if (editor) {
      // preventDefault below would keep focus in the box, so save it explicitly.
      ;(document.activeElement as HTMLElement | null)?.blur()
      if (toolRef.current === "text") return // clicking out only closes the box
    }

    if (toolRef.current === "ask" || toolRef.current === "text") {
      if (isTouch && (penDown.current || now < penUntil.current)) return // palm
      // Open the box on lift, not here: the press would steal focus back from it,
      // and iPad only shows the keyboard when focus happens inside the tap.
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      askTap.current = { pointerId: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top, tool: toolRef.current }
      return
    }

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
    const tap = askTap.current
    if (tap && tap.pointerId === e.pointerId) {
      askTap.current = null
      if (e.type === "pointercancel") return
      // flushSync mounts the box (and its autoFocus) inside this event, so the keyboard opens.
      if (tap.tool === "text") {
        const blank = blankAt(tap.x, tap.y)
        flushSync(() => setEditor(blank ?? { kind: "new", x: tap.x, y: tap.y }))
        return
      }
      toolRef.current = "pen"
      flushSync(() => {
        setTool("pen")
        setComposer({ x: tap.x, y: tap.y, prompt: "", photo: null })
      })
      return
    }
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
        drawStroke(ctx, { ...stroke, color: inkColor.current })
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
    if (action.type === "clear") {
      patchBoard(board.id, (b) => bump({ ...b, strokes: action.strokes, answers: action.answers, cards: action.cards, texts: action.texts }))
      setSelected(null)
      redrawInk()
      syncUndo()
      return
    }
    if (action.type === "text-add" || action.type === "text-del" || action.type === "text-edit" || action.type === "fill") {
      patchBoard(board.id, (b) => {
        const texts = [...(b.texts ?? [])]
        if (action.type === "text-add") return bump({ ...b, texts: texts.filter((t) => t.id !== action.text.id) })
        if (action.type === "text-del") {
          texts.splice(Math.min(action.index, texts.length), 0, action.text)
          return bump({ ...b, texts })
        }
        if (action.type === "text-edit")
          return bump({ ...b, texts: texts.map((t) => (t.id === action.id ? { ...t, text: action.prev } : t)) })
        return { ...b, cards: setFill(b.cards ?? [], action.cardId, action.nodeId, action.prev) }
      })
      setSelected(null)
      syncUndo()
      return
    }
    if (action.type === "card-add" || action.type === "card-del" || action.type === "answer-del") {
      patchBoard(board.id, (b) => {
        if (action.type === "card-add") return { ...b, cards: (b.cards ?? []).filter((c) => c.id !== action.card.id) }
        if (action.type === "card-del") {
          const cards = [...(b.cards ?? [])]
          cards.splice(Math.min(action.index, cards.length), 0, action.card)
          return { ...b, cards }
        }
        const answers = [...b.answers]
        answers.splice(Math.min(action.index, answers.length), 0, action.answer)
        return { ...b, answers }
      })
      setSelected(null)
      syncUndo()
      return
    }
    patchBoard(board.id, (b) => {
      let strokes = b.strokes
      const answers = b.answers
      if (action.type === "add") {
        strokes = strokes.filter((s) => s.id !== action.stroke.id)
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

  const pushUndo = (boardId: string, a: UndoAction) => {
    const stack = undoStacks.current.get(boardId) ?? []
    stack.push(a)
    undoStacks.current.set(boardId, stack)
    syncUndo()
  }

  const clearBoard = () => {
    const b = activeBoard()
    if (!b || drawing.current || isBlank(b)) return
    cancelAnalysis()
    pushUndo(b.id, { type: "clear", strokes: b.strokes, answers: b.answers, cards: b.cards ?? [], texts: b.texts ?? [] })
    patchBoard(b.id, (bd) => bump({ ...bd, strokes: [], answers: [], cards: [], texts: [] }))
    setSelected(null)
    setEditor(null)
    redrawInk()
  }

  const deleteItem = (sel: NonNullable<Selection>) => {
    const b = activeBoard()
    if (!b) return
    if (sel.type === "answer") {
      const index = b.answers.findIndex((a) => a.id === sel.id)
      if (index < 0) return
      pushUndo(b.id, { type: "answer-del", answer: b.answers[index], index })
      patchBoard(b.id, (bd) => ({ ...bd, answers: bd.answers.filter((a) => a.id !== sel.id) }))
    } else if (sel.type === "text") {
      const texts = b.texts ?? []
      const index = texts.findIndex((t) => t.id === sel.id)
      if (index < 0) return
      pushUndo(b.id, { type: "text-del", text: texts[index], index })
      patchBoard(b.id, (bd) => bump({ ...bd, texts: (bd.texts ?? []).filter((t) => t.id !== sel.id) }))
    } else {
      const cards = b.cards ?? []
      const index = cards.findIndex((c) => c.id === sel.id)
      if (index < 0) return
      pushUndo(b.id, { type: "card-del", card: cards[index], index })
      patchBoard(b.id, (bd) => ({ ...bd, cards: (bd.cards ?? []).filter((c) => c.id !== sel.id) }))
    }
    setSelected(null)
  }
  useEffect(() => {
    deleteRef.current = deleteItem
  })

  const moveCard = (id: string, x: number, y: number) => {
    const b = activeBoard()
    if (b) patchBoard(b.id, (bd) => ({ ...bd, cards: (bd.cards ?? []).map((c) => (c.id === id ? { ...c, pos: { x, y } } : c)) }))
  }

  /** Ask box / photo: the AI makes a note or a diagram and it's placed where the user asked. */
  const createCard = async (prompt: string, photo: string | null, at: { x: number; y: number }) => {
    const board = activeBoard()
    if (!board) return
    const pid = crypto.randomUUID()
    setPending((p) => [...p, { id: pid, boardId: board.id, x: at.x, y: at.y }])
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(photo ? { prompt, image: photo } : { prompt }),
      })
      const data = (await res.json().catch(() => ({}))) as { card?: CardPayload; error?: string }
      if (!res.ok || !data.card) {
        flash(`Couldn't create: ${failureText(res.status, data.error)}`)
        return
      }
      const payload = data.card
      const { w: vw, h: vh } = sizeRef.current
      const scale = fitScale(payload, vw, vh)
      const nat = naturalSize(payload)
      const cur = stateRef.current?.boards.find((b) => b.id === board.id)
      const { x, y } = freeSpot(at, nat.w * scale, nat.h * scale, vw, vh, cur)
      const card = { ...payload, id: crypto.randomUUID(), pos: { x, y }, scale, prompt, createdAt: Date.now() } as Card
      patchBoard(board.id, (b) => ({ ...b, cards: [...(b.cards ?? []), card] }))
      pushUndo(board.id, { type: "card-add", card })
    } catch {
      flash("Couldn't create: network")
    } finally {
      setPending((p) => p.filter((x) => x.id !== pid))
    }
  }

  const submitComposer = (prompt: string) => {
    const c = composer
    if (!c) return
    setComposer(null)
    void createCard(prompt, c.photo?.base64 ?? null, { x: c.x, y: c.y })
  }

  const onPhotoPicked = async (file: File | undefined) => {
    if (!file) return
    try {
      const photo = await photoToJpeg(file)
      const { w, h } = sizeRef.current
      setComposer({ x: Math.max(12, w / 2 - 170), y: Math.max(12, h / 2 - 160), prompt: "Turn this into a diagram", photo })
    } catch {
      flash("Couldn't read that photo")
    }
  }

  // ---------- Text tool ----------
  const commitEditor = (text: string) => {
    const ed = editor
    const b = activeBoard()
    setEditor(null)
    if (!ed || !b) return
    if (ed.kind === "blank") {
      const card = (b.cards ?? []).find((c) => c.id === ed.cardId)
      const prev = card?.type === "diagram" ? card.diagram.nodes.find((n) => n.id === ed.nodeId)?.fill : undefined
      if ((prev ?? "") === text) return
      pushUndo(b.id, { type: "fill", cardId: ed.cardId, nodeId: ed.nodeId, prev })
      patchBoard(b.id, (bd) => ({ ...bd, cards: setFill(bd.cards ?? [], ed.cardId, ed.nodeId, text || undefined) }))
    } else if (ed.kind === "new") {
      if (!text) return
      const t: TextBox = {
        id: crypto.randomUUID(),
        pos: { x: Math.max(0, ed.x - TEXT_PAD), y: Math.max(0, ed.y - TEXT_SIZE * 0.7) },
        text,
        size: TEXT_SIZE,
        createdAt: Date.now(),
      }
      pushUndo(b.id, { type: "text-add", text: t })
      patchBoard(b.id, (bd) => bump({ ...bd, texts: [...(bd.texts ?? []), t] }))
    } else {
      const t = (b.texts ?? []).find((x) => x.id === ed.id)
      if (!t || t.text === text) return
      if (!text) {
        const index = (b.texts ?? []).indexOf(t)
        pushUndo(b.id, { type: "text-del", text: t, index })
        patchBoard(b.id, (bd) => bump({ ...bd, texts: (bd.texts ?? []).filter((x) => x.id !== t.id) }))
      } else {
        pushUndo(b.id, { type: "text-edit", id: t.id, prev: t.text })
        patchBoard(b.id, (bd) => bump({ ...bd, texts: (bd.texts ?? []).map((x) => (x.id === t.id ? { ...x, text } : x)) }))
      }
    }
    scheduleIdle()
  }

  const moveText = (id: string, x: number, y: number) => {
    const b = activeBoard()
    if (b) patchBoard(b.id, (bd) => ({ ...bd, texts: (bd.texts ?? []).map((t) => (t.id === id ? { ...t, pos: { x, y } } : t)) }))
  }

  /** Marks each typed practice blank right or wrong against the diagram's answer key. */
  const checkCard = (cardId: string) => {
    const b = activeBoard()
    const card = b?.cards?.find((c) => c.id === cardId)
    if (!b || card?.type !== "diagram") return
    let right = 0
    let total = 0
    const nodes = card.diagram.nodes.map((n) => {
      if (!n.blank || !n.fill) return n
      total++
      const ok = isCorrect(n.fill, n.label)
      if (ok) right++
      return { ...n, result: ok ? ("right" as const) : ("wrong" as const) }
    })
    patchBoard(b.id, (bd) => ({
      ...bd,
      cards: (bd.cards ?? []).map((c) => (c.id === cardId && c.type === "diagram" ? { ...c, diagram: { ...c.diagram, nodes } } : c)),
    }))
    const blanks = card.diagram.nodes.filter((n) => n.blank).length
    flash(right === blanks ? "All correct!" : `${right} of ${total} right${total < blanks ? `, ${blanks - total} blank` : ""}`)
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
    if (t === "ask") flash("Tap where the answer should go")
    if (t === "text") flash("Click anywhere to type, or click a blank to fill it in")
    if (t !== "text") setEditor(null)
  }

  if (!state) return <div className="fixed inset-0 bg-[var(--board)]" />
  const board = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0]

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--board)]">
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
        <AnswerOverlay
          answers={board.answers}
          cards={board.cards ?? []}
          pending={pending.filter((p) => p.boardId === board.id)}
          width={size.w}
          height={size.h}
          selected={selected}
          onSelect={setSelected}
          onMoveAnswer={moveAnswer}
          onMoveCard={moveCard}
          onDelete={deleteItem}
          texts={board.texts ?? []}
          editingTextId={editor?.kind === "edit" ? editor.id : null}
          onMoveText={moveText}
          onEditText={(id) => setEditor({ kind: "edit", id })}
          onCheck={checkCard}
          textTool={tool === "text"}
          glyphs={glyphs}
          aiColor={dark ? THEME.dark.ai : THEME.light.ai}
          dark={dark}
          handwriting={settings.handwriting && Object.keys(userGlyphs).length > 0}
        />
        {editor && (
          <InlineEditor
            key={editor.kind === "edit" ? editor.id : editor.kind === "blank" ? `${editor.cardId}:${editor.nodeId}` : `${editor.x},${editor.y}`}
            {...editorProps(editor, board)}
            onCommit={commitEditor}
            onCancel={() => setEditor(null)}
          />
        )}
        {composer && (
          <Composer
            key={`${composer.x},${composer.y}`}
            x={composer.x}
            y={composer.y}
            bounds={size}
            initialPrompt={composer.prompt}
            photo={composer.photo?.dataUrl ?? null}
            onSubmit={submitComposer}
            onCancel={() => setComposer(null)}
          />
        )}
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void onPhotoPicked(e.target.files?.[0])
          e.target.value = ""
        }}
      />

      <button
        type="button"
        aria-label={state.sidebarOpen ? "Hide boards" : "Show boards"}
        aria-pressed={state.sidebarOpen}
        onClick={toggleSidebar}
        className="absolute z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--chrome)] text-[var(--text)] shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl [touch-action:manipulation] active:bg-[var(--press)]"
        style={{ left: "calc(12px + env(safe-area-inset-left))", top: "calc(12px + env(safe-area-inset-top))" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
          <path d="M9.5 4.5v15" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="Settings"
        aria-expanded={panel === "settings"}
        onClick={() => setPanel(panel === "settings" ? null : "settings")}
        className="absolute z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--chrome)] text-[var(--text)] shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl [touch-action:manipulation] active:bg-[var(--press)]"
        style={{ right: "calc(12px + env(safe-area-inset-right))", top: "calc(12px + env(safe-area-inset-top))" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
        </svg>
      </button>
      {panel === "settings" && (
        <SettingsPanel
          settings={settings}
          glyphCount={Object.keys(userGlyphs).length}
          onChange={updateSettings}
          onSetupHandwriting={() => setPanel("handwriting")}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "handwriting" && (
        <HandwritingSetup
          glyphs={userGlyphs}
          onChange={(g) => {
            setUserGlyphs(g)
            saveGlyphs(g)
          }}
          onClose={() => setPanel(null)}
        />
      )}

      <Sidebar
        boards={state.boards}
        activeId={state.activeBoardId}
        open={state.sidebarOpen}
        onSelect={selectBoard}
        onAdd={addBoard}
      />
      <Toolbar
        tool={tool}
        onTool={changeTool}
        canUndo={canUndo}
        onUndo={undo}
        canClear={!isBlank(state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0])}
        onClear={clearBoard}
        onPhoto={() => photoInput.current?.click()}
        busy={busy}
        onAnalyze={analyzeNow}
      />

      {notice && (
        <div
          className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 rounded-full border border-[var(--hairline)] bg-[var(--chrome-strong)] px-3 py-1.5 text-[13px] text-[var(--text)] shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl"
          style={{ top: "calc(16px + env(safe-area-inset-top))" }}
        >
          {notice}
        </div>
      )}

    </div>
  )
}
