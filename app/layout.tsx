import type { Metadata, Viewport } from "next"
import "./globals.css"
import { THEME_BOOT_SCRIPT } from "@/lib/theme"

export const metadata: Metadata = {
  title: "AI Whiteboard",
  description: "A whiteboard that answers: draw or write, tap Analyze.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Apply the saved light/dark theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  )
}
