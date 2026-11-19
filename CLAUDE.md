# AI Whiteboard (working name) — CLAUDE.md

Read this whole file before writing any code. It is the source of truth for what we are building, why, what is already decided, and what is out of scope. If anything here conflicts with a task prompt, stop and ask.

Owner: Noah Cepler (student, builds web projects on Next.js / Tailwind / Supabase / Vercel, works in Claude Code on a MacBook, tests on an iPad with Apple Pencil).

---

## 0. One-paragraph summary

A whiteboard app you draw (or type) on with an Apple Pencil, finger, or mouse. When you tap **Analyze**, the app takes a picture of the board, sends it to the Gemini API, and Gemini decides what you want answered: a math problem to solve, a question or "Explain X" to explain, a blank or "?" in a diagram to name, or your own wrong answer to correct. No question mark is required. Answers appear next to what they answer: numbers and simple math are drawn as pen strokes (in your own handwriting if you set it up), terms show as short text, explanations as a small card. You can also ask for content (the **Create** button: "diagram of photosynthesis with 4 blanks") or turn a **photo** into a diagram; practice diagrams with numbered blanks can be filled in by pen or by typing and checked. The first target user is a student who diagrams a whole unit on a board and gets stuck on terms.

This repo is still a MOCKUP to answer one question: is the board-that-answers-you loop genuinely useful? It is not the final product and it is not a Miro competitor.

---

## 1. Origin and the problem it solves

Noah diagrammed an entire AP Biology unit (cellular respiration, photosynthesis, enzymes) on a real whiteboard. The board had glycolysis branching into anaerobic and aerobic paths, pyruvate oxidation, the Krebs cycle, oxidative phosphorylation with the electron transport chain and ATP synthase, the light reactions (PSII, ETC, PSI, NADPH, ATP, stroma), the Calvin cycle (CO2, RuBP, 3PG, reduction, G3P, glucose), energy diagrams with activation energy and -ΔG / +ΔG, competitive vs allosteric inhibition, and UCP1 / heat. While drawing it, there are always spots where you forget a name or what goes in a box. Today you stop, look it up, and lose your flow.

The idea: draw a "?" right where the gap is, keep going, and the answer shows up beside it. A second idea built on the same technology: the app draws a diagram for you with parts left blank, and you fill them in (practice). A third: photograph a real whiteboard and have the app process it the same way.

---

## 2. The core loop

1. The student draws (pen strokes) and/or types (Text tool) on the board.
2. The student taps **Analyze** (or presses Enter on a keyboard). Automatic analysis after a pause is optional (Settings → "Analyze automatically when I pause", it waits for 1200 ms of stillness: pointer movement restarts the wait, and switching tools, pressing any button, undo/redo or erasing cancels it; constants `IDLE_MS`, `IDLE_MOVE_PX`); it is OFF by default to save API quota.
3. The app exports everything on the board as a PNG: ink strokes and typed text (black), practice diagrams (gray), and the app's earlier answers (blue, so follow-ups like "÷ 2" under an answer build on it). AI notes and non-practice cards are left out.
4. `/api/answer` sends the image to Gemini, which returns only NEW items: what it read, what kind of response (math / term / explain / check, or create), the answer, a confidence, and the box of what it answers. It handles commands as well as questions ("define…", "write out a diagram for…").
5. Each answer is shown next to what it answers, on the overlay layer.

Second loop (creation): Create box or Photo → `/api/create` → Gemini returns a note or a diagram (nodes + edges + optional numbered blanks) → the app lays it out and places it on the board as a draggable card.

Everything else in the app exists to support these loops or the drawing feel.

---

## 3. Product vision

Three ways Noah has thought about selling it:
1. A full whiteboard with the AI built in (hardware).
2. A Kindle-sized device (hardware).
3. Software for an iPad someone already owns.

Noah's own priority order is software first. Hardware is far-future and depends on the software proving itself. Do not design, name, or stub anything for hardware.

Phases and where they stand:
1. Mockup loop: answers on the board, boards, Apple-feel ink. **Built.**
2. Answers in the user's own handwriting. **Started:** per-character handwriting capture in Settings (about 95 characters; closing marks ) ] } > ≥ are the opening marks flipped: letters, numbers, and a "More symbols" tab with π √ ^ ÷ ≤ ≥ and more); with the setting on, every answer is drawn with those glyphs, and any missing character is typeset. Not yet: connected cursive, natural spacing/jitter, multiple samples per character, learning from normal writing.
3. Practice mode: diagrams with blanks, the user fills them in, the app checks them. **Built (first version):** Ask for "… with N blanks"; fill by pen (checked by Gemini via Analyze) or by typing (checked locally by "Check answers").
4. Photo of a real whiteboard / textbook figure. **Built (first version):** Photo button → diagram or note.
5. Possibly: iPad-optimized app, then hardware.

---

## 4. Competitive landscape and honest assessment

Why this file includes this: so we don't accidentally build the wrong thing or oversell it.

**Miro** is an online infinite whiteboard for teams: sticky notes, flowcharts, mind maps, real-time collaboration, templates. Its AI generates diagrams and mind maps from text prompts, clusters sticky notes, and summarizes boards. It is typing/click-first and handwriting is secondary. It is a different product for a different customer (teams at work). It is not the thing we are competing with.

**Closer competitors for the handwriting side:**
- Apple Notes "Smart Script" on iPadOS 18 can render pasted text in your own handwriting and cleans up your writing. It only works inside Apple's Notes app.
- MyScript Nebo announced AI ink generation (text turned into your handwriting) and quiz generation from handwritten notes.
- Conwrite turns typed text into your handwriting from letter samples.
- GoodNotes and Notability have AI features.

**What appears not to exist (from limited searching, not exhaustive):** an app that answers a hand-drawn "?" in-flow while you draw, or that blanks out a diagram so you redraw it from memory. That is the differentiator. The handwriting-output part is NOT the differentiator and is becoming a built-in feature elsewhere.

**Honest risks:**
- The gap is narrow and the moat is thin. Apple, GoodNotes, or Nebo could add this within months.
- Students rarely pay for study tools. Willingness to pay is unproven.
- Accuracy is the product. A study tool that fills in a wrong term teaches the wrong thing, which is worse than no answer.
- "Works on your existing iPad" really means we build our own whiteboard app. iPadOS does not let a third-party app draw into Apple Notes or GoodNotes.
- Writing back in the user's handwriting is the hardest and least valuable part. A typed answer next to the "?" tests the idea about 90% as well.

Noah's stated expectation: he assumed the software part is easy. The loop (pause, screenshot, vision model, answer) is a weekend prototype; the hard parts are pen feel, accurate "?" localization, correctness of answers, and later handwriting rendering.

---

## 5. Scope of this repo

### In scope (built)
- Full-screen whiteboard canvas with Apple-feel ink using Apple Pencil, finger, or mouse.
- Left sidebar with boards (Board 1, Board 2, ...), add-board button, Examples link, show/hide toggle.
- Floating toolbar: pen, eraser, Move (hand), undo, redo, clear board (red trash icon, undoable; the only clear button) | Shapes, Text (T), Create (palette), Photo | Analyze.
- Settings gear (top right): appearance (System / Light / Dark), "Write answers in my handwriting" + handwriting setup, "Analyze automatically when I pause", See examples.
- Unbounded board with zoom and pan: +, −, and a reset button (shows the zoom %) under the settings gear; two-finger drag pans and pinch zooms; scroll pans, Ctrl/Cmd+scroll or a trackpad pinch zooms; Space + mouse drag pans. Zoom runs 2%–400%. Each board remembers its own view in memory (not saved across refresh). Zoomed out, line thickness keeps its 100% size; everything else (ink, typed text, answers, diagrams, notes, graphs) scales with the board, so nothing drifts relative to the writing.
- Handwriting setup: each box shows a faint gray guide letter to trace (readable in light and dark), and an Undo button in the header undoes the last stroke across all characters.
- Analyze: board image → Gemini → answers by kind, drawn or shown next to what they answer.
- Paste an image (Cmd/Ctrl+V), drop one, or pick one with Photo: a popup asks "What do you want to do with this photo?" with two buttons, **Draw on it** (puts the photo on the board under the ink; grab strip along its top moves it, corner handle resizes, × deletes; saved in localStorage and included in the image sent to Gemini) or **Make a diagram** (opens the Create box with "Turn this into a diagram"; edit it to e.g. "solve this").
- Create box and Photo → AI notes, diagrams (cycle / flow / tree layouts, optional numbered practice blanks) and function graphs (blank axes drawn by the app, curves plotted from formulas). "graph it" written on the board makes a graph too.
- Shapes tool: pick a shape (square, rectangle, circle, oval, triangle, right triangle, diamond, pentagon, hexagon, star, line, arrow) from the palette above the toolbar, then drag on the board. Each shape is one ordinary stroke (`Stroke.shape`: constant width, sharp corners), so it can be erased, undone and is read by Analyze. The tool stays on until another is picked.
- Geometry: for a drawn figure with an unknown angle or length, Gemini is told to answer with the value and a tight box around that unknown label or angle mark, so the answer lands at that angle. Untested against real Gemini.
- Notability-inspired drawing feel (`lib/snap.ts`, `components/PenTray.tsx`): **hold to snap** (hold the pen still 350 ms at the end of a stroke and a rough line, circle, oval, triangle or box becomes a clean shape; a snapped line follows the pen until lift; setting "Hold to snap shapes", on by default); **pen thickness tray** (tap the pen while it is selected: Fine 3 / Medium 6 / Bold 10 / Marker 16, saved in settings); **two-finger tap = undo, three-finger tap = redo** (quick, barely moving); toolbar buttons shrink slightly when pressed. No color picker: ink color is meaningful (black = student, blue = app). Untested on iPad.
- Text tool: typed text on the board (counts as the student's writing) and typed answers in practice blanks, with local "Check answers".
- **PDF / file import** (Photo button, drop): each PDF page (up to 12) is placed on the board as a sheet to write on (`lib/pdf.ts`, uses `pdfjs-dist`), same as "Draw on it" images. Analyze works on a board with only an imported page.
- **Multiple choice:** a fifth answer kind, `circle`: Gemini returns the box of the correct option and the app draws a blue ring on it. Student's option marked and right → nothing; marked and wrong → ring the right one; nothing marked → only when the board says "answer all these". Untested against real Gemini.
- Shapes: tap (no drag) drops a regular-size shape; the palette closes when you tap the board. Cmd/Ctrl+Z undo, Shift+Cmd+Z / Ctrl+Y redo. The first-run hint goes away on the first touch and stays gone.
- Cards also show a small pencil at the top-right corner (always) that opens the same prompt as **Change**.
- Notes, diagrams and graphs have a **Change** button when selected: it reopens the prompt box ("What should change?"), sends the current card plus the edit to `/api/create` (`previous`), and replaces the card in place (one undo step).
- An empty board shows a first-run hint ("Draw or write anything") with Make a diagram / See examples.
- Answers, notes, diagrams and typed text: tap to select, drag to move, × to delete, all undoable. Notes, diagrams and graphs also have a corner handle to resize (one undo step).
- `/examples` page with ready-made example boards (math, follow-ups, check my work, missing angle, word problem, fill the gap, explain, diagram, practice blanks, graph, photo); each opens as a new board via `/?example=<id>`.
- Boards, settings, and handwriting glyphs persisted in localStorage.

### Out of scope (do not build, do not stub)
- Accounts/login, database, sharing, collaboration, export, color picker, hardware anything. (Images and PDFs are only for photo-to-diagram and as sheets to draw over.)
- Any deploy or Vercel configuration changes unless Noah asks (Noah handles deploys and merges).

---

## 6. Decisions already made (do not reopen without Noah)

| Decision | Why |
|---|---|
| Analysis is manual (Analyze button / Enter); auto-on-pause is an opt-in setting, default off | Saves Gemini quota; Noah asked for a button |
| No question mark required: Gemini decides what to respond to | Noah's request; a "?" still works |
| Answer kinds with caps: math ≤10 words, term ≤6 words, explain ≤60 words (2–3 sentences), check ≤8 words; enforced in the Gemini instruction AND in code | Short where it must fit beside the work; explanations when asked ("Krebs cycle:?", "Explain X") |
| Math answers are plain text, never LaTeX; "=" is added when the student didn't write one. Exponents that aren't simple digits are written `^(…)` and drawn raised and small (`3^(π/2)`) | Raw `\frac{}` was showing; "2500+10" should read "= 2510"; a literal caret looked wrong |
| Default answer look: explanations are a typed card; math is drawn as pen strokes; other answers are text in a handwriting-looking system font (`HAND_FONT`: Bradley Hand / Noteworthy / Segoe Print). "Write answers in my handwriting" on: short answers are drawn in the user's glyphs, explanations stay a typed card. Every answer has a toggle (when selected, top-left button) between typed and handwriting (the user's glyphs if made, else the handwriting-looking font) | Noah's request: explanations in a textbox by default, handwriting-looking default |
| Handwriting: user writes each character once in Settings; glyphs behind a `GlyphSet` interface | Phase 2 starting point; renderer swappable |
| Gemini analyzes a screenshot of the board | Noah's choice of model provider |
| Drawing must feel like Apple's ink (Notes/Freeform) | Pen feel is a top priority |
| Apple Pencil, finger and mouse all draw | Stated requirement |
| Ink stored as vector strokes, not pixels | Crisp at any size, erasable by stroke, re-exportable |
| Earlier AI answers ARE in the image sent to Gemini, drawn blue; AI notes/cards are not; practice diagrams are in gray | Noah's request: follow-ups build on answers (3+3 → 6, then "÷ 2" → 3). The prompt tells Gemini never to re-answer blue text |
| Typed practice answers are checked locally (strict on numbers, forgiving on case/spacing/typos); pen-filled blanks are checked by Gemini | Instant, free, and deterministic for typed answers |
| Wrong answers are worse than no answer: confidence returned, low confidence shown muted | Study tool correctness (see section 12) |
| Light, dark, and system appearance | Noah's request |
| localStorage persistence, no database | Mockup scope |
| Gemini key server-side only | Security |

---

## 7. Stack, environment, deployment

- Next.js 16 (App Router, `cacheComponents` on: route segment config like `runtime` is not allowed), React 19, TypeScript, Tailwind v4. Read `node_modules/next/dist/docs/` before using Next APIs (see AGENTS.md).
- `perfect-freehand` for stroke outlines; `@google/genai` for Gemini. No other runtime dependencies.
- Gemini is called ONLY from server routes: `/api/answer` (board analysis) and `/api/create` (Ask box / photo). Shared server code: `lib/gemini.ts` (client, model fallback, error mapping) and `lib/server.ts` (origin check, rate limit, body cap).
- Model ids live in ONE constant, `GEMINI_MODELS` in `lib/gemini.ts`, tried in order: `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`. A quota (429) or not-found (404) error falls through to the next. `gemini-3.8-flash` hit a 0/free-tier quota on Noah's key. SDK retries are disabled (they blew past Vercel's function timeout); per-request timeout 25 s (`/api/answer`) / 50 s (`/api/create`).
- Env: `GEMINI_API_KEY` in Vercel (Production; add Preview to use branch previews) and in `.env.local` for local dev (gitignored; placeholder in `.env.local.example`). The key must never be in client code, logs, or commits.
- Deploy: Vercel project `drawboardacc`, production from `main` (https://drawboardacc.vercel.app). Work happens on a feature branch, merged to `main` by PR when Noah says so. Vercel Deployment Protection (login) is on for `.vercel.app` URLs.
- Noah tests on an iPad with Apple Pencil and on a Mac. Claude Code cannot test Pencil input: test with a mouse/Playwright and flag what needs the iPad.

---

## 8. UX spec

### Layout
- Canvas fills the viewport (`position: fixed; inset: 0`; safe-area insets on all floating chrome). Board color and ink color follow the theme.
- Top left: sidebar toggle (always reachable) and the translucent boards sidebar (boards, Add board, Examples). The sidebar floats over the canvas, so toggling never resizes the canvas.
- Top right: settings gear → settings panel (appearance, handwriting, auto-analyze, examples). Zoom controls sit in a small vertical pill just under it.
- Bottom center toolbar: pen, eraser (whole-stroke), Move (hand: drag the board with any pointer), undo, redo, clear board (red trash icon; one Undo restores it) | Shapes, Text (T), Create (palette), Photo | Analyze. Nothing else.
- Small notices appear top center (e.g. "Nothing to answer found", "Couldn't analyze: …", "2 of 3 right").
- All tap targets at least 44px. No hover-only UI, no right-click, nothing that only works with a mouse (keyboard shortcuts are extras: Enter = Analyze, Delete = delete selection, Escape = deselect).

### Tools and items
- **Create** (palette button): opens the Create box in the middle of the screen (same box as the examples' "make it for me"), type, Create. Undo right after a creation removes the card and reopens the box with the same prompt (and photo) to edit; Redo brings the card back. A "Thinking…" placeholder shows while Gemini works; the result is placed at the nearest free spot.
- **Photo**: pick or take a photo (downscaled to ≤1600 px JPEG in the browser), optionally change the request (default "Turn this into a diagram"), Create.
- **Text (T)**: click empty board to type (Enter saves, Shift+Enter new line, the box grows with its text); click a practice blank to type its answer; click typed text to edit. Clicking away saves, and that click only closes the box (it never opens another). The tool stays on until another tool is picked.
- A pen or mouse can draw right up to an answer's edge; only a finger gets the enlarged grab area.
- **Items** (answers, notes, diagrams, typed text): tap selects (ring + × button), drag moves, × deletes; undo restores. Diagrams move only by the grab strip along the top, so the pen can write on the rest. A dragged answer keeps its spot across re-analysis.
- Erasing ink leaves answers alone; the eraser removes an answer only when it passes over the answer itself (undoable). Undo/redo only ever step the last action: undoing a stroke leaves answers alone.

### Visual language (Apple-like)
- Font stack: `-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif`.
- Theme colors are CSS variables in `app/globals.css` (`:root` and `:root.dark`, toggled by a class on `<html>`; a boot script in `<head>` applies it before first paint). Canvas colors come from `THEME` in `lib/settings.ts`.
- AI content is system blue (#007AFF light / #0A84FF dark); the student's ink and typed text use the ink color. Low-confidence answers are muted.

### Input behavior
- Pointer Events. Board coordinates are independent of the view: `screen = board × zoom + offset`, applied to both ink canvases and (as a CSS transform) the overlay. Palm rejection: while a pen is down or was active (including hover) in the last 500 ms, touch is ignored. Two fingers cancel a finger stroke and pan/zoom instead. Finger draws when no pen is in use.
- The page never scrolls, zooms, selects text, shows callouts, or rubber-bands while drawing on the canvas.
- Drawing is never blocked by network activity. The Ask box and text editor open on pointer LIFT with `flushSync` + `autoFocus` so iPad shows the keyboard (untested on device).

---

## 9. Ink engine spec (the part that must feel like Apple)

Goal: strokes that look and feel like Apple Pencil in Notes/Freeform: smooth, no visible polyline corners, variable width driven by pressure and speed, no perceived lag, crisp at device pixel ratio.

**What was built (`lib/ink.ts`, `components/Whiteboard.tsx`):**
- **Stroke library:** `perfect-freehand` with smoothing 0.6, streamline 0.45, and round caps with no taper.
- **Pen:** size 6, thinning 0.55, using real pressure clamped to ≥0.05 (about 1.2–4.8 px wide).
- **Finger and mouse:** size 5, thinning 0.5, with simulated (speed-based) pressure.
- **Events:** `getCoalescedEvents()` supplies every point. `getPredictedEvents()` points are drawn on the live layer but never stored. Both are feature-detected (Safari 18.2+).
- **Canvases:** two of them, committed ink plus the live stroke. Each is sized by devicePixelRatio (capped at 3 and at 16M pixels) and redrawn from vectors on resize, board switch, undo and erase.
- **Not yet checked:** none of these numbers have been tuned on an iPad.

Original research notes (kept for context; the values above are what was chosen):
- Variable-width smooth strokes via a freehand-stroke approach (for example the `perfect-freehand` library) are likely closer to Apple's feel than raw line segments. Evaluate before committing; if added, state it in the report.
- Pressure (0–1) from Pointer Events should modulate width; finger input has no real pressure and needs a speed-based fallback.
- Use `getCoalescedEvents()` for full-rate points. `getPredictedEvents()` can hide latency but Safari support must be checked; feature-detect and degrade gracefully.
- Canvas must be sized by `devicePixelRatio`, redrawn from vector strokes on resize, and avoid full-canvas clears per frame (draw incrementally; redraw fully only when needed).

iPad Safari gotchas to handle deliberately:
- `touch-action: none` on the canvas, `user-select: none`, `-webkit-touch-callout: none`, `overscroll-behavior: none` on the page.
- `setPointerCapture` so strokes continue if the pen leaves the canvas bounds.
- Prevent double-tap zoom and gesture events on the canvas area.
- Canvas dimension limits and memory: keep buffers sane.
- 100vh vs dynamic viewport behavior; safe-area insets.
- Palm rejection: while a pen pointer is down or recently active, ignore touch pointers. Pencil hover (on supported iPads) must not draw.

Eraser: removes whole strokes whose geometry the eraser path intersects (stroke-level erase, not pixel erase). Undo reverses the last action (see section 10).

---

## 10. Data model (see `lib/types.ts`)

```ts
type Point = { x: number; y: number; p: number; t: number }
type Stroke = { id; points: Point[]; tool: "pen"; width; color; real: boolean /* real pen pressure */; shape?: boolean /* from the Shapes tool */; createdAt }

type AnswerKind = "math" | "term" | "explain" | "check"
type Answer = {
  style?: "text" | "hand"       // per-answer toggle; overrides the default look
  id; box: { x; y; w; h }      // board coords of what it answers (from Gemini's normalized box)
  text; kind?: AnswerKind; confidence: "high" | "low"
  source?: string              // Gemini's transcription; unchanged source => keep old answer on re-analysis
  pos?: { x; y }               // set when the user drags it; overrides auto-placement
  createdAt
}

type DiagramNode = { id; label; blank?: number; fill?: string; result?: "right" | "wrong" }
type Diagram = { title; layout: "cycle" | "flow" | "tree"; nodes: DiagramNode[]; edges: { from; to; label? }[] }
type Graph = { title; xmin; xmax; ymin; ymax; curves: { expr; label? }[]; points: { x; curve; label? }[] }
type Card = { id; pos; scale; prompt?; source?; createdAt } & ({ type: "diagram"; diagram } | { type: "note"; title; text } | { type: "graph"; graph })
type TextBox = { id; pos; text; size; createdAt }   // typed by the student (Text tool)

type Board = { id; name; strokes; answers; cards?; texts?; inkVersion; lastAnalyzedVersion; updatedAt }
type AppState = { boards; activeBoardId; sidebarOpen; version: 1 }
```

- Board coordinates are CSS pixels of the board, independent of the device pixel ratio.
- localStorage keys: `ai-whiteboard:v1` (AppState, debounced save + flush on pagehide), `ai-whiteboard:settings:v1` (theme, handwriting, autoAnalyze), `ai-whiteboard:glyphs:v1` (the user's handwriting glyphs). All reads/writes are guarded with try/catch.
- Undo is per board and in memory: stroke add/erase, card add/delete, answer delete, text add/edit/delete, blank fill.

---

## 11. Analysis and request rules

- Manual by default: Analyze button or Enter. With auto-analyze on, the idle timer resets on every stroke point and fires only when content changed since the last analysis (`inkVersion !== lastAnalyzedVersion`).
- Empty board (no strokes, typed text, or practice diagram): never call the API ("Draw something first").
- The exported image covers all board content (ink, text, practice diagrams, answers), not just what is on screen. A very spread-out board is downscaled to fit `EXPORT_MAX_SIDE`, so tiny writing far apart may be harder for Gemini to read.
- Only one analysis request in flight. Starting a new stroke or switching boards aborts it; late results for a changed or inactive board are ignored.
- After a result: ADD the new answers to the board's existing ones (nothing is replaced; a follow-up becomes its own answer). An item that repeats an existing answer's problem in the same spot is dropped, so the old one and its dragged position stay. `create` items (a written command to make a diagram/note) call `/api/create` once each (tracked by `Card.source`) and place the card under the command.
- API failure: never blocks drawing; one retry for 5xx/network, then a short notice ("Couldn't analyze: Gemini quota exceeded, check API key billing", etc.).
- `/api/create` (Ask/Photo) runs independently of analysis; several can be pending.

---

## 12. Gemini integration

### `POST /api/answer`
- Input: `{ image }`, a base64 PNG. Origin check, per-IP and per-instance rate limit, 4 MB body cap (Vercel Hobby limit is 4.5 MB).
- Output: `{ found, items: [{ kind, reading, box: [ymin, xmin, ymax, xmax] (0–1000), answer, confidence }] }` via structured output (`responseJsonSchema`). The server validates every item and drops malformed ones.
- Instruction (in the route): read the WHOLE board. Black ink and typed text are the student's; gray diagrams are app practice sheets. Respond with:
  - **math**: problems to evaluate, ending in "=", or equations to solve.
  - **explain**: "Explain X", "X?", "X:?".
  - **term**: blanks or "?" in diagrams.
  - **check**: the student's own WRONG answer ("✗ 56"), or blanks the student filled with the pen in a practice diagram ("✓" / "✗ term").
  Skip correct finished work, headings, notes and doodles. Plain text only. The box covers the whole problem line.
- `lib/format.ts` post-processing: LaTeX/markdown → plain text with super/subscripts (x², CO₂); per-kind word caps; for math, strip a leading "=" and add "= " when the student wrote no "=".

### `POST /api/create`
- Input: `{ prompt?, image? }` (JPEG or PNG base64). Output: `{ card: { type: "note", title, text } | { type: "diagram", diagram } | { type: "graph", graph } }`.
- Graphs: Gemini supplies only formulas in x (`x^2 - 4`, up to 3 curves), the window, and key points (x plus which curve; the app computes y). `lib/graph.ts` parses and plots them with its own small parser (no `eval`); unreadable formulas are dropped, never guessed. Blank axes, grid and ticks are drawn by the app. Graph cards move by a grab strip along the top, like diagrams, and are not part of the image sent to Gemini.
- Diagrams: 3–14 nodes, short labels, layout cycle/flow/tree. `blank` numbers only when the student asks for blanks/practice; the blank's correct answer stays in `label` (hidden on screen and in the image sent to Gemini). Layout and SVG rendering are done client-side (`lib/diagram.ts`).

### Correctness rules
- Wrong answers are worse than no answer. Prefer `low` confidence over guessing; low confidence is shown muted.
- If the model answers a different subject than the board's, that is a failure to report, not something to hide.
- Prompts have only been tested with mocked responses, plus a few live runs by Noah (math, "explain photosynthesis" worked). Tune them against real outputs when possible (see HANDOFF.md for how to test with a real key).

### Cost, abuse, and privacy
- Origin check + in-memory rate limit (speed bump only; serverless instances don't share memory) + body cap. No passcode yet.
- Do not log images, prompts, or answers (error messages only). Board images, prompts and photos go to Google's Gemini API; nothing is stored server-side.

---

## 13. Overlay rendering

- One DOM overlay above the ink canvases holds answers, AI cards, typed text, editors and the Ask box. It is never part of the image sent to Gemini (practice diagrams are re-rendered in gray for the export).
- Answer placement: to the right of the answered box, then below, left, above; avoiding other answers and cards (the board is unbounded, so there is no screen edge). Text size follows the height of what was written, capped (text ≤44 px, drawn ≤110 px) and shrunk to fit the screen width at 100% zoom, so zooming never re-flows answers.
- Renderers sit behind `AnswerRenderer { measure(answer, maxW); renderAnswer(answer, maxW) }`: ink (glyphs), text pill, explain card. `makeDefaultRenderer(glyphSet, color, handwriting)` picks one per answer.
- Glyphs: `GlyphSet { get(ch) }`. The built-in set covers digits, `= + - × ÷ / ( ) . x y`, a space, and superscripts. `lib/rich.ts` parses `^(…)` exponents; both renderers draw them smaller and raised.
- With "Write answers in my handwriting" on and at least one glyph set up, every answer except explanations is drawn with the user's glyphs (explanations stay a typed card until toggled). Long answers wrap onto several lines.
  - Sub/superscript digits are drawn with the user's own digits, scaled and shifted.
  - A character the user hasn't written is typeset in a plain font at the same size, so one missing glyph never drops the whole answer to text.
- With handwriting off, only fully-glyphed math is drawn as strokes; explanations show as a typed card and everything else as a text pill in the handwriting-looking font.

---

## 14. Test fixtures: Noah's real bio board

The best test case is Noah's actual whiteboard photo (cellular respiration + photosynthesis + enzymes). Some labels are hard to read; confirm anything uncertain with Noah instead of assuming. Content the board covers:
- Cell respiration: glycolysis → anaerobic (alcohol and a second fermentation product, 2 ATP) and aerobic → pyruvate oxidation → Krebs cycle → oxidative phosphorylation (NADH/ATP electron carriers, ETC, ATP synthase, roughly 30–32 ATP) with the overall equation.
- Photosynthesis: light reactions (PSII, ETC, PSI, NADP+/NADPH, ADP+Pi → ATP, H+ gradient, ATP synthase, water splitting, O2, thylakoid/stroma) and the Calvin cycle (CO2, RuBP, 3PG, reduction, G3P, 1/6 leaves as glucose, carbon fixation).
- Enzymes and energy: activation energy graphs for -ΔG and +ΔG, competitive and allosteric inhibition, substrate/rate curve.
- UCP1 / heat (brown fat), ATP synthase, proton gradient.

Suggested manual test cases (expected answers are examples; Noah confirms):
- "?" between glycolysis and the Krebs cycle → "Pyruvate oxidation" or "Acetyl-CoA".
- "?" next to the ETC H+ pump at the inner mitochondrial membrane → "Electron transport chain".
- "?" inside the Calvin cycle where CO2 is fixed → "RuBP" / "Rubisco".
- "?" next to "-ΔG" curve peak → "Activation energy".
- "?" where an inhibitor binds away from the active site → "Allosteric site".
- Board with NO question mark → nothing shown, no UI change.
- Board with a "?" in normal writing (like "why?") → should be ignored.
- Two or three "?" at once → each gets its own answer, nothing overlaps.
- Messy handwriting, tiny "?", "?" close to other strokes → check localization accuracy.

---

## 15. Quality bar (acceptance checklist)

1. Pen feel: no visible corners, no perceived lag on iPad, pressure changes width, finger works, palm ignored while the pen is active.
2. Nothing on the page scrolls, zooms, or selects while drawing.
3. The sidebar toggles without losing or distorting strokes. Boards switch and persist across refresh, along with settings and handwriting.
4. Analyze puts a correct, plainly formatted answer next to what it answers (no LaTeX; "=" when missing; explanations when asked).
5. Nothing to answer → a notice, no answers. Empty board → no request.
6. Drawing mid-request cancels cleanly with no stale answer.
7. API errors never break drawing; the notice says why.
8. The key is never in client code (`grep -r GEMINI_API_KEY .next/static` → 0 hits); `next build` and `eslint` pass.
9. AI notes/cards are never in the image sent to Gemini; earlier answers are, in blue, and Gemini doesn't re-answer them.
10. Every tap target is ≥44px. Ask/Text work with a keyboard on Mac and with the on-screen keyboard on iPad.
11. Items can be selected, moved, deleted, and undone. Practice blanks can be filled by pen or by typing and checked.

---

## 16. Validation plan (why we are building this at all)

The mockup exists to test the idea cheaply, in about one week:
1. Run Noah's bio board through the loop and check whether answers are right.
2. Give it to 5–10 classmates with their own boards.
3. Keep going if most of them use it a second time on their own, or ask for it for another class.
4. Drop or rethink if answers are often wrong or people try it once and never return.

If it passes: build the live practice mode and handwriting output next. Hardware only after the software proves itself.

---

## 17. Roadmap hooks

- **Handwriting output (next step):** move from per-character glyphs to natural handwriting: connected letters, varied spacing and jitter, multiple samples per character, learning from what the user writes normally. Keep it behind `GlyphSet` / `AnswerRenderer`.
- **Practice mode:** the typed-answer checker (`lib/check.ts`) follows the rule "strict about content, forgiving about format": numbers/coefficients must match exactly ("NADH + H+" is not "2 NAD+ + H+"), while case, spacing, subscripts and small typos are forgiven. Synonyms ("3-PG" vs "3-PGA") are still marked wrong; a Gemini double-check is a possible next step.
- **Photo of a physical whiteboard:** works as photo → diagram/note. Not yet: analyzing a photographed board in place, the way Analyze does for drawn boards.
- **Ink in practice blanks** does not move with the diagram when the diagram is dragged.
- **Hardware:** ignore for now.

---

## 18. Working agreements for Claude Code

- Honest reporting only. If something fails, is untestable on this machine, or you disagree with a decision here, say so plainly. No sugarcoating and no invented problems.
- Keep reports condensed: a table of files and what they do (under fifteen words each), a short "decisions" list, a short "flagged" list. No essays, no next-steps lists.
- Minimal diffs. Match existing patterns in the repo. Do not refactor, rename, or reorganize what you weren't asked to touch.
- Read HANDOFF.md at the start of a new session for current state and open items.
- No tests, README, or docs changes unless asked. Keep this CLAUDE.md in sync when Noah changes a decision. No new dependencies unless required; if you add one (for example a stroke library), say why in the report.
- Do not create extra pages, admin screens, or config unless the task requires it.
- Run the build once at the end of a task, not per file. Run the dev server only to catch obvious errors.
- Before using any API or SDK signature from memory (Gemini model id, box format, SDK methods), verify it in the current official docs.
- If something is ambiguous, a task is bigger than expected, or you can't find what a locator points at, stop and tell Noah. Do not guess and do not work around it.
- Never commit secrets. Never expose `GEMINI_API_KEY` to the browser.

---

## 19. Open questions (ask Noah, don't decide silently)

- Product name (currently "AI Whiteboard", working title only).
- Which Gemini model to use long-term (Flash-Lite fits the free quota; a bigger model may read handwriting and build diagrams more accurately).
- Whether auto-analyze should become the default again once quota allows, and the idle delay.
- Whether to add a simple passcode gate (and turn off Vercel login protection) before sharing with classmates.
- Which classmates/classes to test with.

---

## 20. Glossary

- **Board content:** the student's ink strokes and typed text, plus practice diagrams. This is what gets sent to Gemini.
- **Overlay:** AI answers, AI notes/diagrams, typed text, and editors drawn above the ink. AI items are never sent to Gemini as answers.
- **Analysis pass:** one Analyze (or idle-triggered) round trip to `/api/answer`.
- **Answer kind:** math, term, explain, or check. Each kind has its own length cap and renderer. A fifth item kind, create, isn't an answer: it makes a card.
- **Card:** an AI note, diagram or graph created via Ask, Photo or a written command.
- **Practice blank:** a numbered empty box in a diagram whose answer the student fills in.
- **Glyph set:** the stroke shapes used to draw answers (built-in, or the user's own handwriting).
- **Low confidence:** Gemini unsure; shown muted so the user doesn't trust it blindly.
- **Mockup:** the version in this repo. It tests the loop; it is not the shipping product.
