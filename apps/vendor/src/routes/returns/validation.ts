import type {
  VendorReturnRequest,
  ReturnFilters,
  ReturnStatus,
  ReturnReasonCode,
} from "./types"

/**
 * Filter return requests by status, order number, and date range.
 */
export function filterReturns(
  items: VendorReturnRequest[],
  filters: ReturnFilters
): VendorReturnRequest[] {
  return items.filter((item) => {
    // 1. Status Filter
    if (filters.status !== "all" && item.status !== filters.status) {
      return false
    }

    // 2. Order Search (matches order_id or order_display_id or buyer organization name)
    if (filters.searchOrder.trim()) {
      const q = filters.searchOrder.trim().toLowerCase()
      const matchOrderId = item.order_id.toLowerCase().includes(q)
      const matchDisplayId = item.order_display_id.toLowerCase().includes(q)
      const matchBuyer = item.buyer_organization_name.toLowerCase().includes(q)
      const matchPart = item.items.some(
        (part) =>
          part.title.toLowerCase().includes(q) ||
          part.sku.toLowerCase().includes(q)
      )
      if (!matchOrderId && !matchDisplayId && !matchBuyer && !matchPart) {
        return false
      }
    }

    // 3. Date Range Filter using local calendar date (matches table display)
    const itemDate = new Date(item.created_at)
    if (Number.isNaN(itemDate.getTime())) return false

    const localYear = itemDate.getFullYear()
    const localMonth = String(itemDate.getMonth() + 1).padStart(2, "0")
    const localDay = String(itemDate.getDate()).padStart(2, "0")
    const itemLocalDate = `${localYear}-${localMonth}-${localDay}`

    if (filters.startDate && itemLocalDate < filters.startDate) {
      return false
    }

    if (filters.endDate && itemLocalDate > filters.endDate) {
      return false
    }

    return true
  })
}

/**
 * Validates seller rejection reason.
 * Rejection reason is MANDATORY (en az 5 karakter, en fazla 1000 karakter).
 */
export function validateRejectionReason(
  reason: string,
  t?: (key: string) => string
): string | null {
  const trimmed = reason.trim()
  if (!trimmed) {
    return t ? t("returns.validation.reasonRequired") : "İade reddi için gerekçe belirtilmesi zorunludur."
  }
  if (trimmed.length < 5) {
    return t ? t("returns.validation.reasonMinLength") : "Red gerekçesi en az 5 karakter olmalıdır."
  }
  if (trimmed.length > 1000) {
    return t ? t("returns.validation.reasonMaxLength") : "Red gerekçesi en fazla 1000 karakter olabilir."
  }
  return null
}

/**
 * Validates seller review note.
 * Note must be between 2 and 1000 characters if provided.
 */
export function validateReviewNote(
  note: string,
  t?: (key: string) => string
): string | null {
  const trimmed = note.trim()
  if (!trimmed) {
    return t ? t("returns.validation.noteRequired") : "İnceleme notu boş bırakılamaz."
  }
  if (trimmed.length < 2) {
    return t ? t("returns.validation.noteMinLength") : "İnceleme notu en az 2 karakter olmalıdır."
  }
  if (trimmed.length > 1000) {
    return t ? t("returns.validation.noteMaxLength") : "İnceleme notu en fazla 1000 karakter olabilir."
  }
  return null
}

/**
 * Returns true if the return request can be approved.
 * Only requested, open, received, or partially_received requests can be approved.
 */
export function canApproveReturn(status: ReturnStatus): boolean {
  return (
    status === "requested" ||
    status === "open" ||
    status === "received" ||
    status === "partially_received"
  )
}

/**
 * Returns true if the return request can be rejected.
 * Only requested, open, received, or partially_received requests can be rejected.
 */
export function canRejectReturn(status: ReturnStatus): boolean {
  return (
    status === "requested" ||
    status === "open" ||
    status === "received" ||
    status === "partially_received"
  )
}

/**
 * Translates reason code to human-readable label.
 */
export function getReasonLabel(
  code: ReturnReasonCode,
  t?: (key: string) => string
): string {
  if (t) {
    return t(`returns.reasons.${code}`)
  }
  switch (code) {
    case "incompatible_part":
      return "Uyumsuz Parça"
    case "incorrect_order":
      return "Hatalı Sipariş"
    case "damaged_in_shipping":
      return "Kargoda Hasar Görmüş"
    case "defective_item":
      return "Kusurlu / Arızalı Ürün"
    case "not_as_described":
      return "Tanıma / Görsele Uygun Değil"
    case "other":
    default:
      return "Diğer Neden"
  }
}
