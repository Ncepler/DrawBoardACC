export const SETTINGS_KEY = "ai-whiteboard:settings:v1"

/** Inline script for <head>: applies the saved theme before first paint (no light flash in dark mode). */
export const THEME_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("${SETTINGS_KEY}")||"null");var t=s&&s.theme||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}`

