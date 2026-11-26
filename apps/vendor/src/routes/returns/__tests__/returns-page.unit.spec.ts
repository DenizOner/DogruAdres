import { describe, it, expect } from "bun:test"
import type { VendorReturnRequest, ReturnFilters, ReturnStatus } from "../types"
import {
  filterReturns,
  validateRejectionReason,
  validateReviewNote,
  canApproveReturn,
  canRejectReturn,
  getReasonLabel,
  formatSafeDate,
  formatSafeDateTime,
} from "../validation"
import trJson from "../../../i18n/tr.json"
import enJson from "../../../i18n/en.json"

const mockReturns: VendorReturnRequest[] = [
  {
    id: "return_01JBMRET001",
    order_id: "order_01JBMORD001",
    order_display_id: "10042",
    buyer_organization_id: "daorg_buyer_ankara",
    buyer_organization_name: "Özkan Otomotiv Servis A.Ş.",
    seller_id: "sel_store_primary",
    status: "requested",
    created_at: "2026-11-23T14:30:00.000Z",
    updated_at: "2026-11-23T14:30:00.000Z",
    items: [
      {
        id: "item_ret_01",
        title: "Fren Diski Ön Havalandırmalı 300mm",
        sku: "BRK-FR-300-VENT",
        quantity: 2,
        unit_price: 1850.0,
        currency_code: "TRY",
        reason_code: "incompatible_part",
        reason_note: "Müşteri aracına uymadı",
      },
    ],
    review_notes: [],
    total_refund_amount: 3700.0,
    currency_code: "TRY",
    tracking_number: "YRT-9482710492",
  },
  {
    id: "return_01JBMRET002",
    order_id: "order_01JBMORD002",
    order_display_id: "10038",
    buyer_organization_id: "daorg_buyer_izmir",
    buyer_organization_name: "Ege Lojistik Filo",
    seller_id: "sel_store_primary",
    status: "open",
    created_at: "2026-11-22T09:15:00.000Z",
    updated_at: "2026-11-22T10:00:00.000Z",
    items: [
      {
        id: "item_ret_02",
        title: "Yağ Filtresi Kartuş Tipi",
        sku: "FLT-OIL-HU711",
        quantity: 10,
        unit_price: 180.0,
        currency_code: "TRY",
        reason_code: "incorrect_order",
      },
    ],
    review_notes: [
      {
        id: "note_01",
        author: "Satıcı Yetkilisi",
        created_at: "2026-11-22T10:00:00.000Z",
        note: "Kargo takip bekleniyor",
      },
    ],
    total_refund_amount: 1800.0,
    currency_code: "TRY",
    tracking_number: "ARAS-401928371",
  },
  {
    id: "return_01JBMRET003",
    order_id: "order_01JBMORD003",
    order_display_id: "10015",
    buyer_organization_id: "daorg_buyer_bursa",
    buyer_organization_name: "Yıldız Özel Servis",
    seller_id: "sel_store_primary",
    status: "received",
    created_at: "2026-11-20T16:45:00.000Z",
    updated_at: "2026-11-24T11:20:00.000Z",
    items: [
      {
        id: "item_ret_03",
        title: "Sol Ön Far LED",
        sku: "LGT-HL-L-LED02",
        quantity: 1,
        unit_price: 9400.0,
        currency_code: "TRY",
        reason_code: "damaged_in_shipping",
      },
    ],
    review_notes: [],
    total_refund_amount: 9400.0,
    currency_code: "TRY",
  },
  {
    id: "return_01JBMRET004",
    order_id: "order_01JBMORD004",
    order_display_id: "10002",
    buyer_organization_id: "daorg_buyer_bursa",
    buyer_organization_name: "Yıldız Özel Servis",
    seller_id: "sel_store_primary",
    status: "accepted",
    created_at: "2026-11-18T11:00:00.000Z",
    updated_at: "2026-11-19T15:00:00.000Z",
    items: [
      {
        id: "item_ret_04",
        title: "Amortisör Takozu Ön Sağ",
        sku: "SUS-STR-FR-R",
        quantity: 2,
        unit_price: 750.0,
        currency_code: "TRY",
        reason_code: "defective_item",
      },
    ],
    review_notes: [],
    total_refund_amount: 1500.0,
    currency_code: "TRY",
  },
  {
    id: "return_01JBMRET005",
    order_id: "order_01JBMORD005",
    order_display_id: "10001",
    buyer_organization_id: "daorg_buyer_antalya",
    buyer_organization_name: "Akdeniz Yedek Parça Dağıtım",
    seller_id: "sel_store_primary",
    status: "canceled",
    created_at: "2026-11-15T10:00:00.000Z",
    updated_at: "2026-11-16T12:00:00.000Z",
    seller_decision_reason: "Parça montajı yapılmış ve 30 günlük yasal iade süresi aşılmış.",
    items: [
      {
        id: "item_ret_05",
        title: "Debriyaj Seti Baskı Balata",
        sku: "CLT-SET-240MM",
        quantity: 1,
        unit_price: 4500.0,
        currency_code: "TRY",
        reason_code: "other",
      },
    ],
    review_notes: [],
    total_refund_amount: 4500.0,
    currency_code: "TRY",
  },
]

describe("Vendor Returns - filterReturns", () => {
  it("returns all items when filter is default (all status, empty search and dates)", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(5)
  })

  it("filters by status requested correctly", () => {
    const filters: ReturnFilters = {
      status: "requested",
      searchOrder: "",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("return_01JBMRET001")
  })

  it("filters by status open correctly", () => {
    const filters: ReturnFilters = {
      status: "open",
      searchOrder: "",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("return_01JBMRET002")
  })

  it("filters by status received correctly", () => {
    const filters: ReturnFilters = {
      status: "received",
      searchOrder: "",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("return_01JBMRET003")
  })

  it("filters by status partially_received correctly", () => {
    const itemWithPartiallyReceived: VendorReturnRequest = {
      ...mockReturns[0],
      id: "return_partial_01",
      status: "partially_received",
    }
    const filters: ReturnFilters = {
      status: "partially_received",
      searchOrder: "",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns([...mockReturns, itemWithPartiallyReceived], filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("return_partial_01")
    expect(result[0].status).toBe("partially_received")
  })

  it("filters by status accepted correctly", () => {
    const filters: ReturnFilters = {
      status: "accepted",
      searchOrder: "",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("return_01JBMRET004")
  })

  it("filters by status canceled correctly", () => {
    const filters: ReturnFilters = {
      status: "canceled",
      searchOrder: "",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("return_01JBMRET005")
  })

  it("filters by order display ID search query", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "10042",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].order_display_id).toBe("10042")
  })

  it("filters by order display ID with leading # query symbol", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "#10042",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].order_display_id).toBe("10042")
  })

  it("filters by cargo tracking number", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "YRT-9482710492",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("return_01JBMRET001")
    expect(result[0].tracking_number).toBe("YRT-9482710492")
  })

  it("filters by partial cargo tracking number case-insensitively", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "aras",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("return_01JBMRET002")
  })

  it("filters by buyer organization name case-insensitively", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "özkan",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].buyer_organization_name).toContain("Özkan")
  })

  it("filters by part title search", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "Fren Diski",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].items[0].sku).toBe("BRK-FR-300-VENT")
  })

  it("filters by part SKU search", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "FLT-OIL",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(1)
    expect(result[0].order_display_id).toBe("10038")
  })

  it("filters by date range (start and end date)", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "",
      startDate: "2026-11-20",
      endDate: "2026-11-22",
    }
    const result = filterReturns(mockReturns, filters)
    // Should include return_01JBMRET002 (2026-11-22) and return_01JBMRET003 (2026-11-20)
    expect(result).toHaveLength(2)
    const ids = result.map((r) => r.id)
    expect(ids).toContain("return_01JBMRET002")
    expect(ids).toContain("return_01JBMRET003")
  })

  it("returns empty list when search does not match any return", () => {
    const filters: ReturnFilters = {
      status: "all",
      searchOrder: "non-existent-order-number-9999",
      startDate: "",
      endDate: "",
    }
    const result = filterReturns(mockReturns, filters)
    expect(result).toHaveLength(0)
  })
})

describe("Vendor Returns - validateRejectionReason", () => {
  it("rejects empty or whitespace-only reason (mandatory reason requirement)", () => {
    expect(validateRejectionReason("")).not.toBeNull()
    expect(validateRejectionReason("   ")).not.toBeNull()
  })

  it("rejects reason shorter than 5 characters", () => {
    const error = validateRejectionReason("yok")
    expect(error).not.toBeNull()
    expect(error).toContain("en az 5 karakter")
  })

  it("rejects reason exceeding 1000 characters", () => {
    const longReason = "a".repeat(1001)
    const error = validateRejectionReason(longReason)
    expect(error).not.toBeNull()
    expect(error).toContain("en fazla 1000 karakter")
  })

  it("accepts valid rejection reason", () => {
    const validReason = "Parça montaj izi taşıdığı için yeniden satışa uygun değildir."
    const error = validateRejectionReason(validReason)
    expect(error).toBeNull()
  })

  it("supports translation function when provided", () => {
    const mockT = (key: string) => `translated_${key}`
    const error = validateRejectionReason("", mockT)
    expect(error).toBe("translated_returns.validation.reasonRequired")
  })
})

describe("Vendor Returns - validateReviewNote", () => {
  it("rejects empty or whitespace note", () => {
    expect(validateReviewNote("")).not.toBeNull()
    expect(validateReviewNote("  ")).not.toBeNull()
  })

  it("rejects single character note", () => {
    const error = validateReviewNote("x")
    expect(error).not.toBeNull()
  })

  it("rejects note exceeding 1000 characters", () => {
    const error = validateReviewNote("n".repeat(1001))
    expect(error).not.toBeNull()
  })

  it("accepts valid review note", () => {
    const error = validateReviewNote("Ürün kutusu açılmış, fotoğraflar talep edildi.")
    expect(error).toBeNull()
  })
})

describe("Vendor Returns - Action Eligibility Guards", () => {
  it("allows approve for requested, open, received, and partially_received statuses", () => {
    expect(canApproveReturn("requested")).toBe(true)
    expect(canApproveReturn("open")).toBe(true)
    expect(canApproveReturn("received")).toBe(true)
    expect(canApproveReturn("partially_received")).toBe(true)
  })

  it("denies approve for already accepted or canceled statuses", () => {
    expect(canApproveReturn("accepted")).toBe(false)
    expect(canApproveReturn("canceled")).toBe(false)
  })

  it("allows reject for requested, open, received, and partially_received statuses", () => {
    expect(canRejectReturn("requested")).toBe(true)
    expect(canRejectReturn("open")).toBe(true)
    expect(canRejectReturn("received")).toBe(true)
    expect(canRejectReturn("partially_received")).toBe(true)
  })

  it("denies reject for already accepted or canceled statuses", () => {
    expect(canRejectReturn("accepted")).toBe(false)
    expect(canRejectReturn("canceled")).toBe(false)
  })
})

describe("Vendor Returns - getReasonLabel", () => {
  it("resolves all defined return reason codes", () => {
    expect(getReasonLabel("incompatible_part")).toBe("Uyumsuz Parça")
    expect(getReasonLabel("incorrect_order")).toBe("Hatalı Sipariş")
    expect(getReasonLabel("damaged_in_shipping")).toBe("Kargoda Hasar Görmüş")
    expect(getReasonLabel("defective_item")).toBe("Kusurlu / Arızalı Ürün")
    expect(getReasonLabel("not_as_described")).toBe("Tanıma / Görsele Uygun Değil")
    expect(getReasonLabel("other")).toBe("Diğer Neden")
  })

  it("uses translation function if provided", () => {
    const mockT = (key: string) => `translated_${key}`
    expect(getReasonLabel("incompatible_part", mockT)).toBe(
      "translated_returns.reasons.incompatible_part"
    )
  })
})

describe("Vendor Returns - formatSafeDate & formatSafeDateTime", () => {
  it("formats valid ISO date string correctly", () => {
    const formatted = formatSafeDate("2026-11-23T14:30:00.000Z", "tr-TR")
    expect(formatted).not.toBe("-")
    expect(formatted).toContain("2026")
  })

  it("formats valid numeric timestamp correctly", () => {
    const ts = new Date("2026-11-20T10:00:00Z").getTime()
    const formatted = formatSafeDate(ts, "tr-TR")
    expect(formatted).not.toBe("-")
  })

  it("returns '-' for null, undefined, empty, or invalid date values", () => {
    expect(formatSafeDate(null)).toBe("-")
    expect(formatSafeDate(undefined)).toBe("-")
    expect(formatSafeDate("")).toBe("-")
    expect(formatSafeDate("invalid-date-format")).toBe("-")
  })

  it("formats safe date and time string", () => {
    const formatted = formatSafeDateTime("2026-11-23T14:30:00.000Z", "tr-TR")
    expect(formatted).not.toBe("-")
    expect(formatted).toContain("2026")
  })

  it("returns '-' for invalid date in formatSafeDateTime", () => {
    expect(formatSafeDateTime(null)).toBe("-")
    expect(formatSafeDateTime("not-a-date")).toBe("-")
  })
})

describe("Vendor Returns - i18n Resource Parity and Schema Integrity", () => {
  function getDeepKeys(obj: Record<string, unknown>, prefix = ""): string[] {
    let keys: string[] = []
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        keys = keys.concat(getDeepKeys(v as Record<string, unknown>, fullKey))
      } else {
        keys.push(fullKey)
      }
    }
    return keys
  }

  it("verifies vendor panel i18n key parity between TR and EN for returns section", () => {
    const trReturns = (trJson as Record<string, unknown>).returns as Record<string, unknown>
    const enReturns = (enJson as Record<string, unknown>).returns as Record<string, unknown>

    expect(trReturns).toBeDefined()
    expect(enReturns).toBeDefined()

    const trKeys = getDeepKeys(trReturns).sort()
    const enKeys = getDeepKeys(enReturns).sort()

    expect(trKeys).toEqual(enKeys)
  })

  it("verifies full root vendor panel i18n key parity between TR and EN", () => {
    const trKeys = getDeepKeys(trJson as Record<string, unknown>).sort()
    const enKeys = getDeepKeys(enJson as Record<string, unknown>).sort()

    expect(trKeys).toEqual(enKeys)
  })
})
