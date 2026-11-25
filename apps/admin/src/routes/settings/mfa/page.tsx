import React, { useCallback, useEffect, useRef, useState } from "react"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

export const config = {
  public: true,
  label: "Platform MFA",
  group: "settings",
  rank: 11,
}

type PlatformMode = "required" | "optional" | "disabled"

interface PlatformPolicy {
  platform_mode: PlatformMode
  version: number
}

interface PlatformRead {
  platform: PlatformPolicy
  runtime_enforcement: "enforced" | "not_yet_enabled"
}

const optionDefinitions: ReadonlyArray<{
  value: PlatformMode
  nameKey: string
  effectKey: string
}> = [
  {
    value: "required",
    nameKey: "mfa.requiredName",
    effectKey: "mfa.requiredEffect",
  },
  {
    value: "optional",
    nameKey: "mfa.optionalName",
    effectKey: "mfa.optionalEffect",
  },
  {
    value: "disabled",
    nameKey: "mfa.disabledName",
    effectKey: "mfa.disabledEffect",
  },
]

function parsePolicy(value: unknown): PlatformPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (!optionDefinitions.some(option => option.value === data.platform_mode)) return null
  if (typeof data.version !== "number" || !Number.isInteger(data.version) ||
      data.version < 0 || data.version > 2147483646) return null
  return { platform_mode: data.platform_mode as PlatformMode, version: data.version }
}

function parseRead(value: unknown): PlatformRead | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  // The server owns this permission. An Admin dashboard route and an
  // Organization Owner/SMTP grant are NOT security.mfa.manage.
  if (data.can_manage_platform !== true) return null
  const platform = parsePolicy(data.platform)
  if (!platform || (data.runtime_enforcement !== "enforced" &&
                    data.runtime_enforcement !== "not_yet_enabled")) return null
  return { platform, runtime_enforcement: data.runtime_enforcement }
}

const reauthenticate = "/personal"

export default function PlatformMfaSettingsPage() {
  const { t } = useTranslation()
  const tRef = useRef(t)
  tRef.current = t
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [policy, setPolicy] = useState<PlatformRead | null>(null)
  const [selected, setSelected] = useState<PlatformMode>("required")
  const [csrfToken, setCsrfToken] = useState("")
  const [message, setMessage] = useState("")
  const [locked, setLocked] = useState(true)
  const [denied, setDenied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const sequence = useRef(0)
  const inFlight = useRef(false)

  const options = optionDefinitions.map(opt => ({
    value: opt.value,
    name: t(opt.nameKey),
    effect: t(opt.effectKey),
  }))

  // A rejected or uncertain mutation invalidates the previously displayed
  // policy. Do not label a stale version as the current saved setting.
  function concealStalePolicy() {
    setPolicy(null)
    setCsrfToken("")
    setConfirmed(false)
  }

  // GET is safe to repeat. A failed or uncertain POST is never retried.
  const refresh = useCallback(async (expected?: PlatformMode, previousVersion?: number) => {
    const seq = ++sequence.current
    setLoading(true)
    setLocked(true)
    setPolicy(null)
    setCsrfToken("")
    setMessage("")
    setDenied(false)
    setConfirmed(false)
    try {
      const session = await fetch("/personal/session", {
        method: "GET", credentials: "include", cache: "no-store",
        headers: { Accept: "application/json" },
      })
      if (!session.ok) {
        if (seq === sequence.current) setDenied(session.status === 401 || session.status === 403)
        throw Error("Session unavailable")
      }
      const sessionBody: unknown = await session.json()
      const csrf = sessionBody && typeof sessionBody === "object" &&
        !Array.isArray(sessionBody) ? (sessionBody as Record<string, unknown>).csrf_token : null
      if (typeof csrf !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) {
        throw Error("Missing session CSRF proof")
      }
      const result = await fetch("/personal/mfa", {
        method: "GET", credentials: "include", cache: "no-store",
        headers: { Accept: "application/json" },
      })
      if (!result.ok) {
        if (seq === sequence.current) setDenied(result.status === 401 || result.status === 403)
        throw Error("Policy unavailable")
      }
      const payload: unknown = await result.json()
      const read = parseRead(payload)
      if (!read) {
        if (payload && typeof payload === "object" &&
            (payload as Record<string, unknown>).can_manage_platform === false &&
            seq === sequence.current) setDenied(true)
        throw Error("Untrusted or unauthorized policy response")
      }
      if (seq !== sequence.current) return
      setPolicy(read)
      setSelected(read.platform.platform_mode)
      setCsrfToken(csrf)
      if (expected !== undefined && previousVersion !== undefined) {
        const verified = read.platform.platform_mode === expected &&
          read.platform.version > previousVersion
        setConfirmed(verified)
        if (!verified) {
          setLocked(true)
          setMessage(tRef.current("mfa.warnUnverifiedVersion"))
          return
        }
        setMessage(tRef.current("mfa.successVersion"))
      }
      setLocked(false)
    } catch {
      if (seq === sequence.current) {
        setLocked(true)
        setMessage(tRef.current("mfa.errVerifyFailed"))
      }
    } finally {
      if (seq === sequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => { ++sequence.current }
  }, [refresh])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || saving || locked || !policy ||
        !/^[A-Za-z0-9_-]{43}$/.test(csrfToken) ||
        !options.some(option => option.value === selected) ||
        selected === policy.platform.platform_mode) return
    const chosen = options.find(option => option.value === selected)
    if (!chosen || !window.confirm(
      t("mfa.confirmPrompt", {
        name: chosen.name,
        effect: chosen.effect,
        defaultValue: `Platform MFA politikasını değiştirmek istiyor musunuz? ${chosen.name}: ${chosen.effect} Mevcut native faktörler güvenli uzlaştırma olmadan atlanamaz.`,
      })
    )) return
    inFlight.current = true
    setSaving(true)
    setLocked(true)
    setConfirmed(false)
    setMessage("")
    const previousVersion = policy.platform.version
    try {
      const response = await fetch("/personal/mfa", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          action: "platform",
          platform_mode: selected,
          expected_version: previousVersion,
        }),
      })
      if (response.status === 401 || response.status === 403) {
        concealStalePolicy()
        setDenied(true)
        setMessage(t("mfa.errUnauthorized"))
        return
      }
      if (response.status === 409) {
        concealStalePolicy()
        setMessage(t("mfa.errConflict"))
        return
      }
      if (!response.ok) {
        concealStalePolicy()
        setMessage(t("mfa.errUnverified"))
        return
      }
      const body: unknown = await response.json()
      const posted = body && typeof body === "object" && !Array.isArray(body)
        ? parsePolicy((body as Record<string, unknown>).platform) : null
      if (!posted || posted.platform_mode !== selected || posted.version <= previousVersion) {
        concealStalePolicy()
        setMessage(t("mfa.errInconsistent"))
        return
      }
      // A successful POST is not the same as the current server-side policy
      // readback, nor does it disable an already-enabled Medusa factor.
      await refresh(selected, previousVersion)
    } catch {
      concealStalePolicy()
      setMessage(t("mfa.errNetwork"))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const hasChange = policy !== null && selected !== policy.platform.platform_mode

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      <div>
        <Heading level="h1">{t("mfa.title")}</Heading>
        <Text>{t("mfa.description")}</Text>
      </div>

      <Container className="space-y-5 p-6">
        <p role="status" aria-live="polite">
          {loading ? t("mfa.loading") :
           message || (confirmed ? t("mfa.confirmed") :
           policy ? t("mfa.currentPolicy") : t("mfa.unavailable"))}
        </p>
        {denied && (
          <p role="alert">
            {t("mfa.denied")}{" "}
            <a href={reauthenticate}>{t("mfa.reauthenticate")}</a>.
          </p>
        )}
        <Button type="button" variant="secondary" disabled={loading || saving}
          onClick={() => { void refresh() }}>
          {t("mfa.reloadBtn")}
        </Button>

        {policy && !loading && (
          <>
            <p><strong>{t("mfa.savedMode")}</strong> {options.find(option =>
              option.value === policy.platform.platform_mode)?.name}</p>
            <p><strong>{t("mfa.policyVersion")}</strong> {policy.platform.version}</p>
            <p>
              <strong>{t("mfa.runtimeEnforcement")}</strong>{" "}
              {policy.runtime_enforcement === "enforced"
                ? t("mfa.enforced")
                : t("mfa.notEnforced")}
            </p>
            <form onSubmit={save} className="space-y-5">
              <fieldset disabled={saving || locked} className="space-y-3">
                <legend className="font-semibold">{t("mfa.legend")}</legend>
                {options.map(option => (
                  <label key={option.value} className="flex gap-3 items-start min-h-[48px]">
                    <input type="radio" name="platform-mode" value={option.value}
                      checked={selected === option.value}
                      onChange={() => setSelected(option.value)}
                      aria-describedby={"mfa-effect-" + option.value}
                      className="mt-1" />
                    <span>
                      <strong>{option.name}</strong>
                      <span id={"mfa-effect-" + option.value} className="block">
                        {option.effect}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p>
                {t("mfa.note")}
              </p>
              <Button type="submit" disabled={saving || locked || !hasChange}>
                {saving ? t("mfa.saving") : t("mfa.saveBtn")}
              </Button>
            </form>
          </>
        )}
      </Container>
    </div>
  )
}
