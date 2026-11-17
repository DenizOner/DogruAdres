const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export default function medusaError(error: unknown): never {
  const details = isRecord(error) ? error : null
  const response = details && isRecord(details.response) ? details.response : null

  if (response) {
    // A failed SDK response can contain third-party messages, personal data
    // and credentials. Only a bounded numeric HTTP status is safe to log.
    const status = response.status
    if (typeof status === "number" && Number.isInteger(status) &&
        status >= 100 && status <= 599) {
      console.error("Status code:", status)
    }

    // Never promote untrusted response.data.message/body/headers into a
    // thrown Error: Server Actions and server logs may surface that message.
    throw new Error("Request failed")
  }

  if (details?.request) {
    throw new Error("No response received")
  }

  // Native Mercur/Medusa SDK and transport errors may include the request
  // URL, query, token or response body in error.message. Do not reflect it.
  throw new Error("Error setting up the request")
}
