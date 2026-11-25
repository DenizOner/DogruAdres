import { useCallback, useEffect, useRef, useState } from "react"
import {
  Container,
  Heading,
  Text,
  Button,
  Badge,
  Input,
  Alert,
} from "@medusajs/ui"
import {
  BuildingStorefront,
  CheckCircle,
  XCircle,
  ArrowPath,
  ExclamationCircle,
} from "@medusajs/icons"
import { useTranslation } from "react-i18next"
import { apiGet, apiPost, ApiError } from "../../lib/api"

export const config = {
  public: true,
  label: "Mağazalar & Talepler",
  icon: BuildingStorefront,
  rank: 3,
}

// 1. Store Application Models
interface PendingStoreItem {
  application_id: string
  seller_id: string
  organization_id: string
  organization_name: string
  name: string
  on_hold: boolean
}

interface SuspendedStoreItem {
  application_id: string
  seller_id: string
  organization_id: string
  organization_name: string
  name: string
  on_hold: boolean
  name_review_required: boolean
}

interface StoresResponse {
  pending: PendingStoreItem[]
  suspended: SuspendedStoreItem[]
  reconciliation: PendingStoreItem[]
  release_pending: PendingStoreItem[]
  page: number
  has_more: boolean
}

// 2. Store Rename Models
interface StoreRenameItem {
  request_id: string
  seller_id: string
  organization_id: string
  organization_name: string
  seller_status: "open" | "suspended"
  old_name: string
  old_handle: string
  proposed_name: string
  proposed_handle: string
  status: "pending_review" | "approving"
}

interface StoreRenamesResponse {
  pending: StoreRenameItem[]
  page: number
  has_more: boolean
}

// 3. Store Closing Review (Appeals) Models
interface ClosingAppealItem {
  seller_id: string
  organization_id: string
  organization_name: string
  store_name: string
  source_request_id: string
  stage: "first_appeal" | "second_review"
  request_reason: string
}

// 4. Platform Store Closings Candidates
interface ClosingCandidateItem {
  seller_id: string
  organization_id: string
  organization_name: string
  store_name: string
  store_status: string
}

interface ClosingsResponse {
  candidates: ClosingCandidateItem[]
  page: number
  has_more: boolean
}

type TabType = "applications" | "suspended" | "renames" | "closings"

export default function StoresPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabType>("applications")

  // State for /platform/stores
  const [storesData, setStoresData] = useState<StoresResponse | null>(null)
  const [storesPage, setStoresPage] = useState<number>(0)
  const [storesLoading, setStoresLoading] = useState<boolean>(true)

  // State for /platform/store-renames
  const [renamesData, setRenamesData] = useState<StoreRenamesResponse | null>(null)
  const [renamesPage, setRenamesPage] = useState<number>(0)
  const [renamesLoading, setRenamesLoading] = useState<boolean>(false)

  // State for /platform/store-closing-reviews & /platform/store-closings
  const [appeals, setAppeals] = useState<ClosingAppealItem[]>([])
  const [closingCandidates, setClosingCandidates] = useState<ClosingCandidateItem[]>([])
  const [closingsLoading, setClosingsLoading] = useState<boolean>(false)

  // Global messages & in-flight
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [inFlight, setInFlight] = useState<boolean>(false)

  // Action modals / reason prompts
  const [reasonModal, setReasonModal] = useState<{
    type: "reject_store" | "reject_rename" | "decide_appeal" | "start_closing"
    targetId: string
    sellerId: string
    orgId?: string
    sourceRequestId?: string
    appealDecision?: "accepted" | "rejected"
  } | null>(null)
  const [reasonText, setReasonText] = useState<string>("")
  const [closingConfirmed, setClosingConfirmed] = useState<boolean>(false)

  const activeSeq = useRef(0)

  // Fetch /platform/stores
  const loadStores = useCallback(async (page: number) => {
    const seq = ++activeSeq.current
    setStoresLoading(true)
    setErrorMsg(null)
    try {
      const data = await apiGet<StoresResponse>(`/platform/stores?page=${page}`)
      if (seq !== activeSeq.current) return
      setStoresData(data)
    } catch (err) {
      if (seq !== activeSeq.current) return
      setErrorMsg(err instanceof Error ? err.message : t("stores.alerts.loadError"))
    } finally {
      if (seq === activeSeq.current) setStoresLoading(false)
    }
  }, [t])

  // Fetch /platform/store-renames
  const loadRenames = useCallback(async (page: number) => {
    const seq = ++activeSeq.current
    setRenamesLoading(true)
    setErrorMsg(null)
    try {
      const data = await apiGet<StoreRenamesResponse>(`/platform/store-renames?page=${page}`)
      if (seq !== activeSeq.current) return
      setRenamesData(data)
    } catch (err) {
      if (seq !== activeSeq.current) return
      setErrorMsg(err instanceof Error ? err.message : t("stores.alerts.loadError"))
    } finally {
      if (seq === activeSeq.current) setRenamesLoading(false)
    }
  }, [t])

  // Fetch /platform/store-closing-reviews & /platform/store-closings
  const loadClosingsAndAppeals = useCallback(async () => {
    const seq = ++activeSeq.current
    setClosingsLoading(true)
    setErrorMsg(null)
    try {
      const [appealsRes, closingsRes] = await Promise.allSettled([
        apiGet<ClosingAppealItem[] | { candidates: ClosingAppealItem[] }>("/platform/store-closing-reviews?page=0"),
        apiGet<ClosingsResponse>("/platform/store-closings?page=0"),
      ])

      if (seq !== activeSeq.current) return

      if (appealsRes.status === "fulfilled") {
        const val = appealsRes.value
        setAppeals(Array.isArray(val) ? val : val.candidates || [])
      }

      if (closingsRes.status === "fulfilled") {
        setClosingCandidates(closingsRes.value.candidates || [])
      }
    } catch (err) {
      if (seq !== activeSeq.current) return
      setErrorMsg(err instanceof Error ? err.message : t("stores.alerts.loadError"))
    } finally {
      if (seq === activeSeq.current) setClosingsLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (activeTab === "applications" || activeTab === "suspended") {
      void loadStores(storesPage)
    } else if (activeTab === "renames") {
      void loadRenames(renamesPage)
    } else if (activeTab === "closings") {
      void loadClosingsAndAppeals()
    }
  }, [activeTab, storesPage, renamesPage, loadStores, loadRenames, loadClosingsAndAppeals])

  // Store Application Actions
  const handleApproveStore = async (item: PendingStoreItem) => {
    if (item.on_hold || inFlight) return
    setInFlight(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await apiPost("/platform/stores", {
        application_id: item.application_id,
        seller_id: item.seller_id,
      })
      setSuccessMsg(t("stores.alerts.actionSuccess"))
      await loadStores(storesPage)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hata"
      setErrorMsg(t("stores.alerts.actionError", { error: msg }))
    } finally {
      setInFlight(false)
    }
  }

  // Suspended Actions: unsuspend, release, reconcile
  const handleSuspendedAction = async (
    action: "unsuspend" | "release" | "reconcile",
    item: PendingStoreItem | SuspendedStoreItem
  ) => {
    if (inFlight) return
    const confirmPrompt =
      action === "unsuspend"
        ? t("stores.alerts.confirmUnsuspend")
        : action === "release"
        ? t("stores.alerts.confirmRelease")
        : t("stores.alerts.confirmReconcile")

    if (!window.confirm(confirmPrompt)) return

    setInFlight(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await apiPost("/platform/stores", {
        action,
        application_id: item.application_id,
        seller_id: item.seller_id,
      })
      setSuccessMsg(t("stores.alerts.actionSuccess"))
      await loadStores(storesPage)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hata"
      setErrorMsg(t("stores.alerts.actionError", { error: msg }))
    } finally {
      setInFlight(false)
    }
  }

  // Store Rename Approval
  const handleApproveRename = async (item: StoreRenameItem) => {
    if (inFlight) return
    if (!window.confirm(t("stores.alerts.confirmRename"))) return

    setInFlight(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await apiPost("/platform/store-renames", {
        action: "approve",
        request_id: item.request_id,
        seller_id: item.seller_id,
      })
      setSuccessMsg(t("stores.alerts.actionSuccess"))
      await loadRenames(renamesPage)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Hata"
      setErrorMsg(t("stores.alerts.actionError", { error: msg }))
    } finally {
      setInFlight(false)
    }
  }

  // Submit Reasoned Modal (Rejection / Appeals / Closing)
  const submitReasonAction = async () => {
    if (!reasonModal || inFlight) return

    const trimmed = reasonText.trim()
    if (trimmed.length < 10 || trimmed.length > 500) {
      setErrorMsg(t("stores.alerts.reasonLengthError"))
      return
    }

    setInFlight(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      if (reasonModal.type === "reject_store") {
        await apiPost("/platform/stores", {
          action: "reject",
          application_id: reasonModal.targetId,
          seller_id: reasonModal.sellerId,
          reason: trimmed,
        })
        await loadStores(storesPage)
      } else if (reasonModal.type === "reject_rename") {
        await apiPost("/platform/store-renames", {
          action: "reject",
          request_id: reasonModal.targetId,
          seller_id: reasonModal.sellerId,
          reason: trimmed,
        })
        await loadRenames(renamesPage)
      } else if (reasonModal.type === "decide_appeal") {
        const randomHex = crypto.randomUUID().replace(/-/g, "")
        await apiPost("/platform/store-closing-reviews", {
          organization_id: reasonModal.orgId,
          seller_id: reasonModal.sellerId,
          source_request_id: reasonModal.sourceRequestId,
          request_id: `dasdr_${randomHex}`,
          decision: reasonModal.appealDecision || "rejected",
          reason: trimmed,
        })
        await loadClosingsAndAppeals()
      } else if (reasonModal.type === "start_closing") {
        const randomHex = crypto.randomUUID().replace(/-/g, "")
        await apiPost("/platform/store-closings", {
          organization_id: reasonModal.orgId,
          seller_id: reasonModal.sellerId,
          request_id: `dascp_${randomHex}`,
          reason: trimmed,
        })
        await loadClosingsAndAppeals()
      }

      setSuccessMsg(t("stores.alerts.actionSuccess"))
      setReasonModal(null)
      setReasonText("")
      setClosingConfirmed(false)
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        setErrorMsg("İşlem çakışması: Veri başka bir oturumda güncellendi.")
      } else {
        const msg = err instanceof Error ? err.message : "Hata"
        setErrorMsg(t("stores.alerts.actionError", { error: msg }))
      }
    } finally {
      setInFlight(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Heading level="h1">{t("stores.title")}</Heading>
          <Text className="text-ui-fg-subtle">{t("stores.description")}</Text>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={storesLoading || renamesLoading || closingsLoading || inFlight}
          onClick={() => {
            if (activeTab === "applications" || activeTab === "suspended") void loadStores(storesPage)
            if (activeTab === "renames") void loadRenames(renamesPage)
            if (activeTab === "closings") void loadClosingsAndAppeals()
          }}
        >
          <ArrowPath className="w-4 h-4 mr-2" />
          {t("stores.actions.refresh")}
        </Button>
      </div>

      {errorMsg && (
        <Alert variant="error" role="alert" className="mb-4">
          {errorMsg}
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" role="status" aria-live="polite" className="mb-4">
          {successMsg}
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex border-b border-ui-border-base gap-2" role="tablist" aria-label="Mağaza yönetim sekmeleri">
        {(["applications", "suspended", "renames", "closings"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors ${
              activeTab === tab
                ? "border-ui-border-interactive text-ui-fg-base"
                : "border-transparent text-ui-fg-muted hover:text-ui-fg-base"
            }`}
          >
            {t(`stores.tabs.${tab}`)}
            {tab === "applications" && storesData && (
              <span className="ml-2 py-0.5 px-1.5 text-xs rounded-full bg-ui-bg-subtle text-ui-fg-subtle">
                {storesData.pending.length}
              </span>
            )}
            {tab === "suspended" && storesData && (
              <span className="ml-2 py-0.5 px-1.5 text-xs rounded-full bg-ui-bg-subtle text-ui-fg-subtle">
                {storesData.suspended.length + storesData.release_pending.length + storesData.reconciliation.length}
              </span>
            )}
            {tab === "renames" && renamesData && (
              <span className="ml-2 py-0.5 px-1.5 text-xs rounded-full bg-ui-bg-subtle text-ui-fg-subtle">
                {renamesData.pending.length}
              </span>
            )}
            {tab === "closings" && (
              <span className="ml-2 py-0.5 px-1.5 text-xs rounded-full bg-ui-bg-subtle text-ui-fg-subtle">
                {appeals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 1. Tab: New Store Applications */}
      {activeTab === "applications" && (
        <Container className="p-0 overflow-hidden">
          {storesLoading ? (
            <div className="p-8 text-center text-ui-fg-muted" role="status" aria-live="polite">
              Yükleniyor...
            </div>
          ) : !storesData || storesData.pending.length === 0 ? (
            <div className="p-8 text-center text-ui-fg-muted" role="status" aria-live="polite">
              {t("stores.alerts.emptyPending")}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" aria-label={t("stores.tabs.applications")}>
                  <thead className="bg-ui-bg-subtle text-ui-fg-subtle border-b border-ui-border-base">
                    <tr>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.storeName")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.organization")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.sellerId")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.status")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold text-right">{t("stores.table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ui-border-base">
                    {storesData.pending.map((item) => (
                      <tr key={item.application_id} className="hover:bg-ui-bg-subtle-hover transition-colors">
                        <td className="py-3 px-4 font-medium text-ui-fg-base">{item.name}</td>
                        <td className="py-3 px-4 text-ui-fg-subtle">{item.organization_name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-ui-fg-muted">{item.seller_id}</td>
                        <td className="py-3 px-4">
                          <Badge color="orange">{t("stores.status.pending_approval")}</Badge>
                          {item.on_hold && (
                            <div className="mt-1">
                              <Badge color="red" size="small">{t("stores.status.onHold")}</Badge>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <Button
                            type="button"
                            size="small"
                            variant="primary"
                            disabled={item.on_hold || inFlight}
                            onClick={() => void handleApproveStore(item)}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            {t("stores.actions.approveStore")}
                          </Button>
                          <Button
                            type="button"
                            size="small"
                            variant="danger"
                            disabled={inFlight}
                            onClick={() => {
                              setReasonModal({
                                type: "reject_store",
                                targetId: item.application_id,
                                sellerId: item.seller_id,
                              })
                              setReasonText("")
                            }}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            {t("stores.actions.rejectStore")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {storesData && (storesData.has_more || storesPage > 0) && (
                <div className="flex items-center justify-between p-4 border-t border-ui-border-base">
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    disabled={storesPage === 0 || inFlight}
                    onClick={() => setStoresPage((p) => Math.max(0, p - 1))}
                  >
                    {t("stores.actions.newer")}
                  </Button>
                  <span className="text-xs text-ui-fg-subtle">Sayfa {storesPage + 1}</span>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    disabled={!storesData.has_more || inFlight}
                    onClick={() => setStoresPage((p) => p + 1)}
                  >
                    {t("stores.actions.older")}
                  </Button>
                </div>
              )}
            </>
          )}
        </Container>
      )}

      {/* 2. Tab: Suspended & Reconciliation Stores */}
      {activeTab === "suspended" && (
        <div className="space-y-6">
          <Container className="p-0 overflow-hidden">
            <div className="px-4 py-3 bg-ui-bg-subtle border-b border-ui-border-base font-semibold text-sm">
              Askıdaki Mağazalar
            </div>
            {storesLoading ? (
              <div className="p-8 text-center text-ui-fg-muted">Yükleniyor...</div>
            ) : !storesData || storesData.suspended.length === 0 ? (
              <div className="p-8 text-center text-ui-fg-muted">{t("stores.alerts.emptySuspended")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" aria-label="Askıdaki mağazalar listesi">
                  <thead className="bg-ui-bg-subtle text-ui-fg-subtle border-b border-ui-border-base">
                    <tr>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.storeName")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.organization")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.status")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold text-right">{t("stores.table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ui-border-base">
                    {storesData.suspended.map((item) => (
                      <tr key={item.application_id} className="hover:bg-ui-bg-subtle-hover transition-colors">
                        <td className="py-3 px-4 font-medium text-ui-fg-base">{item.name}</td>
                        <td className="py-3 px-4 text-ui-fg-subtle">{item.organization_name}</td>
                        <td className="py-3 px-4">
                          <Badge color="red">{t("stores.status.suspended")}</Badge>
                          {item.name_review_required && (
                            <div className="mt-1">
                              <Badge color="orange" size="small">{t("stores.status.nameReviewRequired")}</Badge>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            type="button"
                            size="small"
                            variant="secondary"
                            disabled={item.name_review_required || inFlight}
                            onClick={() => void handleSuspendedAction("unsuspend", item)}
                          >
                            {t("stores.actions.unsuspendStore")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Container>

          {/* Release Pending & Reconciliation lists */}
          {storesData && (storesData.release_pending.length > 0 || storesData.reconciliation.length > 0) && (
            <Container className="p-0 overflow-hidden">
              <div className="px-4 py-3 bg-ui-bg-subtle border-b border-ui-border-base font-semibold text-sm">
                Özel Uzlaştırma & Kapatma Durumları
              </div>
              <div className="p-4 space-y-4">
                {storesData.release_pending.map((item) => (
                  <div key={item.application_id} className="flex items-center justify-between p-3 border border-ui-border-base rounded-md">
                    <div>
                      <div className="font-medium text-ui-fg-base">{item.organization_name} — {item.name}</div>
                      <div className="text-xs text-ui-fg-subtle">{t("stores.status.releasePending")}</div>
                    </div>
                    <Button
                      type="button"
                      size="small"
                      variant="danger"
                      disabled={inFlight}
                      onClick={() => void handleSuspendedAction("release", item)}
                    >
                      {t("stores.actions.releaseStore")}
                    </Button>
                  </div>
                ))}

                {storesData.reconciliation.map((item) => (
                  <div key={item.application_id} className="flex items-center justify-between p-3 border border-ui-border-base rounded-md">
                    <div>
                      <div className="font-medium text-ui-fg-base">{item.organization_name} — {item.name}</div>
                      <div className="text-xs text-ui-fg-subtle">{t("stores.status.reconciliationRequired")}</div>
                    </div>
                    <Button
                      type="button"
                      size="small"
                      variant="secondary"
                      disabled={inFlight}
                      onClick={() => void handleSuspendedAction("reconcile", item)}
                    >
                      {t("stores.actions.reconcileStore")}
                    </Button>
                  </div>
                ))}
              </div>
            </Container>
          )}
        </div>
      )}

      {/* 3. Tab: Store Rename Requests */}
      {activeTab === "renames" && (
        <Container className="p-0 overflow-hidden">
          {renamesLoading ? (
            <div className="p-8 text-center text-ui-fg-muted">Yükleniyor...</div>
          ) : !renamesData || renamesData.pending.length === 0 ? (
            <div className="p-8 text-center text-ui-fg-muted">{t("stores.alerts.emptyRenames")}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" aria-label={t("stores.tabs.renames")}>
                  <thead className="bg-ui-bg-subtle text-ui-fg-subtle border-b border-ui-border-base">
                    <tr>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.organization")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.oldName")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold">{t("stores.table.proposedName")}</th>
                      <th scope="col" className="py-3 px-4 font-semibold text-right">{t("stores.table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ui-border-base">
                    {renamesData.pending.map((item) => (
                      <tr key={item.request_id} className="hover:bg-ui-bg-subtle-hover transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-ui-fg-base">{item.organization_name}</div>
                          {item.seller_status === "suspended" && (
                            <Badge color="red" size="small">Askıda</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-ui-fg-subtle">
                          {item.old_name} <span className="text-xs font-mono">({item.old_handle})</span>
                        </td>
                        <td className="py-3 px-4 text-ui-fg-base font-medium">
                          {item.proposed_name} <span className="text-xs font-mono">({item.proposed_handle})</span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          {item.status === "approving" ? (
                            <span className="text-xs text-ui-fg-subtle">Onaylanıyor...</span>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="small"
                                variant="primary"
                                disabled={inFlight}
                                onClick={() => void handleApproveRename(item)}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                {t("stores.actions.approveRename")}
                              </Button>
                              <Button
                                type="button"
                                size="small"
                                variant="danger"
                                disabled={inFlight}
                                onClick={() => {
                                  setReasonModal({
                                    type: "reject_rename",
                                    targetId: item.request_id,
                                    sellerId: item.seller_id,
                                  })
                                  setReasonText("")
                                }}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                {t("stores.actions.rejectRename")}
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renamesData && (renamesData.has_more || renamesPage > 0) && (
                <div className="flex items-center justify-between p-4 border-t border-ui-border-base">
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    disabled={renamesPage === 0 || inFlight}
                    onClick={() => setRenamesPage((p) => Math.max(0, p - 1))}
                  >
                    {t("stores.actions.newer")}
                  </Button>
                  <span className="text-xs text-ui-fg-subtle">Sayfa {renamesPage + 1}</span>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    disabled={!renamesData.has_more || inFlight}
                    onClick={() => setRenamesPage((p) => p + 1)}
                  >
                    {t("stores.actions.older")}
                  </Button>
                </div>
              )}
            </>
          )}
        </Container>
      )}

      {/* 4. Tab: Closings & Appeals */}
      {activeTab === "closings" && (
        <div className="space-y-6">
          {/* Appeals List */}
          <Container className="p-0 overflow-hidden">
            <div className="px-4 py-3 bg-ui-bg-subtle border-b border-ui-border-base font-semibold text-sm">
              Bağımsız Mağaza Kapatma İtiraz İncelemeleri
            </div>
            {closingsLoading ? (
              <div className="p-8 text-center text-ui-fg-muted">Yükleniyor...</div>
            ) : appeals.length === 0 ? (
              <div className="p-8 text-center text-ui-fg-muted">{t("stores.alerts.emptyClosings")}</div>
            ) : (
              <div className="p-4 space-y-4">
                {appeals.map((appeal) => (
                  <div key={appeal.source_request_id} className="p-4 border border-ui-border-base rounded-md space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-ui-fg-base text-base">
                          {appeal.organization_name} / {appeal.store_name}
                        </h3>
                        <div className="text-xs text-ui-fg-subtle">
                          {appeal.stage === "first_appeal" ? t("stores.status.firstAppeal") : t("stores.status.secondReview")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="small"
                          variant="primary"
                          disabled={inFlight}
                          onClick={() => {
                            setReasonModal({
                              type: "decide_appeal",
                              targetId: appeal.source_request_id,
                              sellerId: appeal.seller_id,
                              orgId: appeal.organization_id,
                              sourceRequestId: appeal.source_request_id,
                              appealDecision: "accepted",
                            })
                            setReasonText("")
                          }}
                        >
                          {t("stores.alerts.decisionAccepted")}
                        </Button>
                        <Button
                          type="button"
                          size="small"
                          variant="danger"
                          disabled={inFlight}
                          onClick={() => {
                            setReasonModal({
                              type: "decide_appeal",
                              targetId: appeal.source_request_id,
                              sellerId: appeal.seller_id,
                              orgId: appeal.organization_id,
                              sourceRequestId: appeal.source_request_id,
                              appealDecision: "rejected",
                            })
                            setReasonText("")
                          }}
                        >
                          {t("stores.alerts.decisionRejected")}
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm bg-ui-bg-subtle p-3 rounded text-ui-fg-subtle">
                      <strong>İtiraz Gerekçesi:</strong> {appeal.request_reason}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Container>

          {/* New Store Closing Initiation */}
          <Container className="p-6 space-y-4">
            <Heading level="h2" className="text-base font-semibold">
              Platform Mağaza Kapatma Süreci Başlat
            </Heading>
            <Text className="text-sm text-ui-fg-subtle">
              Yetkili gerekçe ile bir mağazanın satışlarını derhal durdurun. Süreç kapsamında Owner bildirim süresi ve itiraz mekanizması işletilir.
            </Text>

            {closingCandidates.length === 0 ? (
              <p className="text-sm text-ui-fg-muted">İşleme uygun aday mağaza bulunmuyor.</p>
            ) : (
              <div className="space-y-4 max-w-xl">
                <div>
                  <label htmlFor="closing-candidate-select" className="block text-sm font-semibold mb-1">
                    Mağaza Seçimi:
                  </label>
                  <select
                    id="closing-candidate-select"
                    className="w-full border border-ui-border-base rounded p-2 text-sm bg-ui-bg-base text-ui-fg-base"
                    defaultValue=""
                    onChange={(e) => {
                      const sel = closingCandidates.find((c) => c.seller_id === e.target.value)
                      if (sel) {
                        setReasonModal({
                          type: "start_closing",
                          targetId: sel.seller_id,
                          sellerId: sel.seller_id,
                          orgId: sel.organization_id,
                        })
                        setReasonText("")
                        setClosingConfirmed(false)
                      }
                    }}
                  >
                    <option value="" disabled>{t("stores.alerts.selectStore")}</option>
                    {closingCandidates.map((c) => (
                      <option key={c.seller_id} value={c.seller_id}>
                        {c.organization_name} / {c.store_name} ({c.store_status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </Container>
        </div>
      )}

      {/* Generic Reason & Confirmation Modal */}
      {reasonModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reason-modal-title"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !inFlight) setReasonModal(null)
          }}
        >
          <div className="bg-ui-bg-base border border-ui-border-base rounded-lg max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-ui-border-base pb-3">
              <ExclamationCircle className="w-5 h-5 text-ui-tag-red-icon" />
              <Heading level="h2" id="reason-modal-title" className="text-base font-semibold">
                {reasonModal.type === "reject_store"
                  ? t("stores.actions.rejectStore")
                  : reasonModal.type === "reject_rename"
                  ? t("stores.actions.rejectRename")
                  : reasonModal.type === "decide_appeal"
                  ? t("stores.actions.decideAppeal")
                  : t("stores.actions.startClosing")}
              </Heading>
            </div>

            <div className="space-y-3">
              <label htmlFor="modal-reason-input" className="block text-sm font-semibold text-ui-fg-base">
                {t("stores.table.reason")} (10–500 karakter):
              </label>
              <Input
                id="modal-reason-input"
                placeholder={t("stores.alerts.reasonPlaceholder")}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                maxLength={500}
                disabled={inFlight}
              />
              <div className="text-xs text-ui-fg-subtle text-right">
                {reasonText.trim().length} / 500
              </div>

              {reasonModal.type === "start_closing" && (
                <label className="flex items-center gap-2 text-sm text-ui-fg-base cursor-pointer pt-2">
                  <input
                    type="checkbox"
                    checked={closingConfirmed}
                    onChange={(e) => setClosingConfirmed(e.target.checked)}
                    disabled={inFlight}
                  />
                  <span>{t("stores.alerts.closingConfirmed")}</span>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-ui-border-base">
              <Button
                type="button"
                variant="secondary"
                disabled={inFlight}
                onClick={() => setReasonModal(null)}
              >
                İptal
              </Button>
              <Button
                type="button"
                variant={reasonModal.type.startsWith("reject") || reasonModal.type === "start_closing" ? "danger" : "primary"}
                disabled={
                  inFlight ||
                  reasonText.trim().length < 10 ||
                  (reasonModal.type === "start_closing" && !closingConfirmed)
                }
                onClick={() => void submitReasonAction()}
              >
                Onayla ve Kaydet
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
