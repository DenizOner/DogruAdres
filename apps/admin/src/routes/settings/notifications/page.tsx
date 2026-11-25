import { useCallback, useEffect, useRef, useState } from "react"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

export const config = {
  public: true,
  label: "Bildirim Ayarları",
  group: "settings",
  rank: 12,
}

type EmailFrequency = "immediate" | "daily_digest" | "off"

type CategoryId =
  | "security_account"
  | "owner_closing"
  | "organization_membership"
  | "store_operations"
  | "buyer_orders"
  | "seller_operations"
  | "platform_announcements"
  | "marketing_promotions"

interface ChannelPreference {
  platform: boolean
  email: EmailFrequency
  mobile: boolean
}

interface CategoryMeta {
  id: CategoryId
  critical: boolean
}

interface PreferencesResponse {
  preferences: Record<CategoryId, ChannelPreference>
  categories: CategoryMeta[]
  mobile_channel: {
    supported: boolean
    permission_granted: boolean
    reason: string
  }
  version: number
}

export default function NotificationPreferencesSettingsPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [data, setData] = useState<PreferencesResponse | null>(null)
  const [draft, setDraft] = useState<Record<CategoryId, ChannelPreference> | null>(null)
  const [csrfToken, setCsrfToken] = useState("")
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setUnauthorized(false)
    setLoadError("")
    try {
      const sessionRes = await fetch("/personal/session", { credentials: "include" })
      if (!sessionRes.ok) {
        setUnauthorized(true)
        setData(null)
        setDraft(null)
        return
      }
      const sessionJson = (await sessionRes.json()) as { csrf_token?: string }
      if (!sessionJson?.csrf_token) {
        setUnauthorized(true)
        return
      }
      setCsrfToken(sessionJson.csrf_token)

      const res = await fetch("/personal/notification-preferences", {
        credentials: "include",
      })
      if (res.status === 401 || res.status === 403) {
        setUnauthorized(true)
        setData(null)
        setDraft(null)
        return
      }
      if (!res.ok) {
        setLoadError(t("notifications.loadError"))
        return
      }
      const json = (await res.json()) as PreferencesResponse
      setData(json)
      setDraft(json.preferences)
    } catch {
      setLoadError(t("notifications.loadError"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const submitMutation = async (action: "update" | "reset_defaults") => {
    if (!data || !draft || inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setStatusMessage("")
    try {
      const res = await fetch("/personal/notification-preferences", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(
          action === "reset_defaults"
            ? { action: "reset_defaults", expected_version: data.version }
            : { action: "update", preferences: draft, expected_version: data.version }
        ),
      })
      if (res.status === 401 || res.status === 403) {
        setUnauthorized(true)
        return
      }
      if (res.status === 409) {
        setStatusMessage(t("notifications.saveConflict"))
        await load()
        return
      }
      if (!res.ok) {
        setStatusMessage(t("notifications.saveFailed"))
        return
      }
      const next = (await res.json()) as PreferencesResponse
      setData(next)
      setDraft(next.preferences)
      setStatusMessage(
        action === "reset_defaults"
          ? t("notifications.resetSuccess")
          : t("notifications.saveSuccess")
      )
    } catch {
      setStatusMessage(t("notifications.saveFailed"))
    } finally {
      setSaving(false)
      inFlight.current = false
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h1">{t("notifications.title")}</Heading>
          <Text className="text-ui-fg-subtle mt-1" size="small">
            {t("notifications.description")}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge color="grey">
              {t("notifications.versionBadge", { version: data.version })}
            </Badge>
          )}
          <a
            href="/personal#notification-panel"
            className="text-ui-fg-interactive text-xs underline"
          >
            {t("notifications.bellLink")}
          </a>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {loading && <Text size="small">{t("notifications.loading")}</Text>}

        {!loading && unauthorized && (
          <div className="space-y-3">
            <Text size="small" className="text-ui-fg-error">
              {t("notifications.authError")}
            </Text>
            <Button variant="secondary" size="small" onClick={() => window.location.assign("/personal")}>
              {t("notifications.authFrontdoorBtn")}
            </Button>
          </div>
        )}

        {!loading && loadError && (
          <Text size="small" className="text-ui-fg-error">
            {loadError}
          </Text>
        )}

        {!loading && !unauthorized && data && draft && (
          <div className="space-y-4">
            <div className="rounded-md border p-3 space-y-1">
              <Text size="small" weight="plus">
                {t("notifications.summaryTitle")}
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {t("notifications.summaryCritical")}
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {t("notifications.mobileUnsupported")}
              </Text>
            </div>

            <details open className="rounded-md border p-4 space-y-4">
              <summary className="cursor-pointer font-medium text-sm">
                {t("notifications.advancedToggle")}
              </summary>

              <div className="overflow-x-auto mt-3">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-4">{t("notifications.tableCategory")}</th>
                      <th className="py-2 px-3">{t("notifications.tablePlatform")}</th>
                      <th className="py-2 px-3">{t("notifications.tableEmail")}</th>
                      <th className="py-2 pl-3">{t("notifications.tableMobile")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categories.map((cat) => {
                      const pref = draft[cat.id]
                      return (
                        <tr key={cat.id} className="border-b last:border-b-0">
                          <td className="py-3 pr-4">
                            <div className="font-medium flex items-center gap-2">
                              <span>{t(`notifications.categories.${cat.id}.name`)}</span>
                              {cat.critical && (
                                <Badge color="orange" size="2xsmall">
                                  {t("notifications.criticalBadge")}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-ui-fg-subtle mt-0.5">
                              {t(`notifications.categories.${cat.id}.desc`)}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="checkbox"
                              aria-label={`${t(`notifications.categories.${cat.id}.name`)} - ${t("notifications.tablePlatform")}`}
                              checked={pref.platform}
                              disabled={cat.critical || saving}
                              onChange={(e) =>
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        [cat.id]: { ...prev[cat.id], platform: e.target.checked },
                                      }
                                    : prev
                                )
                              }
                            />
                          </td>
                          <td className="py-3 px-3">
                            <select
                              aria-label={`${t(`notifications.categories.${cat.id}.name`)} - ${t("notifications.tableEmail")}`}
                              className="border rounded px-2 py-1 text-xs bg-transparent"
                              value={pref.email}
                              disabled={cat.critical || saving}
                              onChange={(e) =>
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        [cat.id]: {
                                          ...prev[cat.id],
                                          email: e.target.value as EmailFrequency,
                                        },
                                      }
                                    : prev
                                )
                              }
                            >
                              <option value="immediate">{t("notifications.emailImmediate")}</option>
                              {!cat.critical && (
                                <>
                                  <option value="daily_digest">
                                    {t("notifications.emailDailyDigest")}
                                  </option>
                                  <option value="off">{t("notifications.emailOff")}</option>
                                </>
                              )}
                            </select>
                          </td>
                          <td className="py-3 pl-3">
                            <input
                              type="checkbox"
                              aria-label={`${t(`notifications.categories.${cat.id}.name`)} - ${t("notifications.tableMobile")}`}
                              checked={false}
                              disabled
                              title={t("notifications.mobileUnsupported")}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="small"
                disabled={saving}
                onClick={() => void submitMutation("update")}
              >
                {saving ? t("notifications.savingBtn") : t("notifications.saveBtn")}
              </Button>
              <Button
                variant="secondary"
                size="small"
                disabled={saving}
                onClick={() => void submitMutation("reset_defaults")}
              >
                {t("notifications.resetBtn")}
              </Button>
              {statusMessage && (
                <Text size="small" role="status" aria-live="polite">
                  {statusMessage}
                </Text>
              )}
            </div>
          </div>
        )}
      </div>
    </Container>
  )
}
