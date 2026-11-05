import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import {
  InvalidTaxCertificate,
  TAX_CERTIFICATE_MAX_BYTES,
  restoreTaxCertificate,
  type PreparedTaxCertificate,
} from "./tax-certificate-policy"

/**
 * B22 narrow, server-only storage primitive; NEVER an HTTP file handler.
 *
 * The caller must first establish Person/application authorization and
 * verify the document contents are safe. A returned key must be associated
 * with the draft/version + audit/outbox in the Foundation transaction.
 * This function cannot make filesystem and PostgreSQL one ACID transaction:
 * a failed DB transaction leaves an unreferenced private file for reviewed
 * reconciliation, NEVER a submitted application.
 *
 * Deployment must independently verify private mount, OS ACLs, backup and
 * restore. No default directory and no automatic file deletion.
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(?:pdf|jpg|png)$/

export type PrivateTaxCertificateRecord =
  Readonly<Omit<PreparedTaxCertificate, "storedBytes"> & {
    storageKey: string
    storedByteLength: number
  }>

function inaccessible(): never {
  // Avoid leaking private filesystem paths or OS diagnostics through callers.
  throw new InvalidTaxCertificate()
}

async function checkedPrivateRoot(configuredRoot: string): Promise<string> {
  if (typeof configuredRoot !== "string" ||
      configuredRoot.trim() !== configuredRoot ||
      !isAbsolute(configuredRoot) || configuredRoot.includes("\0")) inaccessible()

  const path = resolve(configuredRoot)
  // Files must live outside the application checkout, including /static,
  // /node_modules and all files that web servers could serve from it.
  const workspace = resolve(process.cwd())
  const relativeToWorkspace = relative(workspace, path)
  const relativeFromRoot = relative(path, workspace)
  const overlapsCheckout = (rel: string) =>
    rel === "" || (rel !== ".." &&
      !rel.startsWith(".." + sep) && !isAbsolute(rel))
  // Neither a descendant NOR an ancestor of the checkout is a safe root.
  if (overlapsCheckout(relativeToWorkspace) ||
      overlapsCheckout(relativeFromRoot)) inaccessible()
  try {
    const rootInfo = await lstat(path)
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) inaccessible()
    const canonical = await realpath(path)
    const match = process.platform === "win32"
      ? canonical.toLowerCase() === path.toLowerCase()
      : canonical === path
    if (!match) inaccessible()
    // On POSIX, only the application account may traverse this directory.
    // Windows ACL verification is a separate deployment acceptance gate.
    if (process.platform !== "win32") {
      if ((rootInfo.mode & 0o077) !== 0 ||
          (typeof process.getuid === "function" && rootInfo.uid !== process.getuid()))
        inaccessible()
    }
    return canonical
  } catch {
    return inaccessible()
  }
}

/**
 * Durable, exclusive creation with the EXACT physical basename UUID v4
 * (no fake .pdf suffix for gzipped bytes). An interrupted write can leave
 * an unreferenced file; never expose it until a successful DB linkage.
 */
export async function writePrivateTaxCertificate(
  configuredRoot: string,
  prepared: PreparedTaxCertificate
): Promise<PrivateTaxCertificateRecord> {
  const root = await checkedPrivateRoot(configuredRoot)
  // Verify before touching the disk, including type, SHA-256 and gzip bounds.
  restoreTaxCertificate(prepared)
  const matched = NAME.exec(prepared.internalName)
  if (!matched || !UUID_V4.test(matched[1])) inaccessible()
  const key = matched[1]
  const pathname = join(root, key)
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    // Exclusive creation refuses pre-existing files and symlink targets.
    handle = await open(
      pathname,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL |
      (constants.O_NOFOLLOW ?? 0),
      0o600
    )
    await handle.writeFile(prepared.storedBytes)
    await handle.sync()
    await handle.close()
    handle = undefined

    // Flush the new UUID directory entry on POSIX before publishing DB metadata.
    // Windows directory/ACL durability needs separate environment acceptance.
    if (process.platform !== "win32") {
      const directoryHandle = await open(root, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0))
      try { await directoryHandle.sync() }
      finally { await directoryHandle.close() }
    }

    // No file URL or original filename in returned metadata.
    const record: PrivateTaxCertificateRecord = {
      storageKey: key,
      internalName: prepared.internalName,
      mimeType: prepared.mimeType,
      compression: prepared.compression,
      originalByteLength: prepared.originalByteLength,
      originalSha256: prepared.originalSha256,
      storedByteLength: prepared.storedBytes.length,
    }
    // A successful write is not enough: verify the exact durable bytes before
    // permitting the caller to link this immutable object to a draft.
    await readPrivateTaxCertificate(root, record)
    return record
  } catch {
    // Do not blindly unlink: an interrupted, complete document may require
    // reconciliation. Accepted versions are NEVER automatically deleted.
    return inaccessible()
  } finally {
    if (handle) await handle.close().catch(() => undefined)
  }
}

/**
 * Call ONLY after an independent, fresh, trusted DB Person/Admin authorization
 * decision. Never take storageKey from an HTTP parameter or public URL.
 */
export async function readPrivateTaxCertificate(
  configuredRoot: string,
  record: PrivateTaxCertificateRecord
): Promise<Buffer> {
  const root = await checkedPrivateRoot(configuredRoot)
  if (!record || typeof record !== "object" ||
      typeof record.storageKey !== "string" ||
      !UUID_V4.test(record.storageKey) ||
      typeof record.internalName !== "string" ||
      !record.internalName.startsWith(record.storageKey + ".") ||
      !Number.isSafeInteger(record.storedByteLength) ||
      record.storedByteLength < 8 ||
      record.storedByteLength > TAX_CERTIFICATE_MAX_BYTES) inaccessible()

  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    const pathname = join(root, record.storageKey)
    const linkInfo = await lstat(pathname)
    if (!linkInfo.isFile() || linkInfo.isSymbolicLink() || linkInfo.nlink !== 1)
      inaccessible()
    handle = await open(pathname, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const info = await handle.stat()
    if (!info.isFile() || info.size !== record.storedByteLength ||
        info.size > TAX_CERTIFICATE_MAX_BYTES || info.nlink !== 1) inaccessible()
    const storedBytes = await handle.readFile()
    if (storedBytes.length !== record.storedByteLength) inaccessible()
    return restoreTaxCertificate({...record, storedBytes})
  } catch {
    return inaccessible()
  } finally {
    if (handle) await handle.close().catch(() => undefined)
  }
}
