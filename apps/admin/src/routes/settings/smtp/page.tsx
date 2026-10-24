import React, { useState, useEffect } from "react"
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
import { getAuthHeaders } from "@mercurjs/admin"

declare const __BACKEND_URL__: string

export const config = {
  label: "SMTP Ayarları",
  group: "settings",
  rank: 10,
}

interface SmtpSettings {
  id: string
  enabled: boolean
  host: string
  port: number
  security: "ssl" | "tls"
  username: string | null
  from_email: string
  from_name: string | null
  has_password: boolean
  version: number
  updated_at: string
}

export default function PlatformSmtpSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [csrfToken, setCsrfToken] = useState<string>("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [canManage, setCanManage] = useState<boolean>(true)

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
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const backendUrl = typeof __BACKEND_URL__ !== "undefined" ? __BACKEND_URL__ : "http://localhost:9000"

  // Fetch current settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true)
        setAuthError(null)

        // 1. Fetch CSRF token from /personal/session
        try {
          const sessionRes = await fetch(`${backendUrl}/personal/session`, {
            method: "GET",
            headers: {
              ...getAuthHeaders(),
              "Accept": "application/json",
            },
            credentials: "include",
          })
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json()
            if (sessionData?.csrf_token) {
              setCsrfToken(sessionData.csrf_token)
            }
          }
        } catch {
          // Frontdoor / proxy fallback handles same-origin credentials
        }

        // 2. Fetch platform SMTP settings
        const res = await fetch(`${backendUrl}/personal/platform/smtp`, {
          method: "GET",
          headers: {
            ...getAuthHeaders(),
            "Accept": "application/json",
          },
          credentials: "include",
        })

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            setCanManage(false)
            setAuthError("SMTP ayarlarını görüntülemek ve yönetmek için 'platform.smtp.manage' yetkisi ve güçlü kimlik doğrulaması (MFA) gereklidir.")
            return
          }
          throw new Error("HTTP " + res.status)
        }

        const data: { settings: SmtpSettings; can_manage?: boolean } = await res.json()
        if (data?.settings) {
          const s = data.settings
          setEnabled(s.enabled)
          setHost(s.host || "")
          setPort(s.port || 465)
          setSecurity(s.security || "ssl")
          setUsername(s.username || "")
          setFromEmail(s.from_email || "")
          setFromName(s.from_name || "")
          setHasExistingPassword(s.has_password)
          setVersion(s.version)
          setLastUpdated(s.updated_at)
          setCanManage(data.can_manage !== false)
          if (s.from_email && !testRecipient) {
            setTestRecipient(s.from_email)
          }
        }
      } catch (err: any) {
        toast.error("SMTP ayarları yüklenemedi: " + (err.message || ""))
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
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
        ...getAuthHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json",
      }
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken
      }

      const res = await fetch(`${backendUrl}/personal/platform/smtp`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          toast.error("Eşzamanlı değişiklik çakışması! Sayfayı yenileyip tekrar deneyiniz.")
        } else {
          toast.error(data.message || "Kaydetme başarısız")
        }
        return
      }

      if (data?.settings) {
        setVersion(data.settings.version)
        setHasExistingPassword(data.settings.has_password)
        setLastUpdated(data.settings.updated_at)
        setPassword("") // Clear plaintext password immediately
        toast.success("E-posta ayarları kaydedildi.")
      }
    } catch (err: any) {
      toast.error("Hata: " + (err.message || "Sunucuya ulaşılamadı"))
    } finally {
      setSaving(false)
    }
  }

  // Live Test Dispatch handler
  async function handleTest() {
    if (!testRecipient) {
      toast.error("Lütfen test e-postasının gönderileceği alıcı adresini giriniz.")
      return
    }

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
        ...getAuthHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json",
      }
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken
      }

      const res = await fetch(`${backendUrl}/personal/platform/smtp`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          message: "E-posta gönderim için kabul edildi. Gelen kutusundan teslimatı kontrol edin.",
        })
        toast.success("Test e-postası başarıyla gönderildi!")
      } else {
        setTestResult({
          ok: false,
          message: data.message || "Bağlantı veya kimlik doğrulama başarısız oldu.",
        })
        toast.error("Test e-postası gönderilemedi.")
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: "Ağ veya sunucu hatası: " + err.message,
      })
      toast.error("Test hatası: " + err.message)
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
              Platform SMTP Ayarları
            </Heading>
            <Badge color="blue" size="small" className="bg-[#0e66c2]/10 text-[#0e66c2] border-[#0e66c2]/20 font-semibold">
              Ayar sürümü: {version}
            </Badge>
          </div>
          <Text className="text-sm text-ui-fg-subtle">
            DoğruAdres e-posta doğrulama, kullanıcı davetleri ve işlem bildirimleri için giden SMTP sunucu altyapısı.
          </Text>
        </div>

        {lastUpdated && (
          <div className="text-xs text-ui-fg-muted sm:text-right">
            <span>Son Güncelleme: </span>
            <span className="font-medium text-ui-fg-subtle">{new Date(lastUpdated).toLocaleString("tr-TR")}</span>
          </div>
        )}
      </div>

      {authError && (
        <Alert variant="error" className="p-4 rounded-xl border border-red-200 bg-red-50/50">
          <div className="space-y-2">
            <Text className="text-sm font-semibold text-red-900">{authError}</Text>
            <Text className="text-xs text-red-700">
              Platform SMTP ayarlarını yönetmek güvenlik gereği güçlü kimlik doğrulaması (TOTP / MFA) ve platform staff yetkisi gerektirir.
            </Text>
            <div className="pt-1">
              <Button
                asChild
                variant="secondary"
                size="small"
                className="min-h-[48px] px-4 font-semibold text-ui-fg-base"
              >
                <a href="https://127.0.0.1:19102/personal" target="_blank" rel="noopener noreferrer">
                  Personal Frontdoor Panelinde Doğrula &rarr;
                </a>
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {loading ? (
        <Container className="p-8 text-center">
          <div className="w-8 h-8 border-3 border-[#0e66c2]/20 border-t-[#0e66c2] rounded-full animate-spin mx-auto mb-3" />
          <Text className="text-sm text-ui-fg-muted">Yapılandırma yükleniyor...</Text>
        </Container>
      ) : canManage ? (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Main Configuration Card */}
          <Container className="p-6 space-y-6 rounded-xl border border-ui-border-base bg-ui-bg-base">
            {/* Service Toggle */}
            <div className="flex items-center justify-between pb-4 border-b border-ui-border-base">
              <div>
                <Label htmlFor="smtp-toggle" className="text-base font-semibold text-ui-fg-base">
                  SMTP Bildirim Servisi Durumu
                </Label>
                <Text className="text-xs text-ui-fg-subtle">
                  Servis kapalı olduğunda giden e-postalar Transactional Outbox kuyruğunda bekletilir.
                </Text>
              </div>
              <div className="flex items-center gap-3">
                <Badge color={enabled ? "green" : "grey"} size="small">
                  {enabled ? "Aktif" : "Devre Dışı"}
                </Badge>
                <Switch
                  id="smtp-toggle"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>
            </div>

            {/* Host & Port Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-8 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="smtp-host" className="text-xs font-semibold text-ui-fg-base">
                    Sunucu Adresi (Host) *
                  </Label>
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    SSRF & Özel IP Korumalı
                  </span>
                </div>
                <Input
                  id="smtp-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.example.com"
                  required
                  className="min-h-[48px]"
                />
              </div>

              <div className="md:col-span-4 space-y-1.5">
                <Label htmlFor="smtp-port" className="text-xs font-semibold text-ui-fg-base">
                  Port Numarası *
                </Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  placeholder="465"
                  required
                  className="min-h-[48px]"
                />
              </div>
            </div>

            {/* Security Protocol Options */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-ui-fg-base">
                Güvenlik Protokolü *
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  onClick={() => { setSecurity("ssl"); if (port === 587) setPort(465) }}
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
                    onChange={() => {}}
                    className="mt-1 text-[#0e66c2]"
                  />
                  <div>
                    <div className="text-xs font-bold text-ui-fg-base flex items-center gap-1.5">
                      <span>SSL / TLS (Port 465)</span>
                      <span className="text-[10px] bg-[#0e66c2] text-white px-1.5 py-0.5 rounded font-medium">Önerilen</span>
                    </div>
                    <Text className="text-[11px] text-ui-fg-subtle mt-0.5">
                      Doğrudan TLS soket bağlantısı; el sıkışma öncesi şifreleme aktiftir.
                    </Text>
                  </div>
                </label>

                <label
                  onClick={() => { setSecurity("tls"); if (port === 465) setPort(587) }}
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
                    onChange={() => {}}
                    className="mt-1 text-[#0e66c2]"
                  />
                  <div>
                    <div className="text-xs font-bold text-ui-fg-base">
                      STARTTLS (Port 587)
                    </div>
                    <Text className="text-[11px] text-ui-fg-subtle mt-0.5">
                      Düz metin başlangıçlı TLS yükseltmesi; kimlik bilgileri TLS sonrası iletilir.
                    </Text>
                  </div>
                </label>
              </div>
            </div>

            {/* Credentials Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user" className="text-xs font-semibold text-ui-fg-base">
                  Kullanıcı Adı (Kimlik Doğrulama)
                </Label>
                <Input
                  id="smtp-user"
                  type="email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ornek@dogruadres.com"
                  className="min-h-[48px]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="smtp-pass" className="text-xs font-semibold text-ui-fg-base">
                    Parola / Uygulama Şifresi
                  </Label>
                  {hasExistingPassword && !password && (
                    <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      AES-256 Kasada Kayıtlı
                    </span>
                  )}
                </div>
                <Input
                  id="smtp-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasExistingPassword ? "•••••••••••••••• (Değiştirmek için yeni parola girin)" : "Uygulama şifresi"}
                  className="min-h-[48px]"
                />
              </div>
            </div>

            {/* Sender (From) Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-ui-border-base">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-from-email" className="text-xs font-semibold text-ui-fg-base">
                  Gönderen E-posta (From Email) *
                </Label>
                <Input
                  id="smtp-from-email"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="bildirim@dogruadres.com"
                  required
                  className="min-h-[48px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-from-name" className="text-xs font-semibold text-ui-fg-base">
                  Gönderen Adı (From Name)
                </Label>
                <Input
                  id="smtp-from-name"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="DoğruAdres Platformu"
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
                {saving ? "Kaydediliyor..." : "Ayarları kaydet"}
              </Button>
            </div>
          </Container>

          {/* Live Connection Test Card */}
          <Container className="p-6 space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-base">
            <div>
              <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
                Canlı Bağlantı ve Teslimat Testi
              </Heading>
              <Text className="text-xs text-ui-fg-subtle">
                Yapılandırılan sunucu üzerinden gerçek bir test e-postası göndererek SMTP-AUTH el sıkışmasını ve teslimatı teyit ediniz.
              </Text>
            </div>

            {testResult && (
              <Alert
                variant={testResult.ok ? "success" : "error"}
                className="my-2"
              >
                {testResult.message}
              </Alert>
            )}

            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1.5 w-full">
                <Label htmlFor="test-recipient" className="text-xs font-semibold text-ui-fg-base">
                  Hedef Test Alıcısı
                </Label>
                <Input
                  id="test-recipient"
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="yonetici@dogruadres.net"
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
                {testing ? "Bağlanıyor..." : "Bağlantıyı ve E-posta Gönderimini Test Et"}
              </Button>
            </div>
          </Container>
        </form>
      ) : null}
    </div>
  )
}
