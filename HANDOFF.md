# Handoff

Snapshot for the next Claude Code session. CLAUDE.md is the spec; this file is where things stand. Update it when you finish a chunk of work.

## Where things are

- **Live:** https://drawboardacc.vercel.app. Production builds from `main`, behind Vercel login protection.
- **Branch:** work on `claude/beautiful-pascal-354ugy`. `main` is in sync with it up to the handwriting fix ([Ncepler/DrawBoardACC#11](https://github.com/Ncepler/DrawBoardACC/pull/11)). The CLAUDE.md + HANDOFF.md update sits on the branch until Noah says "merge".
- **Merge flow:** Noah says "merge" or "main". Open a PR from the branch to `main` with the GitHub MCP tools, then merge it (merge commit). Vercel then deploys `main`.
- **Preview before merge:** deploy the branch commit to production with the Vercel MCP tool `create_deployment`:
  - team `team_JEVmOFi8WaQppwDjrvEht2fo`, project `prj_po12aTbVIPDpcrOjwKsZWYX0N4FE`
  - `target: "production"`, `forceNew: "1"`
  - `gitSource` `{type:"github", org:"Ncepler", repo:"DrawBoardACC", ref:<branch>, sha:<commit>}`

  The next push to `main` overwrites it.
- **Vercel project:** `drawboardacc`. Framework is set to Next.js and Node 22.x. `GEMINI_API_KEY` is set for **Production only**; branch previews have no key.

## What the app does now

See CLAUDE.md §0–§13. In short:
- **Answering:** Analyze reads the whole board (no "?" needed), including its own earlier answers (drawn blue in the image). New answers are added, never replaced, so "÷ 2" under a 6 becomes its own answer. Commands work too: text commands come back as answers, "write out a diagram…" / "graph it" make a card.
- **Making things:** Ask box and Photo produce notes, diagrams or function graphs (`lib/graph.ts`: formulas plotted on app-drawn axes). Practice blanks can be filled by pen or by typing, and "Check answers" checks the typed ones.
- **Tools:** the Text tool types on the board (click-out saves, box grows). Clear board button (undoable). Items can be selected, dragged, deleted and undone; undoing a stroke leaves answers alone.
- **Board:** unbounded with zoom/pan (2%–400%): +/−/reset under the gear, pinch and two-finger pan, scroll to pan, Ctrl/Cmd+scroll to zoom, Space+drag. View is per board, in memory only.
- **Looks:** explanations are a typed card by default, other answers use a handwriting-looking font (falls back to a generic cursive off Apple devices); each answer has a typed/handwriting toggle. Zoomed out, text, answers and line thickness keep their 100% size. Move tool in the toolbar; paste or drop an image opens the Photo box.
- **Settings:** light/dark, your-own-handwriting glyphs (letters, numbers, a "More symbols" tab, gray guide letters, undo), auto-analyze. Answers show exponents `^(…)` raised.
- **Demos:** the `/examples` page (`/?example=<id>`).

## Testing (what works in the container)

- **Build and lint:** `npm run build` and `npx eslint .` should both be clean.
- **Key leak check:** `grep -rl GEMINI_API_KEY .next/static` should print nothing.
- **Browser tests:** run Playwright scripts against `npx next dev -p 3111`, launched with `NODE_PATH=$(npm root -g) node script.js`.
  - Mock the routes with `page.route('**/api/answer', …)` and `'**/api/create'`.
  - Seed state through localStorage: `ai-whiteboard:v1`, `ai-whiteboard:settings:v1` and `ai-whiteboard:glyphs:v1`.
  - Use `/?example=<id>` to open ready-made boards.
- **Playwright selectors:** `text=Done` is a case-insensitive substring match, so prefer `getByRole('button', { name, exact: true })`.
- **Pure helpers:** copy `lib/format.ts` or `lib/check.ts` to a temp dir and run `node --experimental-strip-types`.
- **React compiler lint (`react-hooks/purity`) false positive:** an event handler that calls a function declared *later* in the component gets flagged as "impure function during render". Move the callee above the handler.

## Real Gemini testing: not done yet

- **No key here yet:** this session made a cloud environment `drawboardacc` with `generativelanguage.googleapis.com` allowed. Noah tried to add the key as a network secret, but said the entry was wrong, so treat it as not working yet.
- **Getting a working key:** use `request_credential` (Bearer only).
- **Calling Gemini with it:** the proxy can only inject `Authorization: Bearer`, so test prompts through the OpenAI-compatible endpoint `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`. The app itself uses the `@google/genai` SDK with `x-goog-api-key`. Same models, different wrapper.
- **What's untested:** every prompt has only been run against mocks. Noah confirmed live that "1+1" → "2", math with "=", and "explain photosynthesis" work. Diagrams, photos, check kind and practice checking have never been run against real Gemini.
- **Quota:** Noah's key hit a 0/free-tier quota on `gemini-3.8-flash`, so the app uses `gemini-3.5-flash-lite` with `gemini-3.1-flash-lite` as fallback (`lib/gemini.ts`).

## Open items / known issues

- **Untested on iPad:**
  - Two-finger pan and pinch zoom (only mouse/wheel/buttons were tested)
  - Zoom redraw speed on a board with thousands of strokes
  - Pencil feel, palm rejection, and hover
  - the Ask/Text keyboard opening on tap (`flushSync` + `autoFocus` on pointer lift)
  - camera photo upload
  - writing on diagrams
- **Diagram blanks:** pen ink written in a blank doesn't move when the diagram is dragged.
- **Synonym answers** ("3-PG" vs "3-PGA") are marked wrong by the local checker.
- **Answers can land on writing** when Gemini returns a loose box. They're draggable, but there's no automatic ink avoidance yet. Noah interrupted that work for draggable answers.
- **Full board:** new cards stack on top when there's no free spot.
- **Handwriting rendering:** per-character glyphs with fixed spacing. No cursive, jitter or multiple samples (CLAUDE.md §17).
- **Rate limit:** in-memory per instance, and there's no passcode. Sharing with classmates needs a decision on passcode and Vercel login protection (CLAUDE.md §19).
- **Noah's cut-off note:** "i need to be able to grab answers that…" was interpreted as select/drag/delete. He never clarified.

## File map

| Path | Role |
|---|---|
| `app/api/answer/route.ts` | Board analysis prompt and schema, sanitizing by answer kind |
| `app/api/create/route.ts` | Ask/Photo → note or diagram prompt and schema |
| `app/examples/page.tsx` | Examples gallery; "Try it" → `/?example=<id>` |
| `app/layout.tsx`, `app/globals.css` | Theme boot script, CSS variables (light/dark) |
| `components/Whiteboard.tsx` | Main component: input, tools, analysis, undo, examples, settings wiring |
| `components/AnswerOverlay.tsx` | Answers/cards/typed text rendering, placement, renderers |
| `components/Draggable.tsx` | Select / drag / delete wrapper (optional top-strip handle) |
| `components/Composer.tsx` | Ask box (with photo preview) |
| `components/InlineEditor.tsx` | Text tool editor (board text and blanks) |
| `components/HandwritingSetup.tsx` | Per-character handwriting capture |
| `components/SettingsPanel.tsx` | Gear panel: theme, handwriting, auto-analyze |
| `components/Toolbar.tsx`, `components/Sidebar.tsx` | Toolbar and boards sidebar |
| `lib/gemini.ts`, `lib/server.ts` | Server-only: Gemini calls, model fallback, origin/rate/body guards |
| `lib/format.ts` | LaTeX→plain, "=" rule, per-kind caps |
| `lib/graph.ts` | Safe formula parser and SVG for graph cards (axes, curves, points) |
| `lib/rich.ts` | Parses `^(…)` exponents for the ink and text renderers |
| `lib/analysis.ts` | Board→PNG export (ink, typed text, gray practice diagrams), answer merging/pruning |
| `lib/diagram.ts`, `lib/cards.ts` | Diagram layout and SVG; card sizing |
| `lib/glyphs.ts`, `lib/settings.ts` | Glyph sets and drawing; settings and user glyph storage |
| `lib/ink.ts` | perfect-freehand strokes, eraser hit test |
| `lib/check.ts` | Local practice-answer checker |
| `lib/examples.ts`, `lib/shapes.ts`, `lib/photo.ts`, `lib/texts.ts`, `lib/measure.ts`, `lib/storage.ts`, `lib/theme.ts`, `lib/config.ts`, `lib/types.ts` | Helpers and data |
