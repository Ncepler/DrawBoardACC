import { STORAGE_KEY } from "./config"
import type { AppState, Board } from "./types"

export function newBoard(n: number): Board {
  return {
    id: crypto.randomUUID(),
    name: `Board ${n}`,
    strokes: [],
    answers: [],
    inkVersion: 0,
    lastAnalyzedVersion: 0,
    updatedAt: Date.now(),
  }
}

export function initialState(): AppState {
  const b = newBoard(1)
  return { boards: [b], activeBoardId: b.id, sidebarOpen: true, version: 1 }
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as AppState
    if (s?.version !== 1 || !Array.isArray(s.boards) || s.boards.length === 0) return null
    if (!s.boards.some((b) => b.id === s.activeBoardId)) s.activeBoardId = s.boards[0].id
    return s
  } catch {
    return null
  }
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // quota / private mode: ignore
  }
}
