"use client"

import { HANDWRITING_CHAR_COUNT } from "./HandwritingSetup"
import type { Settings, Theme } from "@/lib/settings"

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex h-11 shrink-0 items-center [touch-action:manipulation]"
    >
      <span className={`relative block h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${on ? "bg-[#34C759]" : "bg-[var(--press)]"}`}>
        <span
          className="absolute left-0 top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform"
          style={{ transform: `translateX(${on ? 22 : 2}px)` }}
        />
      </span>
    </button>
  )
}

const row = "flex min-h-11 items-center justify-between gap-3 px-4 py-1"

export default function SettingsPanel({
  settings,
  glyphCount,
  onChange,
  onSetupHandwriting,
  onClose,
}: {
  settings: Settings
  glyphCount: number
  onChange: (s: Settings) => void
  onSetupHandwriting: () => void
  onClose: () => void
}) {
  return (
    <>
      {/* tap outside to close */}
      <div className="absolute inset-0 z-40" onPointerDown={(e) => (e.stopPropagation(), onClose())} />
      <div
        className="absolute z-50 w-[320px] max-w-[calc(100%-24px)] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--chrome-strong)] py-2 text-[15px] text-[var(--text)] shadow-[0_12px_40px_rgba(0,0,0,0.2)] backdrop-blur-xl select-none"
        style={{ right: "calc(12px + env(safe-area-inset-right))", top: "calc(64px + env(safe-area-inset-top))" }}
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="px-4 pb-1 pt-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Appearance</div>
        <div className="px-4 py-1">
          <div className="flex rounded-xl bg-[var(--press)] p-0.5">
            {(["system", "light", "dark"] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...settings, theme: t })}
                className={`h-10 flex-1 rounded-[10px] text-[14px] capitalize [touch-action:manipulation] ${
                  settings.theme === t ? "bg-[var(--card)] font-medium shadow" : ""
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Answers</div>
        <div className={row}>
          <span>Write answers in my handwriting</span>
          <Switch
            label="Write answers in my handwriting"
            on={settings.handwriting}
            onChange={(v) => {
              onChange({ ...settings, handwriting: v })
              if (v && glyphCount === 0) onSetupHandwriting()
            }}
          />
        </div>
        <button type="button" onClick={onSetupHandwriting} className={`${row} w-full text-left active:bg-[var(--press)]`}>
          <span>Set up my handwriting</span>
          <span className="text-[var(--text-muted)]">
            {glyphCount}/{HANDWRITING_CHAR_COUNT} ›
          </span>
        </button>
        <div className={row}>
          <span>Analyze automatically when I pause</span>
          <Switch
            label="Analyze automatically when I pause"
            on={settings.autoAnalyze}
            onChange={(v) => onChange({ ...settings, autoAnalyze: v })}
          />
        </div>

        <div className="mx-4 my-2 border-t border-[var(--hairline)]" />
        <a href="/demo" className={`${row} text-[var(--ai)] active:bg-[var(--press)]`}>
          See demos
        </a>
      </div>
    </>
  )
}
