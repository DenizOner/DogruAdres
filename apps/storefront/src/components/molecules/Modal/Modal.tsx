"use client"
import { useEffect, useId, useRef } from "react"
import { CloseIcon } from "@/icons"

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export const Modal = ({
  children,
  heading,
  onClose,
  "data-testid": dataTestId,
}: {
  children: React.ReactNode
  heading: string
  onClose: () => void
  "data-testid"?: string
}) => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus()
      }
    }
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== "Tab") return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter(element => element.getClientRects().length > 0)
    if (!focusable.length) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed top-0 left-0 w-full h-full flex justify-center z-30"
      data-testid={dataTestId ?? "modal"}
    >
      <div
        aria-hidden="true"
        className="bg-tertiary/60 w-full h-full absolute backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute bg-primary z-20 my-20 py-5 rounded-sm max-w-[600px] w-full max-h-[80vh] overflow-y-auto shadow-lg">
        <div className="uppercase flex justify-between items-center heading-md border-b px-4 pb-5">
          <h2 id={titleId}>{heading}</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={`Close ${heading}`}
            onClick={onClose}
            className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span aria-hidden="true"><CloseIcon size={20} /></span>
          </button>
        </div>
        <div className="pt-5">{children}</div>
      </div>
    </div>
  )
}
