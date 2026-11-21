import { createServer } from "node:http"
import storefrontCacheRevalidateHandler from "../storefront-cache-revalidate"

const originalFetch = globalThis.fetch
const originalUrl = process.env.STOREFRONT_REVALIDATE_URL
const originalSecret = process.env.STOREFRONT_REVALIDATE_SECRET

const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })
const graph = jest.fn(async ({ filters }: { filters: { id: string } }) => ({
  data: [{ handle: "item-" + filters.id }],
}))
const container = {
  resolve: jest.fn(() => ({ graph })),
}

const deliver = async (name: string, data: Array<{ id: string; product_id?: string }>) => {
  await storefrontCacheRevalidateHandler({
    event: { name, data },
    container,
    pluginOptions: {},
  } as any)
}

const sentTags = (): string[] => {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [, options] = fetchMock.mock.calls[0]
  expect(options.method).toBe("POST")
  expect(options.headers["x-revalidate-secret"]).toBe("synthetic-private-value")
  return JSON.parse(options.body).tags as string[]
}

beforeEach(() => {
  process.env.STOREFRONT_REVALIDATE_URL = "http://127.0.0.1:9191/api/revalidate"
  process.env.STOREFRONT_REVALIDATE_SECRET = "synthetic-private-value"
  globalThis.fetch = fetchMock as typeof fetch
  fetchMock.mockClear()
  graph.mockClear()
  container.resolve.mockClear()
})

afterAll(() => {
  globalThis.fetch = originalFetch
  if (originalUrl === undefined) delete process.env.STOREFRONT_REVALIDATE_URL
  else process.env.STOREFRONT_REVALIDATE_URL = originalUrl
  if (originalSecret === undefined) delete process.env.STOREFRONT_REVALIDATE_SECRET
  else process.env.STOREFRONT_REVALIDATE_SECRET = originalSecret
})

describe("existing native Medusa/Mercur cache subscriber with #172 bounded receiver", () => {
  it("preserves specific product tags for a normal native batch", async () => {
    await deliver("product.updated", [{ id: "prod_1" }, { id: "prod_2" }])
    expect(sentTags()).toEqual([
      "products", "product-item-prod_1", "product-item-prod_2",
    ])
  })

  it("sends the pre-existing products broad tag for 129 distinct products", async () => {
    const events = Array.from({ length: 129 }, (_, i) => ({ id: "prod_" + i }))
    await deliver("product.updated", events)
    expect(graph).toHaveBeenCalledTimes(129)
    expect(sentTags()).toEqual(["products"])
  })

  it("still invalidates products for an even larger bulk update", async () => {
    const events = Array.from({ length: 512 }, (_, i) => ({ id: "prod_" + i }))
    await deliver("product.updated", events)
    expect(sentTags()).toEqual(["products"])
  })

  it("sends both existing broad tags for a large offer batch", async () => {
    const events = Array.from({ length: 129 }, (_, i) => ({
      id: "off_" + i, product_id: "prod_" + i,
    }))
    await deliver("offer.updated", events)
    expect(sentTags()).toEqual(["products", "offers"])
  })

  it("retains normal offer-specific tags for one offer", async () => {
    await deliver("offer.updated", [{ id: "off_3", product_id: "prod_3" }])
    expect(sentTags()).toEqual([
      "products", "product-item-prod_3", "offers",
      "offer-off_3", "product-offers-prod_3",
    ])
  })

  it("falls back to safe global invalidation for a noncanonical or overlong legacy handle", async () => {
    graph.mockResolvedValueOnce({ data: [{ handle: "x".repeat(260) }] })
    await deliver("product.updated", [{ id: "prod_1" }])
    expect(sentTags()).toEqual(["products"])
  })

  it("does not attempt any network request when endpoint or secret is not configured", async () => {
    delete process.env.STOREFRONT_REVALIDATE_URL
    await deliver("product.updated", [{ id: "prod_1" }])
    expect(fetchMock).not.toHaveBeenCalled()
    process.env.STOREFRONT_REVALIDATE_URL = "http://127.0.0.1:9191/api/revalidate"
    delete process.env.STOREFRONT_REVALIDATE_SECRET
    await deliver("product.updated", [{ id: "prod_1" }])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})


// #170: These tests exercise the actual native subscriber over real loopback
// HTTP on an OS-assigned port, with a synthetic secret. No production/DB access.
type HttpReply = number | "drop"
type CapturedRequest = { method: string | undefined; body: string; secret: string | undefined }

const withNativeHttp = async (
  replies: HttpReply[],
  check: (requests: CapturedRequest[]) => Promise<void>
): Promise<void> => {
  const requests: CapturedRequest[] = []
  const server = createServer((request, response) => {
    const pieces: Buffer[] = []
    request.on("data", (piece: Buffer) => pieces.push(piece))
    request.on("end", () => {
      const body = Buffer.concat(pieces).toString("utf8")
      requests.push({
        method: request.method, body,
        secret: request.headers["x-revalidate-secret"] as string | undefined,
      })
      const outcome = replies[Math.min(requests.length - 1, replies.length - 1)]
      if (outcome === "drop") {
        request.socket.destroy()
        return
      }
      response.writeHead(outcome, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ revalidated: outcome >= 200 && outcome < 300 }))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("No synthetic HTTP port")
  process.env.STOREFRONT_REVALIDATE_URL = "http://127.0.0.1:" + address.port + "/api/revalidate"
  globalThis.fetch = originalFetch
  try {
    await check(requests)
  } finally {
    globalThis.fetch = fetchMock as typeof fetch
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe("#170 native cache delivery over real ephemeral HTTP", () => {
  it("accepts actual HTTP 204 and keeps the old catalog tag payload", async () => {
    await withNativeHttp([204], async (requests) => {
      await deliver("product.updated", [{ id: "prod_1" }])
      expect(requests).toHaveLength(1)
      expect(requests[0].method).toBe("POST")
      expect(requests[0].secret).toBe("synthetic-private-value")
      expect(JSON.parse(requests[0].body).tags).toEqual(["products", "product-item-prod_1"])
    })
  })

  it("retries transient 500 and 503 with the identical idempotent body, then succeeds", async () => {
    await withNativeHttp([500, 503, 200], async (requests) => {
      await deliver("offer.updated", [{ id: "off_3", product_id: "prod_3" }])
      expect(requests).toHaveLength(3)
      expect(new Set(requests.map((r) => r.body)).size).toBe(1)
      expect(JSON.parse(requests[2].body).tags).toEqual([
        "products", "product-item-prod_3", "offers",
        "offer-off_3", "product-offers-prod_3"
      ])
    })
  })

  it.each([401, 403, 413, 429])("rejects HTTP %i without retry or false success", async (status) => {
    const logs = jest.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      await withNativeHttp([status], async (requests) => {
        await expect(deliver("product.updated", [{ id: "prod_1" }]))
          .rejects.toThrow("HTTP " + status)
        expect(requests).toHaveLength(1)
        const message = logs.mock.calls.flat().join(" ")
        expect(message).toContain("HTTP " + status)
        expect(message).not.toContain("synthetic-private-value")
        expect(message).not.toContain("prod_1")
        expect(message).not.toContain("/api/revalidate")
      })
    } finally {
      logs.mockRestore()
    }
  })

  it("fails loudly after a bounded series of HTTP 503 responses", async () => {
    const logs = jest.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      await withNativeHttp([503], async (requests) => {
        await expect(deliver("product.updated", [{ id: "prod_1" }]))
          .rejects.toThrow("HTTP 503")
        expect(requests).toHaveLength(3)
      })
    } finally { logs.mockRestore() }
  })

  it("fails loudly after bounded socket disconnects without logging secrets", async () => {
    const logs = jest.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      await withNativeHttp(["drop"], async (requests) => {
        await expect(deliver("product.updated", [{ id: "prod_1" }]))
          .rejects.toThrow("transport failure")
        expect(requests).toHaveLength(3)
        const message = logs.mock.calls.flat().join(" ")
        expect(message).toContain("transport failed")
        expect(message).not.toContain("synthetic-private-value")
        expect(message).not.toContain("/api/revalidate")
      })
    } finally { logs.mockRestore() }
  })

  it("allows safe replay after a successful invalidation", async () => {
    await withNativeHttp([200, 200], async (requests) => {
      await deliver("product.updated", [{ id: "prod_1" }])
      await deliver("product.updated", [{ id: "prod_1" }])
      expect(requests).toHaveLength(2)
      expect(requests[0].body).toBe(requests[1].body)
    })
  })
})
