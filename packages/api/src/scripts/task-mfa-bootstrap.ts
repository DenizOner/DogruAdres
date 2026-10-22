import type { ExecArgs, IAuthModuleService } from "@medusajs/framework/types"
import { Client } from "@medusajs/framework/pg"
import { randomBytes } from "node:crypto"
import { writeFile, access, stat, realpath } from "node:fs/promises"
import path from "node:path"
import DogruAdresAccessModuleService from "../modules/dogruadres-access/service"
import { createUserAccountWorkflow } from "@medusajs/core-flows"

/**
 * Execution gate switch.
 * The task bootstrap runner is DELIBERATELY DISABLED until an authorized,
 * independently audited environment and signed manifest are formally commissioned.
 */
export const BOOTSTRAP_EXECUTION_GATE_OPEN = false

export interface TaskResourceManifest {
  readonly manifestVersion: string
  readonly taskEnvironmentId: string
  readonly targetDatabase: string
  readonly targetHost: string
  readonly targetPort: string
  readonly targetContainerName: string
  readonly targetVolumeName: string
  readonly authorizedOperator: string
  readonly signatureProof?: string
}

export const FORBIDDEN_DATABASE_PATTERNS: ReadonlyArray<RegExp> = [
  /^m0ssi_a7f1$/i,
  /^mfa_e2e.*$/i,
  /^medusa.*$/i,
  /^postgres$/i,
  /^template[01]$/i,
]

export const ALLOWED_LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
])

export function sanitizeAndDecodeDatabaseName(rawPathname: string): string {
  if (!rawPathname) return ""
  let decoded = rawPathname.replace(/^\//, "").trim()
  try {
    while (decoded.includes("%")) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
  } catch {
    throw new Error("REFUSED: Malformed percent-encoded database name in connection string")
  }
  return decoded.toLowerCase().trim()
}

export function validateSafeBasename(filename: string): string {
  if (!filename || typeof filename !== "string") {
    throw new Error("REFUSED: Output filename must be a non-empty string")
  }
  const trimmed = filename.trim()
  if (
    trimmed !== filename ||
    path.basename(trimmed) !== trimmed ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    !/^[a-zA-Z0-9_\-\.]+$/.test(trimmed)
  ) {
    throw new Error(`REFUSED: Output filename "${filename}" is not a strict safe basename`)
  }
  return trimmed
}

export async function validatePathSecurity(evidenceDir: string, cwd: string = process.cwd()): Promise<{
  realEvidenceDir: string
}> {
  const resolvedEvidence = path.resolve(evidenceDir)
  const resolvedCwd = path.resolve(cwd)

  let evidenceStat
  try {
    evidenceStat = await stat(resolvedEvidence)
  } catch {
    throw new Error(`REFUSED: Evidence directory does not exist or cannot be accessed: ${resolvedEvidence}`)
  }

  if (!evidenceStat.isDirectory()) {
    throw new Error(`REFUSED: Evidence path is not a directory: ${resolvedEvidence}`)
  }

  const realEvidenceDir = await realpath(resolvedEvidence)
  const realCwd = await realpath(resolvedCwd)

  const lowerEvidence = realEvidenceDir.toLowerCase()
  const lowerCwd = realCwd.toLowerCase()

  if (lowerEvidence === lowerCwd || lowerEvidence.startsWith(lowerCwd + path.sep)) {
    throw new Error(`REFUSED: Evidence directory (${realEvidenceDir}) resides inside worktree (${realCwd})`)
  }

  return { realEvidenceDir }
}

export function validateTargetAgainstManifest(
  targetUrl: URL,
  resourceManifest: TaskResourceManifest
): void {
  const normDbName = sanitizeAndDecodeDatabaseName(targetUrl.pathname)
  if (!normDbName) {
    throw new Error("REFUSED: Target database name is empty")
  }

  for (const pattern of FORBIDDEN_DATABASE_PATTERNS) {
    if (pattern.test(normDbName)) {
      throw new Error(`REFUSED: Target database "${normDbName}" matches protected/prohibited pattern ${pattern}`)
    }
  }

  const rawHost = targetUrl.hostname.toLowerCase().trim()
  if (!ALLOWED_LOOPBACK_HOSTS.has(rawHost)) {
    throw new Error(`REFUSED: Target host "${rawHost}" is not an allowed local loopback endpoint`)
  }

  const rawPort = targetUrl.port || "5432"

  if (normDbName !== resourceManifest.targetDatabase.toLowerCase().trim()) {
    throw new Error(
      `REFUSED: Database mismatch: actual "${normDbName}" != manifest "${resourceManifest.targetDatabase}"`
    )
  }

  if (rawHost !== resourceManifest.targetHost.toLowerCase().trim()) {
    throw new Error(
      `REFUSED: Host mismatch: actual "${rawHost}" != manifest "${resourceManifest.targetHost}"`
    )
  }

  if (rawPort !== resourceManifest.targetPort.trim()) {
    throw new Error(
      `REFUSED: Port mismatch: actual "${rawPort}" != manifest "${resourceManifest.targetPort}"`
    )
  }

  if (!resourceManifest.signatureProof || resourceManifest.signatureProof.length < 32) {
    throw new Error("REFUSED: Resource manifest lacks verified signature/authorization proof")
  }
}

export async function verifyCleanPreconditions(db: Client): Promise<void> {
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

export interface PartialRecoveryCheckpoint {
  readonly checkpointVersion: string
  readonly startedAt: string
  readonly targetDatabase: string
  status: "in_progress" | "failed" | "completed"
  completedSteps: string[]
  error?: string
  principals: Array<{
    label: "A" | "B"
    userId?: string
    authIdentityId?: string
    personId?: string
    bindingCreated: boolean
  }>
}

export default async function taskMfaBootstrap({ container }: ExecArgs): Promise<void> {
  if (!BOOTSTRAP_EXECUTION_GATE_OPEN) {
    throw new Error(
      "REFUSED: taskMfaBootstrap is locked by BOOTSTRAP_EXECUTION_GATE_OPEN = false. Execution is prohibited until an independently authorized clean environment is commissioned."
    )
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error("DATABASE_URL is missing")
  const targetUrl = new URL(dbUrl)

  const manifestPath = process.env.M0_RESOURCE_MANIFEST_PATH
  const evidenceDir = process.env.M0_FIXTURE_EVIDENCE_DIR
  const outputFilenameRaw = process.env.M0_BOOTSTRAP_OUTPUT_FILE || "task-mfa-users.private.json"

  if (!manifestPath || !evidenceDir) {
    throw new Error("REFUSED: Missing M0_RESOURCE_MANIFEST_PATH or M0_FIXTURE_EVIDENCE_DIR environment variables")
  }

  const safeOutputFilename = validateSafeBasename(outputFilenameRaw)
  const { realEvidenceDir } = await validatePathSecurity(evidenceDir)

  let resourceManifest: TaskResourceManifest
  try {
    const rawContent = await (await import("node:fs/promises")).readFile(manifestPath, "utf8")
    resourceManifest = JSON.parse(rawContent) as TaskResourceManifest
  } catch (err: unknown) {
    throw new Error(`REFUSED: Cannot read or parse resource manifest from ${manifestPath}: ${String(err)}`)
  }

  if (
    !resourceManifest.manifestVersion ||
    !resourceManifest.taskEnvironmentId ||
    !resourceManifest.targetDatabase ||
    !resourceManifest.targetHost ||
    !resourceManifest.targetPort ||
    !resourceManifest.authorizedOperator
  ) {
    throw new Error("REFUSED: Invalid resource manifest structure or missing mandatory attributes")
  }

  validateTargetAgainstManifest(targetUrl, resourceManifest)

  const targetOutputFile = path.join(realEvidenceDir, safeOutputFilename)
  const checkpointFile = path.join(realEvidenceDir, `${safeOutputFilename}.checkpoint.json`)

  try {
    await access(targetOutputFile)
    throw new Error(`REFUSED: Final output file ${safeOutputFilename} already exists in evidence dir`)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }

  try {
    await access(checkpointFile)
    throw new Error(`REFUSED: Previous incomplete checkpoint ${path.basename(checkpointFile)} exists. Manual forensic review required`)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }

  const recoveryState: PartialRecoveryCheckpoint = {
    checkpointVersion: "1.0.0",
    startedAt: new Date().toISOString(),
    targetDatabase: resourceManifest.targetDatabase,
    status: "in_progress",
    completedSteps: [],
    principals: [],
  }

  await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600, flag: "wx" })

  const db = new Client({ connectionString: dbUrl })
  await db.connect()

  const finalSecrets: Array<{
    label: "A" | "B"
    email: string
    password: string
    userId: string
    authIdentityId: string
    personId: string
  }> = []

  try {
    await verifyCleanPreconditions(db)
    recoveryState.completedSteps.push("preconditions_verified")
    await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600 })

    const auth: IAuthModuleService = container.resolve("auth")
    const foundation: DogruAdresAccessModuleService = container.resolve("dogruadresAccess")

    for (const label of ["A", "B"] as const) {
      const entropy = randomBytes(16).toString("hex")
      const email = `task-mfa-person-${label.toLowerCase()}-${entropy}@task.invalid`
      const password = randomBytes(32).toString("base64url")

      const reg = await auth.register("emailpass", { body: { email, password } })
      if (!reg.success || !reg.authIdentity) {
        throw new Error(`Failed native registration for Person ${label}`)
      }
      const authIdentityId = reg.authIdentity.id
      recoveryState.completedSteps.push(`auth_registered_${label}`)
      await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600 })

      const workflowResult = await createUserAccountWorkflow(container).run({
        input: {
          authIdentityId,
          userData: { email },
        },
      })
      const user = workflowResult.result
      if (!user || !user.id) {
        throw new Error(`Failed official createUserAccountWorkflow for Person ${label}`)
      }
      recoveryState.completedSteps.push(`user_account_workflow_completed_${label}`)
      await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600 })

      const verify = await auth.authenticate("emailpass", { body: { email, password } })
      if (!verify.success || verify.authIdentity?.app_metadata?.user_id !== user.id) {
        throw new Error(`Server-side native User ownership verification failed for Person ${label}`)
      }
      recoveryState.completedSteps.push(`ownership_verified_${label}`)
      await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600 })

      const factors = await auth.listAuthMfa({ auth_identity_id: authIdentityId })
      if (factors.length > 0) {
        throw new Error(`Integrity violation: Pre-existing MFA factor on fresh Person ${label}`)
      }

      const [person] = await foundation.createPeople([
        { display_name: `Task Person ${label}` },
      ])
      recoveryState.completedSteps.push(`person_created_${label}`)
      await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600 })

      await foundation.createActorMappings([
        {
          actor_type: "user",
          actor_id: user.id,
          person_id: person.id,
          created_by_actor_type: "user",
          created_by_actor_id: user.id,
        },
      ])
      recoveryState.completedSteps.push(`actor_mapped_${label}`)
      await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600 })

      await db.query(
        `INSERT INTO da_login_binding (auth_identity_id, person_id, actor_type, actor_id, verified_at)
         VALUES ($1, $2, 'user', $3, now())`,
        [authIdentityId, person.id, user.id]
      )
      recoveryState.completedSteps.push(`binding_inserted_${label}`)

      recoveryState.principals.push({
        label,
        userId: user.id,
        authIdentityId,
        personId: person.id,
        bindingCreated: true,
      })
      await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600 })

      finalSecrets.push({
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
        manifest: resourceManifest,
        principals: finalSecrets,
      },
      null,
      2
    )

    await writeFile(targetOutputFile, payload, { mode: 0o600, flag: "wx" })
    recoveryState.status = "completed"
    await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600 })

    console.log(`[task-mfa-bootstrap] Prepared 2 canonical Persons and verified login bindings in ${resourceManifest.targetDatabase}`)
  } catch (err: unknown) {
    recoveryState.status = "failed"
    recoveryState.error = err instanceof Error ? err.message : "Bootstrap operation failed"
    try {
      await writeFile(checkpointFile, JSON.stringify(recoveryState, null, 2), { mode: 0o600 })
    } catch {
      // Best-effort write of failure state
    }
    throw err
  } finally {
    await db.end()
  }
}