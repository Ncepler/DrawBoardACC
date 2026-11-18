import type { Metadata } from "next"
import Link from "next/link"
import { DEMOS } from "@/lib/demos"

export const metadata: Metadata = {
  title: "Demos · AI Whiteboard",
  description: "Things you can do on the AI whiteboard.",
}

export default function DemoPage() {
  return (
    <main className="h-full overflow-y-auto bg-[var(--page)] [user-select:text]" style={{ WebkitUserSelect: "text" }}>
      <div
        className="mx-auto max-w-5xl px-4 pb-16 sm:px-8"
        style={{ paddingTop: "calc(32px + env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[34px] font-semibold tracking-tight text-[var(--text)]">What you can do</h1>
            <p className="mt-1 text-[17px] text-[var(--text-muted)]">
              Write or ask on the board, then tap Analyze or Create. Each demo opens as a new board.
            </p>
          </div>
          <Link
            href="/"
            className="flex h-11 shrink-0 items-center rounded-full bg-[var(--card)] px-4 text-[15px] font-medium text-[var(--ai)] shadow-[0_0_0_0.5px_var(--hairline)] active:opacity-70"
          >
            Back to board
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEMOS.map((d) => (
            <div
              key={d.id}
              className="flex flex-col rounded-2xl bg-[var(--card)] p-5 shadow-[0_0_0_0.5px_var(--hairline),0_2px_12px_rgba(0,0,0,0.04)]"
            >
              <h2 className="text-[19px] font-semibold text-[var(--text)]">{d.title}</h2>
              <dl className="mt-3 space-y-2 text-[15px] leading-snug">
                <div>
                  <dt className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">You</dt>
                  <dd className="text-[var(--text)]">{d.you}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">You get</dt>
                  <dd className="text-[var(--ai-text)]">{d.get}</dd>
                </div>
              </dl>
              <a
                href={`/?demo=${d.id}`}
                className="mt-5 flex h-11 items-center justify-center rounded-full bg-[#007AFF] text-[15px] font-medium text-white active:opacity-80"
              >
                Try it
              </a>
            </div>
          ))}
        </div>

        <p className="mt-10 text-[13px] text-[var(--text-muted)]">
          Board images, prompts and photos are sent to Google’s Gemini API to generate answers. Boards are saved only in
          this browser.
        </p>
      </div>
    </main>
  )
}
