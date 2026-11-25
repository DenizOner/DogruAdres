import React, { useState, useEffect, useRef } from "react"
import { Badge, Button, Heading, Text, Label } from "@medusajs/ui"
import { XMark, Check, ChatBubble, InformationCircle } from "@medusajs/icons"
import { useTranslation } from "react-i18next"
import type { VendorReturnRequest, ReturnStatus } from "../types"
import {
  canApproveReturn,
  canRejectReturn,
  getReasonLabel,
  validateRejectionReason,
  validateReviewNote,
} from "../validation"

interface ReturnDetailModalProps {
  isOpen: boolean
  returnRequest: VendorReturnRequest | null
  onClose: () => void
  onApprove: (returnId: string) => Promise<void>
  onReject: (returnId: string, reason: string) => Promise<void>
  onAddNote: (returnId: string, note: string) => Promise<void>
  submitting: boolean
}

export const ReturnDetailModal: React.FC<ReturnDetailModalProps> = ({
  isOpen,
  returnRequest,
  onClose,
  onApprove,
  onReject,
  onAddNote,
  submitting,
}) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<"details" | "notes" | "reject">("details")
  const [rejectionReason, setRejectionReason] = useState("")
  const [rejectionError, setRejectionError] = useState("")
  const [newNote, setNewNote] = useState("")
  const [noteError, setNoteError] = useState("")

  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const rejectionInputRef = useRef<HTMLTextAreaElement>(null)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const prevReturnIdRef = useRef<string | null>(null)

  // Reset local form states when modal opens or return request ID changes (preserves tab on note addition)
  useEffect(() => {
    if (isOpen) {
      if (prevReturnIdRef.current !== returnRequest?.id) {
        setActiveTab("details")
        setRejectionReason("")
        setRejectionError("")
        setNewNote("")
        setNoteError("")
        prevReturnIdRef.current = returnRequest?.id ?? null
      }
    } else {
      prevReturnIdRef.current = null
    }
  }, [isOpen, returnRequest?.id])

  // Accessibility: Focus trap & Escape key handling (WCAG 2.2 SC 2.1.2)
  useEffect(() => {
    if (!isOpen) return

    const timer = setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 50)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!submitting) {
          onClose()
        }
        return
      }

      if (e.key === "Tab") {
        const container = modalRef.current
        if (!container) return
        const focusable = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.closest("[aria-hidden='true']"))

        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement

        if (!container.contains(active)) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
          return
        }

        if (e.shiftKey) {
          if (active === first || active === container) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (active === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, submitting, onClose])

  if (!isOpen || !returnRequest) return null

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

  const handleApprove = async () => {
    await onApprove(returnRequest.id)
  }

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const error = validateRejectionReason(rejectionReason, t)
    if (error) {
      setRejectionError(error)
      rejectionInputRef.current?.focus()
      return
    }
    setRejectionError("")
    await onReject(returnRequest.id, rejectionReason.trim())
  }

  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const error = validateReviewNote(newNote, t)
    if (error) {
      setNoteError(error)
      noteInputRef.current?.focus()
      return
    }
    setNoteError("")
    await onAddNote(returnRequest.id, newNote.trim())
    setNewNote("")
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-modal-title"
      ref={modalRef}
    >
      <div className="relative w-full max-w-3xl my-8 bg-white dark:bg-ui-bg-base border border-ui-border-base rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border-base bg-ui-bg-subtle">
          <div className="flex items-center gap-3">
            <Heading level="h2" id="return-modal-title" className="text-lg font-semibold text-ui-fg-base">
              {t("returns.detail.modalTitle", { id: returnRequest.order_display_id })}
            </Heading>
            {getStatusBadge(returnRequest.status)}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={t("returns.actions.closeModal")}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 rounded-lg text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base-hover focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none transition-colors"
          >
            <XMark className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-ui-border-base bg-ui-bg-subtle px-6 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`min-h-[44px] px-4 py-2 text-sm font-medium border-b-2 transition-colors focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none ${
              activeTab === "details"
                ? "border-violet-600 text-violet-600 font-semibold"
                : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            {t("returns.detail.tabDetails")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("notes")}
            className={`min-h-[44px] px-4 py-2 text-sm font-medium border-b-2 transition-colors focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none ${
              activeTab === "notes"
                ? "border-violet-600 text-violet-600 font-semibold"
                : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
            }`}
          >
            {t("returns.detail.tabNotes")} ({returnRequest.review_notes.length})
          </button>
          {canRejectReturn(returnRequest.status) && (
            <button
              type="button"
              onClick={() => setActiveTab("reject")}
              className={`min-h-[44px] px-4 py-2 text-sm font-medium border-b-2 transition-colors focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none ${
                activeTab === "reject"
                  ? "border-red-600 text-red-600 font-semibold"
                  : "border-transparent text-ui-fg-subtle hover:text-ui-fg-base"
              }`}
            >
              {t("returns.actions.rejectReturn")}
            </button>
          )}
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === "details" && (
            <div className="space-y-6">
              {/* Order & Buyer Info Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base">
                <div>
                  <Text className="text-xs font-semibold text-ui-fg-muted uppercase tracking-wider">
                    {t("returns.table.buyerOrg")}
                  </Text>
                  <Text className="text-sm font-medium text-ui-fg-base mt-1">
                    {returnRequest.buyer_organization_name}
                  </Text>
                  <Text className="text-xs text-ui-fg-subtle">
                    ID: {returnRequest.buyer_organization_id}
                  </Text>
                </div>
                <div>
                  <Text className="text-xs font-semibold text-ui-fg-muted uppercase tracking-wider">
                    {t("returns.table.orderId")}
                  </Text>
                  <Text className="text-sm font-medium text-ui-fg-base mt-1">
                    #{returnRequest.order_display_id}
                  </Text>
                  <Text className="text-xs text-ui-fg-subtle">
                    {t("returns.table.date")}: {new Date(returnRequest.created_at).toLocaleDateString()}
                  </Text>
                </div>
              </div>

              {/* Returned Items List */}
              <div>
                <Heading level="h3" className="text-base font-semibold text-ui-fg-base mb-3">
                  {t("returns.detail.itemsTitle")} ({returnRequest.items.length})
                </Heading>
                {returnRequest.items.length === 0 ? (
                  <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base text-xs text-ui-fg-muted">
                    {t("returns.detail.itemsPendingBackend")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {returnRequest.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-lg border border-ui-border-base bg-ui-bg-base flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <Text className="text-sm font-semibold text-ui-fg-base">
                            {item.title}
                          </Text>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-ui-fg-subtle">
                            <span className="font-mono bg-ui-bg-subtle px-2 py-0.5 rounded border border-ui-border-base">
                              SKU: {item.sku}
                            </span>
                            <span>•</span>
                            <span>
                              {t("returns.detail.quantity")}: {item.quantity}
                            </span>
                            <span>•</span>
                            <span className="font-medium text-ui-fg-base">
                              {item.unit_price ? `${item.unit_price.toFixed(2)} ${item.currency_code}` : ""}
                            </span>
                          </div>
                          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs">
                            <InformationCircle className="w-4 h-4 flex-shrink-0" />
                            <span>
                              <strong>{t("returns.detail.reasonLabel")}:</strong> {getReasonLabel(item.reason_code, t)}
                              {item.reason_note ? ` — ${item.reason_note}` : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Rejection / Decision Note Display if Canceled */}
              {returnRequest.status === "canceled" && returnRequest.seller_decision_reason && (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                  <Text className="text-xs font-semibold text-red-800 dark:text-red-200 uppercase tracking-wider">
                    {t("returns.detail.rejectionReasonTitle")}
                  </Text>
                  <Text className="text-sm text-red-900 dark:text-red-100 mt-1">
                    {returnRequest.seller_decision_reason}
                  </Text>
                </div>
              )}
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === "notes" && (
            <div className="space-y-6">
              {/* Existing Notes Timeline */}
              <div className="space-y-3">
                {returnRequest.review_notes.length === 0 ? (
                  <div className="p-6 text-center text-ui-fg-subtle bg-ui-bg-subtle rounded-lg border border-dashed border-ui-border-base">
                    <ChatBubble className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <Text className="text-sm">{t("returns.detail.noNotes")}</Text>
                  </div>
                ) : (
                  returnRequest.review_notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs text-ui-fg-subtle">
                        <span className="font-semibold text-ui-fg-base">{note.author}</span>
                        <span>{new Date(note.created_at).toLocaleString()}</span>
                      </div>
                      <Text className="text-sm text-ui-fg-base mt-1 whitespace-pre-wrap">
                        {note.note}
                      </Text>
                    </div>
                  ))
                )}
              </div>

              {/* Add Note Form */}
              <form onSubmit={handleAddNoteSubmit} className="space-y-3 pt-4 border-t border-ui-border-base">
                <Label htmlFor="seller-review-note" className="text-sm font-semibold text-ui-fg-base">
                  {t("returns.actions.addNoteLabel")}
                </Label>
                <textarea
                  id="seller-review-note"
                  ref={noteInputRef}
                  rows={3}
                  value={newNote}
                  onChange={(e) => {
                    setNewNote(e.target.value)
                    if (noteError) setNoteError("")
                  }}
                  placeholder={t("returns.actions.addNotePlaceholder")}
                  disabled={submitting}
                  className="w-full p-3 text-sm rounded-lg border border-ui-border-base bg-ui-bg-base text-ui-fg-base placeholder:text-ui-fg-muted focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none"
                />
                {noteError && (
                  <Text className="text-xs font-medium text-red-600">{noteError}</Text>
                )}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={submitting || !newNote.trim()}
                    className="min-h-[44px] min-w-[44px] px-4 font-medium focus-visible:ring-2 focus-visible:ring-violet-600"
                  >
                    {submitting ? t("returns.actions.submitting") : t("returns.actions.saveNoteBtn")}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Rejection Tab */}
          {activeTab === "reject" && canRejectReturn(returnRequest.status) && (
            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-800 dark:text-red-200">
                <Text className="font-semibold">{t("returns.actions.rejectWarningTitle")}</Text>
                <Text className="text-xs mt-1">{t("returns.actions.rejectWarningDesc")}</Text>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejection-reason" className="text-sm font-semibold text-ui-fg-base">
                  {t("returns.actions.rejectReasonLabel")} <span className="text-red-600">*</span>
                </Label>
                <textarea
                  id="rejection-reason"
                  ref={rejectionInputRef}
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value)
                    if (rejectionError) setRejectionError("")
                  }}
                  placeholder={t("returns.actions.rejectReasonPlaceholder")}
                  disabled={submitting}
                  aria-required="true"
                  aria-invalid={!!rejectionError}
                  aria-describedby={rejectionError ? "rejection-error-msg" : undefined}
                  className="w-full p-3 text-sm rounded-lg border border-ui-border-base bg-ui-bg-base text-ui-fg-base placeholder:text-ui-fg-muted focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none"
                />
                {rejectionError && (
                  <Text id="rejection-error-msg" className="text-xs font-medium text-red-600">
                    {rejectionError}
                  </Text>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActiveTab("details")}
                  disabled={submitting}
                  className="min-h-[44px] min-w-[44px] px-4 font-medium"
                >
                  {t("returns.actions.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={submitting}
                  className="min-h-[44px] min-w-[44px] px-4 font-medium focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  {submitting ? t("returns.actions.submitting") : t("returns.actions.confirmRejectBtn")}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer with Primary Actions */}
        {activeTab === "details" && (
          <div className="flex flex-wrap items-center justify-between px-6 py-4 border-t border-ui-border-base bg-ui-bg-subtle gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[44px] min-w-[44px] px-4 font-medium"
            >
              {t("returns.actions.closeModal")}
            </Button>

            <div className="flex flex-wrap items-center gap-3">
              {canRejectReturn(returnRequest.status) && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setActiveTab("reject")}
                  disabled={submitting}
                  className="min-h-[44px] min-w-[44px] px-4 font-medium focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  {t("returns.actions.rejectReturn")}
                </Button>
              )}

              {canApproveReturn(returnRequest.status) && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleApprove}
                  disabled={submitting}
                  className="min-h-[44px] min-w-[44px] px-5 font-semibold bg-green-600 hover:bg-green-700 text-white focus-visible:ring-2 focus-visible:ring-green-600 inline-flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {submitting ? t("returns.actions.submitting") : t("returns.actions.approveReturn")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
