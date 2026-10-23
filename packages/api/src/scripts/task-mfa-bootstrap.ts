import type { ExecArgs, IAuthModuleService } from "@medusajs/framework/types"
import { Client } from "@medusajs/framework/pg"
import { randomBytes } from "node:crypto"
import { writeFile, access, stat, realpath } from "node:fs/promises"
import path from "node:path"
import DogruAdresAccessModuleService from "../modules/dogruadres-access/service"
import { createUserAccountWorkflow } from "@medusajs/core-flows"
import {
  SignedTaskManifest,
  TaskResourceManifest,
  verifySignedManifest,
  createTrustedOperatorRegistry,
  redactSensitiveData,
  PinnedOperatorApproval,
  TrustedOperatorRegistry,
  RuntimeResourceAdapter,
  AtomicNonceStorageAdapter,
  SecurityEnvironmentAdapter,
  DatabaseReadbackAdapter,
  DurableAtomicNonceStore,
  FilesystemDurableCheckpointAdapter,
  DurableCheckpointManager,
  PartialRecoveryCheckpoint,
  executeBootstrapController,
} from "./operator-audit-protocol"

/**
 * Execution gate switch.
 * The task bootstrap runner is DELIBERATELY DISABLED (BLOCKED) until an authorized,
 * independently audited environment and pinned operator manifest are formally commissioned.
 */
export const BOOTSTRAP_EXECUTION_GATE_OPEN = false

/**
 * No operator key, identity or execution target has been independently
 * commissioned. Do not initialize this from a manifest, path or environment
 * variable. It requires a separately approved, source-reviewed runtime controller.
 */
export const INDEPENDENT_PINNED_OPERATOR_APPROVAL: PinnedOperatorApproval | null = null

/**
 * In this source-only checkpoint, no real Docker daemon, persistent database
 * or independent readback adapter has been commissioned.
 */
export const NATIVE_RESOURCE_ADAPTER: RuntimeResourceAdapter | null = null
export const NATIVE_NONCE_STORAGE_ADAPTER: AtomicNonceStorageAdapter | null = null
export const NATIVE_SECURITY_ADAPTER: SecurityEnvironmentAdapter | null = null
export const NATIVE_READBACK_ADAPTER: DatabaseReadbackAdapter | null = null

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
  resourceManifest: TaskResourceManifest,
  trustedRegistry: TrustedOperatorRegistry,
  signedManifest?: SignedTaskManifest
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

  if (!signedManifest) {
    throw new Error("REFUSED: Signed manifest payload is missing")
  }

  verifySignedManifest(signedManifest, trustedRegistry)
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

export { PartialRecoveryCheckpoint }

export default async function taskMfaBootstrap({ container }: ExecArgs): Promise<void> {
  try {
    if (!BOOTSTRAP_EXECUTION_GATE_OPEN) {
      throw new Error(
        "REFUSED: taskMfaBootstrap is locked by BOOTSTRAP_EXECUTION_GATE_OPEN = false. Execution is prohibited until an independently authorized clean environment is commissioned."
      )
    }

    if (!INDEPENDENT_PINNED_OPERATOR_APPROVAL) {
      throw new Error(
        "REFUSED: taskMfaBootstrap is locked by INDEPENDENT_PINNED_OPERATOR_APPROVAL = null. Execution requires an independently approved and source-pinned authorization."
      )
    }

    if (
      !NATIVE_RESOURCE_ADAPTER ||
      !NATIVE_NONCE_STORAGE_ADAPTER ||
      !NATIVE_SECURITY_ADAPTER ||
      !NATIVE_READBACK_ADAPTER
    ) {
      throw new Error(
        "REFUSED: Required native runtime adapters (Resource, NonceStorage, Security, Readback) are not commissioned. Execution remains strictly fail-closed."
      )
    }

    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) throw new Error("DATABASE_URL is missing")
    const targetUrl = new URL(dbUrl)

    const manifestPath = process.env.M0_RESOURCE_MANIFEST_PATH
    const evidenceDir = process.env.M0_FIXTURE_EVIDENCE_DIR
    const outputFilenameRaw = process.env.M0_BOOTSTRAP_OUTPUT_FILE || "task-mfa-users.private.json"
    const trustedRegistryPath = process.env.M0_TRUSTED_REGISTRY_PATH

    if (!manifestPath || !evidenceDir || !trustedRegistryPath) {
      throw new Error("REFUSED: Missing M0_RESOURCE_MANIFEST_PATH, M0_FIXTURE_EVIDENCE_DIR, or M0_TRUSTED_REGISTRY_PATH")
    }

    const safeOutputFilename = validateSafeBasename(outputFilenameRaw)
    const { realEvidenceDir } = await validatePathSecurity(evidenceDir)

    let signedManifest: SignedTaskManifest
    try {
      const rawContent = await (await import("node:fs/promises")).readFile(manifestPath, "utf8")
      signedManifest = JSON.parse(rawContent) as SignedTaskManifest
    } catch (err: unknown) {
      throw new Error(`REFUSED: Cannot read or parse resource manifest from ${manifestPath}: ${String(err)}`)
    }

    let trustedRegistry: TrustedOperatorRegistry
    try {
      const registryRaw = await (await import("node:fs/promises")).readFile(trustedRegistryPath, "utf8")
      const parsedRegistry = JSON.parse(registryRaw)
      trustedRegistry = createTrustedOperatorRegistry(parsedRegistry, INDEPENDENT_PINNED_OPERATOR_APPROVAL)
    } catch (err: unknown) {
      throw new Error(`REFUSED: Cannot construct validated operator registry from ${trustedRegistryPath}: ${String(err)}`)
    }

    validateTargetAgainstManifest(targetUrl, signedManifest.manifest, trustedRegistry, signedManifest)

    const targetOutputFile = path.join(realEvidenceDir, safeOutputFilename)
    const checkpointFile = path.join(realEvidenceDir, `${safeOutputFilename}.checkpoint.json`)

    try {
      await access(targetOutputFile)
      throw new Error(`REFUSED: Final output file ${safeOutputFilename} already exists in evidence dir`)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }

    // Preflight: Inspect path security BEFORE any file or database mutations
    const nonceStore = new DurableAtomicNonceStore(NATIVE_NONCE_STORAGE_ADAPTER)
    const pathInspection = await NATIVE_SECURITY_ADAPTER.inspectPathSecurity(realEvidenceDir)

    const executionCtx = {
      executionGateOpen: BOOTSTRAP_EXECUTION_GATE_OPEN,
      pinnedApproval: INDEPENDENT_PINNED_OPERATOR_APPROVAL,
      registryData: JSON.parse(await (await import("node:fs/promises")).readFile(trustedRegistryPath, "utf8")),
      signedManifest,
      resourceAdapter: NATIVE_RESOURCE_ADAPTER,
      nonceStore,
      pathSecurityInspection: pathInspection,
      connectionString: dbUrl,
    }

    // Preflight controller execution: Gate, Pin, Manifest, Resource Ownership, Nonce claim
    // Must succeed BEFORE any filesystem checkpoint creation or database connection
    await executeBootstrapController(executionCtx, async () => {
      // 1. Exclusive non-clobber reservation of checkpoint file
      const checkpointAdapter = new FilesystemDurableCheckpointAdapter()
      const checkpointManager = new DurableCheckpointManager(checkpointAdapter)

      const recoveryState = await checkpointManager.initializeCheckpoint(
        checkpointFile,
        signedManifest.manifest.targetDatabase
      )

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
        await checkpointManager.recordStep(checkpointFile, recoveryState, "preconditions_verified")

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
          // Record authIdentityId immediately at the earliest safe point
          await checkpointManager.recordStep(
            checkpointFile,
            recoveryState,
            `auth_registered_${label}`,
            { label, authIdentityId }
          )

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
          // Record userId immediately at the earliest safe point
          await checkpointManager.recordStep(
            checkpointFile,
            recoveryState,
            `user_account_workflow_completed_${label}`,
            { label, userId: user.id }
          )

          const verify = await auth.authenticate("emailpass", { body: { email, password } })
          if (!verify.success || verify.authIdentity?.app_metadata?.user_id !== user.id) {
            throw new Error(`Server-side native User ownership verification failed for Person ${label}`)
          }
          await checkpointManager.recordStep(checkpointFile, recoveryState, `ownership_verified_${label}`)

          const factors = await auth.listAuthMfa({ auth_identity_id: authIdentityId })
          if (factors.length > 0) {
            throw new Error(`Integrity violation: Pre-existing MFA factor on fresh Person ${label}`)
          }

          const [person] = await foundation.createPeople([
            { display_name: `Task Person ${label}` },
          ])
          // Record personId immediately at the earliest safe point
          await checkpointManager.recordStep(
            checkpointFile,
            recoveryState,
            `person_created_${label}`,
            { label, personId: person.id }
          )

          await foundation.createActorMappings([
            {
              actor_type: "user",
              actor_id: user.id,
              person_id: person.id,
              created_by_actor_type: "user",
              created_by_actor_id: user.id,
            },
          ])
          await checkpointManager.recordStep(checkpointFile, recoveryState, `actor_mapped_${label}`)

          await db.query(
            `INSERT INTO da_login_binding (auth_identity_id, person_id, actor_type, actor_id, verified_at)
             VALUES ($1, $2, 'user', $3, now())`,
            [authIdentityId, person.id, user.id]
          )
          // Record login binding immediately at the earliest safe point
          await checkpointManager.recordStep(
            checkpointFile,
            recoveryState,
            `binding_inserted_${label}`,
            { label, bindingCreated: true }
          )

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
            manifest: signedManifest.manifest,
            principals: finalSecrets,
          },
          null,
          2
        )

        await writeFile(targetOutputFile, payload, { mode: 0o600, flag: "wx" })
        await checkpointManager.markCompleted(checkpointFile, recoveryState)

        console.log(`[task-mfa-bootstrap] Prepared 2 canonical Persons and verified login bindings in ${signedManifest.manifest.targetDatabase}`)
      } catch (err: unknown) {
        // Handle crash windows as indeterminate when mutations have begun
        const hasMutations = recoveryState.completedSteps.some(
          (s) => s.startsWith("auth_registered_") || s.startsWith("user_") || s.startsWith("person_")
        )
        await checkpointManager.recordFailure(checkpointFile, recoveryState, err, hasMutations)
        throw err
      } finally {
        await db.end()
      }
    })
  } catch (err: unknown) {
    const sanitizedMsg = redactSensitiveData(err instanceof Error ? err.message : String(err))
    throw new Error(sanitizedMsg)
  }
}