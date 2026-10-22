import type { ExecArgs, IAuthModuleService, IUserModuleService } from "@medusajs/framework/types"
import { Client } from "@medusajs/framework/pg"
import { randomBytes } from "node:crypto"
import { writeFile, access } from "node:fs/promises"
import path from "node:path"
import DogruAdresAccessModuleService from "../modules/dogruadres-access/service"

export interface TaskBootstrapManifest {
  readonly allowedHost: string
  readonly allowedPort: string
  readonly allowedDatabase: string
  readonly evidenceDir: string
  readonly outputSecretFilename: string
}

export const PROTECTED_ENVIRONMENTS: ReadonlyArray<{ hostname: string; port: string; database: string }> = [
  { hostname: "127.0.0.1", port: "55700", database: "mfa_e2e_fresh" },
  { hostname: "127.0.0.1", port: "55710", database: "mfa_e2e_fresh" },
  { hostname: "127.0.0.1", port: "55631", database: "m0ssi_a7f1" },
  { hostname: "127.0.0.1", port: "9000", database: "medusa" },
  { hostname: "localhost", port: "5432", database: "medusa-docker" },
]

export function validateEnvironmentSafety(
  targetUrl: URL,
  manifest: TaskBootstrapManifest,
  cwd: string = process.cwd()
): void {
  const normHost = targetUrl.hostname.toLowerCase()
  const normPort = targetUrl.port || "5432"
  const normDb = targetUrl.pathname.replace(/^\//, "").toLowerCase()

  for (const protectedEnv of PROTECTED_ENVIRONMENTS) {
    if (
      normHost === protectedEnv.hostname.toLowerCase() &&
      normPort === protectedEnv.port &&
      normDb === protectedEnv.database.toLowerCase()
    ) {
      throw new Error(`REFUSED: Target matches protected environment (${protectedEnv.hostname}:${protectedEnv.port}/${protectedEnv.database})`)
    }
  }

  if (
    normHost !== manifest.allowedHost.toLowerCase() ||
    normPort !== manifest.allowedPort ||
    normDb !== manifest.allowedDatabase.toLowerCase()
  ) {
    throw new Error(
      `REFUSED: Target (${normHost}:${normPort}/${normDb}) does not match authorized manifest (${manifest.allowedHost}:${manifest.allowedPort}/${manifest.allowedDatabase})`
    )
  }

  const resolvedEvidence = path.resolve(manifest.evidenceDir).toLowerCase()
  const resolvedCwd = path.resolve(cwd).toLowerCase()
  if (resolvedEvidence.startsWith(resolvedCwd)) {
    throw new Error("REFUSED: Evidence directory must reside outside repository worktree")
  }
}

export async function verifyPreconditions(db: Client): Promise<void> {
  const userCountRes = await db.query('SELECT count(*)::int as cnt FROM "user"')
  if (userCountRes.rows[0].cnt > 0) {
    throw new Error(`REFUSED: Target database already contains ${userCountRes.rows[0].cnt} User records`)
  }

  const authCountRes = await db.query("SELECT count(*)::int as cnt FROM auth_identity")
  if (authCountRes.rows[0].cnt > 0) {
    throw new Error(`REFUSED: Target database already contains ${authCountRes.rows[0].cnt} AuthIdentity records`)
  }

  const bindingCountRes = await db.query("SELECT count(*)::int as cnt FROM da_login_binding")
  if (bindingCountRes.rows[0].cnt > 0) {
    throw new Error(`REFUSED: Target database already contains ${bindingCountRes.rows[0].cnt} da_login_binding records`)
  }

  const personCountRes = await db.query("SELECT count(*)::int as cnt FROM da_person")
  if (personCountRes.rows[0].cnt > 0) {
    throw new Error(`REFUSED: Target database already contains ${personCountRes.rows[0].cnt} da_person records`)
  }
}

export default async function taskMfaBootstrap({ container }: ExecArgs): Promise<void> {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error("DATABASE_URL is missing")
  const targetUrl = new URL(dbUrl)

  const allowedHost = process.env.M0_BOOTSTRAP_ALLOWED_HOST
  const allowedPort = process.env.M0_BOOTSTRAP_ALLOWED_PORT
  const allowedDatabase = process.env.M0_BOOTSTRAP_ALLOWED_DB
  const evidenceDir = process.env.M0_FIXTURE_EVIDENCE_DIR
  const outputSecretFilename = process.env.M0_BOOTSTRAP_OUTPUT_FILE || "task-mfa-users.private.json"

  if (!allowedHost || !allowedPort || !allowedDatabase || !evidenceDir) {
    throw new Error("REFUSED: Missing required task authorization manifest environment variables")
  }

  const manifest: TaskBootstrapManifest = {
    allowedHost,
    allowedPort,
    allowedDatabase,
    evidenceDir,
    outputSecretFilename,
  }

  validateEnvironmentSafety(targetUrl, manifest)

  const targetOutputFile = path.join(manifest.evidenceDir, manifest.outputSecretFilename)
  try {
    await access(targetOutputFile)
    throw new Error(`REFUSED: Output file ${manifest.outputSecretFilename} already exists in evidence dir`)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }

  const db = new Client({ connectionString: dbUrl })
  await db.connect()

  try {
    await verifyPreconditions(db)

    const auth: IAuthModuleService = container.resolve("auth")
    const users: IUserModuleService = container.resolve("user")
    const foundation: DogruAdresAccessModuleService = container.resolve("dogruadresAccess")

    const principals: Array<{
      label: "A" | "B"
      email: string
      password: string
      userId: string
      authIdentityId: string
      personId: string
    }> = []

    for (const label of ["A", "B"] as const) {
      const entropy = randomBytes(16).toString("hex")
      const email = `task-mfa-person-${label.toLowerCase()}-${entropy}@task.invalid`
      const password = randomBytes(32).toString("base64url")

      const user = await users.createUsers({ email })

      const reg = await auth.register("emailpass", { body: { email, password } })
      if (!reg.success || !reg.authIdentity) {
        throw new Error(`Failed native registration for Person ${label}`)
      }
      const authIdentityId = reg.authIdentity.id

      await auth.updateAuthIdentities({
        id: authIdentityId,
        app_metadata: { user_id: user.id },
      })

      const verify = await auth.authenticate("emailpass", { body: { email, password } })
      if (!verify.success || verify.authIdentity?.app_metadata?.user_id !== user.id) {
        throw new Error(`Server-side native User ownership verification failed for Person ${label}`)
      }

      const factors = await auth.listAuthMfa({ auth_identity_id: authIdentityId })
      if (factors.length > 0) {
        throw new Error(`Integrity violation: Pre-existing MFA factor on fresh Person ${label}`)
      }

      const [person] = await foundation.createPeople([
        { display_name: `Task Person ${label}` },
      ])

      await foundation.createActorMappings([
        {
          actor_type: "user",
          actor_id: user.id,
          person_id: person.id,
          created_by_actor_type: "user",
          created_by_actor_id: user.id,
        },
      ])

      await db.query(
        `INSERT INTO da_login_binding (auth_identity_id, person_id, actor_type, actor_id, verified_at)
         VALUES ($1, $2, 'user', $3, now())`,
        [authIdentityId, person.id, user.id]
      )

      principals.push({
        label,
        email,
        password,
        userId: user.id,
        authIdentityId,
        personId: person.id,
      })
    }

    const payload = JSON.stringify(
      {
        created_at: new Date().toISOString(),
        target_database: manifest.allowedDatabase,
        principals,
      },
      null,
      2
    )

    await writeFile(targetOutputFile, payload, { mode: 0o600, flag: "wx" })
    console.log(`[task-mfa-bootstrap] Successfully prepared 2 canonical Persons and verified login bindings in ${manifest.allowedDatabase}`)
  } finally {
    await db.end()
  }
}