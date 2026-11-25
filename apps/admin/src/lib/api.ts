export class ApiError extends Error {
  status: number
  isConflict: boolean
  isUnauthorized: boolean

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.isConflict = status === 409
    this.isUnauthorized = status === 401 || status === 403
  }
}

let cachedCsrfToken: string | null = null

export async function fetchCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedCsrfToken && !forceRefresh) {
    return cachedCsrfToken
  }

  const response = await fetch("/personal/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    cachedCsrfToken = null
    throw new ApiError("Session unavailable", response.status)
  }

  const data: unknown = await response.json()
  const token =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>).csrf_token
      : null

  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    cachedCsrfToken = null
    throw new ApiError("Invalid or missing CSRF token in session", 403)
  }

  cachedCsrfToken = token
  return token
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    let errMsg = `Request failed (${response.status})`
    try {
      const errBody: unknown = await response.json()
      if (errBody && typeof errBody === "object" && "message" in errBody && typeof (errBody as Record<string, unknown>).message === "string") {
        errMsg = (errBody as Record<string, unknown>).message as string
      }
    } catch {
      // ignore
    }
    throw new ApiError(errMsg, response.status)
  }

  return (await response.json()) as T
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const csrfToken = await fetchCsrfToken()

  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      cachedCsrfToken = null
    }

    let errMsg = `Request failed (${response.status})`
    try {
      const errBody: unknown = await response.json()
      if (errBody && typeof errBody === "object" && "message" in errBody && typeof (errBody as Record<string, unknown>).message === "string") {
        errMsg = (errBody as Record<string, unknown>).message as string
      }
    } catch {
      // ignore
    }
    throw new ApiError(errMsg, response.status)
  }

  return (await response.json()) as T
}
