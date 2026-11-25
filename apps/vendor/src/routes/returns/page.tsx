import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import {
  Container,
  Heading,
  Text,
  Input,
  Button,
  Badge,
  Alert,
  Label,
} from "@medusajs/ui"
import {
  ArrowUturnLeft,
  MagnifyingGlass,
  Funnel,
  Eye,
  InformationCircle,
} from "@medusajs/icons"
import { defineRouteConfig } from "@mercurjs/dashboard-sdk"
import { useTranslation } from "react-i18next"
import type {
  VendorReturnRequest,
  ReturnFilters,
  ReturnStatus,
  OrgInfo,
} from "./types"
import { filterReturns } from "./validation"
import { ReturnDetailModal } from "./components/ReturnDetailModal"

export const config = defineRouteConfig({
  label: "İade Talepleri",
  icon: ArrowUturnLeft,
  rank: 16,
})

export default function VendorReturnsPage() {
  const { t } = useTranslation()
  const tRef = useRef(t)
  tRef.current = t

  const [loadingReturns, setLoadingReturns] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)
  const [csrfToken, setCsrfToken] = useState<string>("")
  const [activeOrg, setActiveOrg] = useState<OrgInfo | null>(null)
  const [activeSellerId, setActiveSellerId] = useState<string>("")

  const [returnsList, setReturnsList] = useState<VendorReturnRequest[]>([])
  const [filters, setFilters] = useState<ReturnFilters>({
    status: "all",
    searchOrder: "",
    startDate: "",
    endDate: "",
  })

  const [selectedReturn, setSelectedReturn] = useState<VendorReturnRequest | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [statusMessage, setStatusMessage] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string>("")

  const triggerButtonRef = useRef<HTMLElement | null>(null)

  // 1. Authenticate personal session and fetch CSRF token
  const verifySession = useCallback(async () => {
    setUnauthorized(false)
    setErrorMessage("")
    try {
      const res = await fetch("/personal/session", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) {
        setUnauthorized(true)
        return
      }
      const data = await res.json()
      if (typeof data?.csrf_token === "string") {
        setCsrfToken(data.csrf_token)
      }

      // Fetch user organizations to resolve seller/org context
      const orgRes = await fetch("/personal/organizations", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (orgRes.ok) {
        const orgData = await orgRes.json()
        const orgList: OrgInfo[] = Array.isArray(orgData.organizations)
          ? orgData.organizations
          : orgData.id
          ? [{ id: orgData.id, name: orgData.name || orgData.id, role: orgData.role, status: orgData.status }]
          : []
        if (orgList.length > 0) {
          const firstOrg = orgList[0]
          setActiveOrg(firstOrg)
          // Resolve authorized seller store from /organization/stores
          const storeRes = await fetch(
            `/organization/stores?organization=${encodeURIComponent(firstOrg.id)}`,
            {
              method: "GET",
              credentials: "include",
              headers: { Accept: "application/json" },
            }
          ).catch(() => null)
          if (storeRes && storeRes.ok) {
            const storeData = await storeRes.json()
            if (
              Array.isArray(storeData?.stores) &&
              storeData.stores.length > 0 &&
              typeof storeData.stores[0]?.id === "string"
            ) {
              setActiveSellerId(storeData.stores[0].id)
            }
          }
        }
      }
    } catch {
      // Network or authorization error
    }
  }, [])

  useEffect(() => {
    void verifySession()
  }, [verifySession])

  // 2. Fetch returns from backend endpoint if available
  const fetchBackendReturns = useCallback(async (orgId: string, sellerId: string) => {
    if (!orgId || !sellerId) return
    setLoadingReturns(true)
    setErrorMessage("")
    try {
      const res = await fetch(
        `/organization/return-requests?organization_id=${encodeURIComponent(
          orgId
        )}&seller_id=${encodeURIComponent(sellerId)}&page=0`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      )
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.return_requests)) {
          const mapped: VendorReturnRequest[] = data.return_requests.map(
            (bItem: { id: string; status: ReturnStatus; created_at: string }) => ({
              id: bItem.id,
              order_id: bItem.id,
              order_display_id: bItem.id.slice(0, 12),
              buyer_organization_id: orgId,
              buyer_organization_name: t("returns.table.notSpecified"),
              seller_id: sellerId,
              status: bItem.status,
              created_at: bItem.created_at,
              updated_at: bItem.created_at,
              items: [],
              review_notes: [],
              total_refund_amount: 0,
              currency_code: "TRY",
            })
          )
          setReturnsList(mapped)
        } else {
          setReturnsList([])
        }
      } else {
        setReturnsList([])
        setErrorMessage(t("returns.errorFetchFailed"))
      }
    } catch {
      setReturnsList([])
      setErrorMessage(t("returns.errorFetchFailed"))
    } finally {
      setLoadingReturns(false)
    }
  }, [t])

  useEffect(() => {
    if (activeOrg?.id && activeSellerId) {
      void fetchBackendReturns(activeOrg.id, activeSellerId)
    }
  }, [activeOrg, activeSellerId, fetchBackendReturns])

  // Filtered returns list based on status, order number, and date range
  const filteredReturns = useMemo(() => {
    return filterReturns(returnsList, filters)
  }, [returnsList, filters])

  // Statistics calculation for overview summary cards
  const stats = useMemo(() => {
    return {
      total: returnsList.length,
      requested: returnsList.filter((r) => r.status === "requested").length,
      open: returnsList.filter((r) => r.status === "open").length,
      received: returnsList.filter((r) => r.status === "received").length,
      accepted: returnsList.filter((r) => r.status === "accepted").length,
      canceled: returnsList.filter((r) => r.status === "canceled").length,
    }
  }, [returnsList])

  // Modal handlers with WCAG 2.2 focus restore
  const handleOpenDetail = (returnItem: VendorReturnRequest, e: React.MouseEvent<HTMLElement>) => {
    triggerButtonRef.current = e.currentTarget
    setSelectedReturn(returnItem)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedReturn(null)
    setTimeout(() => {
      if (triggerButtonRef.current && triggerButtonRef.current.isConnected) {
        triggerButtonRef.current.focus()
      }
    }, 0)
  }

  // Seller Action: Approve Return
  const handleApproveReturn = async (returnId: string): Promise<boolean> => {
    setSubmitting(true)
    setErrorMessage("")
    setStatusMessage("")
    try {
      if (!csrfToken || !activeOrg || !activeSellerId) {
        setErrorMessage(t("returns.feedback.actionPendingBackend"))
        return false
      }

      const res = await fetch("/organization/return-requests", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          action: "approve",
          return_id: returnId,
          organization_id: activeOrg.id,
          seller_id: activeSellerId,
        }),
      }).catch(() => null)

      // Fail-closed verification: never assume success if server does not respond 2xx
      if (!res || !res.ok) {
        setErrorMessage(t("returns.feedback.actionPendingBackend"))
        return false
      }

      // Update state only on verified server response
      setReturnsList((prev) =>
        prev.map((r) =>
          r.id === returnId
            ? {
                ...r,
                status: "accepted",
                updated_at: new Date().toISOString(),
                review_notes: [
                  ...r.review_notes,
                  {
                    id: `note_${Date.now()}`,
                    author: t("returns.actions.sellerAuthor"),
                    created_at: new Date().toISOString(),
                    note: t("returns.actions.approveSystemNote"),
                  },
                ],
              }
            : r
        )
      )

      setStatusMessage(t("returns.feedback.approvedSuccess"))
      handleCloseModal()
      return true
    } catch {
      setErrorMessage(t("returns.feedback.approveError"))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  // Seller Action: Reject Return (requires mandatory reason)
  const handleRejectReturn = async (returnId: string, reason: string): Promise<boolean> => {
    setSubmitting(true)
    setErrorMessage("")
    setStatusMessage("")
    try {
      if (!csrfToken || !activeOrg || !activeSellerId) {
        setErrorMessage(t("returns.feedback.actionPendingBackend"))
        return false
      }

      const res = await fetch("/organization/return-requests", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          action: "reject",
          return_id: returnId,
          reason,
          organization_id: activeOrg.id,
          seller_id: activeSellerId,
        }),
      }).catch(() => null)

      // Fail-closed verification: preserve inputs and form on server error
      if (!res || !res.ok) {
        setErrorMessage(t("returns.feedback.actionPendingBackend"))
        return false
      }

      setReturnsList((prev) =>
        prev.map((r) =>
          r.id === returnId
            ? {
                ...r,
                status: "canceled",
                seller_decision_reason: reason,
                updated_at: new Date().toISOString(),
                review_notes: [
                  ...r.review_notes,
                  {
                    id: `note_${Date.now()}`,
                    author: t("returns.actions.sellerAuthor"),
                    created_at: new Date().toISOString(),
                    note: `${t("returns.actions.rejectSystemNotePrefix")}: ${reason}`,
                  },
                ],
              }
            : r
        )
      )

      setStatusMessage(t("returns.feedback.rejectedSuccess"))
      handleCloseModal()
      return true
    } catch {
      setErrorMessage(t("returns.feedback.rejectError"))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  // Seller Action: Add Review Note
  const handleAddReviewNote = async (returnId: string, note: string): Promise<boolean> => {
    setSubmitting(true)
    setErrorMessage("")
    setStatusMessage("")
    try {
      if (!csrfToken || !activeOrg || !activeSellerId) {
        setErrorMessage(t("returns.feedback.actionPendingBackend"))
        return false
      }

      const res = await fetch("/organization/return-requests", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          action: "add_note",
          return_id: returnId,
          note,
          organization_id: activeOrg.id,
          seller_id: activeSellerId,
        }),
      }).catch(() => null)

      // Fail-closed: preserve typed note if server has not confirmed write
      if (!res || !res.ok) {
        setErrorMessage(t("returns.feedback.actionPendingBackend"))
        return false
      }

      const newNoteObj = {
        id: `note_${Date.now()}`,
        author: t("returns.actions.sellerAuthor"),
        created_at: new Date().toISOString(),
        note,
      }

      setReturnsList((prev) =>
        prev.map((r) =>
          r.id === returnId
            ? {
                ...r,
                review_notes: [...r.review_notes, newNoteObj],
                updated_at: new Date().toISOString(),
              }
            : r
        )
      )

      setSelectedReturn((prev) =>
        prev && prev.id === returnId
          ? {
              ...prev,
              review_notes: [...prev.review_notes, newNoteObj],
              updated_at: new Date().toISOString(),
            }
          : prev
      )

      setStatusMessage(t("returns.feedback.noteAddedSuccess"))
      return true
    } catch {
      setErrorMessage(t("returns.feedback.noteError"))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (status: ReturnStatus) => {
    switch (status) {
      case "requested":
        return <Badge color="orange">{t("returns.status.requested")}</Badge>
      case "open":
        return <Badge color="blue">{t("returns.status.open")}</Badge>
      case "received":
        return <Badge color="purple">{t("returns.status.received")}</Badge>
      case "accepted":
        return <Badge color="green">{t("returns.status.accepted")}</Badge>
      case "canceled":
        return <Badge color="red">{t("returns.status.canceled")}</Badge>
      default:
        return <Badge color="grey">{status}</Badge>
    }
  }

  return (
    <Container className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Accessible Live Announcement Region for screen readers (WCAG 2.2) */}
      <div
        id="return-status-announcement"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {statusMessage || errorMessage}
      </div>

      {/* Header & Seller Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ui-border-base pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
              <ArrowUturnLeft className="w-6 h-6" />
            </div>
            <div>
              <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">
                {t("returns.pageTitle")}
              </Heading>
              <Text className="text-sm text-ui-fg-subtle mt-0.5">
                {t("returns.pageDescription")}
              </Text>
            </div>
          </div>
        </div>

        {activeOrg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-ui-bg-subtle border border-ui-border-base text-xs">
            <span className="font-semibold text-ui-fg-muted uppercase">
              {t("returns.orgLabel")}:
            </span>
            <span className="font-medium text-ui-fg-base">{activeOrg.name}</span>
            <span className="text-ui-fg-muted font-mono">({activeOrg.id})</span>
          </div>
        )}
      </div>

      {/* Information Banner on Policy A Read-only Phase */}
      <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2.5">
        <InformationCircle className="w-4 h-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
        <span>{t("returns.infoBanner")}</span>
      </div>

      {/* Unauthorized Notice Banner */}
      {unauthorized && (
        <Alert variant="warning" className="flex items-center justify-between">
          <span>{t("returns.unauthorizedWarning")}</span>
          <a
            href="/personal/login"
            className="text-violet-600 underline font-semibold focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            {t("returns.actions.loginBtn")}
          </a>
        </Alert>
      )}

      {/* Success / Error Alerts */}
      {statusMessage && (
        <Alert
          variant="success"
          role="status"
          aria-live="polite"
          className="flex items-center gap-2"
        >
          {statusMessage}
        </Alert>
      )}
      {errorMessage && (
        <Alert
          variant="error"
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-2"
        >
          {errorMessage}
        </Alert>
      )}

      {/* Overview Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, status: "all" }))}
          className={`p-4 rounded-xl border text-left transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none ${
            filters.status === "all"
              ? "border-violet-600 bg-violet-50/50 dark:bg-violet-950/20 shadow-sm"
              : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"
          }`}
        >
          <Text className="text-xs font-semibold text-ui-fg-muted uppercase">
            {t("returns.stats.total")}
          </Text>
          <Text className="text-2xl font-bold text-ui-fg-base mt-1">{stats.total}</Text>
        </button>

        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, status: "requested" }))}
          className={`p-4 rounded-xl border text-left transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:outline-none ${
            filters.status === "requested"
              ? "border-amber-600 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm"
              : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"
          }`}
        >
          <Text className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase">
            {t("returns.status.requested")}
          </Text>
          <Text className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
            {stats.requested}
          </Text>
        </button>

        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, status: "open" }))}
          className={`p-4 rounded-xl border text-left transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
            filters.status === "open"
              ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm"
              : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"
          }`}
        >
          <Text className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase">
            {t("returns.status.open")}
          </Text>
          <Text className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1">
            {stats.open}
          </Text>
        </button>

        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, status: "received" }))}
          className={`p-4 rounded-xl border text-left transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:outline-none ${
            filters.status === "received"
              ? "border-purple-600 bg-purple-50/50 dark:bg-purple-950/20 shadow-sm"
              : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"
          }`}
        >
          <Text className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase">
            {t("returns.status.received")}
          </Text>
          <Text className="text-2xl font-bold text-purple-700 dark:text-purple-400 mt-1">
            {stats.received}
          </Text>
        </button>

        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, status: "accepted" }))}
          className={`p-4 rounded-xl border text-left transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:outline-none ${
            filters.status === "accepted"
              ? "border-green-600 bg-green-50/50 dark:bg-green-950/20 shadow-sm"
              : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"
          }`}
        >
          <Text className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">
            {t("returns.status.accepted")}
          </Text>
          <Text className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">
            {stats.accepted}
          </Text>
        </button>

        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, status: "canceled" }))}
          className={`p-4 rounded-xl border text-left transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none ${
            filters.status === "canceled"
              ? "border-red-600 bg-red-50/50 dark:bg-red-950/20 shadow-sm"
              : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle"
          }`}
        >
          <Text className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">
            {t("returns.status.canceled")}
          </Text>
          <Text className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">
            {stats.canceled}
          </Text>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Funnel className="w-4 h-4 text-ui-fg-muted" />
            <Text className="text-sm font-semibold text-ui-fg-base">
              {t("returns.filters.title")}
            </Text>
          </div>
          {(filters.status !== "all" || filters.searchOrder || filters.startDate || filters.endDate) && (
            <Button
              type="button"
              variant="transparent"
              onClick={() =>
                setFilters({
                  status: "all",
                  searchOrder: "",
                  startDate: "",
                  endDate: "",
                })
              }
              className="text-xs text-violet-600 hover:text-violet-700 font-medium min-h-[44px] px-2"
            >
              {t("returns.filters.reset")}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search by Order / Buyer / Part */}
          <div className="space-y-1">
            <Label htmlFor="search-order-input" className="text-xs font-medium text-ui-fg-subtle">
              {t("returns.filters.searchLabel")}
            </Label>
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ui-fg-muted" />
              <Input
                id="search-order-input"
                type="text"
                value={filters.searchOrder}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, searchOrder: e.target.value }))
                }
                placeholder={t("returns.filters.searchPlaceholder")}
                className="pl-9 min-h-[44px] text-sm"
              />
            </div>
          </div>

          {/* Status Filter Dropdown */}
          <div className="space-y-1">
            <Label htmlFor="status-filter-select" className="text-xs font-medium text-ui-fg-subtle">
              {t("returns.filters.statusLabel")}
            </Label>
            <select
              id="status-filter-select"
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  status: e.target.value as ReturnFilters["status"],
                }))
              }
              className="w-full min-h-[44px] px-3 text-sm rounded-lg border border-ui-border-base bg-ui-bg-base text-ui-fg-base focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none"
            >
              <option value="all">{t("returns.status.all")}</option>
              <option value="requested">{t("returns.status.requested")}</option>
              <option value="open">{t("returns.status.open")}</option>
              <option value="received">{t("returns.status.received")}</option>
              <option value="accepted">{t("returns.status.accepted")}</option>
              <option value="canceled">{t("returns.status.canceled")}</option>
            </select>
          </div>

          {/* Date Range - Start */}
          <div className="space-y-1">
            <Label htmlFor="start-date-input" className="text-xs font-medium text-ui-fg-subtle">
              {t("returns.filters.startDateLabel")}
            </Label>
            <Input
              id="start-date-input"
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className="min-h-[44px] text-sm"
            />
          </div>

          {/* Date Range - End */}
          <div className="space-y-1">
            <Label htmlFor="end-date-input" className="text-xs font-medium text-ui-fg-subtle">
              {t("returns.filters.endDateLabel")}
            </Label>
            <Input
              id="end-date-input"
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, endDate: e.target.value }))
              }
              className="min-h-[44px] text-sm"
            />
          </div>
        </div>
      </div>

      {/* Return Requests Table & List */}
      <div className="border border-ui-border-base rounded-xl overflow-hidden bg-ui-bg-base">
        <div className="px-6 py-4 border-b border-ui-border-base flex items-center justify-between">
          <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
            {t("returns.table.title")} ({filteredReturns.length})
          </Heading>
          {loadingReturns && (
            <Text className="text-xs text-ui-fg-muted">{t("returns.table.loading")}</Text>
          )}
        </div>

        {filteredReturns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <InformationCircle className="w-10 h-10 mx-auto text-ui-fg-muted opacity-60" />
            <Heading level="h3" className="text-base font-medium text-ui-fg-base">
              {t("returns.table.emptyHeading")}
            </Heading>
            <Text className="text-sm text-ui-fg-subtle max-w-md mx-auto">
              {t("returns.table.emptyDescription")}
            </Text>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" role="table">
              <thead>
                <tr className="border-b border-ui-border-base bg-ui-bg-subtle text-xs font-semibold text-ui-fg-muted uppercase tracking-wider">
                  <th scope="col" className="px-6 py-3.5">
                    {t("returns.table.orderId")}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t("returns.table.buyerOrg")}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t("returns.table.items")}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t("returns.table.date")}
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    {t("returns.table.status")}
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    {t("returns.table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border-base text-sm">
                {filteredReturns.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-ui-bg-subtle/60 transition-colors focus-within:bg-ui-bg-subtle"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-ui-fg-base">
                        #{item.order_display_id}
                      </span>
                      <div className="text-xs text-ui-fg-muted font-mono">{item.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-ui-fg-base">
                        {item.buyer_organization_name}
                      </div>
                      <div className="text-xs text-ui-fg-muted">{item.buyer_organization_id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-ui-fg-base">
                        {item.items[0]?.title}
                        {item.items.length > 1 && (
                          <span className="text-xs text-violet-600 font-semibold ml-1.5">
                            +{item.items.length - 1} {t("returns.table.moreItems")}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ui-fg-subtle">
                        SKU: {item.items[0]?.sku}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-ui-fg-subtle text-xs">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={(e) => handleOpenDetail(item, e)}
                        aria-label={t("returns.actions.viewDetailAria", {
                          id: item.order_display_id,
                        })}
                        className="min-h-[44px] min-w-[44px] px-3 text-xs font-semibold inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-violet-600"
                      >
                        <Eye className="w-4 h-4" />
                        <span>{t("returns.actions.viewDetail")}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail & Action Accessible Modal */}
      <ReturnDetailModal
        isOpen={isModalOpen}
        returnRequest={selectedReturn}
        onClose={handleCloseModal}
        onApprove={handleApproveReturn}
        onReject={handleRejectReturn}
        onAddNote={handleAddReviewNote}
        submitting={submitting}
      />
    </Container>
  )
}
