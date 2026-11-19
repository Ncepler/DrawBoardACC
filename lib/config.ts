// Auto-analyze waits for this long of stillness (no stroke, no pointer movement) after the last pen stroke.
export const IDLE_MS = 1200
export const IDLE_MOVE_PX = 4
// Idle-triggered analysis is off for now: the Analyze button / Enter key run it instead.
export const AUTO_ANALYZE = false
export const MAX_ANSWER_WORDS = 6
export const EXPORT_MAX_SIDE = 1600
export const INK_COLOR = "#1d1d1f"
export const ANSWER_COLOR = "#007AFF"
export const STORAGE_KEY = "ai-whiteboard:v1"
export const PEN_REJECT_MS = 500
export const ERASER_RADIUS = 10
// Hold the pen still this long at the end of a stroke and a rough shape snaps clean.
export const SNAP_HOLD_MS = 350
export const SNAP_JITTER_PX = 4
// Two- or three-finger tap undoes or redoes (must be quick and barely move).
export const TAP_MAX_MS = 300
export const TAP_MAX_MOVE_PX = 12
export const PEN_SIZES = [3, 6, 10, 16]
