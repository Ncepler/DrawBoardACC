"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import AnswerOverlay, { answerMode, makeDefaultRenderer, placeAnswers, type AnswerRenderer, type Selection } from "./AnswerOverlay"
import Composer from "./Composer"
import PhotoChoice from "./PhotoChoice"
import { isPdf, pdfToPages } from "@/lib/pdf"
import ShapePicker from "./ShapePicker"
import PenTray from "./PenTray"
import InlineEditor from "./InlineEditor"
import HandwritingSetup from "./HandwritingSetup"
import SettingsPanel from "./SettingsPanel"
import Sidebar from "./Sidebar"
import Toolbar, { type Tool } from "./Toolbar"
import { boxToBoard, exportBoardPng, mergeAnswers } from "@/lib/analysis"
import { cardSize, fitScale, naturalSize } from "@/lib/cards"
import { isCorrect } from "@/lib/check"
import { BLANK_H, BLANK_W, layoutDiagram } from "@/lib/diagram"
import { TEXT_PAD, TEXT_SIZE, textBoxSize } from "@/lib/texts"
import { ERASER_RADIUS, IDLE_MOVE_PX, IDLE_MS, INK_COLOR, PEN_REJECT_MS, SNAP_HOLD_MS, SNAP_JITTER_PX, TAP_MAX_MOVE_PX, TAP_MAX_MS } from "@/lib/config"
import { recognizeShape, type Snapped } from "@/lib/snap"
import { EXAMPLES, buildExample } from "@/lib/examples"
import { densify, pathExtent, shapePath, shapeStroke, SHAPE_WIDTH, type ShapeKind } from "@/lib/shapes"
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
import type { Answer, AnswerItem, AppState, Board, BoardImage, Card, CardPayload, Point, Stroke, TextBox } from "@/lib/types"

type UndoAction =
  | { type: "add"; stroke: Stroke }
  | { type: "erase"; items: { stroke: Stroke; index: number }[]; answers?: { answer: Answer; index: number }[] }
  | { type: "card-add"; card: Card; reopen?: { x: number; y: number; prompt: string; photo: ComposerState["photo"] } }
  | { type: "image-add"; image: BoardImage }
  | { type: "image-del"; image: BoardImage; index: number }
  | { type: "image-scale"; id: string; prev: number; next: number }
  | { type: "card-del"; card: Card; index: number }
  | { type: "answer-del"; answer: Answer; index: number }
  | { type: "text-add"; text: TextBox }
  | { type: "text-del"; text: TextBox; index: number }
  | { type: "text-edit"; id: string; prev: string; next: string }
  | { type: "fill"; cardId: string; nodeId: string; prev?: string; next?: string }
  | { type: "card-scale"; id: string; prev: number; next: number }
  | { type: "card-replace"; id: string; prev: Card; next: Card }
  | { type: "clear"; strokes: Stroke[]; answers: Answer[]; cards: Card[]; texts: TextBox[]; images: BoardImage[] }

/** Open Text-tool editor: a new box, an existing box, or a practice blank. */
type EditorState =
  | { kind: "new"; x: number; y: number }
  | { kind: "edit"; id: string }
  | { kind: "blank"; cardId: string; nodeId: string; x: number; y: number; w: number; h: number; fs: number }

type ComposerState = { x: number; y: number; prompt: string; photo: { dataUrl: string; base64: string } | null; editCardId?: string }

type Drawing = {
  pointerId: number
  tool: Tool
  stroke: Stroke | null
  predicted: Point[]
  erased: { stroke: Stroke; index: number }[]
  erasedAnswers: { answer: Answer; index: number }[]
  lastX: number
  lastY: number
  touch: boolean
  start?: Point // where a shape drag began
  anchor?: { x: number; y: number } // where the pen last moved, for hold-to-snap
  hold?: ReturnType<typeof setTimeout>
  snap?: Snapped // set once a held stroke has snapped to a clean shape
}

const MAX_BUFFER_PIXELS = 16_000_000

/** Board-space rectangle that is on screen, plus the zoom it was computed at. */
type Rect = { x: number; y: number; w: number; h: number; k: number }
/** How the board sits on screen: screen = board * k + (x, y). */
type View = { x: number; y: number; k: number }
const MIN_ZOOM = 0.02
const MAX_ZOOM = 4
const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))

/** Nearest spot to `at` (spiralling out) where a w×h card overlaps no other card or answer. */
function freeSpot(at: { x: number; y: number }, w: number, h: number, vis: Rect, board?: Board) {
  const clampX = (x: number) => Math.min(Math.max(vis.x + 8, x), Math.max(vis.x + 8, vis.x + vis.w - w - 8))
  const clampY = (y: number) => Math.min(Math.max(vis.y + 8, y), Math.max(vis.y + 8, vis.y + vis.h - h - 90 / vis.k))
  const taken = [
    ...(board?.cards ?? []).map((c) => ({ x: c.pos.x, y: c.pos.y, ...cardSize(c) })),
    ...(board?.answers ?? []).map((a) => (a.pos ? { ...a.box, x: a.pos.x, y: a.pos.y } : a.box)),
    ...(board?.texts ?? []).map((t) => ({ x: t.pos.x, y: t.pos.y, ...textBoxSize(t) })),
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
const isBlank = (b: Board) => !b.strokes.length && !b.answers.length && !b.cards?.length && !b.texts?.length && !b.images?.length

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

/** Applies an undone action again. */
function redoBoard(b: Board, a: UndoAction): Board {
  switch (a.type) {
    case "add":
      return bump({ ...b, strokes: [...b.strokes, a.stroke] })
    case "erase": {
      const ids = new Set(a.items.map((i) => i.stroke.id))
      const aids = new Set((a.answers ?? []).map((x) => x.answer.id))
      return bump({ ...b, strokes: b.strokes.filter((s) => !ids.has(s.id)), answers: b.answers.filter((x) => !aids.has(x.id)) })
    }
    case "card-add":
      return { ...b, cards: [...(b.cards ?? []), a.card] }
    case "image-add":
      return { ...b, images: [...(b.images ?? []), a.image] }
    case "image-del":
      return { ...b, images: (b.images ?? []).filter((i) => i.id !== a.image.id) }
    case "image-scale":
      return { ...b, images: (b.images ?? []).map((i) => (i.id === a.id ? { ...i, scale: a.next } : i)) }
    case "card-del":
      return { ...b, cards: (b.cards ?? []).filter((c) => c.id !== a.card.id) }
    case "answer-del":
      return { ...b, answers: b.answers.filter((x) => x.id !== a.answer.id) }
    case "text-add":
      return bump({ ...b, texts: [...(b.texts ?? []), a.text] })
    case "text-del":
      return bump({ ...b, texts: (b.texts ?? []).filter((t) => t.id !== a.text.id) })
    case "text-edit":
      return bump({ ...b, texts: (b.texts ?? []).map((t) => (t.id === a.id ? { ...t, text: a.next } : t)) })
    case "fill":
      return { ...b, cards: setFill(b.cards ?? [], a.cardId, a.nodeId, a.next) }
    case "card-scale":
      return { ...b, cards: (b.cards ?? []).map((c) => (c.id === a.id ? { ...c, scale: a.next } : c)) }
    case "card-replace":
      return { ...b, cards: (b.cards ?? []).map((c) => (c.id === a.id ? a.next : c)) }
    case "clear":
      return bump({ ...b, strokes: [], answers: [], cards: [], texts: [], images: [] })
  }
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
  const [canRedo, setCanRedo] = useState(false)
  const canUndoRef = useRef(false)
  const canRedoRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<Selection>(null)
  const [penTray, setPenTray] = useState(false)
  const [shapeOpen, setShapeOpen] = useState(false)
  const [hintGone, setHintGone] = useState(false)
  const tapTrack = useRef<{ t0: number; max: number; moved: boolean; start: Map<number, { x: number; y: number }> } | null>(null)
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle")
  const shapeRef = useRef<ShapeKind>("rectangle")
  const [composer, setComposer] = useState<ComposerState | null>(null)
  const [photoChoice, setPhotoChoice] = useState<{ file: File; photo: NonNullable<ComposerState["photo"]> } | null>(null)
  const [imgDrag, setImgDrag] = useState<{ id: string; x: number; y: number } | null>(null)
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
  const [view, setViewState] = useState<View>({ x: 0, y: 0, k: 1 })
  const viewRef = useRef<View>({ x: 0, y: 0, k: 1 })
  const viewsRef = useRef(new Map<string, View>()) // each board remembers its own view (in memory)
  const redrawRaf = useRef(0)
  const touchPos = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ ids: [number, number]; mid0: { x: number; y: number }; dist0: number; v0: View } | null>(null)
  const panDrag = useRef<{ pointerId: number; sx: number; sy: number; v0: View } | null>(null)
  const spaceDown = useRef(false)

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
  const warnedSave = useRef(false)
  const undoStacks = useRef(new Map<string, UndoAction[]>())
  const redoStacks = useRef(new Map<string, UndoAction[]>())
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
    canUndoRef.current = !!s && (undoStacks.current.get(s.activeBoardId)?.length ?? 0) > 0
    canRedoRef.current = !!s && (redoStacks.current.get(s.activeBoardId)?.length ?? 0) > 0
    setCanUndo(canUndoRef.current)
    setCanRedo(canRedoRef.current)
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
    const v = viewRef.current
    ctx.setTransform(d * v.k, 0, 0, d * v.k, d * v.x, d * v.y)
    // Zoomed out, lines keep the thickness they have at 100%.
    const f = v.k < 1 ? 1 / v.k : 1
    for (const s of board.strokes) drawStroke(ctx, { ...s, color: inkColor.current, width: s.width * f })
  }, [activeBoard])

  /** Moves the board under the screen (pan/zoom). Redraws the ink at most once per frame. */
  const setView = useCallback(
    (v: View) => {
      const nv = { x: v.x, y: v.y, k: clampZoom(v.k) }
      viewRef.current = nv
      setViewState(nv)
      const id = stateRef.current?.activeBoardId
      if (id) viewsRef.current.set(id, nv)
      if (!redrawRaf.current)
        redrawRaf.current = requestAnimationFrame(() => {
          redrawRaf.current = 0
          redrawInk()
        })
    },
    [redrawInk],
  )

  /** Zoom to `k`, keeping the board point under screen (sx, sy) where it is. */
  const zoomAt = useCallback(
    (sx: number, sy: number, k: number) => {
      const v = viewRef.current
      const nk = clampZoom(k)
      const bx = (sx - v.x) / v.k
      const by = (sy - v.y) / v.k
      setView({ k: nk, x: sx - bx * nk, y: sy - by * nk })
    },
    [setView],
  )

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
    const v = viewRef.current
    ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y)
    const pts = d.predicted.length ? [...d.stroke.points, ...d.predicted] : d.stroke.points
    const f = v.k < 1 ? 1 / v.k : 1
    const path = strokePath(pts, d.stroke.real, d.stroke.width * f, false, d.stroke.shape)
    ctx.fillStyle = inkColor.current
    if (path) ctx.fill(path)
    else {
      const p = pts[0]
      ctx.beginPath()
      ctx.arc(p.x, p.y, (d.stroke.width * f) / 3, 0, Math.PI * 2)
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

  // Latest renderer and card-maker, so analysis can place answers like the overlay does and run "create" commands.
  const rendererRef = useRef<AnswerRenderer | null>(null)
  const createRef = useRef<(prompt: string, photo: string | null, at: { x: number; y: number }, source?: string) => void>(() => {})
  const makingRef = useRef(new Set<string>())

  const runAnalysis = useCallback(
    async (manual = false) => {
    idleTimer.current = null
    if (drawing.current) return
    const board = activeBoard()
    if (!board) return
    const practice = (board.cards ?? []).some((c) => c.type === "diagram")
    if (board.strokes.length === 0 && !practice && !(board.texts ?? []).length && !(board.images ?? []).length) {
      if (manual) flash("Draw something first")
      return
    }
    // Enter forces a pass even if the ink hasn't changed since the last one.
    if (!manual && board.inkVersion === board.lastAnalyzedVersion) return

    const version = board.inkVersion
    const boardId = board.id
    const { w, h } = sizeRef.current
    let exported
    try {
      const rects = rendererRef.current
        ? [...placeAnswers(board.answers, board.cards ?? [], w - 16, rendererRef.current)].flatMap(([id, r]) => {
            const a = board.answers.find((x) => x.id === id)
            return a ? [{ text: a.text, kind: a.kind, left: r.left, top: r.top, w: r.w, h: r.h }] : []
          })
        : []
      exported = await exportBoardPng(board.strokes, board.cards ?? [], board.texts ?? [], rects, w, h, board.images ?? [])
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
    const got = items.filter((i) => i.kind !== "create")
    const creates = items.filter((i) => i.kind === "create")
    patchBoard(boardId, (b) => ({
      ...b,
      answers: mergeAnswers(got, exported.region, b.answers),
      lastAnalyzedVersion: version,
    }))
    // Written commands to make a diagram or note: once each, placed under the command.
    for (const c of creates) {
      const key = (c.reading || c.answer).toLowerCase().replace(/[^a-z0-9]/g, "")
      if (!key || makingRef.current.has(key) || (cur.cards ?? []).some((k) => k.source === key)) continue
      makingRef.current.add(key)
      const box = boxToBoard(c.box, exported.region)
      createRef.current(c.answer, null, { x: box.x, y: box.y + box.h + 12 }, key)
    }
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

  // Auto-analyze waits for stillness: any pointer movement (a hovering pen or a mouse that is
  // heading for a button) restarts the wait, and pressing anything else on the page cancels it.
  useEffect(() => {
    let last: { x: number; y: number } | null = null
    const onMove = (e: PointerEvent) => {
      if (!idleTimer.current) return
      if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < IDLE_MOVE_PX) return
      last = { x: e.clientX, y: e.clientY }
      scheduleIdle()
    }
    const onDown = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerdown", onDown, true)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown, true)
    }
  }, [scheduleIdle])

  // Keyboard: Enter analyzes, Delete removes the selected item, Escape deselects.
  // Ignored while typing in the Ask box.
  const historyRef = useRef<{ undo: () => void; redo: () => void }>({ undo: () => {}, redo: () => {} })
  const deleteRef = useRef<(s: NonNullable<Selection>) => void>(() => {})
  const selectedRef = useRef<Selection>(null)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) historyRef.current.redo()
        else historyRef.current.undo()
      } else if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "y") {
        e.preventDefault()
        historyRef.current.redo()
      } else if (e.key === "Enter" && !e.repeat && !drawing.current) {
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
  // The user's own handwriting, if they made any; used by the per-answer "handwriting" toggle even when the setting is off.
  const mineGlyphs = useMemo(() => (Object.keys(userGlyphs).length ? glyphSetFor(userGlyphs, true) : null), [userGlyphs])
  useEffect(() => {
    rendererRef.current = makeDefaultRenderer(glyphs, dark ? THEME.dark.ai : THEME.light.ai, settings.handwriting && Object.keys(userGlyphs).length > 0, mineGlyphs)
  })

  useEffect(() => {
    if (!state) return
    const save = (s: AppState) => {
      if (saveState(s) || warnedSave.current) return
      warnedSave.current = true
      flash("Couldn't save: the board is too big (photos are large). Delete a photo.", 6000)
    }
    const t = setTimeout(() => save(state), 400)
    const flush = () => save(stateRef.current ?? state)
    window.addEventListener("pagehide", flush)
    return () => {
      clearTimeout(t)
      window.removeEventListener("pagehide", flush)
    }
  }, [state, flash])

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

  // Scroll pans; Ctrl/Cmd + scroll (or a trackpad pinch) zooms around the cursor.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !hydrated) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (drawing.current) return
      const line = e.deltaMode === 1 ? 16 : 1
      const dx = e.deltaX * line
      const dy = e.deltaY * line
      const v = viewRef.current
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, v.k * Math.exp(-dy * 0.01))
      else setView({ ...v, x: v.x - dx, y: v.y - dy })
    }
    host.addEventListener("wheel", onWheel, { passive: false })
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.("input, textarea")
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e)) {
        spaceDown.current = true
        // a focused button keeps its own Space behavior
        if (!(e.target as HTMLElement | null)?.closest?.("button")) e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      host.removeEventListener("wheel", onWheel)
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [hydrated, setView, zoomAt])

  // ---------- example boards (/?example=<id> from the examples page) ----------
  const exampleDone = useRef(false)
  useEffect(() => {
    if (!hydrated || exampleDone.current) return
    exampleDone.current = true
    const id = new URLSearchParams(window.location.search).get("example")
    if (!id) return
    window.history.replaceState(null, "", window.location.pathname)
    const example = EXAMPLES.find((d) => d.id === id)
    const s = stateRef.current
    if (!example || !s) return
    const b = newBoard(s.boards.length + 1)
    b.name = `Example: ${example.title}`
    const built = buildExample(example)
    b.strokes = built.strokes
    b.texts = built.texts
    b.inkVersion = b.strokes.length ? 1 : 0
    if (example.diagram) {
      const payload: CardPayload = { type: "diagram", diagram: example.diagram.diagram }
      const { w, h } = sizeRef.current
      b.cards = [
        { ...payload, id: crypto.randomUUID(), pos: { x: example.diagram.x, y: example.diagram.y }, scale: fitScale(payload, w, h), createdAt: Date.now() },
      ]
    }
    commit({ ...s, boards: [...s.boards, b], activeBoardId: b.id, sidebarOpen: false })
    if (example.create) setComposer({ x: example.create.x, y: example.create.y, prompt: example.create.prompt, photo: null })
    flash(example.hint, 7000)
  }, [hydrated, commit, flash])

  const activeId = state?.activeBoardId
  useEffect(() => {
    const v = (activeId && viewsRef.current.get(activeId)) || { x: 0, y: 0, k: 1 }
    viewRef.current = v
    setViewState(v)
    redrawInk()
    syncUndo()
  }, [activeId, dark, redrawInk, syncUndo])

  useEffect(() => () => cancelAnalysis(), [cancelAnalysis])

  // ---------- pointer input ----------
  /** Screen position -> board coordinates. */
  const toBoard = (sx: number, sy: number) => {
    const v = viewRef.current
    return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k }
  }
  const visibleRect = (): Rect => {
    const v = viewRef.current
    const { w, h } = sizeRef.current
    return { x: -v.x / v.k, y: -v.y / v.k, w: w / v.k, h: h / v.k, k: v.k }
  }

  const pointOf = (e: PointerEvent | React.PointerEvent, rect: DOMRect, real: boolean): Point => ({
    ...toBoard(e.clientX - rect.left, e.clientY - rect.top),
    p: real ? e.pressure : 0.5,
    t: Math.round(e.timeStamp),
  })

  /** Starts a two-finger pan/pinch from the first two touches that are down. */
  const beginGesture = () => {
    const [a, b] = [...touchPos.current.entries()].slice(0, 2)
    if (!a || !b || gesture.current) return
    gesture.current = {
      ids: [a[0], b[0]],
      mid0: { x: (a[1].x + b[1].x) / 2, y: (a[1].y + b[1].y) / 2 },
      dist0: Math.max(10, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y)),
      v0: viewRef.current,
    }
  }

  const cancelDrawing = () => {
    if (drawing.current?.hold) clearTimeout(drawing.current.hold)
    drawing.current = null
    clearLive()
  }

  const eraseAt = (d: Drawing, ax: number, ay: number, bx: number, by: number) => {
    const board = activeBoard()
    if (!board) return
    const r = ERASER_RADIUS / viewRef.current.k
    const hit: { stroke: Stroke; index: number }[] = []
    board.strokes.forEach((s, index) => {
      if (segmentHitsStroke(s, ax, ay, bx, by, r)) hit.push({ stroke: s, index })
    })
    // Answers are erased like ink: when the eraser passes over one. Erasing the question leaves its answer.
    const hitAnswers: { answer: Answer; index: number }[] = []
    if (board.answers.length && rendererRef.current) {
      const pos = placeAnswers(board.answers, board.cards ?? [], sizeRef.current.w - 16, rendererRef.current)
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(2, r / 2)))
      board.answers.forEach((a, index) => {
        const p = pos.get(a.id)
        if (!p) return
        for (let i = 0; i <= steps; i++) {
          const x = ax + ((bx - ax) * i) / steps
          const y = ay + ((by - ay) * i) / steps
          if (x >= p.left - r && x <= p.left + p.w + r && y >= p.top - r && y <= p.top + p.h + r) {
            hitAnswers.push({ answer: a, index })
            return
          }
        }
      })
    }
    if (!hit.length && !hitAnswers.length) return
    const ids = new Set(hit.map((h) => h.stroke.id))
    const aids = new Set(hitAnswers.map((h) => h.answer.id))
    d.erased.push(...hit)
    d.erasedAnswers.push(...hitAnswers)
    patchBoard(board.id, (b) => ({
      ...b,
      strokes: b.strokes.filter((s) => !ids.has(s.id)),
      answers: b.answers.filter((a) => !aids.has(a.id)),
    }))
    if (hit.length) redrawInk()
    setSelected(null)
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

  /** Hold-to-snap: after SNAP_HOLD_MS of stillness a rough line, circle, oval, triangle or box becomes a clean one. */
  const armHold = (d: Drawing) => {
    if (d.hold) clearTimeout(d.hold)
    if (!settingsRef.current.snapShapes) return
    d.hold = setTimeout(() => {
      if (drawing.current !== d || !d.stroke || d.snap) return
      const r = recognizeShape(d.stroke.points)
      if (!r) return
      d.snap = r
      d.stroke = {
        ...d.stroke,
        shape: true,
        real: false,
        width: Math.max(2.5, d.stroke.width * 0.7),
        points: r.pts.map(([x, y], i) => ({ x, y, p: 0.5, t: i })),
      }
      d.predicted = []
      navigator.vibrate?.(8)
      scheduleLive()
    }, SNAP_HOLD_MS)
  }

  /** Two quick fingers = undo, three = redo (Notability's gestures). Called when the last finger lifts. */
  const finishTapGesture = (now: number) => {
    const t = tapTrack.current
    tapTrack.current = null
    if (!t || t.moved || now - t.t0 > TAP_MAX_MS) return
    if (t.max === 2 && canUndoRef.current) {
      historyRef.current.undo()
      flash("Undo", 900)
    } else if (t.max === 3 && canRedoRef.current) {
      historyRef.current.redo()
      flash("Redo", 900)
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    const board = activeBoard()
    if (!board) return
    const now = performance.now()
    const isPen = e.pointerType === "pen"
    const isTouch = e.pointerType === "touch"
    setSelected(null)
    setShapeOpen(false)
    setHintGone(true)

    // The Move tool: any pointer (finger, pen, mouse) drags the board; a second finger pinch-zooms.
    if (toolRef.current === "hand") {
      if (isTouch) {
        touches.current.add(e.pointerId)
        touchPos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.current.size > 1) {
          panDrag.current = null
          beginGesture()
          return
        }
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      panDrag.current = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, v0: viewRef.current }
      return
    }

    // Space + drag with a mouse pans the board.
    if (spaceDown.current && e.pointerType === "mouse") {
      e.currentTarget.setPointerCapture(e.pointerId)
      panDrag.current = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, v0: viewRef.current }
      return
    }

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
      askTap.current = { pointerId: e.pointerId, ...toBoard(e.clientX - rect.left, e.clientY - rect.top), tool: toolRef.current }
      return
    }

    if (isPen) {
      penDown.current = true
      if (drawing.current?.touch) cancelDrawing() // palm/finger stroke loses to the pen
    } else if (isTouch) {
      touches.current.add(e.pointerId)
      touchPos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (penDown.current || now < penUntil.current) return // palm rejection
      const tt = (tapTrack.current ??= { t0: e.timeStamp, max: 0, moved: false, start: new Map() })
      tt.start.set(e.pointerId, { x: e.clientX, y: e.clientY })
      tt.max = Math.max(tt.max, touches.current.size)
      if (touches.current.size > 1) {
        if (drawing.current?.touch) cancelDrawing() // two fingers: pan and pinch-zoom, not a stroke
        beginGesture()
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
      erasedAnswers: [],
      lastX: pt.x,
      lastY: pt.y,
      touch: isTouch,
    }
    if (d.tool === "pen") {
      d.stroke = {
        id: crypto.randomUUID(),
        points: [pt],
        tool: "pen",
        width: isPen ? settingsRef.current.penSize : Math.max(2, settingsRef.current.penSize * 0.85),
        color: INK_COLOR,
        real: isPen,
        createdAt: Date.now(),
      }
    }
    if (d.tool === "shape") {
      d.start = pt
      d.stroke = { ...shapeStroke([[pt.x, pt.y]]), width: SHAPE_WIDTH }
    }
    drawing.current = d
    if (d.tool === "pen") {
      d.anchor = { x: pt.x, y: pt.y }
      armHold(d)
    }
    if (d.tool === "eraser") eraseAt(d, pt.x, pt.y, pt.x, pt.y)
    else scheduleLive()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "pen") penUntil.current = performance.now() + PEN_REJECT_MS // includes hover
    const pd = panDrag.current
    if (pd && pd.pointerId === e.pointerId) {
      setView({ ...pd.v0, x: pd.v0.x + e.clientX - pd.sx, y: pd.v0.y + e.clientY - pd.sy })
      return
    }
    if (e.pointerType === "touch" && touchPos.current.has(e.pointerId)) {
      touchPos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const g = gesture.current
      const a = g && touchPos.current.get(g.ids[0])
      const b = g && touchPos.current.get(g.ids[1])
      if (g && a && b) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const nk = clampZoom((g.v0.k * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist0)
        const bx = (g.mid0.x - g.v0.x) / g.v0.k
        const by = (g.mid0.y - g.v0.y) / g.v0.k
        setView({ k: nk, x: mid.x - bx * nk, y: mid.y - by * nk })
        return
      }
    }
    const tt = tapTrack.current?.start.get(e.pointerId)
    if (tt && Math.hypot(e.clientX - tt.x, e.clientY - tt.y) > TAP_MAX_MOVE_PX) tapTrack.current!.moved = true
    const d = drawing.current
    if (!d || d.pointerId !== e.pointerId) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (d.snap) {
      // Snapped: a line keeps following the pen (drag the end where you want it); other shapes stay put.
      if (d.snap.kind === "line" && d.snap.a && d.stroke) {
        const pt = pointOf(e, rect, false)
        d.stroke.points = densify([[d.snap.a.x, d.snap.a.y], [pt.x, pt.y]]).map(([x, y], i) => ({ x, y, p: 0.5, t: i }))
        scheduleLive()
      }
      return
    }
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
      } else if (d.tool === "shape" && d.stroke && d.start) {
        d.stroke.points = shapePath(shapeRef.current, d.start, pt).map(([x, y], i) => ({ x, y, p: 0.5, t: i }))
      } else if (d.stroke) {
        const last = d.stroke.points[d.stroke.points.length - 1]
        if (last.x === pt.x && last.y === pt.y) continue
        d.stroke.points.push(pt)
      }
    }
    if (d.tool === "pen" && d.anchor) {
      const lp = d.stroke?.points[d.stroke.points.length - 1]
      if (lp && Math.hypot(lp.x - d.anchor.x, lp.y - d.anchor.y) * viewRef.current.k > SNAP_JITTER_PX) {
        d.anchor = { x: lp.x, y: lp.y }
        armHold(d)
      }
    }
    if (d.stroke && d.tool === "shape") scheduleLive()
    else if (d.stroke) {
      const predicted = typeof native.getPredictedEvents === "function" ? native.getPredictedEvents() : []
      d.predicted = predicted.map((ev) => pointOf(ev, rect, real)) // drawn, never stored
      scheduleLive()
    }
  }

  /** Records a new action; anything that was undone can no longer be redone. */
  const pushUndo = (boardId: string, a: UndoAction) => {
    const stack = undoStacks.current.get(boardId) ?? []
    stack.push(a)
    undoStacks.current.set(boardId, stack)
    redoStacks.current.set(boardId, [])
    syncUndo()
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "pen") {
      penDown.current = false
      penUntil.current = performance.now() + PEN_REJECT_MS
    }
    touches.current.delete(e.pointerId)
    touchPos.current.delete(e.pointerId)
    if (e.pointerType === "touch" && touches.current.size === 0 && e.type === "pointerup") finishTapGesture(e.timeStamp)
    else if (touches.current.size === 0) tapTrack.current = null
    if (gesture.current?.ids.includes(e.pointerId)) gesture.current = null
    if (panDrag.current?.pointerId === e.pointerId) {
      panDrag.current = null
      return
    }
    const tap = askTap.current
    if (tap && tap.pointerId === e.pointerId) {
      askTap.current = null
      if (e.type === "pointercancel") return
      // flushSync mounts the box (and its autoFocus) inside this event, so the keyboard opens.
      if (tap.tool === "text") {
        const blank = blankAt(tap.x, tap.y)
        flushSync(() => {
          setHintGone(true)
          setEditor(blank ?? { kind: "new", x: tap.x, y: tap.y })
        })
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
    if (d.hold) clearTimeout(d.hold)
    drawing.current = null
    const board = activeBoard()
    if (!board) return
    if (d.tool === "shape" && d.stroke && d.start && pathExtent(d.stroke.points) < 8) {
      // A tap, not a drag: drop a regular-sized shape centered on the tap.
      const k = shapeRef.current
      const line = k === "line" || k === "arrow"
      const wide = k === "rectangle" || k === "oval"
      const hw = line ? 70 : wide ? 80 : 60
      const hh = line ? 0 : wide ? 50 : 60
      d.stroke.points = shapePath(k, { x: d.start.x - hw, y: d.start.y - hh }, { x: d.start.x + hw, y: d.start.y + hh }).map(([x, y], i) => ({ x, y, p: 0.5, t: i }))
    }
    if ((d.tool === "pen" || d.tool === "shape") && d.stroke) {
      const stroke = d.stroke
      const ctx = inkRef.current?.getContext("2d")
      if (ctx) {
        const v = viewRef.current
        const dpr = dprRef.current
        ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y)
        drawStroke(ctx, { ...stroke, color: inkColor.current, width: stroke.width * (v.k < 1 ? 1 / v.k : 1) })
      }
      clearLive()
      pushUndo(board.id, { type: "add", stroke })
      patchBoard(board.id, (b) => ({
        ...b,
        strokes: [...b.strokes, stroke],
        inkVersion: b.inkVersion + 1,
        updatedAt: Date.now(),
      }))
      scheduleIdle()
    } else if (d.tool === "eraser" && (d.erased.length || d.erasedAnswers.length)) {
      pushUndo(board.id, { type: "erase", items: d.erased, answers: d.erasedAnswers })
      patchBoard(board.id, (b) => ({ ...b, inkVersion: b.inkVersion + 1, updatedAt: Date.now() }))
    }
  }

  // ---------- actions ----------
  const undo = () => {
    const board = activeBoard()
    if (!board || drawing.current) return
    cancelAnalysis() // undoing is editing: no auto-analysis (and stop one that's running)
    const action = undoStacks.current.get(board.id)?.pop()
    if (!action) return
    const redo = redoStacks.current.get(board.id) ?? []
    redo.push(action)
    redoStacks.current.set(board.id, redo)
    setSelected(null)
    if (action.type === "clear") {
      patchBoard(board.id, (b) => bump({ ...b, strokes: action.strokes, answers: action.answers, cards: action.cards, texts: action.texts, images: action.images }))
      redrawInk()
    } else if (action.type === "text-add" || action.type === "text-del" || action.type === "text-edit" || action.type === "fill") {
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
    } else if (action.type === "image-add" || action.type === "image-del" || action.type === "image-scale") {
      patchBoard(board.id, (b) => {
        if (action.type === "image-add") return { ...b, images: (b.images ?? []).filter((i) => i.id !== action.image.id) }
        if (action.type === "image-scale")
          return { ...b, images: (b.images ?? []).map((i) => (i.id === action.id ? { ...i, scale: action.prev } : i)) }
        const images = [...(b.images ?? [])]
        images.splice(Math.min(action.index, images.length), 0, action.image)
        return { ...b, images }
      })
    } else if (action.type === "card-scale") {
      patchBoard(board.id, (b) => ({ ...b, cards: (b.cards ?? []).map((c) => (c.id === action.id ? { ...c, scale: action.prev } : c)) }))
    } else if (action.type === "card-replace") {
      patchBoard(board.id, (b) => ({ ...b, cards: (b.cards ?? []).map((c) => (c.id === action.id ? action.prev : c)) }))
    } else if (action.type === "card-add" || action.type === "card-del" || action.type === "answer-del") {
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
      // Undoing a freshly created diagram/note goes back to its prompt, ready to edit.
      if (action.type === "card-add" && action.reopen) {
        const r = action.reopen
        flushSync(() => setComposer({ x: r.x, y: r.y, prompt: r.prompt, photo: r.photo }))
      }
    } else {
      patchBoard(board.id, (b) => {
        let strokes = b.strokes
        let answers = b.answers
        if (action.type === "add") {
          strokes = strokes.filter((s) => s.id !== action.stroke.id)
        } else {
          strokes = [...strokes]
          for (const it of [...action.items].sort((a, c) => a.index - c.index)) {
            strokes.splice(Math.min(it.index, strokes.length), 0, it.stroke)
          }
          answers = [...answers]
          for (const it of [...(action.answers ?? [])].sort((a, c) => a.index - c.index)) {
            answers.splice(Math.min(it.index, answers.length), 0, it.answer)
          }
        }
        return { ...b, strokes, answers, inkVersion: b.inkVersion + 1, updatedAt: Date.now() }
      })
      redrawInk()
    }
    syncUndo()
  }

  const redo = () => {
    const board = activeBoard()
    if (!board || drawing.current) return
    cancelAnalysis()
    const action = redoStacks.current.get(board.id)?.pop()
    if (!action) return
    const stack = undoStacks.current.get(board.id) ?? []
    stack.push(action)
    undoStacks.current.set(board.id, stack)
    setSelected(null)
    if (action.type === "card-add") setComposer(null)
    patchBoard(board.id, (b) => redoBoard(b, action))
    redrawInk()
    syncUndo()
  }

  /** Live resize while dragging a card's corner; one undo step is recorded when the drag ends. */
  const scaleCard = (id: string, scale: number) => {
    const b = activeBoard()
    if (b) patchBoard(b.id, (bd) => ({ ...bd, cards: (bd.cards ?? []).map((c) => (c.id === id ? { ...c, scale } : c)) }))
  }
  const finishScale = (id: string, prev: number, next: number) => {
    const b = activeBoard()
    if (b && Math.abs(prev - next) > 0.001) pushUndo(b.id, { type: "card-scale", id, prev, next })
  }
  const scaleImage = (id: string, scale: number) => {
    const b = activeBoard()
    if (b) patchBoard(b.id, (bd) => ({ ...bd, images: (bd.images ?? []).map((i) => (i.id === id ? { ...i, scale } : i)) }))
  }
  const finishImageScale = (id: string, prev: number, next: number) => {
    const b = activeBoard()
    if (b && Math.abs(prev - next) > 0.001) pushUndo(b.id, { type: "image-scale", id, prev, next })
  }
  const moveImage = (id: string, x: number, y: number) => {
    const b = activeBoard()
    if (b) patchBoard(b.id, (bd) => ({ ...bd, images: (bd.images ?? []).map((i) => (i.id === id ? { ...i, pos: { x, y } } : i)) }))
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

  const clearBoard = () => {
    const b = activeBoard()
    if (!b || drawing.current || isBlank(b)) return
    cancelAnalysis()
    pushUndo(b.id, { type: "clear", strokes: b.strokes, answers: b.answers, cards: b.cards ?? [], texts: b.texts ?? [], images: b.images ?? [] })
    patchBoard(b.id, (bd) => bump({ ...bd, strokes: [], answers: [], cards: [], texts: [], images: [] }))
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
    } else if (sel.type === "image") {
      const images = b.images ?? []
      const index = images.findIndex((i) => i.id === sel.id)
      if (index < 0) return
      pushUndo(b.id, { type: "image-del", image: images[index], index })
      patchBoard(b.id, (bd) => ({ ...bd, images: (bd.images ?? []).filter((i) => i.id !== sel.id) }))
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
    historyRef.current = { undo, redo }
  })

  const moveCard = (id: string, x: number, y: number) => {
    const b = activeBoard()
    if (b) patchBoard(b.id, (bd) => ({ ...bd, cards: (bd.cards ?? []).map((c) => (c.id === id ? { ...c, pos: { x, y } } : c)) }))
  }

  /** Ask box / photo: the AI makes a note or a diagram and it's placed where the user asked. */
  const createCard = async (
    prompt: string,
    photo: string | null,
    at: { x: number; y: number },
    source?: string,
    reopen?: { x: number; y: number; prompt: string; photo: ComposerState["photo"] },
  ) => {
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
      const vis = visibleRect()
      const scale = fitScale(payload, vis.w, vis.h)
      const nat = naturalSize(payload)
      const cur = stateRef.current?.boards.find((b) => b.id === board.id)
      const { x, y } = freeSpot(at, nat.w * scale, nat.h * scale, vis, cur)
      const card = { ...payload, id: crypto.randomUUID(), pos: { x, y }, scale, prompt, source, createdAt: Date.now() } as Card
      patchBoard(board.id, (b) => ({ ...b, cards: [...(b.cards ?? []), card] }))
      pushUndo(board.id, { type: "card-add", card, reopen })
    } catch {
      flash("Couldn't create: network")
    } finally {
      if (source) makingRef.current.delete(source)
      setPending((p) => p.filter((x) => x.id !== pid))
    }
  }

  useEffect(() => {
    createRef.current = (p, ph, at, src) => void createCard(p, ph, at, src)
  })

  /** "Change this": the card and the requested edit go to the model, and the result replaces the card in place (undoable). */
  const reviseCard = async (cardId: string, change: string) => {
    const board = activeBoard()
    const old = board?.cards?.find((c) => c.id === cardId)
    if (!board || !old) return
    const pid = crypto.randomUUID()
    setPending((p) => [...p, { id: pid, boardId: board.id, x: old.pos.x, y: old.pos.y }])
    try {
      let previous: CardPayload
      if (old.type === "diagram") {
        // typed practice answers and check marks stay out of the request; the correct labels are in the diagram
        previous = { type: "diagram", diagram: { ...old.diagram, nodes: old.diagram.nodes.map((n) => (n.blank ? { id: n.id, label: n.label, blank: n.blank } : { id: n.id, label: n.label })) } }
      } else if (old.type === "graph") previous = { type: "graph", graph: old.graph }
      else previous = { type: "note", title: old.title, text: old.text }
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: change, previous }),
      })
      const data = (await res.json().catch(() => ({}))) as { card?: CardPayload; error?: string }
      if (!res.ok || !data.card) {
        flash(`Couldn't change it: ${failureText(res.status, data.error)}`)
        return
      }
      const next = { ...data.card, id: old.id, pos: old.pos, scale: old.scale, prompt: old.prompt, source: old.source, createdAt: old.createdAt } as Card
      patchBoard(board.id, (b) => ({ ...b, cards: (b.cards ?? []).map((c) => (c.id === cardId ? next : c)) }))
      pushUndo(board.id, { type: "card-replace", id: cardId, prev: old, next })
    } catch {
      flash("Couldn't change it: network")
    } finally {
      setPending((p) => p.filter((x) => x.id !== pid))
    }
  }

  const editCard = (cardId: string) => {
    const b = activeBoard()
    const c = b?.cards?.find((x) => x.id === cardId)
    if (!c) return
    setSelected(null)
    const r = cardSize(c)
    const at = { x: c.pos.x, y: c.pos.y + r.h + 12 }
    flushSync(() => setComposer({ x: at.x, y: at.y, prompt: "", photo: null, editCardId: cardId }))
  }

  const submitComposer = (prompt: string) => {
    const c = composer
    if (!c) return
    setComposer(null)
    if (c.editCardId) {
      void reviseCard(c.editCardId, prompt)
      return
    }
    void createCard(prompt, c.photo?.base64 ?? null, { x: c.x, y: c.y }, undefined, { x: c.x, y: c.y, prompt, photo: c.photo })
  }

  /** Toolbar Create button: the same box as the examples' "make it for me", in the middle of the screen. */
  const openCreate = () => {
    changeTool("pen")
    const { w, h } = sizeRef.current
    const at = toBoard(Math.max(12, w / 2 - 170), Math.max(12, h / 2 - 140))
    flushSync(() => setComposer({ x: at.x, y: at.y, prompt: "", photo: null }))
  }

  /** A PDF: every page goes on the board as a sheet to write on, stacked top to bottom. */
  const addPdfToBoard = async (file: File) => {
    const b = activeBoard()
    if (!b) return
    flash("Opening PDF…", 4000)
    try {
      const pages = await pdfToPages(file)
      const vis = visibleRect()
      const scale = Math.min(1, (vis.w - 48) / pages[0].w)
      let y = vis.y + 16 / vis.k
      const images: BoardImage[] = pages.map((p) => {
        const im: BoardImage = {
          id: crypto.randomUUID(),
          pos: { x: vis.x + Math.max(8, (vis.w - p.w * scale) / 2), y },
          w: p.w,
          h: p.h,
          scale,
          src: p.dataUrl,
          createdAt: Date.now(),
        }
        y += p.h * scale + 12
        return im
      })
      for (const image of images) pushUndo(b.id, { type: "image-add", image })
      patchBoard(b.id, (bd) => ({ ...bd, images: [...(bd.images ?? []), ...images] }))
      flash(pages.length > 1 ? `Added ${pages.length} pages` : "Added 1 page")
    } catch {
      flash("Couldn't open that PDF")
    }
  }

  const onPhotoPicked = async (file: File | undefined) => {
    if (!file) return
    if (isPdf(file)) return void addPdfToBoard(file)
    try {
      setPhotoChoice({ file, photo: await photoToJpeg(file) })
    } catch {
      flash("Couldn't read that photo")
    }
  }

  /** "Draw on it": put the photo on the board, under the ink, centered on screen. */
  const addPhotoToBoard = async () => {
    const pc = photoChoice
    const b = activeBoard()
    setPhotoChoice(null)
    if (!pc || !b) return
    try {
      const p = await photoToJpeg(pc.file, 1400, 0.8)
      const vis = visibleRect()
      const scale = Math.min(1, (vis.w - 48) / p.w, (vis.h - 180 / vis.k) / p.h)
      const w = p.w * scale
      const h = p.h * scale
      const image: BoardImage = {
        id: crypto.randomUUID(),
        pos: { x: vis.x + Math.max(8, (vis.w - w) / 2), y: vis.y + Math.max(8, (vis.h - h - 70 / vis.k) / 2) },
        w: p.w,
        h: p.h,
        scale,
        src: p.dataUrl,
        createdAt: Date.now(),
      }
      pushUndo(b.id, { type: "image-add", image })
      patchBoard(b.id, (bd) => ({ ...bd, images: [...(bd.images ?? []), image] }))
      setSelected({ type: "image", id: image.id })
    } catch {
      flash("Couldn't read that photo")
    }
  }

  /** "Make a diagram": open the Create box with the photo attached. */
  const createFromPhoto = () => {
    const pc = photoChoice
    setPhotoChoice(null)
    if (!pc) return
    const { w, h } = sizeRef.current
    const at = toBoard(Math.max(12, w / 2 - 170), Math.max(12, h / 2 - 160))
    flushSync(() => setComposer({ x: at.x, y: at.y, prompt: "Turn this into a diagram", photo: pc.photo }))
  }
  // Paste an image (Cmd/Ctrl+V) or drop one on the board: same flow as the Photo button.
  const photoRef = useRef<(f: File) => void>(() => {})
  useEffect(() => {
    photoRef.current = (f) => void onPhotoPicked(f)
  })
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === "file" && i.type.startsWith("image/"))
      const file = item?.getAsFile()
      if (!file) return
      e.preventDefault()
      photoRef.current(file)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [])

  /** Flips one answer between typed text and handwriting. */
  const toggleStyle = (id: string) => {
    const b = activeBoard()
    if (!b) return
    const hw = settings.handwriting && Object.keys(userGlyphs).length > 0
    patchBoard(b.id, (bd) => ({
      ...bd,
      answers: bd.answers.map((a) => (a.id === id ? { ...a, style: answerMode(a, hw) === "text" ? "hand" : "text" } : a)),
    }))
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
      pushUndo(b.id, { type: "fill", cardId: ed.cardId, nodeId: ed.nodeId, prev, next: text || undefined })
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
        pushUndo(b.id, { type: "text-edit", id: t.id, prev: t.text, next: text })
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
    if (idleTimer.current) clearTimeout(idleTimer.current) // switching tools means you're not done
    idleTimer.current = null
    const prev = toolRef.current
    toolRef.current = t
    setTool(t)
    setPenTray(false)
    setShapeOpen(t === "shape" ? prev !== "shape" || !shapeOpen : false)
    if (t === "ask") flash("Tap where the answer should go")
    if (t === "text") flash("Click anywhere to type, or click a blank to fill it in")
    if (t === "hand") flash("Drag the board to move around")
    if (t !== "text") setEditor(null)
  }

  if (!state) return <div className="fixed inset-0 bg-[var(--board)]" />
  const board = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0]

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--board)]">
      <div
        ref={hostRef}
        className="absolute inset-0 [touch-action:none] select-none [-webkit-touch-callout:none]"
        style={{ cursor: tool === "hand" ? "grab" : undefined }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/") || isPdf(x))
          if (!f) return
          e.preventDefault()
          void onPhotoPicked(f)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* photos sit under the ink so you can draw on them */}
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          {(board.images ?? []).map((im) => {
            const p = imgDrag?.id === im.id ? imgDrag : im.pos
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={im.id}
                src={im.src}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none"
                style={{ left: p.x, top: p.y, width: im.w * im.scale, height: im.h * im.scale }}
              />
            )
          })}
        </div>
        <canvas ref={inkRef} className="absolute inset-0 h-full w-full" />
        <canvas ref={liveRef} className="absolute inset-0 h-full w-full" />
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
        <AnswerOverlay
          answers={board.answers}
          images={board.images ?? []}
          onMoveImage={moveImage}
          onDragImage={(id, p) => setImgDrag(p ? { id, ...p } : null)}
          onScaleImage={scaleImage}
          onScaleImageDone={finishImageScale}
          onScaleCard={scaleCard}
          onScaleCardDone={finishScale}
          cards={board.cards ?? []}
          pending={pending.filter((p) => p.boardId === board.id)}
          width={size.w}
          scale={view.k}
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
          onEditCard={editCard}
          textTool={tool === "text"}
          glyphs={glyphs}
          aiColor={dark ? THEME.dark.ai : THEME.light.ai}
          dark={dark}
          handwriting={settings.handwriting && Object.keys(userGlyphs).length > 0}
          mineGlyphs={mineGlyphs}
          onToggleStyle={toggleStyle}
        />
        {editor && (
          <InlineEditor
            key={editor.kind === "edit" ? editor.id : editor.kind === "blank" ? `${editor.cardId}:${editor.nodeId}` : `${editor.x},${editor.y}`}
            {...editorProps(editor, board)}
            onCommit={commitEditor}
            onCancel={() => setEditor(null)}
          />
        )}
        </div>
        {photoChoice && (
          <PhotoChoice
            preview={photoChoice.photo.dataUrl}
            onAdd={() => void addPhotoToBoard()}
            onCreate={createFromPhoto}
            onCancel={() => setPhotoChoice(null)}
          />
        )}
        {composer && (
          <Composer
            key={`${composer.x},${composer.y}`}
            x={composer.x * view.k + view.x}
            y={composer.y * view.k + view.y}
            bounds={size}
            initialPrompt={composer.prompt}
            photo={composer.photo?.dataUrl ?? null}
            editing={composer.editCardId ? board.cards?.find((c) => c.id === composer.editCardId)?.type : undefined}
            onSubmit={submitComposer}
            onCancel={() => setComposer(null)}
          />
        )}
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/*,application/pdf,.pdf"
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
      <div
        className="absolute z-30 flex flex-col items-center gap-0.5 rounded-full border border-[var(--hairline)] bg-[var(--chrome)] p-0.5 text-[var(--text)] shadow-[0_4px_24px_rgba(0,0,0,0.12)] backdrop-blur-xl select-none"
        style={{ right: "calc(12px + env(safe-area-inset-right))", top: "calc(68px + env(safe-area-inset-top))" }}
        role="group"
        aria-label="Zoom"
      >
        <button type="button" aria-label="Zoom in" className="flex h-11 w-11 items-center justify-center rounded-full [touch-action:manipulation] active:bg-[var(--press)]" onClick={() => zoomAt(size.w / 2, size.h / 2, view.k * 1.25)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" aria-label="Reset zoom" title="Reset zoom and position" className="flex h-11 w-11 items-center justify-center rounded-full text-[11px] font-medium tabular-nums [touch-action:manipulation] active:bg-[var(--press)]" onClick={() => setView({ x: 0, y: 0, k: 1 })}>
          {Math.round(view.k * 100)}%
        </button>
        <button type="button" aria-label="Zoom out" className="flex h-11 w-11 items-center justify-center rounded-full [touch-action:manipulation] active:bg-[var(--press)]" onClick={() => zoomAt(size.w / 2, size.h / 2, view.k / 1.25)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
      </div>
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
      {tool === "shape" && shapeOpen && (
        <ShapePicker
          value={shapeKind}
          onPick={(k) => {
            shapeRef.current = k
            setShapeKind(k)
          }}
        />
      )}
      {tool === "pen" && penTray && (
        <PenTray
          value={settings.penSize}
          onPick={(s) => {
            updateSettings({ ...settingsRef.current, penSize: s })
            setPenTray(false)
          }}
        />
      )}
      <Toolbar
        tool={tool}
        onTool={changeTool}
        onPenAgain={() => setPenTray((v) => !v)}
        canUndo={canUndo}
        onUndo={undo}
        canRedo={canRedo}
        onRedo={redo}
        canClear={!isBlank(state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0])}
        onClear={clearBoard}
        onPhoto={() => photoInput.current?.click()}
        onCreate={openCreate}
        busy={busy}
        onAnalyze={analyzeNow}
      />

      {isBlank(board) && !hintGone && !composer && !editor && !pending.length && (
        <div className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-6" style={{ top: "34%" }}>
          <div className="max-w-sm text-center text-[var(--text-muted)]">
            <div className="text-[22px] font-semibold tracking-tight text-[var(--text)]">Draw or write anything</div>
            <p className="mt-1.5 text-[15px] leading-snug">
              Try <span className="font-medium text-[var(--text)]">2 + 2 =</span> or a <span className="font-medium text-[var(--text)]">?</span> next to a
              diagram, then tap <span className="font-medium text-[#007AFF]">Analyze</span>.
            </p>
            <div className="pointer-events-auto mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={openCreate}
                className="h-11 rounded-full bg-[#007AFF] px-5 text-[15px] font-medium text-white [touch-action:manipulation] active:opacity-80"
              >
                Make a diagram
              </button>
              <a
                href="/examples"
                className="flex h-11 items-center rounded-full border border-[var(--hairline)] bg-[var(--chrome)] px-5 text-[15px] font-medium text-[var(--text)] backdrop-blur-xl [touch-action:manipulation] active:bg-[var(--press)]"
              >
                See examples
              </a>
            </div>
          </div>
        </div>
      )}

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
