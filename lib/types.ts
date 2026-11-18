export type Point = { x: number; y: number; p: number; t: number }

export type Stroke = {
  id: string
  points: Point[]
  tool: "pen"
  width: number
  color: string
  real: boolean // true when pressure came from a real pen
  createdAt: number
}

/** math = a computed result, term = a short name, explain = a few sentences, check = verdict on the student's own answer */
export type AnswerKind = "math" | "term" | "explain" | "check"

export type Answer = {
  id: string
  box: { x: number; y: number; w: number; h: number }
  text: string
  kind?: AnswerKind
  confidence: "high" | "low"
  source?: string // model's transcription of what this answers; used to tell if the problem changed
  pos?: { x: number; y: number } // set when the user drags the answer; overrides auto-placement
  createdAt: number
}

export type DiagramNode = { id: string; label: string; blank?: number } // blank = practice blank number (label hidden)
export type DiagramEdge = { from: string; to: string; label?: string }
export type Diagram = {
  title: string
  layout: "cycle" | "flow" | "tree"
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

/** Things the AI creates on request (Ask box / photo). Live on the overlay, draggable and deletable. */
export type Card = {
  id: string
  pos: { x: number; y: number }
  scale: number
  prompt?: string
  createdAt: number
} & ({ type: "diagram"; diagram: Diagram } | { type: "note"; title: string; text: string })

export type Board = {
  id: string
  name: string
  strokes: Stroke[]
  answers: Answer[]
  cards?: Card[]
  inkVersion: number
  lastAnalyzedVersion: number
  updatedAt: number
}

export type AppState = {
  boards: Board[]
  activeBoardId: string
  sidebarOpen: boolean
  version: 1
}

export type AnswerItem = {
  reading?: string
  kind?: AnswerKind
  box: [number, number, number, number] // ymin, xmin, ymax, xmax, 0-1000
  answer: string
  confidence: "high" | "low"
}

/** What /api/create returns. */
export type CardPayload =
  | { type: "diagram"; diagram: Diagram }
  | { type: "note"; title: string; text: string }
