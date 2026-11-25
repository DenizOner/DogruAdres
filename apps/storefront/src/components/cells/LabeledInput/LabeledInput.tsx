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
  ...props
}: LabeledInputProps) => {
  const errorId = useId()
  return (
    <label className={cn("label-sm block", className)}>
      <p className={cn(error && "text-negative")}>{label}</p>
      <Input
        error={!!error}
        aria-invalid={!!error}
        aria-describedby={error?.message ? errorId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="label-sm text-negative">
          {error.message}
        </p>
      )}
    </label>
  )
}
