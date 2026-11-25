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
  TruckFast,
  Plus,
  PencilSquare,
  Trash,
  MagnifyingGlass,
  BuildingStorefront,
  InformationCircle,
} from "@medusajs/icons"
import { defineRouteConfig } from "@mercurjs/dashboard-sdk"
import { useTranslation } from "react-i18next"
import {
  type VehicleItem,
  type OrgInfo,
  type VehicleFormValues,
  initialFormValues,
  validateVehicleForm,
  canDeleteVehicle,
} from "./validation"

export const config = defineRouteConfig({
  label: "Müşteri Araçları",
  icon: TruckFast,
  rank: 15,
})

export type { VehicleItem, OrgInfo, VehicleFormValues }

export default function VehiclesPage() {
  const { t } = useTranslation()
  const tRef = useRef(t)
  tRef.current = t
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [organizations, setOrganizations] = useState<OrgInfo[]>([])
  const [activeOrg, setActiveOrg] = useState<OrgInfo | null>(null)
  const [vehicles, setVehicles] = useState<VehicleItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  const [modalMode, setModalMode] = useState<"none" | "create" | "edit" | "delete">("none")
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleItem | null>(null)
  const [formValues, setFormValues] = useState<VehicleFormValues>(initialFormValues)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const [statusMessage, setStatusMessage] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [csrfToken, setCsrfToken] = useState<string>("")

  // Fetch CSRF token from personal session for mutation requests
  useEffect(() => {
    fetch("/personal/session", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.csrf_token === "string") {
          setCsrfToken(data.csrf_token)
        }
      })
      .catch(() => {})
  }, [])

  const modalRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)
  const triggerButtonRef = useRef<HTMLElement | null>(null)
  const activeOrgFetchRef = useRef<string>("")
  const abortControllerRef = useRef<AbortController | null>(null)

  // 1. Fetch user organizations
  const fetchOrganizations = useCallback(async () => {
    setLoadingOrgs(true)
    setErrorMessage("")
    try {
      const res = await fetch("/personal/organizations", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setErrorMessage(tRef.current("vehicles.errorSessionExpired"))
        } else {
          setErrorMessage(tRef.current("vehicles.errorOrgFetchFailed"))
        }
        return
      }
      const data = await res.json()
      const orgList: OrgInfo[] = Array.isArray(data.organizations)
        ? data.organizations
        : data.id
        ? [{ id: data.id, name: data.name || data.id, role: data.role || "member", status: data.status || "active" }]
        : []

      setOrganizations(orgList)
      if (orgList.length > 0) {
        // Default to first active org
        setActiveOrg(orgList[0])
      }
    } catch {
      setErrorMessage(tRef.current("vehicles.errorOrgConnection"))
    } finally {
      setLoadingOrgs(false)
    }
  }, [])

  useEffect(() => {
    void fetchOrganizations()
  }, [fetchOrganizations])

  // 2. Fetch customer vehicles for active organization
  //    Uses AbortController to cancel in-flight requests on org switch (race guard)
  const fetchVehicles = useCallback(async (orgId: string) => {
    // Cancel any previous in-flight fetch to prevent cross-org display
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller
    activeOrgFetchRef.current = orgId

    setLoadingVehicles(true)
    setErrorMessage("")
    setVehicles([]) // Clear immediately to prevent cross-org vehicle display

    try {
      const res = await fetch(
        `/organization/vehicles?organization=${encodeURIComponent(orgId)}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        }
      )

      // Guard: ignore response if org has changed since this fetch was started
      if (activeOrgFetchRef.current !== orgId) return

      if (res.status === 403) {
        setErrorMessage(tRef.current("vehicles.errorForbidden"))
        setVehicles([])
        return
      }
      if (!res.ok) {
        setErrorMessage(tRef.current("vehicles.errorVehicleFetchFailed"))
        return
      }
      const data = await res.json()
      if (activeOrgFetchRef.current === orgId) {
        setVehicles(Array.isArray(data.vehicles) ? data.vehicles : [])
      }
    } catch (err: unknown) {
      const error = err as { name?: string }
      if (error?.name === "AbortError") return // Intentional cancellation — not an error
      if (activeOrgFetchRef.current === orgId) {
        setErrorMessage(tRef.current("vehicles.errorVehicleConnection"))
      }
    } finally {
      if (activeOrgFetchRef.current === orgId) {
        setLoadingVehicles(false)
      }
    }
  }, [])

  useEffect(() => {
    if (activeOrg) {
      void fetchVehicles(activeOrg.id)
    }
  }, [activeOrg, fetchVehicles])

  // Filtered vehicles based on search query
  const filteredVehicles = useMemo(() => {
    if (!searchQuery.trim()) return vehicles
    const q = searchQuery.trim().toLowerCase()
    return vehicles.filter((v) => {
      const matchPlate = v.plate?.toLowerCase().includes(q) || v.plate_key?.toLowerCase().includes(q)
      const matchVin = v.vin?.toLowerCase().includes(q) || v.vin_key?.toLowerCase().includes(q)
      const matchMake = v.make?.toLowerCase().includes(q)
      const matchModel = v.model?.toLowerCase().includes(q)
      const matchLabel = v.label?.toLowerCase().includes(q)
      const matchYear = v.model_year ? String(v.model_year).includes(q) : false
      return matchPlate || matchVin || matchMake || matchModel || matchLabel || matchYear
    })
  }, [vehicles, searchQuery])

  // Close modal and return focus to the element that triggered it
  const closeModal = useCallback(() => {
    setModalMode("none")
    setSelectedVehicle(null)
    setFormValues(initialFormValues)
    setFormErrors({})
    // Return focus to the trigger button for keyboard users (WCAG 2.1 SC 2.4.3)
    setTimeout(() => {
      triggerButtonRef.current?.focus()
      triggerButtonRef.current = null
    }, 0)
  }, [])

  // Full focus trap and Esc key for modal accessibility (WCAG 2.1 SC 2.1.2)
  useEffect(() => {
    if (modalMode === "none") return

    const FOCUSABLE =
      'a[href],area[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])'

    // Set initial focus: Plate input for create/edit, Cancel button for delete
    const timer = setTimeout(() => {
      if (modalMode === "delete") {
        cancelDeleteRef.current?.focus()
      } else {
        firstInputRef.current?.focus()
      }
    }, 50)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal()
        return
      }

      if (e.key === "Tab") {
        const container = modalRef.current
        if (!container) return
        const focusableEls = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => !el.closest("[aria-hidden='true']")
        )
        if (focusableEls.length === 0) return

        const first = focusableEls[0]
        const last = focusableEls[focusableEls.length - 1]

        if (e.shiftKey) {
          // Shift+Tab: wrap backward from first to last
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          // Tab: wrap forward from last to first
          if (document.activeElement === last) {
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
  }, [modalMode, closeModal])

  const openCreateModal = (e: React.MouseEvent<HTMLElement>) => {
    triggerButtonRef.current = e.currentTarget
    setFormValues(initialFormValues)
    setFormErrors({})
    setModalMode("create")
  }

  const openEditModal = (vehicle: VehicleItem, e: React.MouseEvent<HTMLElement>) => {
    triggerButtonRef.current = e.currentTarget
    setSelectedVehicle(vehicle)
    setFormValues({
      plate: vehicle.plate || "",
      vin: vehicle.vin || "",
      label: vehicle.label || "",
      make: vehicle.make || "",
      model: vehicle.model || "",
      model_year: vehicle.model_year ? String(vehicle.model_year) : "",
    })
    setFormErrors({})
    setModalMode("edit")
  }

  const openDeleteModal = (vehicle: VehicleItem, e: React.MouseEvent<HTMLElement>) => {
    triggerButtonRef.current = e.currentTarget
    setSelectedVehicle(vehicle)
    setModalMode("delete")
  }

  // Handle Create or Update submission
  //   Routes through /organization/vehicles (organization-scoped session auth) — #482
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeOrg) return

    const errors = validateVehicleForm(formValues, t)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setSubmitting(true)
    setErrorMessage("")
    setStatusMessage("")

    const payload: Record<string, unknown> = {
      organization_id: activeOrg.id,
      action: modalMode === "create" ? "create" : "update",
    }

    if (modalMode === "edit" && selectedVehicle?.id) {
      payload.vehicle_id = selectedVehicle.id
    }

    if (formValues.plate.trim()) payload.plate = formValues.plate.trim()
    else if (modalMode === "edit") payload.plate = null

    if (formValues.vin.trim()) payload.vin = formValues.vin.trim()
    else if (modalMode === "edit") payload.vin = null

    if (formValues.label.trim()) payload.label = formValues.label.trim()
    else if (modalMode === "edit") payload.label = null

    if (formValues.make.trim()) payload.make = formValues.make.trim()
    else if (modalMode === "edit") payload.make = null

    if (formValues.model.trim()) payload.model = formValues.model.trim()
    else if (modalMode === "edit") payload.model = null

    if (formValues.model_year.trim()) payload.model_year = Number(formValues.model_year)
    else if (modalMode === "edit") payload.model_year = null

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      }
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken
      }

      const res = await fetch("/organization/vehicles", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers,
        body: JSON.stringify(payload),
      })

      if (res.status === 503) {
        setErrorMessage(t("vehicles.errorServiceUnavailable"))
        return
      }

      if (res.status === 409) {
        setErrorMessage(t("vehicles.errorDuplicate"))
        return
      }

      if (res.status === 403) {
        setErrorMessage(t("vehicles.errorActionForbidden"))
        return
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const msg = (errorData as { message?: string }).message || t("vehicles.errorSaveFailed")
        setErrorMessage(msg)
        return
      }

      setStatusMessage(
        modalMode === "create"
          ? t("vehicles.successCreate")
          : t("vehicles.successUpdate")
      )
      closeModal()
      await fetchVehicles(activeOrg.id)
    } catch {
      setErrorMessage(t("vehicles.errorSaveConnection"))
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Delete confirmation
  //   Routes through /organization/vehicles (organization-scoped session auth) — #482
  const handleDeleteConfirm = async () => {
    if (!activeOrg || !selectedVehicle) return
    setSubmitting(true)
    setErrorMessage("")
    setStatusMessage("")
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      }
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken
      }

      const res = await fetch("/organization/vehicles", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          action: "delete",
          organization_id: activeOrg.id,
          vehicle_id: selectedVehicle.id,
        }),
      })

      if (res.status === 503) {
        setErrorMessage(t("vehicles.errorDeleteUnavailable"))
        return
      }

      if (res.status === 403) {
        setErrorMessage(t("vehicles.errorDeleteForbidden"))
        return
      }

      if (!res.ok) {
        setErrorMessage(t("vehicles.errorDeleteFailed"))
        return
      }

      setStatusMessage(t("vehicles.successDelete"))
      closeModal()
      await fetchVehicles(activeOrg.id)
    } catch {
      setErrorMessage(t("vehicles.errorDeleteConnection"))
    } finally {
      setSubmitting(false)
    }
  }

  const roleText =
    activeOrg?.role === "owner"
      ? t("vehicles.roleOwner")
      : activeOrg?.role === "admin"
      ? t("vehicles.roleAdmin")
      : t("vehicles.roleMember")

  const canDelete = canDeleteVehicle(activeOrg?.role || "")

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 pb-20">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <Heading level="h1" className="text-2xl font-bold flex items-center gap-2">
            <TruckFast className="w-7 h-7 text-blue-600" aria-hidden="true" />
            {t("vehicles.pageTitle")}
          </Heading>
          <Text className="text-gray-600 mt-1">
            {t("vehicles.pageDescription")}
          </Text>
        </div>

        {/* Organization switcher */}
        {organizations.length > 1 && (
          <div className="flex items-center gap-2">
            <Label htmlFor="org-switcher" className="text-sm font-medium text-gray-700">
              {t("vehicles.orgLabel")}
            </Label>
            <select
              id="org-switcher"
              value={activeOrg?.id || ""}
              onChange={(e) => {
                const found = organizations.find((o) => o.id === e.target.value)
                if (found) setActiveOrg(found)
              }}
              className="px-3 py-1.5 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={t("vehicles.changeActiveOrg")}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.role === "owner" ? t("vehicles.roleOwner") : org.role === "admin" ? t("vehicles.roleAdmin") : t("vehicles.roleMember")})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Active context card */}
      {activeOrg && (
        <Container className="p-4 bg-gray-50 border rounded-lg flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BuildingStorefront className="w-5 h-5 text-gray-500" aria-hidden="true" />
            <div>
              <span className="font-semibold text-gray-900">{activeOrg.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{t("vehicles.yourRole")}</span>
            <Badge color={activeOrg.role === "owner" ? "purple" : activeOrg.role === "admin" ? "blue" : "grey"}>
              {roleText}
            </Badge>
          </div>
        </Container>
      )}

      {/* Accessible Notifications */}
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

      {/* Information Banner on Mutation Gate */}
      <Container className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-xs text-blue-900">
        <InformationCircle className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
        <span>
          {t("vehicles.infoBanner")}
        </span>
      </Container>

      {/* Search and Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder={t("vehicles.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-full"
            aria-label={t("vehicles.searchAriaLabel")}
          />
        </div>

        <Button
          variant="primary"
          onClick={(e) => openCreateModal(e)}
          disabled={!activeOrg || loadingVehicles}
          className="flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t("vehicles.addVehicleBtn")}
        </Button>
      </div>

      {/* Vehicles Table / Content */}
      <Container className="overflow-hidden border rounded-lg">
        {loadingOrgs || loadingVehicles ? (
          <div className="p-8 text-center text-gray-500" role="status" aria-live="polite">
            <p className="animate-pulse">{t("vehicles.loading")}</p>
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="p-8 text-center text-gray-500 space-y-2">
            <InformationCircle className="w-10 h-10 mx-auto text-gray-400" aria-hidden="true" />
            <p className="font-medium text-gray-700">
              {searchQuery ? t("vehicles.noVehiclesFound") : t("vehicles.noVehicles")}
            </p>
            <p className="text-sm">
              {searchQuery ? t("vehicles.searchTip") : t("vehicles.emptyTip")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 border-b text-gray-700">
                  <th scope="col" className="p-3 font-semibold">{t("vehicles.tableHeaderPlate")}</th>
                  <th scope="col" className="p-3 font-semibold">{t("vehicles.tableHeaderVin")}</th>
                  <th scope="col" className="p-3 font-semibold">{t("vehicles.tableHeaderDetails")}</th>
                  <th scope="col" className="p-3 font-semibold">{t("vehicles.tableHeaderNote")}</th>
                  <th scope="col" className="p-3 font-semibold">{t("vehicles.tableHeaderDate")}</th>
                  <th scope="col" className="p-3 font-semibold text-right">{t("vehicles.tableHeaderActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-mono font-medium text-gray-900">
                      {vehicle.plate ? (
                        <span className="inline-block bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded text-xs font-bold">
                          {vehicle.plate}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">{t("vehicles.notSpecified")}</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs text-gray-700">
                      {vehicle.vin || <span className="text-gray-400 italic">{t("vehicles.notSpecified")}</span>}
                    </td>
                    <td className="p-3 text-gray-800">
                      {[vehicle.make, vehicle.model, vehicle.model_year].filter(Boolean).join(" ") || (
                        <span className="text-gray-400 italic">{t("vehicles.noDetails")}</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-800">
                      {vehicle.label ? (
                        <span className="text-gray-700">{vehicle.label}</span>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-500 text-xs">
                      {vehicle.created_at ? new Date(vehicle.created_at).toLocaleDateString() : "-"}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={(e) => openEditModal(vehicle, e)}
                          aria-label={t("vehicles.editAriaLabel", { identifier: vehicle.plate || vehicle.vin })}
                          className="min-h-[36px] min-w-[36px]"
                        >
                          <PencilSquare className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">{t("vehicles.editBtn")}</span>
                        </Button>

                        <Button
                          variant="danger"
                          size="small"
                          disabled={!canDelete}
                          onClick={(e) => openDeleteModal(vehicle, e)}
                          aria-label={
                            canDelete
                              ? t("vehicles.deleteAriaLabel", { identifier: vehicle.plate || vehicle.vin })
                              : t("vehicles.deleteDisabledTitle")
                          }
                          title={!canDelete ? t("vehicles.deleteDisabledTitle") : undefined}
                          className="min-h-[36px] min-w-[36px]"
                        >
                          <Trash className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">{t("vehicles.deleteBtn")}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Container>

      {/* Total count footer */}
      {!loadingVehicles && vehicles.length > 0 && (
        <div className="text-xs text-gray-500 text-right">
          {t("vehicles.totalCount", { count: vehicles.length })}{" "}
          {searchQuery && t("vehicles.filteredCount", { count: filteredVehicles.length })}
        </div>
      )}

      {/* Accessible Create / Edit Modal Dialog */}
      {(modalMode === "create" || modalMode === "edit") && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-vehicle-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            ref={modalRef}
            className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="border-b pb-3">
              <Heading level="h2" id="modal-vehicle-title" className="text-lg font-bold text-gray-900">
                {modalMode === "create" ? t("vehicles.modalCreateTitle") : t("vehicles.modalEditTitle")}
              </Heading>
              <Text className="text-xs text-gray-500 mt-1">
                {t("vehicles.modalDescription")}
              </Text>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4" noValidate>
              {/* Plaka Input */}
              <div className="space-y-1">
                <Label htmlFor="vehicle-plate" className="text-sm font-medium text-gray-700">
                  {t("vehicles.plateLabel")}
                </Label>
                <Input
                  ref={firstInputRef}
                  id="vehicle-plate"
                  type="text"
                  value={formValues.plate}
                  onChange={(e) => {
                    setFormValues({ ...formValues, plate: e.target.value.toUpperCase() })
                    if (formErrors.plate) setFormErrors({ ...formErrors, plate: "" })
                  }}
                  placeholder="34 ABC 123"
                  aria-invalid={!!formErrors.plate}
                  aria-describedby={formErrors.plate ? "vehicle-plate-error" : "vehicle-plate-hint"}
                  className="w-full font-mono uppercase"
                  maxLength={64}
                />
                <p id="vehicle-plate-hint" className="text-xs text-gray-500">
                  {t("vehicles.plateHint")}
                </p>
                {formErrors.plate && (
                  <p id="vehicle-plate-error" role="alert" className="text-xs text-red-600 font-medium">
                    {formErrors.plate}
                  </p>
                )}
              </div>

              {/* VIN / Şasi No Input */}
              <div className="space-y-1">
                <Label htmlFor="vehicle-vin" className="text-sm font-medium text-gray-700">
                  {t("vehicles.vinLabel")}
                </Label>
                <Input
                  id="vehicle-vin"
                  type="text"
                  value={formValues.vin}
                  onChange={(e) => {
                    setFormValues({ ...formValues, vin: e.target.value.toUpperCase() })
                    if (formErrors.vin) setFormErrors({ ...formErrors, vin: "" })
                  }}
                  placeholder={t("vehicles.vinPlaceholder")}
                  aria-invalid={!!formErrors.vin}
                  aria-describedby={formErrors.vin ? "vehicle-vin-error" : "vehicle-vin-hint"}
                  className="w-full font-mono uppercase"
                  maxLength={128}
                />
                <p id="vehicle-vin-hint" className="text-xs text-gray-500">
                  {t("vehicles.vinHint")}
                </p>
                {formErrors.vin && (
                  <p id="vehicle-vin-error" role="alert" className="text-xs text-red-600 font-medium">
                    {formErrors.vin}
                  </p>
                )}
              </div>

              {/* Marka and Model row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="vehicle-make" className="text-sm font-medium text-gray-700">
                    {t("vehicles.makeLabel")}
                  </Label>
                  <Input
                    id="vehicle-make"
                    type="text"
                    value={formValues.make}
                    onChange={(e) => setFormValues({ ...formValues, make: e.target.value })}
                    placeholder={t("vehicles.makePlaceholder")}
                    maxLength={100}
                    className="w-full"
                  />
                  {formErrors.make && (
                    <p role="alert" className="text-xs text-red-600">
                      {formErrors.make}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="vehicle-model" className="text-sm font-medium text-gray-700">
                    {t("vehicles.modelLabel")}
                  </Label>
                  <Input
                    id="vehicle-model"
                    type="text"
                    value={formValues.model}
                    onChange={(e) => setFormValues({ ...formValues, model: e.target.value })}
                    placeholder={t("vehicles.modelPlaceholder")}
                    maxLength={100}
                    className="w-full"
                  />
                  {formErrors.model && (
                    <p role="alert" className="text-xs text-red-600">
                      {formErrors.model}
                    </p>
                  )}
                </div>
              </div>

              {/* Model Yılı and Müşteri Etiketi row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="vehicle-year" className="text-sm font-medium text-gray-700">
                    {t("vehicles.yearLabel")}
                  </Label>
                  <Input
                    id="vehicle-year"
                    type="number"
                    min={1886}
                    max={2100}
                    value={formValues.model_year}
                    onChange={(e) => {
                      setFormValues({ ...formValues, model_year: e.target.value })
                      if (formErrors.model_year) setFormErrors({ ...formErrors, model_year: "" })
                    }}
                    placeholder={t("vehicles.yearPlaceholder")}
                    className="w-full"
                  />
                  {formErrors.model_year && (
                    <p role="alert" className="text-xs text-red-600">
                      {formErrors.model_year}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="vehicle-label" className="text-sm font-medium text-gray-700">
                    {t("vehicles.noteLabel")}
                  </Label>
                  <Input
                    id="vehicle-label"
                    type="text"
                    value={formValues.label}
                    onChange={(e) => setFormValues({ ...formValues, label: e.target.value })}
                    placeholder={t("vehicles.notePlaceholder")}
                    maxLength={100}
                    className="w-full"
                  />
                  {formErrors.label && (
                    <p role="alert" className="text-xs text-red-600">
                      {formErrors.label}
                    </p>
                  )}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeModal}
                  disabled={submitting}
                  className="min-h-[44px]"
                >
                  {t("vehicles.cancelBtn")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting}
                  className="min-h-[44px]"
                >
                  {submitting ? t("vehicles.savingBtn") : modalMode === "create" ? t("vehicles.saveBtn") : t("vehicles.updateBtn")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Accessible Delete Confirmation Modal */}
      {modalMode === "delete" && selectedVehicle && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div ref={modalRef} className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <Trash className="w-6 h-6" aria-hidden="true" />
              <Heading level="h2" id="modal-delete-title" className="text-lg font-bold text-gray-900">
                {t("vehicles.modalDeleteTitle")}
              </Heading>
            </div>

            <Text className="text-sm text-gray-700">
              {t("vehicles.deletePrompt", { identifier: selectedVehicle.plate || selectedVehicle.vin })}
            </Text>

            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
              {t("vehicles.deleteWarning")}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                ref={cancelDeleteRef}
                type="button"
                variant="secondary"
                onClick={closeModal}
                disabled={submitting}
                className="min-h-[44px]"
              >
                {t("vehicles.dismissBtn")}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteConfirm}
                disabled={submitting}
                className="min-h-[44px]"
              >
                {submitting ? t("vehicles.deletingBtn") : t("vehicles.confirmDeleteBtn")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
