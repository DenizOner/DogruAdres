"use client"
import { Card } from "@/components/atoms"
import { CollapseIcon } from "@/icons"
import { cn } from "@/lib/utils"
import { useEffect, useId, useRef, useState } from "react"

export const Accordion = ({
  children,
  heading,
  defaultOpen = true,
}: {
  children: React.ReactNode
  heading: string
  defaultOpen?: boolean
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [height, setHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      if (contentRef.current) setHeight(contentRef.current.scrollHeight)
    }, 100)
    return () => clearTimeout(timer)
  }, [children, isOpen])

  return (
    <Card>
      <h4 className="label-lg uppercase px-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen(open => !open)}
          className="flex w-full items-center justify-between cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span>{heading}</span>
          <CollapseIcon
            size={20}
            className={cn("transition-all duration-300", isOpen && "rotate-180")}
          />
        </button>
      </h4>
      <div
        id={panelId}
        hidden={!isOpen}
        aria-hidden={!isOpen}
        className="transition-all duration-300 overflow-hidden"
        style={{
          maxHeight: isOpen ? `${height}px` : "0px",
          opacity: isOpen ? 1 : 0,
          transition: "max-height 0.3s ease-in-out, opacity 0.2s ease-in-out",
        }}
      >
        <div ref={contentRef} className="pt-4">
          {children}
        </div>
      </div>
    </Card>
  )
}
