"use client"
import { useId } from "react"
import { Input } from "@/components/atoms"
import { cn } from "@/lib/utils"
import { FieldError } from "react-hook-form"

type LabeledInputProps = {
  label: string
  error?: FieldError
} & React.InputHTMLAttributes<HTMLInputElement>

export const LabeledInput = ({
  error,
  label,
  className,
  id: customId,
  ...props
}: LabeledInputProps) => {
  const generatedId = useId()
  const inputId = customId || generatedId
  const errorId = `${inputId}-error`
  const hasErrorMessage = Boolean(error?.message)

  return (
    <div className={cn("label-sm block", className)}>
      <label htmlFor={inputId} className={cn("block mb-1", error && "text-negative")}>
        {label}
      </label>
      <Input
        id={inputId}
        error={!!error}
        aria-invalid={!!error}
        aria-describedby={hasErrorMessage ? errorId : undefined}
        {...props}
      />
      {hasErrorMessage && (
        <p id={errorId} role="alert" className="label-sm text-negative mt-1">
          {error?.message}
        </p>
      )}
    </div>
  )
}
