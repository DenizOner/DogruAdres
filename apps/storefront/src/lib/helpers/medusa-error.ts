const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export default function medusaError(error: unknown): never {
  const details = isRecord(error) ? error : null
  const response = details && isRecord(details.response) ? details.response : null

  if (response) {
    // Avoid logging raw headers, request URLs or response bodies: those may
    // contain bearer credentials or personal information.
    if (typeof response.status === "number") {
      console.error("Status code:", response.status)
    }

    const data = response.data
    const message =
      typeof data === "string"
        ? data
        : isRecord(data) && typeof data.message === "string"
          ? data.message
          : "Request failed"

    throw new Error(message.charAt(0).toUpperCase() + message.slice(1) + ".")
  }

  if (details?.request) {
    throw new Error("No response received")
  }

  const message =
    details && typeof details.message === "string"
      ? details.message
      : error instanceof Error
        ? error.message
        : "Unknown error"

  throw new Error("Error setting up the request: " + message)
}
