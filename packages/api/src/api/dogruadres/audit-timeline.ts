import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

export class TimelineError extends Error {
  constructor(public readonly status: number) { super(status === 400 ? "Invalid timeline pagination" : "Audit timeline unavailable") }
}
type Scope = { organizationId: string; personId: string; limit: number }
export type Boundary = { occurred_at: string; id: string }
export type TimelineRow = Boundary & { source_module: string; source_event_id: string; indexed_at: string | Date;
  action: string; resource: string; target_id: string; actor_person_id: string }
const iso = (value: string | Date) => new Date(value).toISOString()
const aad = Buffer.from("dogruadres.audit.timeline.v1")
// Dedicated 32-byte random key, canonical base64; no production fallback.
// Provision via the server secret manager. Rotation invalidates existing cursors.
export function cursorKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new TimelineError(503)
  const key = Buffer.from(value, "base64")
  if (key.length !== 32 || key.toString("base64") !== value) throw new TimelineError(503)
  return key
}
export function pagination(query: Record<string, unknown>) {
  if (Object.keys(query).some(k => k !== "limit" && k !== "cursor")) throw new TimelineError(400)
  if (query.limit !== undefined && (typeof query.limit !== "string" || !/^[1-9][0-9]{0,2}$/.test(query.limit))) throw new TimelineError(400)
  const limit = query.limit === undefined ? 25 : Number(query.limit)
  if (limit > 100) throw new TimelineError(400)
  if (query.cursor !== undefined && (typeof query.cursor !== "string" || !query.cursor.length || query.cursor.length > 4096)) throw new TimelineError(400)
  return { limit, cursor: query.cursor as string | undefined }
}
export function encodeCursor(scope: Scope, boundary: Boundary, key: Buffer): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(aad)
  const body = Buffer.concat([cipher.update(JSON.stringify({ version: 1, ...scope, ...boundary }), "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}
export function decodeCursor(token: string, scope: Scope, key: Buffer): Boundary {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > 4096) throw new Error()
    const bytes = Buffer.from(token, "base64url")
    if (bytes.length < 29 || bytes.toString("base64url") !== token) throw new Error()
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12))
    decipher.setAAD(aad); decipher.setAuthTag(bytes.subarray(12, 28))
    const v = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"))
    if (Object.keys(v).sort().join() !== "id,limit,occurred_at,organizationId,personId,version" || v.version !== 1 ||
      v.organizationId !== scope.organizationId || v.personId !== scope.personId || v.limit !== scope.limit ||
      typeof v.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(v.id) ||
      typeof v.occurred_at !== "string" || iso(v.occurred_at) !== v.occurred_at) throw new Error()
    return { id: v.id, occurred_at: v.occurred_at }
  } catch { throw new TimelineError(400) }
}
export async function timelinePage(query: Record<string, unknown>, authorize: () => Promise<{ organizationId: string; personId: string }>,
  read: (organizationId: string, limit: number, boundary?: Boundary) => Promise<TimelineRow[]>, secret: () => string | undefined) {
  // Last current-membership authorization check occurs here, on EVERY request.
  // Later committed revocation may coexist with this already authorized read.
  const identity = await authorize()
  const { limit, cursor } = pagination(query), key = cursorKey(secret())
  const scope = { ...identity, limit }, boundary = cursor ? decodeCursor(cursor, scope, key) : undefined
  try {
    const rows = await read(identity.organizationId, limit, boundary)
    const visible = rows.slice(0, limit), hasMore = rows.length > limit
    const items = visible.map(row => ({ id: row.id, source_module: row.source_module, source_event_id: row.source_event_id,
      occurred_at: iso(row.occurred_at), indexed_at: iso(row.indexed_at), action: row.action, resource: row.resource,
      target_id: row.target_id, actor: { person_id: row.actor_person_id } }))
    const last = items[items.length - 1]
    return { items, page: { has_more: hasMore, next_cursor: hasMore && last ? encodeCursor(scope, { id: last.id, occurred_at: last.occurred_at }, key) : null },
      projection: { consistency: "eventual" as const, completeness: "not_guaranteed" as const } }
  } catch { throw new TimelineError(503) }
}
