export type ReturnStatus =
  | "requested"
  | "open"
  | "received"
  | "partially_received"
  | "accepted"
  | "canceled"

export type ReturnReasonCode =
  | "incompatible_part"
  | "incorrect_order"
  | "damaged_in_shipping"
  | "defective_item"
  | "not_as_described"
  | "other"

export interface ReturnItemPart {
  id: string
  title: string // Parça Adı (örn: Fren Diski Ön Havalandırmalı)
  sku: string // Parça Kodu (örn: BRK-FR-2024-X)
  quantity: number
  unit_price: number
  currency_code: string
  reason_code: ReturnReasonCode
  reason_note?: string
}

export interface ReviewNote {
  id: string
  author: string
  created_at: string
  note: string
}

export interface VendorReturnRequest {
  id: string // return_...
  order_id: string // order_...
  order_display_id: string // örn: "10042" veya "#10042"
  buyer_organization_id: string // daorg_...
  buyer_organization_name: string // örn: "Özkan Otomotiv Servis A.Ş."
  seller_id: string // sel_...
  status: ReturnStatus
  created_at: string // ISO date string
  updated_at: string // ISO date string
  items: ReturnItemPart[]
  review_notes: ReviewNote[]
  total_refund_amount: number
  currency_code: string
  tracking_number?: string
  seller_decision_reason?: string
}

export interface ReturnFilters {
  status: "all" | ReturnStatus
  searchOrder: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

export interface OrgInfo {
  id: string
  name: string
  role?: string
  status?: string
}

export interface StoreInfo {
  id: string
  name: string
}
