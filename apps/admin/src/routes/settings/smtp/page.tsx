import React, { useState, useEffect, useRef } from "react"
import {
  Container,
  Heading,
  Text,
  Input,
  Button,
  Badge,
  Switch,
  Alert,
  Toaster,
  toast,
  Label,
} from "@medusajs/ui"
import { useTranslation } from "react-i18next"

declare const __BACKEND_URL__: string

export const config = {
  public: true,
  label: "SMTP Ayarları",
  group: "settings",
  rank: 10,
}

interface SmtpSettings {
  enabled: boolean
  host: string
  port: number
  security: "ssl" | "tls"
  username: string | null
  from_email: string
  from_name: string | null
  has_password: boolean
  version: number
  updated_at?: string
}

// Validate the read contract, including the backend's version-zero bootstrap response.
function isSmtpSettings(value: unknown): value is SmtpSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const s = value as Record<string, unknown>
  return typeof s.enabled === "boolean" &&
    typeof s.host === "string" && s.host.trim().length > 0 && s.host.length <= 255 &&
    typeof s.port === "number" && Number.isInteger(s.port) && s.port >= 1 && s.port <= 65535 &&
    (s.security === "ssl" || s.security === "tls") &&
    (s.username === null || typeof s.username === "string") &&
    typeof s.from_email === "string" && s.from_email.trim().length > 0 &&
    (s.from_name === null || typeof s.from_name === "string") &&
    typeof s.has_password === "boolean" &&
    typeof s.version === "number" && Number.isInteger(s.version) && s.version >= 0 && s.version <= 2147483646 &&
    (s.updated_at === undefined || (typeof s.updated_at === "string" && Number.isFinite(Date.parse(s.updated_at))))
}

export default function PlatformSmtpSettingsPage() {
  const { t } = useTranslation()
  const tRef = useRef(t)
  tRef.current = t
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [csrfToken, setCsrfToken] = useState<string>("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [canManage, setCanManage] = useState<boolean>(false)

  // Settings Form State - initialized empty / unpopulated until server readback
  const [enabled, setEnabled] = useState(true)
  const [host, setHost] = useState("")
  const [port, setPort] = useState(465)
  const [security, setSecurity] = useState<"ssl" | "tls">("ssl")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [hasExistingPassword, setHasExistingPassword] = useState(false)
  const [fromEmail, setFromEmail] = useState("")
  const [fromName, setFromName] = useState("")
  const [version, setVersion] = useState(1)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  // Live Test State
  const [testRecipient, setTestRecipient] = useState("")
  const testRecipientRef = useRef<HTMLInputElement>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const backendUrl = ""

  // Fetch current settings on mount
  useEffect(() => {
    let cancelled = false
    function clearSettings() {
      setCanManage(false)
      setCsrfToken("")
      setEnabled(false)
      setHost("")
      setPort(465)
      setSecurity("ssl")
      setUsername("")
      setPassword("")
      setHasExistingPassword(false)
      setFromEmail("")
      setFromName("")
      setVersion(0)
      setLastUpdated(null)
      setTestRecipient("")
      setTestResult(null)
    }
    async function loadSettings() {
      try {
        setLoading(true)
        setAuthError(null)
        setLoadError(null)
        clearSettings()

        // 1. Fetch CSRF token from /personal/session
        try {
          const sessionRes = await fetch(`${backendUrl}/personal/session`, {
            method: "GET",
            headers: {
              "Accept": "application/json",
            },
            credentials: "include",
          })
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json()
            if (!cancelled && typeof sessionData?.csrf_token === "string") {
              setCsrfToken(sessionData.csrf_token)
            }
          }
        } catch {
          // Frontdoor / proxy fallback handles same-origin credentials
        }

        if (cancelled) return

        // 2. Fetch platform SMTP settings
        const res = await fetch(`${backendUrl}/platform/smtp`, {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
          credentials: "include",
        })

        if (cancelled) return
        if (res.status !== 200) {
          if (res.status === 401 || res.status === 403) {
            clearSettings()
            setAuthError(tRef.current("smtp.authError"))
            return
          }
          throw new Error("HTTP " + res.status)
        }

        const data = await res.json()
        if (cancelled) return
        if (data?.can_manage !== true || !isSmtpSettings(data?.settings)) {
          throw new Error("Invalid SMTP settings response")
        }
        const s = data.settings
        setEnabled(s.enabled)
        setHost(s.host)
        setPort(s.port)
        setSecurity(s.security)
        setUsername(s.username ?? "")
        setFromEmail(s.from_email)
        setFromName(s.from_name ?? "")
        setHasExistingPassword(s.has_password)
        setVersion(s.version)
        setLastUpdated(s.updated_at ?? null)
        setCanManage(true)
      } catch {
        if (!cancelled) {
          clearSettings()
          setLoadError(tRef.current("smtp.loadError"))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSettings()
    return () => { cancelled = true }
  }, [backendUrl])

  // Save Settings handler
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setTestResult(null)

    try {
      const payload: any = {
        action: "save",
        enabled,
        host,
        port: Number(port),
        security,
        username: username || null,
        from_email: fromEmail,
        from_name: fromName || null,
        expected_version: version,
      }

      if (password) {
        payload.password = password
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      }
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken
      }

      const res = await fetch(`${backendUrl}/platform/smtp`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          toast.error(t("smtp.saveConflict"))
        } else {
          toast.error(data.message || t("smtp.saveFailed"))
        }
        return
      }

      if (data?.settings) {
        setVersion(data.settings.version)
        setHasExistingPassword(data.settings.has_password)
        setLastUpdated(data.settings.updated_at)
        setPassword("") // Clear plaintext password immediately
        toast.success(t("smtp.saveSuccess"))
      }
    } catch (err: any) {
      toast.error(t("smtp.saveError", { error: err.message || t("smtp.saveUnreachable") }))
    } finally {
      setSaving(false)
    }
  }

  // Live Test Dispatch handler
  async function handleTest() {
    const recipientInput = testRecipientRef.current
    if (!recipientInput) return
    if (!recipientInput.value.trim()) {
      recipientInput.setCustomValidity(t("smtp.testRecipientValidation"))
      recipientInput.reportValidity()
      recipientInput.setCustomValidity("")
      return
    }
    if (!recipientInput.reportValidity()) return

    setTesting(true)
    setTestResult(null)

    try {
      const payload: any = {
        action: "test",
        target_recipient: testRecipient,
        candidate_settings: {
          host,
          port: Number(port),
          security,
          username: username || null,
          from_email: fromEmail,
          from_name: fromName || null,
        },
      }

      if (password) {
        payload.candidate_settings.password = password
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      }
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken
      }

      const res = await fetch(`${backendUrl}/platform/smtp`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          message: t("smtp.testSuccessMessage"),
        })
        toast.success(t("smtp.testSuccessToast"))
      } else {
        setTestResult({
          ok: false,
          message: data.message || t("smtp.testFailedMessage"),
        })
        toast.error(t("smtp.testFailedToast"))
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: t("smtp.testNetworkError", { error: err.message }),
      })
      toast.error(t("smtp.testErrorToast", { error: err.message }))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      <Toaster />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ui-border-base pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Heading level="h1" className="text-2xl font-bold tracking-tight text-ui-fg-base">
              {t("smtp.title")}
            </Heading>
            {canManage && <Badge color="blue" size="small" className="bg-[#0e66c2]/10 text-[#0e66c2] border-[#0e66c2]/20 font-semibold">
              {t("smtp.versionBadge", { version })}
            </Badge>}
          </div>
          <Text className="text-sm text-ui-fg-subtle">
            {t("smtp.description")}
          </Text>
        </div>

        {lastUpdated && (
          <div className="text-xs text-ui-fg-muted sm:text-right">
            <span>{t("smtp.lastUpdated")}</span>
            <span className="font-medium text-ui-fg-subtle">{new Date(lastUpdated).toLocaleString()}</span>
          </div>
        )}
      </div>

      {authError && (
        <Alert variant="error" role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50/50">
          <div className="space-y-2">
            <Text className="text-sm font-semibold text-red-900">{authError}</Text>
            <Text className="text-xs text-red-700">
              {t("smtp.authSubtext")}
            </Text>
            <div className="pt-1">
              <Button
                asChild
                variant="secondary"
                size="small"
                className="min-h-[48px] px-4 font-semibold text-ui-fg-base"
              >
                <a href={backendUrl ? `${backendUrl}/personal` : "/personal"} target="_blank" rel="noopener noreferrer">
                  {t("smtp.authFrontdoorBtn")}
                </a>
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {loadError && <Alert variant="error" role="alert">{loadError}</Alert>}

      {loading ? (
        <Container className="p-8 text-center" role="status" aria-live="polite">
          <div aria-hidden="true" className="w-8 h-8 border-3 border-[#0e66c2]/20 border-t-[#0e66c2] rounded-full animate-spin mx-auto mb-3" />
          <Text className="text-sm text-ui-fg-muted">{t("smtp.loading")}</Text>
        </Container>
      ) : canManage ? (
        <div className="space-y-6">
          <form onSubmit={handleSave}>
          {/* Main Configuration Card */}
          <Container className="p-6 space-y-6 rounded-xl border border-ui-border-base bg-ui-bg-base">
            {/* Service Toggle */}
            <div className="flex items-center justify-between pb-4 border-b border-ui-border-base">
              <div>
                <Label htmlFor="smtp-toggle" className="text-base font-semibold text-ui-fg-base">
                  {t("smtp.serviceStatus")}
                </Label>
                <Text id="smtp-service-desc" className="text-xs text-ui-fg-subtle">
                  {t("smtp.serviceDesc")}
                </Text>
              </div>
              <div className="flex items-center gap-3">
                <Badge color={enabled ? "green" : "grey"} size="small">
                  {enabled ? t("smtp.statusActive") : t("smtp.statusDisabled")}
                </Badge>
                <Switch
                  id="smtp-toggle"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  aria-describedby="smtp-service-desc"
                />
              </div>
            </div>

            {/* Host & Port Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-8 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="smtp-host" className="text-xs font-semibold text-ui-fg-base">
                    {t("smtp.hostLabel")}
                  </Label>
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {t("smtp.badgeSsrf")}
                  </span>
                </div>
                <Input
                  id="smtp-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder={t("smtp.hostPlaceholder")}
                  required
                  className="min-h-[48px]"
                />
              </div>

              <div className="md:col-span-4 space-y-1.5">
                <Label htmlFor="smtp-port" className="text-xs font-semibold text-ui-fg-base">
                  {t("smtp.portLabel")}
                </Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  placeholder={t("smtp.portPlaceholder")}
                  required
                  className="min-h-[48px]"
                />
              </div>
            </div>

            {/* Security Protocol Options */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-ui-fg-base">
                {t("smtp.securityLegend")}
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`min-h-[48px] p-4 rounded-lg border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    security === "ssl"
                      ? "border-[#0e66c2] bg-blue-50/50 dark:bg-blue-950/20"
                      : "border-ui-border-base hover:bg-ui-bg-subtle"
                  }`}
                >
                  <input
                    type="radio"
                    name="security-mode"
                    checked={security === "ssl"}
                    onChange={() => { setSecurity("ssl"); if (port === 587) setPort(465) }}
                    className="mt-1 text-[#0e66c2]"
                  />
                  <div>
                    <div className="text-xs font-bold text-ui-fg-base flex items-center gap-1.5">
                      <span>{t("smtp.securitySsl")}</span>
                      <span className="text-[10px] bg-[#0e66c2] text-white px-1.5 py-0.5 rounded font-medium">{t("smtp.securityRecommended")}</span>
                    </div>
                    <Text className="text-[11px] text-ui-fg-subtle mt-0.5">
                      {t("smtp.securitySslDesc")}
                    </Text>
                  </div>
                </label>

                <label
                  className={`min-h-[48px] p-4 rounded-lg border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    security === "tls"
                      ? "border-[#0e66c2] bg-blue-50/50 dark:bg-blue-950/20"
                      : "border-ui-border-base hover:bg-ui-bg-subtle"
                  }`}
                >
                  <input
                    type="radio"
                    name="security-mode"
                    checked={security === "tls"}
                    onChange={() => { setSecurity("tls"); if (port === 465) setPort(587) }}
                    className="mt-1 text-[#0e66c2]"
                  />
                  <div>
                    <div className="text-xs font-bold text-ui-fg-base">
                      {t("smtp.securityTls")}
                    </div>
                    <Text className="text-[11px] text-ui-fg-subtle mt-0.5">
                      {t("smtp.securityTlsDesc")}
                    </Text>
                  </div>
                </label>
              </div>
            </fieldset>

            {/* Credentials Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user" className="text-xs font-semibold text-ui-fg-base">
                  {t("smtp.userLabel")}
                </Label>
                <Input
                  id="smtp-user"
                  type="email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("smtp.userPlaceholder")}
                  className="min-h-[48px]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="smtp-pass" className="text-xs font-semibold text-ui-fg-base">
                    {t("smtp.passLabel")}
                  </Label>
                  {hasExistingPassword && !password && (
                    <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {t("smtp.badgeExistingPass")}
                    </span>
                  )}
                </div>
                <Input
                  id="smtp-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasExistingPassword ? t("smtp.passPlaceholderExisting") : t("smtp.passPlaceholderNew")}
                  className="min-h-[48px]"
                />
              </div>
            </div>

            {/* Sender (From) Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-ui-border-base">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-from-email" className="text-xs font-semibold text-ui-fg-base">
                  {t("smtp.fromEmailLabel")}
                </Label>
                <Input
                  id="smtp-from-email"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder={t("smtp.fromEmailPlaceholder")}
                  required
                  className="min-h-[48px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-from-name" className="text-xs font-semibold text-ui-fg-base">
                  {t("smtp.fromNameLabel")}
                </Label>
                <Input
                  id="smtp-from-name"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder={t("smtp.fromNamePlaceholder")}
                  className="min-h-[48px]"
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex justify-end pt-4 border-t border-ui-border-base">
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#0e66c2] hover:bg-[#0b57a4] text-white font-semibold min-h-[48px] px-6"
              >
                {saving ? t("smtp.savingBtn") : t("smtp.saveBtn")}
              </Button>
            </div>
          </Container>
          </form>

          {/* Live Connection Test Card */}
          <Container className="p-6 space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-base">
            <div>
              <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
                {t("smtp.testTitle")}
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                {t("smtp.testDesc")}
              </Text>
            </div>

            {testResult && (
              <Alert
                variant={testResult.ok ? "success" : "error"}
                role={testResult.ok ? "status" : "alert"}
                aria-live={testResult.ok ? "polite" : "assertive"}
                className="my-2"
              >
                {testResult.message}
              </Alert>
            )}

            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1.5 w-full">
                <Label htmlFor="test-recipient" className="text-xs font-semibold text-ui-fg-base">
                  {t("smtp.testRecipientLabel")}
                </Label>
                <Input
                  id="test-recipient"
                  ref={testRecipientRef}
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder={t("smtp.testRecipientPlaceholder")}
                  className="min-h-[48px]"
                />
              </div>
              <Button
                type="button"
                onClick={handleTest}
                disabled={testing}
                variant="secondary"
                className="min-h-[48px] px-5 font-semibold text-ui-fg-base"
              >
                {testing ? t("smtp.testingBtn") : t("smtp.testBtn")}
              </Button>
            </div>
          </Container>
        </div>
      ) : null}
    </div>
  )
}
