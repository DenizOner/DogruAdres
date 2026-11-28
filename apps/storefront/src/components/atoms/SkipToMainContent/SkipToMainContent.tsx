import type { ReactNode } from "react"

export function SkipToMainContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-sm focus:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
    >
      İçeriğe atla
    </a>
  )
}

export function MainContentTarget({ children }: { children: ReactNode }) {
  return (
    <div id="main-content" tabIndex={-1} className="focus:outline-none">
      {children}
    </div>
  )
}
