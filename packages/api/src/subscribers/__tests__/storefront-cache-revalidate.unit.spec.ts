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
