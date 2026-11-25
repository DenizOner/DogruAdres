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
import { Buildings, CheckCircle, XCircle, ArrowPath, Eye } from "@medusajs/icons"
import { useTranslation } from "react-i18next"
import { apiGet, apiPost, ApiError } from "../../lib/api"

export const config = {
  public: true,
  label: "Şirketler & Başvurular",
  icon: Buildings,
  rank: 2,
}

interface ApplicationDocument {
  mime_type: string
  original_byte_length: number
  original_sha256: string
  version: number
}

interface OrganizationApplicationItem {
  id: string
  applicant_person_id: string
  business_kind: "legal_company" | "individual_business"
  legal_name: string
  landline_phone: string
  tax_identifier: string | null
  declared_activities: string[]
  primary_activity: string
  status: "submitted" | "in_review" | "approved" | "rejected" | "correction_requested" | "draft" | "withdrawn"
  version: number
  duplicate_review_required: boolean
  created_at: string
  updated_at: string
  has_document: boolean
  document?: ApplicationDocument
}

interface ReviewQueueResponse {
  applications: OrganizationApplicationItem[]
  next_cursor: string | null
}

type TabType = "all" | "submitted" | "in_review"

export default function OrganizationsPage() {
  const { t } = useTranslation()
  const [applications, setApplications] = useState<OrganizationApplicationItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [currentTab, setCurrentTab] = useState<TabType>("all")
  const [selectedApp, setSelectedApp] = useState<OrganizationApplicationItem | null>(null)
  const [notes, setNotes] = useState<string>("")
  const [inFlight, setInFlight] = useState<boolean>(false)

  // Cursor-based pagination state
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null])
  const [cursorIndex, setCursorIndex] = useState<number>(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  // Document preview state with strict application binding
  const [previewLoading, setPreviewLoading] = useState<boolean>(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewForAppId, setPreviewForAppId] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const activePreviewAppId = useRef<string | null>(null)

  const activeSeq = useRef(0)

  const loadApplications = useCallback(
    async (cursor?: string | null) => {
      const seq = ++activeSeq.current
      setLoading(true)
      setErrorMsg(null)
      try {
        const queryParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
        const data = await apiGet<ReviewQueueResponse>(
          `/platform/organization-applications?action=review_queue${queryParam}`
        )
        if (seq !== activeSeq.current) return
        setApplications(data.applications || [])
        setNextCursor(data.next_cursor || null)
      } catch (err) {
        if (seq !== activeSeq.current) return
        const message = err instanceof Error ? err.message : t("organizations.alerts.loadError")
        setErrorMsg(message)
      } finally {
        if (seq === activeSeq.current) {
          setLoading(false)
        }
      }
    },
    [t]
  )

  useEffect(() => {
    void loadApplications(null)
    return () => {
      activeSeq.current++
      activePreviewAppId.current = null
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [loadApplications])

  const handleNextPage = () => {
    if (!nextCursor || inFlight || loading) return
    const newStack = [...cursorStack.slice(0, cursorIndex + 1), nextCursor]
    setCursorStack(newStack)
    setCursorIndex(cursorIndex + 1)
    void loadApplications(nextCursor)
  }

  const handlePrevPage = () => {
    if (cursorIndex <= 0 || inFlight || loading) return
    const prevIdx = cursorIndex - 1
    const prevCursor = cursorStack[prevIdx]
    setCursorIndex(prevIdx)
    void loadApplications(prevCursor)
  }

  const openReviewModal = (app: OrganizationApplicationItem) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    activePreviewAppId.current = app.id
    setSelectedApp(app)
    setNotes("")
    setPreviewForAppId(null)
    setPreviewError(null)
  }

  const closeReviewModal = () => {
    if (inFlight) return
    activePreviewAppId.current = null
    setSelectedApp(null)
    setNotes("")
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setPreviewForAppId(null)
    setPreviewError(null)
  }

  const loadSafePreview = async (appId: string) => {
    if (previewLoading || inFlight) return
    activePreviewAppId.current = appId
    setPreviewLoading(true)
    setPreviewError(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setPreviewForAppId(null)

    try {
      const response = await fetch(
        `/platform/organization-applications?action=review_preview&application_id=${encodeURIComponent(appId)}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      )

      if (!response.ok) {
        throw new Error(response.status === 403 ? "Erişim reddedildi" : "Önizleme oluşturulamadı")
      }

      const blob = await response.blob()

      // Guard against stale response if user switched applications or closed modal
      if (activePreviewAppId.current !== appId) {
        return
      }

      const objectUrl = URL.createObjectURL(blob)
      setPreviewUrl(objectUrl)
      setPreviewForAppId(appId)
    } catch (err) {
      if (activePreviewAppId.current === appId) {
        setPreviewError(err instanceof Error ? err.message : "Önizleme yüklenemedi")
      }
    } finally {
      if (activePreviewAppId.current === appId) {
        setPreviewLoading(false)
      }
    }
  }

  const handleDecision = async (
    decision: "start_review" | "request_correction" | "reject" | "approve"
  ) => {
    if (!selectedApp || inFlight) return

    const trimmedNotes = notes.trim()
    if ((decision === "request_correction" || decision === "reject") && trimmedNotes.length < 2) {
      setErrorMsg(t("organizations.modal.notesRequired"))
      return
    }

    if (decision === "approve" && !window.confirm(t("organizations.modal.confirmApprove"))) {
      return
    }

    if (decision === "start_review" && !window.confirm(t("organizations.modal.confirmStartReview"))) {
      return
    }

    setInFlight(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const payload: {
        action: "review_decision"
        application_id: string
        expected_version: number
        decision: "start_review" | "request_correction" | "reject" | "approve"
        notes?: string
      } = {
        action: "review_decision",
        application_id: selectedApp.id,
        expected_version: selectedApp.version,
        decision,
      }

      if (trimmedNotes.length > 0) {
        payload.notes = trimmedNotes
      }

      await apiPost("/platform/organization-applications", payload)
      setSuccessMsg(t("organizations.alerts.actionSuccess"))
      closeReviewModal()
      const currentCursor = cursorStack[cursorIndex]
      await loadApplications(currentCursor)
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        setErrorMsg(t("organizations.alerts.conflictError"))
        closeReviewModal()
        const currentCursor = cursorStack[cursorIndex]
        await loadApplications(currentCursor)
      } else {
        const message = err instanceof Error ? err.message : "İşlem başarısız"
        setErrorMsg(t("organizations.alerts.actionError", { error: message }))
      }
    } finally {
      setInFlight(false)
    }
  }

  const filteredApps = applications.filter((item) => {
    if (currentTab === "submitted") return item.status === "submitted"
    if (currentTab === "in_review") return item.status === "in_review"
    return true
  })

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "submitted":
        return <Badge color="orange">{t("organizations.status.submitted")}</Badge>
      case "in_review":
        return <Badge color="purple">{t("organizations.status.in_review")}</Badge>
      case "approved":
      case "active":
        return <Badge color="green">{t("organizations.status.approved")}</Badge>
      case "rejected":
        return <Badge color="red">{t("organizations.status.rejected")}</Badge>
      case "correction_requested":
        return <Badge color="blue">{t("organizations.status.correction_requested")}</Badge>
      case "suspended":
        return <Badge color="red">{t("organizations.status.suspended")}</Badge>
      default:
        return <Badge color="grey">{status}</Badge>
    }
  }

  const isPreviewVerifiedForSelected = Boolean(
    selectedApp && previewUrl && previewForAppId === selectedApp.id
  )

  return (
    <div className="space-y-6 max-w-7xl pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Heading level="h1">{t("organizations.title")}</Heading>
          <Text className="text-ui-fg-subtle">{t("organizations.description")}</Text>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={loading || inFlight}
          onClick={() => {
            setCursorIndex(0)
            setCursorStack([null])
            void loadApplications(null)
          }}
          className="self-start sm:self-auto"
        >
          <ArrowPath className="w-4 h-4 mr-2" />
          {t("organizations.alerts.refreshBtn")}
        </Button>
      </div>

      {errorMsg && (
        <Alert variant="error" className="mb-4" role="alert">
          {errorMsg}
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" className="mb-4" role="status" aria-live="polite">
          {successMsg}
        </Alert>
      )}

      {/* Tabs with keyboard accessibility */}
      <div className="flex border-b border-ui-border-base gap-2" role="tablist" aria-label="Başvuru durum filtreleri">
        {(["all", "submitted", "in_review"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={currentTab === tab}
            tabIndex={0}
            onClick={() => setCurrentTab(tab)}
            className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors ${
              currentTab === tab
                ? "border-ui-border-interactive text-ui-fg-base"
                : "border-transparent text-ui-fg-muted hover:text-ui-fg-base"
            }`}
          >
            {t(`organizations.tabs.${tab}`)}
            <span className="ml-2 py-0.5 px-1.5 text-xs rounded-full bg-ui-bg-subtle text-ui-fg-subtle">
              {tab === "all"
                ? applications.length
                : tab === "submitted"
                ? applications.filter((a) => a.status === "submitted").length
                : applications.filter((a) => a.status === "in_review").length}
            </span>
          </button>
        ))}
      </div>

      {/* Applications Table & Pagination */}
      <Container className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-ui-fg-muted" role="status" aria-live="polite">
            {t("organizations.alerts.loading")}
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="p-8 text-center text-ui-fg-muted" role="status" aria-live="polite">
            {t("organizations.alerts.emptyList")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-label={t("organizations.title")}>
              <thead className="bg-ui-bg-subtle text-ui-fg-subtle border-b border-ui-border-base">
                <tr>
                  <th scope="col" className="py-3 px-4 font-semibold">{t("organizations.table.legalName")}</th>
                  <th scope="col" className="py-3 px-4 font-semibold">{t("organizations.table.businessKind")}</th>
                  <th scope="col" className="py-3 px-4 font-semibold">{t("organizations.table.taxIdentifier")}</th>
                  <th scope="col" className="py-3 px-4 font-semibold">{t("organizations.table.phone")}</th>
                  <th scope="col" className="py-3 px-4 font-semibold">{t("organizations.table.status")}</th>
                  <th scope="col" className="py-3 px-4 font-semibold">{t("organizations.table.document")}</th>
                  <th scope="col" className="py-3 px-4 font-semibold text-right">{t("organizations.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border-base">
                {filteredApps.map((item) => (
                  <tr key={item.id} className="hover:bg-ui-bg-subtle-hover transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-ui-fg-base">{item.legal_name}</div>
                      {item.duplicate_review_required && (
                        <span className="inline-block mt-1">
                          <Badge color="orange" size="small">
                            {t("organizations.badges.duplicateReview")}
                          </Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-ui-fg-subtle">
                      {t(`organizations.businessKind.${item.business_kind}`)}
                    </td>
                    <td className="py-3 px-4 font-mono text-ui-fg-base">
                      {item.tax_identifier || "-"}
                    </td>
                    <td className="py-3 px-4 text-ui-fg-subtle">
                      {item.landline_phone}
                    </td>
                    <td className="py-3 px-4">
                      {renderStatusBadge(item.status)}
                    </td>
                    <td className="py-3 px-4">
                      {item.has_document ? (
                        <Badge color="blue" size="small">
                          {t("organizations.badges.hasDocument")}
                        </Badge>
                      ) : (
                        <Badge color="grey" size="small">
                          {t("organizations.badges.noDocument")}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        type="button"
                        size="small"
                        variant="secondary"
                        onClick={() => openReviewModal(item)}
                        aria-label={`${item.legal_name} - ${t("organizations.modal.viewModalBtn")}`}
                      >
                        <Eye className="w-4 h-4 mr-1.5" />
                        {t("organizations.modal.viewModalBtn")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cursor-based pagination controls */}
        {(cursorIndex > 0 || nextCursor) && (
          <div className="flex items-center justify-between p-4 border-t border-ui-border-base">
            <Button
              type="button"
              size="small"
              variant="secondary"
              disabled={cursorIndex <= 0 || loading || inFlight}
              onClick={handlePrevPage}
            >
              Önceki Sayfa
            </Button>
            <span className="text-xs text-ui-fg-subtle">
              Sayfa {cursorIndex + 1}
            </span>
            <Button
              type="button"
              size="small"
              variant="secondary"
              disabled={!nextCursor || loading || inFlight}
              onClick={handleNextPage}
            >
              Sonraki Sayfa
            </Button>
          </div>
        )}
      </Container>

      {/* Review & Decision Modal */}
      {selectedApp && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !inFlight) closeReviewModal()
          }}
        >
          <div className="bg-ui-bg-base border border-ui-border-base rounded-lg max-w-3xl w-full p-6 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-ui-border-base pb-4">
              <div>
                <Heading level="h2" id="review-modal-title">
                  {selectedApp.legal_name}
                </Heading>
                <Text className="text-ui-fg-subtle text-sm">
                  {t(`organizations.businessKind.${selectedApp.business_kind}`)} — VKN/TCKN: {selectedApp.tax_identifier || "-"}
                </Text>
              </div>
              <div className="flex items-center gap-2">
                {renderStatusBadge(selectedApp.status)}
                {selectedApp.duplicate_review_required && (
                  <Badge color="orange">{t("organizations.badges.duplicateReview")}</Badge>
                )}
              </div>
            </div>

            {/* Application info grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-ui-bg-subtle p-4 rounded-md">
              <div>
                <span className="font-semibold text-ui-fg-subtle block">{t("organizations.table.phone")}:</span>
                <span className="text-ui-fg-base">{selectedApp.landline_phone}</span>
              </div>
              <div>
                <span className="font-semibold text-ui-fg-subtle block">{t("organizations.table.date")}:</span>
                <span className="text-ui-fg-base">{new Date(selectedApp.created_at).toLocaleString("tr-TR")}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="font-semibold text-ui-fg-subtle block">{t("organizations.table.activities")}:</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {selectedApp.declared_activities.map((act) => (
                    <Badge key={act} color={act === selectedApp.primary_activity ? "purple" : "grey"} size="small">
                      {t(`organizations.activity.${act}`, { defaultValue: act })}
                      {act === selectedApp.primary_activity && " (Öncelikli)"}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Safe Document Preview */}
            {selectedApp.has_document && (
              <div className="space-y-3 border border-ui-border-base p-4 rounded-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-ui-fg-base text-sm">
                      {t("organizations.modal.documentPreviewTitle")}
                    </h3>
                    <p className="text-xs text-ui-fg-subtle">
                      {isPreviewVerifiedForSelected
                        ? t("organizations.modal.documentVerifiedNotice")
                        : t("organizations.modal.documentPendingNotice")}
                    </p>
                  </div>
                  {!isPreviewVerifiedForSelected && (
                    <Button
                      type="button"
                      size="small"
                      variant="secondary"
                      disabled={previewLoading || inFlight}
                      onClick={() => void loadSafePreview(selectedApp.id)}
                    >
                      <Eye className="w-4 h-4 mr-1.5" />
                      {previewLoading ? "Taranıyor..." : t("organizations.modal.loadPreviewBtn")}
                    </Button>
                  )}
                </div>

                {previewError && (
                  <Alert variant="error">
                    {previewError}
                  </Alert>
                )}

                {isPreviewVerifiedForSelected && previewUrl && (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Vergi levhasının rasterize edilmiş güvenli sayfaları"
                    className="max-h-96 overflow-y-auto border border-ui-border-base rounded bg-neutral-900 flex justify-center p-2"
                  >
                    <img
                      src={previewUrl}
                      alt="Vergi levhası güvenli önizleme"
                      className="max-w-full h-auto object-contain"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Notes input */}
            <div className="space-y-2">
              <label htmlFor="review-notes" className="font-semibold text-sm text-ui-fg-base block">
                {t("organizations.modal.notesLabel")}
              </label>
              <Input
                id="review-notes"
                placeholder={t("organizations.modal.notesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={inFlight}
                maxLength={1000}
              />
            </div>

            {/* Decision Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-ui-border-base">
              <Button
                type="button"
                variant="secondary"
                disabled={inFlight}
                onClick={closeReviewModal}
              >
                {t("organizations.modal.closeBtn")}
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                {selectedApp.status === "submitted" && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={inFlight}
                    onClick={() => void handleDecision("start_review")}
                  >
                    {t("organizations.modal.startReviewBtn")}
                  </Button>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  disabled={inFlight}
                  onClick={() => void handleDecision("request_correction")}
                >
                  {t("organizations.modal.requestCorrectionBtn")}
                </Button>

                <Button
                  type="button"
                  variant="danger"
                  disabled={inFlight}
                  onClick={() => void handleDecision("reject")}
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  {t("organizations.modal.rejectBtn")}
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  disabled={inFlight}
                  onClick={() => void handleDecision("approve")}
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  {t("organizations.modal.approveBtn")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
