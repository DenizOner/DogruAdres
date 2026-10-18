// Feasibility projection ONLY. L = snapshot acquisition of this single SELECT.
// No commit-time fencing; product concurrency policy and Vehicle integration BLOCKED.
export const AUTHORIZATION_FIELDS = ["id", "allowed", "actor_type", "actor_id", "person_id", "organization_id", "membership_id", "role", "action"] as const
export const AUTHORIZATION_SCHEMA = `type DaAuthorizationObservation {
  id: ID!
  allowed: Boolean!
  actor_type: String
  actor_id: String
  person_id: String
  organization_id: String
  membership_id: String
  role: String
  action: String
}`
export const AUTHORIZATION_ALIAS = { name: ["da_authorization_observation"], entity: "DaAuthorizationObservation", args: { methodSuffix: "AuthorizationObservations" } }
export type AuthorizationRequest = { actor_type: string; actor_id: string; organization_id: string; action: string }
export type PrimaryReadConnection = { execute(sql: string, parameters: unknown[], method: "all"): Promise<unknown> }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,254}$/.test(v)
export function validateAuthorizationRequest(filters: unknown, options: unknown): AuthorizationRequest {
  if (!object(filters) || Object.keys(filters).sort().join() !== "action,actor_id,actor_type,organization_id" ||
    typeof filters.actor_type !== "string" || !["user", "member", "customer"].includes(filters.actor_type) ||
    !id(filters.actor_id) || !id(filters.organization_id) || typeof filters.action !== "string" ||
    !["vehicle.read", "vehicle.create", "vehicle.update", "vehicle.delete"].includes(filters.action)) throw new Error("INVALID_AUTHORIZATION_PROJECTION_REQUEST")
  if (!object(options) || Object.keys(options).some(k => !["select", "relations", "take", "args"].includes(k)) || options.take !== 2 ||
    !Array.isArray(options.select) || options.select.length !== AUTHORIZATION_FIELDS.length ||
    new Set(options.select).size !== AUTHORIZATION_FIELDS.length || options.select.some(k => !(AUTHORIZATION_FIELDS as readonly unknown[]).includes(k)) ||
    (options.relations !== undefined && (!Array.isArray(options.relations) || options.relations.length)) ||
    (options.args !== undefined && (!object(options.args) || Object.keys(options.args).length))) throw new Error("INVALID_AUTHORIZATION_PROJECTION_REQUEST")
  return { actor_type: filters.actor_type, actor_id: filters.actor_id, organization_id: filters.organization_id, action: filters.action }
}
// Parameterized fixed SELECT only: all cardinalities/state predicates share L.
// Ordinary SELECT, no locks, data-changing CTEs, stored-procedure reads or LIMIT 1.
export const AUTHORIZATION_SQL = `WITH
  input AS (SELECT ?::text AS actor_type, ?::text AS actor_id, ?::text AS organization_id, ?::text AS action),
  mappings AS (SELECT m.id, m.person_id FROM da_actor_mapping m, input i
    WHERE m.actor_type = i.actor_type AND m.actor_id = i.actor_id AND m.deleted_at IS NULL),
  people AS (SELECT p.id, p.disabled_at FROM da_person p JOIN mappings m ON p.id = m.person_id WHERE p.deleted_at IS NULL),
  organizations AS (SELECT o.id, o.status FROM da_organization o, input i WHERE o.id = i.organization_id AND o.deleted_at IS NULL),
  memberships AS (SELECT s.id, s.person_id, s.organization_id, s.role FROM da_organization_membership s
    JOIN people p ON p.id = s.person_id JOIN organizations o ON o.id = s.organization_id
    WHERE s.status = 'active' AND s.deleted_at IS NULL),
  decision AS (SELECT (SELECT count(*) FROM mappings) = 1 AND (SELECT count(*) FROM people) = 1
    AND (SELECT count(*) FROM people WHERE disabled_at IS NULL) = 1 AND (SELECT count(*) FROM organizations) = 1
    AND (SELECT count(*) FROM organizations WHERE status = 'active') = 1 AND (SELECT count(*) FROM memberships) = 1
    AND EXISTS (SELECT 1 FROM memberships s, input i WHERE s.role IN ('owner','admin','member')
      AND (i.action <> 'vehicle.delete' OR s.role IN ('owner','admin'))) AS allowed)
SELECT 'daauth_observation'::text AS id, d.allowed,
  current_setting('transaction_isolation') = 'read committed' AS read_committed,
  NOT pg_is_in_recovery() AS authoritative_primary,
  CASE WHEN d.allowed THEN i.actor_type END AS actor_type, CASE WHEN d.allowed THEN i.actor_id END AS actor_id,
  CASE WHEN d.allowed THEN (SELECT min(id) FROM people) END AS person_id,
  CASE WHEN d.allowed THEN i.organization_id END AS organization_id,
  CASE WHEN d.allowed THEN (SELECT min(id) FROM memberships) END AS membership_id,
  CASE WHEN d.allowed THEN (SELECT min(role) FROM memberships) END AS role,
  CASE WHEN d.allowed THEN i.action END AS action
FROM decision d CROSS JOIN input i`
export async function readAuthorizationProjection(connection: PrimaryReadConnection, request: AuthorizationRequest) {
  request = validateAuthorizationRequest(request, { select: [...AUTHORIZATION_FIELDS], take: 2 })
  const unavailable = () => new Error("FOUNDATION_AUTHORIZATION_PROJECTION_UNAVAILABLE")
  let result: unknown
  try { result = await connection.execute(AUTHORIZATION_SQL, [request.actor_type, request.actor_id, request.organization_id, request.action], "all") }
  catch { throw unavailable() }
  if (!Array.isArray(result) || result.length !== 1 || !object(result[0])) throw unavailable()
  const row = result[0]
  if (row.read_committed !== true || row.authoritative_primary !== true || typeof row.allowed !== "boolean") throw unavailable()
  const denied = { id: "daauth_observation", allowed: false, actor_type: null, actor_id: null, person_id: null, organization_id: null, membership_id: null, role: null, action: null }
  if (!row.allowed) return [denied]
  if (row.actor_type !== request.actor_type || row.actor_id !== request.actor_id || row.organization_id !== request.organization_id || row.action !== request.action ||
    !id(row.person_id) || !id(row.membership_id) || typeof row.role !== "string" || !["owner", "admin", "member"].includes(row.role) ||
    (request.action === "vehicle.delete" && row.role === "member")) return [denied]
  return [{ id: "daauth_observation", allowed: true, actor_type: request.actor_type, actor_id: request.actor_id,
    person_id: row.person_id, organization_id: request.organization_id, membership_id: row.membership_id, role: row.role, action: request.action }]
}
// Runtime NOT TESTED: primary topology/proxy routing, connection/pool defaults,
// statement count, ambient context separation, snapshot isolation and Query virtual
// entity dispatch. pg_is_in_recovery is a safety check, not topology attestation.
