import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  OfferWorkflowEvents,
  ProductWorkflowEvents,
} from "@mercurjs/core/workflows"

type EventPayload = {
  id?: string
  product_id?: string
}

const resolveProductHandle = async (
  container: SubscriberArgs["container"],
  productId?: string
): Promise<string | undefined> => {
  if (!productId) {
    return undefined
  }

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product",
      fields: ["handle"],
      filters: { id: productId },
    })
    return data?.[0]?.handle
  } catch {
    return undefined
  }
}

const buildTags = async (
  container: SubscriberArgs["container"],
  eventName: string,
  payload: EventPayload
): Promise<string[]> => {
  const tags = new Set<string>(["products"])

  const isOffer = eventName.startsWith("offer.")
  const productId = isOffer ? payload.product_id : payload.id

  const handle = await resolveProductHandle(container, productId)
  if (handle) {
    tags.add(`product-${handle}`)
  }

  if (isOffer) {
    tags.add("offers")
    if (payload.id) {
      tags.add(`offer-${payload.id}`)
    }
    if (productId) {
      tags.add(`product-offers-${productId}`)
    }
  }

  return [...tags]
}

export default async function storefrontCacheRevalidateHandler({
  event,
  container,
}: SubscriberArgs<EventPayload | EventPayload[]>) {
  const url = process.env.STOREFRONT_REVALIDATE_URL
  const secret = process.env.STOREFRONT_REVALIDATE_SECRET

  if (!url || !secret) {
    return
  }

  const payloads = Array.isArray(event.data) ? event.data : [event.data]

  const tagSet = new Set<string>()
  for (const payload of payloads) {
    const tags = await buildTags(container, event.name, payload ?? {})
    tags.forEach((tag) => tagSet.add(tag))
  }

  if (tagSet.size === 0) {
    return
  }

  // #172: all product requests already carry the broad "products" tag,
  // and all offer requests also carry "offers". If a legitimate large Medusa
  // event batch exceeds the bounded Storefront HTTP route, these existing
  // broad tags invalidate every affected cache entry without dropping an event.
  // Keep the exact specific tags for ordinary small events.
  const tags = [...tagSet]
  const catalogSuffix = /^[\p{L}\p{N}][\p{L}\p{N}._~-]*$/u
  const canonical = (tag: string) => {
    if (tag === "products" || tag === "offers") return true
    const prefix = ["product-offers-", "product-", "offer-"].find((part) => tag.startsWith(part))
    return !!prefix && catalogSuffix.test(tag.slice(prefix.length))
  }
  const oversized = tags.length > 128 ||
    Buffer.byteLength(JSON.stringify({ tags }), "utf8") > 32 * 1024 ||
    tags.some((tag) => Buffer.byteLength(tag, "utf8") > 256 || !canonical(tag))
  const deliveryTags = oversized
    ? event.name.startsWith("offer.") ? ["products", "offers"] : ["products"]
    : tags

  // #170: A resolved fetch is not necessarily a successful cache refresh.
  // Repeating the same tag invalidation is safe, but the Medusa default local
  // event bus does NOT guarantee durable redelivery. Never report terminal
  // 4xx, exhausted 5xx or transport failures as a handled-success event.
  // No URLs, request bodies, response bodies, tokens or raw errors in logs.
  const body = JSON.stringify({ tags: deliveryTags })
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-revalidate-secret": secret,
        },
        body,
        signal: AbortSignal.timeout(5_000),
      })
    } catch {
      if (attempt === maxAttempts) {
        console.error("[storefront-cache-revalidate] transport failed after bounded attempts")
        throw new Error("Storefront cache revalidation transport failure")
      }
      await new Promise((resolve) => setTimeout(resolve, 120 * attempt))
      continue
    }

    if (response.ok) return
    // 401/403/413 and 429 are configuration/client/rate-limit problems, not
    // safe for a blind immediate retry. Retry only temporary 408 or 5xx.
    const retryable = response.status === 408 || response.status >= 500
    if (!retryable || attempt === maxAttempts) {
      console.error(`[storefront-cache-revalidate] HTTP ${response.status} after ${attempt} attempt(s)`)
      throw new Error(`Storefront cache revalidation failed: HTTP ${response.status}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 120 * attempt))
  }
}

export const config: SubscriberConfig = {
  event: [
    OfferWorkflowEvents.CREATED,
    OfferWorkflowEvents.UPDATED,
    OfferWorkflowEvents.DELETED,
    ProductWorkflowEvents.PUBLISHED,
    ProductWorkflowEvents.REJECTED,
    "product.updated",
  ],
  context: {
    subscriberId: "storefront-cache-revalidate-handler",
  },
}
