import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import path from "node:path"
import { promisify } from "node:util"
import { realpath, lstat, open } from "node:fs/promises"
import { Client } from "@medusajs/framework/pg"
import type {
  SecurityEnvironmentAdapter,
  PathSecurityInspection,
  AccessControlEntry,
  RuntimeResourceAdapter,
  AtomicNonceStorageAdapter,
  DatabaseReadbackAdapter,
  CommittedStateEvidence,
} from "./operator-audit-protocol"
import {
} from "./operator-audit-protocol"

const execFileAsync = promisify(execFile)

/**
 * Real Windows filesystem security adapter:
 * - inspectPathSecurity: queries real NTFS owner, explicit/inherited ACEs, and reparse point status.
 * - Uses .NET GetAccessControl to bypass Windows PowerShell 5.1 module loading anomalies.
 */
export class NativeWindowsSecurityAdapter implements SecurityEnvironmentAdapter {
  async inspectPathSecurity(targetPath: string): Promise<PathSecurityInspection> {
    // Real Windows ACL verification must never silently degrade to fabricated
    // POSIX results in Linux CI or other unsupported environments.
    if (process.platform !== "win32") {
      throw new Error("BLOCKED: Native Windows NTFS ACL inspection requires win32")
    }
    const rawTarget = path.resolve(targetPath)
    let cursor = rawTarget
    let isReparsePoint = false
    while (true) {
      if ((await lstat(cursor)).isSymbolicLink()) isReparsePoint = true
      const parent = path.dirname(cursor)
      if (parent === cursor) break
      cursor = parent
    }
    const realTarget = await realpath(rawTarget)
    if (path.normalize(realTarget).toLowerCase() !== path.normalize(rawTarget).toLowerCase()) {
      isReparsePoint = true
    }

    const psScript = `
      $target = '${realTarget.replace(/'/g, "''")}';
      $isDir = [System.IO.Directory]::Exists($target);
      $acl = if ($isDir) {
        [System.IO.Directory]::GetAccessControl($target)
      } else {
        [System.IO.File]::GetAccessControl($target)
      };
      $owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;
      $entries = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | ForEach-Object {
        @{
          principal = $_.IdentityReference.Value
          rights = @($_.FileSystemRights.ToString().Split(', ') | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
          accessType = $_.AccessControlType.ToString()
          isInherited = $_.IsInherited
        }
      });
      $item = Get-Item -LiteralPath $target;
      $isReparse = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0;
      [PSCustomObject]@{
        owner = $owner
        isReparse = $isReparse
        entries = $entries
      } | ConvertTo-Json -Depth 5 -Compress
    `

    const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", psScript])
    const parsed = JSON.parse(stdout.trim())

    const entries: AccessControlEntry[] = (parsed.entries || []).map((e: any) => ({
      principal: e.principal,
      rights: Array.isArray(e.rights) ? e.rights : [String(e.rights)],
      accessType: e.accessType === "Deny" ? ("Deny" as const) : ("Allow" as const),
      isInherited: Boolean(e.isInherited),
    }))

    return {
      path: realTarget,
      owner: String(parsed.owner || ""),
      isReparsePoint: Boolean(parsed.isReparse) || isReparsePoint,
      entries,
    }
  }
}

/**
 * Real Docker & PostgreSQL runtime resource adapter:
 * - inspectContainer: queries Docker engine via CLI inspecting real container status and volume names.
 * - inspectDatabase: connects to PostgreSQL to query database name and exclusive session count.
 * - getCurrentGitSha: resolves HEAD SHA from Git worktree.
 * - getOperatorPrincipal: queries current operating system security principal (whoami).
 */
/**
 * Expected identity MUST come from a separately approved, signed and pinned
 * task manifest; it must never be inferred from Docker names or local env.
 */
export interface ApprovedRuntimeResourceBinding {
  readonly containerId: string
  readonly imageId: string
  readonly composeProject: string
  readonly volumeName: string
  readonly volumeMountSource: string
  readonly volumeMountDestination: string
  readonly loopbackHostPort: string
  readonly postgresSystemIdentifier: string
}

export function assertDockerResourceMatchesBinding(
  actual: any,
  expected: ApprovedRuntimeResourceBinding
): void {
  if (!/^[a-f0-9]{64}$/i.test(expected.containerId) ||
      !/^sha256:[a-f0-9]{64}$/i.test(expected.imageId) ||
      !expected.composeProject || !expected.volumeName ||
      !expected.volumeMountSource || !expected.volumeMountDestination ||
      !/^\d+$/.test(expected.loopbackHostPort) ||
      !/^\d{10,25}$/.test(expected.postgresSystemIdentifier)) {
    throw new Error("REFUSED: Immutable resource binding is incomplete or malformed")
  }
  const pgBindings = actual?.HostConfig?.PortBindings?.["5432/tcp"]
  const volumeMounts = actual?.Mounts ?? []
  const approvedMount = Array.isArray(volumeMounts) && volumeMounts.some((m: any) =>
    m.Type === "volume" &&
    m.Name === expected.volumeName &&
    m.Source === expected.volumeMountSource &&
    m.Destination === expected.volumeMountDestination
  )
  if (actual?.Id !== expected.containerId ||
      actual?.Image !== expected.imageId ||
      actual?.State?.Running !== true ||
      actual?.Config?.Labels?.["com.docker.compose.project"] !== expected.composeProject ||
      !approvedMount ||
      !Array.isArray(pgBindings) || pgBindings.length !== 1 ||
      pgBindings[0]?.HostIp !== "127.0.0.1" ||
      pgBindings[0]?.HostPort !== expected.loopbackHostPort) {
    throw new Error("REFUSED: Actual immutable Docker identity, volume mount or loopback binding differs from independently approved target")
  }
}

export class NativeDockerResourceAdapter implements RuntimeResourceAdapter {
  private workspaceDir: string

  constructor(
    workspaceDir: string = process.cwd(),
    private readonly approvedBinding: ApprovedRuntimeResourceBinding | null = null
  ) {
    this.workspaceDir = workspaceDir
  }

  async inspectContainer(containerNameOrId: string): Promise<{
    exists: boolean
    isRunning: boolean
    volumeNames: string[]
  }> {
    let stdout: string
    try {
      const result = await execFileAsync("docker", [
        "inspect", "--type", "container", "--format", "{{json .}}", containerNameOrId,
      ])
      stdout = result.stdout
    } catch {
      return { exists: false, isRunning: false, volumeNames: [] }
    }
    // A found container is never accepted from its mutable name alone.
    if (!this.approvedBinding) {
      throw new Error("BLOCKED: Independent immutable Docker binding has not been commissioned")
    }
    const data = JSON.parse(stdout.trim())
    assertDockerResourceMatchesBinding(data, this.approvedBinding)
    return { exists: true, isRunning: true, volumeNames: [this.approvedBinding.volumeName] }
  }

  async inspectDatabase(connectionString: string): Promise<{
    dbName: string
    isExclusive: boolean
  }> {
    // Reject an uncommissioned adapter BEFORE opening any database connection.
    if (!this.approvedBinding) {
      throw new Error("BLOCKED: Independent PostgreSQL instance binding has not been commissioned")
    }
    const client = new Client({ connectionString })
    await client.connect()
    try {
      const dbRes = await client.query("SELECT current_database() as name")
      const dbName = dbRes.rows[0]?.name || ""
      // Cluster system identifier defeats substitution of a different PG
      // server answering at the same name/port. The caller must be allowed
      // to read pg_control_system(); lack of permission fails closed.
      const serverRes = await client.query("SELECT system_identifier::text AS id FROM pg_control_system()")
      if (String(serverRes.rows[0]?.id ?? "") !== this.approvedBinding.postgresSystemIdentifier) {
        throw new Error("REFUSED: Actual PostgreSQL cluster identifier differs from pinned target")
      }

      const connRes = await client.query(
        "SELECT count(*)::int as cnt FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()"
      )
      const otherConnections = connRes.rows[0]?.cnt || 0

      return {
        dbName,
        isExclusive: otherConnections === 0,
      }
    } finally {
      await client.end()
    }
  }

  async getCurrentGitSha(): Promise<string> {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: this.workspaceDir,
    })
    return stdout.trim()
  }

  async getOperatorPrincipal(): Promise<{ windowsPrincipal: string }> {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("whoami", ["/user", "/fo", "csv", "/nh"])
      const sid = stdout.match(/S-1-\d+(?:-\d+)+/i)?.[0]
      if (!sid) throw new Error("REFUSED: Cannot verify the real Windows security SID")
      return { windowsPrincipal: sid.toLowerCase() }
    }
    const user = process.env.USER || "unknown"
    return { windowsPrincipal: user.toLowerCase() }
  }
}

/**
 * Real PostgreSQL atomic nonce storage adapter:
 * - Uses dedicated nonce claim table with primary key / unique constraint.
 * - Guarantees atomic, crash-safe, race-free single claim.
 */
export class NativePostgresAtomicNonceAdapter implements AtomicNonceStorageAdapter {
  constructor(private readonly connectionString: string) {}

  async claimIfAbsent(entry: { nonce: string; runId: string; expiresAt: string }): Promise<boolean> {
    // Schema provisioning is a distinct migration, NEVER a hidden side effect
    // of an anti-replay claim. Missing table must fail closed.
    const client = new Client({ connectionString: this.connectionString })
    await client.connect()
    try {
      const result = await client.query(
        `INSERT INTO da_task_nonce_claim (nonce, run_id, expires_at)
         VALUES ($1, $2, $3) ON CONFLICT (nonce) DO NOTHING RETURNING nonce`,
        [entry.nonce, entry.runId, entry.expiresAt]
      )
      return (result.rowCount ?? 0) === 1
    } finally {
      await client.end()
    }
  }
}

/**
 * Real filesystem atomic nonce storage adapter:
 * - Uses atomic POSIX/Windows wx open flag (exclusive file creation).
 * - Race-safe across concurrent processes on the local machine.
 */
export class NativeFileAtomicNonceAdapter implements AtomicNonceStorageAdapter {
  constructor(private storageDir: string) {}

  async claimIfAbsent(entry: { nonce: string; runId: string; expiresAt: string }): Promise<boolean> {
    if (!entry.nonce || !entry.runId || !Number.isFinite(Date.parse(entry.expiresAt))) {
      throw new Error("REFUSED: Invalid persistent nonce claim data")
    }
    // A hash avoids collisions for distinct nonces such as "a/b" and "a?b".
    const nonceDigest = createHash("sha256").update(entry.nonce, "utf8").digest("hex")
    const nonceFile = path.join(this.storageDir, `nonce_${nonceDigest}.claim`)
    try {
      const handle = await open(nonceFile, "wx", 0o600)
      try {
        await handle.writeFile(
          JSON.stringify({
            nonce: entry.nonce,
            runId: entry.runId,
            expiresAt: entry.expiresAt,
            claimedAt: new Date().toISOString(),
            pid: process.pid,
          })
        )
        await handle.sync()
      } finally {
        await handle.close()
      }
      // Even with file fsync, directory-entry durability and Windows ACLs
      // require separate native evidence. No automatic retry after a crash.
      return true
    } catch (err: any) {
      if (err.code === "EEXIST") {
        return false
      }
      throw err
    }
  }
}

/**
 * R1 readback remains UNCOMMISSIONED: checking the latch is insufficient
 * to independently attest the exact committed transaction. Never fabricate
 * ARMED provenance from caller-controlled transaction hashes.
 */
export class NativePostgresReadbackAdapter implements DatabaseReadbackAdapter {
  constructor(private readonly connectionString:string,private readonly commissioning?:import("./r1-commit-readback").R1ReadbackCommission) {}
  async queryCommittedState(targetDatabase:string,transactionHash:string,ceremonyId:string):Promise<CommittedStateEvidence> {
    if(!this.commissioning)throw Error("BLOCKED: R1 commit-bound independent readback attestation is not commissioned")
    const {readR1CommittedState}=require("./r1-commit-readback")
    return readR1CommittedState(this.connectionString,this.commissioning,targetDatabase,transactionHash,ceremonyId)
  }
}