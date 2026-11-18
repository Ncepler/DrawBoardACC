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

export type Answer = {
  id: string
  box: { x: number; y: number; w: number; h: number }
  text: string
  confidence: "high" | "low"
  source?: string // model's transcription of what this answers; used to tell if the problem changed
  pos?: { x: number; y: number } // set when the user drags the answer; overrides auto-placement
  createdAt: number
}

export type Board = {
  id: string
  name: string
  strokes: Stroke[]
  answers: Answer[]
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
  box: [number, number, number, number] // ymin, xmin, ymax, xmax, 0-1000
  answer: string
  confidence: "high" | "low"
}
