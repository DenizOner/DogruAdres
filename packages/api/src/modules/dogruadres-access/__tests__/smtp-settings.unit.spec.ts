import {
  PlatformSmtpPersistence,
  SmtpConcurrentUpdateError,
  InvalidSmtpSettingsState,
  type SmtpAuditActor,
  type UpdateSmtpSettingsInput,
} from "../smtp-settings"
import type { SecuritySql } from "../identity-session"

describe("smtp-settings unit tests", () => {
  const originalKey = process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY
  const dummyActor: SmtpAuditActor = {
    person_id: "daprs_01TEST_PERSON_A",
    actor_type: "user",
    actor_id: "usr_01TEST_USER_A",
  }

  beforeEach(() => {
    process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  })

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY = originalKey
    } else {
      delete process.env.DOGRUADRES_SMTP_ENCRYPTION_KEY
    }
  })

  it("reads default bootstrap settings when table is empty", async () => {
    const mockDb: SecuritySql = {
      execute: jest.fn().mockResolvedValue([]),
    }
    const store = new PlatformSmtpPersistence(mockDb)
    const settings = await store.readSettings()

    expect(settings.enabled).toBe(true)
    expect(settings.version).toBe(0)
    expect(settings.has_password).toBe(Boolean(process.env.SMTP_PASSWORD))
  })

  it("rejects private IP / loopback addresses for SSRF protection", async () => {
    const mockDb: SecuritySql = {
      execute: jest.fn().mockResolvedValue([]),
    }
    const store = new PlatformSmtpPersistence(mockDb)

    const input: UpdateSmtpSettingsInput = {
      enabled: true,
      host: "127.0.0.1",
      port: 465,
      security: "ssl",
      from_email: "admin@dogruadres.com",
      expected_version: 0,
    }

    await expect(store.updateSettings(input, dummyActor)).rejects.toThrow(
      InvalidSmtpSettingsState
    )
  })

  it("inserts new settings row when expected_version is 0 and records audit", async () => {
    const executedQueries: Array<{ sql: string; params: any[] }> = []
    const mockDb: SecuritySql = {
      execute: jest.fn().mockImplementation((sql: string, params: any[] = []) => {
        executedQueries.push({ sql, params })
        if (sql.includes("select pg_advisory_xact_lock")) return Promise.resolve([])
        if (sql.includes("from da_platform_smtp_settings where id='current'")) return Promise.resolve([])
        if (sql.includes("insert into da_platform_smtp_settings")) return Promise.resolve([])
        if (sql.includes("insert into da_audit_event")) return Promise.resolve([])
        if (sql.includes("insert into da_security_outbox")) return Promise.resolve([])
        return Promise.resolve([])
      }),
    }

    const store = new PlatformSmtpPersistence(mockDb)
    const input: UpdateSmtpSettingsInput = {
      enabled: true,
      host: "smtp.sendgrid.net",
      port: 465,
      security: "ssl",
      username: "apikey",
      password: "SG.supersecret",
      from_email: "notifications@dogruadres.com",
      from_name: "DogruAdres Platform",
      expected_version: 0,
    }

    const updated = await store.updateSettings(input, dummyActor)
    expect(updated.version).toBe(1)
    expect(updated.host).toBe("smtp.sendgrid.net")
    expect(updated.has_password).toBe(true)

    const insertSettingQuery = executedQueries.find((q) =>
      q.sql.includes("insert into da_platform_smtp_settings")
    )
    expect(insertSettingQuery).toBeDefined()
    expect(insertSettingQuery?.params[5]).toMatch(/^v1:/) // password_encrypted

    const auditQuery = executedQueries.find((q) =>
      q.sql.includes("insert into da_audit_event")
    )
    expect(auditQuery).toBeDefined()
    expect(auditQuery?.params[4]).toBe("platform.smtp_settings_updated")
    expect(auditQuery?.params[9]).not.toContain("SG.supersecret") // Never leaks plaintext secret in audit!
  })

  it("throws SmtpConcurrentUpdateError when version does not match expected_version", async () => {
    const mockDb: SecuritySql = {
      execute: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes("select pg_advisory_xact_lock")) return Promise.resolve([])
        if (sql.includes("from da_platform_smtp_settings where id='current'")) {
          return Promise.resolve([
            {
              enabled: true,
              host: "smtp.example.com",
              port: 465,
              security: "ssl",
              version: 2,
            },
          ])
        }
        return Promise.resolve([])
      }),
    }

    const store = new PlatformSmtpPersistence(mockDb)
    const input: UpdateSmtpSettingsInput = {
      enabled: true,
      host: "smtp.example.com",
      port: 465,
      security: "ssl",
      from_email: "test@example.com",
      expected_version: 1, // Stale version!
    }

    await expect(store.updateSettings(input, dummyActor)).rejects.toThrow(
      SmtpConcurrentUpdateError
    )
  })
})
