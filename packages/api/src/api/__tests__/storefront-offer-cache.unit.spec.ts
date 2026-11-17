/**
 * #171: Seller Offer price/stock cache isolation, using the real Storefront
 * query wrapper and synthetic actor headers. This is a mocked SDK unit test,
 * NOT a real Next HTTP, PostgreSQL or buyer authorization acceptance test.
 */
jest.mock("../../../../../apps/storefront/src/lib/client", () => ({
  sdk: {
    store: {
      offers: {
        query: jest.fn(),
        $id: { query: jest.fn() },
      },
    },
  },
}));
jest.mock("../../../../../apps/storefront/src/lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(),
}));
jest.mock("../../../../../apps/storefront/src/lib/data/regions", () => ({
  getRegion: jest.fn(),
}));

import { sdk } from "../../../../../apps/storefront/src/lib/client";
import { getAuthHeaders } from "../../../../../apps/storefront/src/lib/data/cookies";
import { getRegion } from "../../../../../apps/storefront/src/lib/data/regions";
import { listOffers, retrieveOffer } from "../../../../../apps/storefront/src/lib/data/offers";
import { CACHE_TAGS, getGlobalCacheOptions } from "../../../../../apps/storefront/src/lib/data/cache-tags";

const authHeaders = getAuthHeaders as jest.Mock;
const region = getRegion as jest.Mock;
const listQuery = sdk.store.offers.query as unknown as jest.Mock;
const detailQuery = sdk.store.offers.$id.query as unknown as jest.Mock;

describe("#171 Storefront Offer cache isolation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    authHeaders.mockResolvedValue({});
    region.mockResolvedValue({ id: "reg_synthetic_tr" });
    listQuery.mockResolvedValue({ offers: [], count: 0 });
    detailQuery.mockResolvedValue({ offer: { id: "offer_synthetic" } });
  });

  const assertUncached = (call: Record<string, unknown>, headers: object) => {
    const fetchOptions = call.fetchOptions as Record<string, unknown>;
    expect(fetchOptions).toEqual({ headers, cache: "no-store" });
    expect(fetchOptions).not.toHaveProperty("next");
    expect(fetchOptions).not.toHaveProperty("revalidate");
  };

  it("never globally caches the anonymous Seller listing with calculated price and stock", async () => {
    await listOffers({
      sellerId: "sel_synthetic_a",
      countryCode: "tr",
      limit: 12,
      offset: 0,
    });

    expect(listQuery).toHaveBeenCalledTimes(1);
    const [call] = listQuery.mock.calls[0];
    expect(call).toMatchObject({
      seller_id: "sel_synthetic_a",
      region_id: "reg_synthetic_tr",
      country_code: "tr",
      limit: 12,
      offset: 0,
    });
    expect(call.fields).toContain("+calculated_price");
    expect(call.fields).toContain("+inventory_quantity");
    assertUncached(call, {});
  });

  it("keeps separate authenticated actors uncached and preserves their headers", async () => {
    authHeaders
      .mockResolvedValueOnce({ authorization: "Bearer ci-actor-a" })
      .mockResolvedValueOnce({ authorization: "Bearer ci-actor-b" });
    listQuery.mockImplementation(async (query: { fetchOptions: { headers: { authorization: string } } }) =>
      ({ offers: [{ id: query.fetchOptions.headers.authorization }], count: 1 }));

    const a = await listOffers({ sellerId: "sel_synthetic_a", regionId: "reg_synthetic_tr" });
    const b = await listOffers({ sellerId: "sel_synthetic_a", regionId: "reg_synthetic_tr" });

    expect(a.offers).toEqual([{ id: "Bearer ci-actor-a" }]);
    expect(b.offers).toEqual([{ id: "Bearer ci-actor-b" }]);
    expect(listQuery).toHaveBeenCalledTimes(2);
    assertUncached(listQuery.mock.calls[0][0], { authorization: "Bearer ci-actor-a" });
    assertUncached(listQuery.mock.calls[1][0], { authorization: "Bearer ci-actor-b" });
  });

  it("never globally caches the single-Offer detail response", async () => {
    authHeaders.mockResolvedValue({ authorization: "Bearer ci-actor-a" });
    await retrieveOffer("offer_synthetic", { regionId: "reg_synthetic_tr" });
    expect(detailQuery).toHaveBeenCalledTimes(1);
    const [call] = detailQuery.mock.calls[0];
    expect(call).toMatchObject({
      $id: "offer_synthetic",
      region_id: "reg_synthetic_tr",
    });
    assertUncached(call, { authorization: "Bearer ci-actor-a" });
  });

  it("keeps the existing fail-closed empty/null result on SDK failure", async () => {
    listQuery.mockRejectedValue(new Error("synthetic-unavailable"));
    detailQuery.mockRejectedValue(new Error("synthetic-unavailable"));

    await expect(listOffers({ sellerId: "sel_synthetic_a" }))
      .resolves.toEqual({ offers: [], count: 0 });
    await expect(retrieveOffer("offer_synthetic")).resolves.toBeNull();
  });

  it("does not alter native catalog tag names or the independent category/collection helper", () => {
    expect(CACHE_TAGS.offers).toBe("offers");
    expect(CACHE_TAGS.offer("offer_synthetic")).toBe("offer-offer_synthetic");
    expect(CACHE_TAGS.productOffers("prod_synthetic")).toBe("product-offers-prod_synthetic");
    expect(getGlobalCacheOptions(CACHE_TAGS.categories)).toEqual({
      revalidate: false,
      tags: ["categories"],
    });
  });
});
