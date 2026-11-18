# AI Whiteboard (working name) — CLAUDE.md

Read this whole file before writing any code. It is the source of truth for what we are building, why, what is already decided, and what is out of scope. If anything here conflicts with a task prompt, stop and ask.

Owner: Noah Cepler (student, builds web projects on Next.js / Tailwind / Supabase / Vercel, works in Claude Code on a MacBook, tests on an iPad with Apple Pencil).

---

## 0. One-paragraph summary

A whiteboard app you draw on with an Apple Pencil or your finger. When you stop drawing for a moment, the app takes a picture of the board, sends it to the Gemini API, and Gemini looks for any question mark you drew. If you drew a "?" where you forgot what something is called, the app writes a very short answer next to it. In this mockup the answer is plain text. In a later phase the answer is written in the user's own handwriting. The first target user is a student who diagrams a whole unit on a board and gets stuck on terms.

This repo is a MOCKUP to answer one question: does the "?" fill-in loop feel genuinely useful? It is not the final product and it is not a Miro competitor.

---

## 1. Origin and the problem it solves

Noah diagrammed an entire AP Biology unit (cellular respiration, photosynthesis, enzymes) on a real whiteboard. The board had glycolysis branching into anaerobic and aerobic paths, pyruvate oxidation, the Krebs cycle, oxidative phosphorylation with the electron transport chain and ATP synthase, the light reactions (PSII, ETC, PSI, NADPH, ATP, stroma), the Calvin cycle (CO2, RuBP, 3PG, reduction, G3P, glucose), energy diagrams with activation energy and -ΔG / +ΔG, competitive vs allosteric inhibition, and UCP1 / heat. While drawing it, there are always spots where you forget a name or what goes in a box. Today you stop, look it up, and lose your flow.

The idea: draw a "?" right where the gap is, keep going, and the answer shows up beside it. A second idea built on the same technology: the app draws a diagram for you with parts left blank, and you fill them in (practice). A third: photograph a real whiteboard and have the app process it the same way.

---

## 2. The core loop (this is the whole product right now)

1. User draws on the canvas.
2. User stops drawing for about 2.5 seconds (the idle delay is one named constant).
3. The app exports the INK canvas as a PNG and POSTs it to a server route.
4. The route sends the image to the Gemini API, which finds question marks the user drew and returns a very short answer for each, plus where each "?" is.
5. The app shows each answer as small text next to its "?".

Everything else in the app exists to support this loop. If a feature does not serve this loop or the drawing feel, it is out of scope for the mockup.

---

## 3. Product vision (context only — do NOT build any of this yet)

Three ways Noah has thought about selling it:
1. A full whiteboard with the AI built in (hardware).
2. A Kindle-sized device (hardware).
3. Software for an iPad someone already owns.

Noah's own priority order is software first. Hardware is far-future and depends on the software proving itself. Do not design, name, or stub anything for hardware.

Planned phases:
1. This mockup: text answers, "?" detection, boards, Apple-feel ink.
2. Answers written back in the user's own handwriting.
3. Practice mode: the app draws a diagram with blanks, the user fills them in, the app checks them.
4. Upload a photo of a real physical whiteboard and process it the same way.
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

### In scope (the mockup)
- Full-screen whiteboard canvas with Apple-feel ink using Apple Pencil or finger.
- Left sidebar with boards (Board 1, Board 2, ...), add-board button, and a toggle that shows/hides the sidebar.
- Minimal floating toolbar: pen, eraser, undo.
- Idle detection, screenshot of the ink layer, server route calling Gemini, short text answers rendered next to each "?".
- Boards persisted in localStorage.
- Light mode, Apple-like visual design.

### Out of scope (do not build, do not stub)
- Handwriting-style answers or any handwriting font.
- Practice mode, photo upload, accounts/login, database, sharing, collaboration, export, color picker, shapes, text tool, images, zoom/pan canvas (unless needed for correctness), dark mode, hardware anything.
- Any deploy or Vercel configuration changes (Noah handles deploys).

---

## 6. Decisions already made (do not reopen without Noah)

| Decision | Why |
|---|---|
| Answers are plain TEXT in this mockup | Handwriting is a later phase; text tests the loop just as well |
| Answers are very, very short: a term or a few words, hard cap 6 words, enforced in the Gemini instruction AND truncated in code | Must fit in the space next to a "?", and short answers are easy to verify. Noah explicitly does not want paragraphs |
| Gemini API analyzes a screenshot of the board | Noah's choice of model provider for this mockup |
| Trigger = no drawing activity for a few seconds | Mirrors how a person pauses and wonders |
| Drawing must feel like Apple's ink (Notes/Freeform) | Pen feel is a top priority, researched before building |
| Apple Pencil AND finger both draw | Stated requirement |
| Left sidebar with toggle and Board 1, Board 2, etc. | Stated requirement |
| Ink stored as vector strokes, not pixels | Crisp at any size, erasable by stroke, re-exportable |
| Overlay layer separate from ink layer; only ink is sent to Gemini | Otherwise Gemini sees its own previous answers |
| Wrong answers are worse than no answer: Gemini returns a confidence, low-confidence answers show visibly muted | Study tool correctness (see section 12) |
| Light mode only, Apple-like look | Scope control |
| localStorage persistence, no database | Mockup scope |
| Gemini key server-side only | Security |

---

## 7. Stack, environment, deployment

- Next.js (App Router), TypeScript, Tailwind. Deployed on Vercel by Noah.
- Gemini via the official `@google/genai` SDK, called ONLY from a server route (`/api/answer`). Verify the SDK's current API and the current Flash-tier model id in the official docs before coding; put the model id in ONE constant.
- No database. No auth.
- Env: `GEMINI_API_KEY` in `.env.local` (gitignored), a placeholder in `.env.local.example`, and the same variable in Vercel project settings. The key must never be in client code, logs, or commits.
- Noah develops on a MacBook in the Claude desktop app's Claude Code, but the real test device is an iPad with Apple Pencil via a Vercel preview URL. Claude Code cannot test Pencil input, so build pointer logic carefully against the research and test with a mouse; flag everything that is untestable without an iPad.

---

## 8. UX spec

### Layout
- Canvas fills the viewport (use dynamic viewport units; account for iPad Safari toolbars and safe areas). White board, near-black ink.
- Left sidebar: translucent, blurred, rounded, Apple-style. Lists boards: "Board 1", "Board 2", ... with the active one highlighted. An add-board button creates the next numbered board. Clicking a board swaps in its strokes and answers; nothing is lost when switching.
- A toggle button shows/hides the sidebar. When hidden the canvas takes the full width, and the toggle stays reachable (small floating button). Animate smoothly but quickly; the canvas must not stretch or lose strokes when the sidebar toggles (resize canvas buffer correctly and redraw from vectors).
- Floating toolbar (bottom or top center, translucent): pen, eraser (erases whole strokes it touches), undo. Nothing else.
- All tap targets at least 44px. No hover-only UI, no right-click, nothing that only works with a mouse.

### Visual language (Apple-like)
- Font stack: `-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif`.
- Near-black ink (Apple's #1d1d1f-ish), system blue for AI answers (#007AFF-ish), light neutral sidebar with backdrop blur, generous corner radius, thin hairline borders, soft shadows, minimal chrome. Restraint over decoration.
- Answers must be clearly distinguishable from the user's ink (different color, smaller, clean sans text).

### Input behavior
- Use Pointer Events. When a pen (`pointerType === "pen"`) is active, ignore touch input from the resting palm. If only touch is present, finger draws.
- The page must never scroll, zoom, select text, show callouts, or rubber-band while drawing on the canvas.
- Drawing must never be blocked by network activity.

---

## 9. Ink engine spec (the part that must feel like Apple)

Goal: strokes that look and feel like Apple Pencil in Notes/Freeform: smooth, no visible polyline corners, variable width driven by pressure and speed, no perceived lag, crisp at device pixel ratio.

The build prompt requires a research step first (a subagent investigates Apple's PencilKit/Notes feel and the web equivalents and reports a short summary). Decisions about smoothing, width range, and pressure curve come from that research; record them in the final report. Starting hypotheses to verify, not facts to assume:
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

Eraser: removes whole strokes whose geometry the eraser path intersects (stroke-level erase, not pixel erase). Undo reverses the last stroke add or erase.

---

## 10. Data model (TypeScript, guidance not gospel)

```ts
type Point = { x: number; y: number; p: number; t: number } // p = pressure 0..1, t = ms timestamp

type Stroke = {
  id: string
  points: Point[]
  tool: "pen"            // eraser removes strokes, it is not stored as a stroke
  width: number          // base width
  color: string
  createdAt: number
}

type Answer = {
  id: string
  box: { x: number; y: number; w: number; h: number } // board coordinates, derived from normalized Gemini box
  text: string           // <= 6 words
  confidence: "high" | "low"
  createdAt: number
}

type Board = {
  id: string
  name: string           // "Board 1"
  strokes: Stroke[]
  answers: Answer[]
  inkVersion: number     // increments when ink changes; used to skip redundant analysis
  lastAnalyzedVersion: number
  updatedAt: number
}

type AppState = { boards: Board[]; activeBoardId: string; sidebarOpen: boolean; version: 1 }
```

Store coordinates in a board coordinate space independent of screen pixels so boards survive window resizes and different devices. Version the localStorage schema (`version: 1`) so it can be migrated later. Guard localStorage reads/writes with try/catch (Safari private mode can throw) and debounce saves.

---

## 11. Idle detection and request rules

State machine per active board: `drawing → idle-waiting → analyzing → showing`.

- The idle timer resets on every stroke start and every stroke point. It fires only when ink has changed since the last analysis (`inkVersion !== lastAnalyzedVersion`) and the board is not empty.
- Idle delay is one constant (start at 2500 ms). Noah may tune it after real use.
- Only one Gemini request in flight at a time. If the user starts drawing again while a request is running, abort it (AbortController) and ignore any late result.
- Switching boards cancels any pending timer/request for the previous board.
- Empty board: never call the API.
- After a result: replace the board's answers with the new set. For a "?" whose box center is close to an existing answer's center, keep the existing answer text so answers don't flicker or change between passes. Answers for a "?" that no longer exists (user erased it) disappear on the next pass.
- API failure: fail quietly. At most a tiny unobtrusive indicator. Never block drawing, never show raw errors on the canvas, never auto-retry in a loop (one retry max, then wait for the next idle).

---

## 12. Gemini integration

### Route contract: `POST /api/answer`
- Input: JSON with a base64 PNG (reject anything over a sensible size cap; validate type).
- Output: JSON `{ found: boolean, items: [{ box: [ymin, xmin, ymax, xmax], answer: string, confidence: "high" | "low" }] }`.
- Box format: Gemini's documented normalized bounding box convention (verify in current docs; historically ymin/xmin/ymax/xmax scaled 0–1000). Convert to board coordinates in the client.
- Use structured/JSON output mode with a response schema so the route never has to parse free text. Validate the parsed result server-side and drop malformed items.
- Truncate every `answer` to 6 words in code regardless of what the model returned.

### Image sent to Gemini
- ONLY the ink layer, exported from the vector strokes (white background, ink in near-black). Never the overlay, UI, or sidebar.
- Scale so the long side is at most about 1600px. Keep the aspect ratio. Consider padding or contrast so thin strokes remain legible after downscaling.

### Instruction to Gemini (starting point, refine with testing)
This is a hand-drawn whiteboard (study diagrams). Find every question mark the user drew that means "what is this called / what goes here". Use surrounding labels, arrows, and diagram structure to decide what the question mark refers to. Answer in 6 words or fewer: a term or short phrase, never a sentence. If you cannot tell, return low confidence rather than inventing an answer. Ignore question marks that are clearly part of normal writing. If there are none, return found=false. Return the box of the question mark itself.

### Correctness rules
- Wrong answers are worse than no answer.
- Prefer returning `low` confidence over guessing; the UI shows low-confidence answers visibly muted.
- If the model answers a different subject than the diagram's (for example an Apple-unrelated topic), that is a failure to log in the report, not something to hide.

### Cost, abuse, and privacy
- This route calls a paid API from a public Vercel deployment. Add protection proportionate to a mockup: payload size cap, basic per-IP rate limiting or a simple shared-passcode gate, and an origin check. Mention what you chose in the report.
- Do not log images or answers. Do not store boards server-side. Boards (screenshots) are sent to Google's API; note that in the report so Noah knows.
- One request per idle pass only; the client-side single-flight rule above prevents bursts.

---

## 13. Answer overlay rendering

- A separate layer above the ink (DOM or a second canvas), never included in the screenshot export.
- Position each answer next to its "?" box: prefer to the right of the box; if that would overflow or collide with the board edge, fall back to below, then left. Keep the answer fully on-screen.
- Style: small clean sans text in system blue, light subtle pill/background so it reads over ink. Low-confidence: muted color/opacity.
- Renderer should sit behind a small interface (for example `renderAnswer(answer): void`) so the future handwriting renderer can replace the text renderer without touching detection or Gemini code.

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

1. Pen feel: no visible corners, no lag perceived on iPad, pressure changes width, finger works, palm ignored while pen is active.
2. Nothing on the page scrolls, zooms, or selects while drawing.
3. Sidebar toggles without losing or distorting strokes; boards switch and persist across refresh.
4. A drawn "?" gets a short answer within a few seconds of stopping; the answer sits next to the "?" and is clearly AI text.
5. No "?" → no request result is shown; empty board → no request.
6. Drawing again mid-request cancels cleanly with no stale answer appearing.
7. API errors never break drawing.
8. Key never appears in client code; `next build` passes.
9. Overlay is never in the screenshot sent to Gemini.
10. Everything works with touch targets of at least 44px.

---

## 16. Validation plan (why we are building this at all)

The mockup exists to test the idea cheaply, in about one week:
1. Run Noah's bio board through the loop and check whether answers are right.
2. Give it to 5–10 classmates with their own boards.
3. Keep going if most of them use it a second time on their own, or ask for it for another class.
4. Drop or rethink if answers are often wrong or people try it once and never return.

If it passes: build the live practice mode and handwriting output next. Hardware only after the software proves itself.

---

## 17. Roadmap hooks (design for these, don't build them)

- **Handwriting output:** swap the answer renderer for one that draws strokes in the user's handwriting (approaches: build a personal glyph set from letter samples as Conwrite does, or a generative ink model). Keep answer data and rendering decoupled now.
- **Practice mode:** the app generates a diagram with blanks and checks what the user fills in. Lesson from Noah's earlier bio study guides: answer checking must be strict about content (for example a missing coefficient is wrong: "NADH + H+" is not "2 NAD+ + H+") while forgiving about typos/format. Design any checker with explicit rules, not vague leniency.
- **Photo of a physical whiteboard:** same pipeline starting from an uploaded image; Noah's messy real board is the test case.
- **Hardware:** ignore for now.

---

## 18. Working agreements for Claude Code

- Honest reporting only. If something fails, is untestable on this machine, or you disagree with a decision here, say so plainly. No sugarcoating and no invented problems.
- Keep reports condensed: a table of files and what they do (under fifteen words each), a short "decisions" list, a short "flagged" list. No essays, no next-steps lists.
- Minimal diffs. Match existing patterns in the repo. Do not refactor, rename, or reorganize what you weren't asked to touch.
- No tests, README, or docs changes unless asked. No new dependencies unless required; if you add one (for example a stroke library), say why in the report.
- Do not create extra pages, admin screens, or config unless the task requires it.
- Run the build once at the end of a task, not per file. Run the dev server only to catch obvious errors.
- Before using any API or SDK signature from memory (Gemini model id, box format, SDK methods), verify it in the current official docs.
- If something is ambiguous, a task is bigger than expected, or you can't find what a locator points at, stop and tell Noah. Do not guess and do not work around it.
- Never commit secrets. Never expose `GEMINI_API_KEY` to the browser.

---

## 19. Open questions (ask Noah, don't decide silently)

- Product name (currently "AI Whiteboard", working title only).
- Final Gemini model id to use once checked against current docs and rate limits.
- Whether the idle delay should be longer or shorter after real use.
- Whether answers should be dismissible or stay until the "?" is erased.
- Whether to add a simple passcode gate before sharing the preview URL with classmates.
- Which classmates/classes to test with.

---

## 20. Glossary

- **Ink layer:** the vector strokes the user drew, rendered to canvas. The only thing sent to Gemini.
- **Overlay layer:** AI answers drawn above the ink. Never sent to Gemini.
- **Idle:** no stroke activity for the idle delay.
- **Analysis pass:** one idle-triggered round trip to Gemini.
- **Low confidence:** Gemini unsure; shown muted so the user doesn't trust it blindly.
- **Mockup:** the version in this repo. Text answers only; testing the loop, not shipping the product.
