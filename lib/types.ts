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

export type DiagramNode = {
  id: string
  label: string
  blank?: number // practice blank number (label hidden)
  fill?: string // what the student typed into the blank
  result?: "right" | "wrong" // set by "Check answers"
}
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
  source?: string // the model's reading of the written command that made this card (avoids making it twice)
  createdAt: number
} & ({ type: "diagram"; diagram: Diagram } | { type: "note"; title: string; text: string })

/** Text the student typed on the board (Text tool). Counts as their own writing for Analyze. */
export type TextBox = { id: string; pos: { x: number; y: number }; text: string; size: number; createdAt: number }

export type Board = {
  id: string
  name: string
  strokes: Stroke[]
  answers: Answer[]
  cards?: Card[]
  texts?: TextBox[]
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
  kind?: AnswerKind | "create" // "create": the student wrote a command to make a diagram or note; answer = the request
  box: [number, number, number, number] // ymin, xmin, ymax, xmax, 0-1000
  answer: string
  confidence: "high" | "low"
}

/** What /api/create returns. */
export type CardPayload =
  | { type: "diagram"; diagram: Diagram }
  | { type: "note"; title: string; text: string }
