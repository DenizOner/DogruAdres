"use client"
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div data-testid="global-error">
          <h2>Something went wrong!</h2>
          <button onClick={() => reset()} data-testid="global-error-retry-button">Try again</button>
        </div>
      </body>
    </html>
  )
}
