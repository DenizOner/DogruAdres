export const orderErrorFormatter = (error: { message: string }): string | null => {
  if (error.message === "NEXT_REDIRECT") {
    return null
  }

  if (error.message.includes("Not enough stock available")) {
    return "Not enough stock available"
  }

  return error.message
}
