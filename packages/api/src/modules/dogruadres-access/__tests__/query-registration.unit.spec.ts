import { defineJoinerConfig, toPascalCase } from "@medusajs/framework/utils"
import Service from "../service"
import { Person, ActorMapping, Organization, Membership, Invitation, AuditEvent, AuditOutbox } from "../models"
import { AUTHORIZATION_ALIAS, AUTHORIZATION_SCHEMA } from "../authorization-projection"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// Actual metadata builder and generated method surface; no module/Query/DB startup.
// Dispatch naming follows Medusa 2.21.2 ModuleDataFetcher.fetch list/listAndCount.
const models = [Person, ActorMapping, Organization, Membership, Invitation, AuditEvent, AuditOutbox]
const expected = [
  { entity: "DaActorMapping", suffix: "ActorMappings", names: ["da_actor_mapping", "da_actor_mappings"] },
  { entity: "DaPerson", suffix: "People", names: ["da_person", "da_people"] },
  { entity: "DaOrganization", suffix: "Organizations", names: ["da_organization", "da_organizations"] },
  { entity: "DaOrganizationMembership", suffix: "Memberships", names: ["da_organization_membership", "da_organization_memberships"] },
  { entity: "DaOrganizationInvitation", suffix: "Invitations", names: ["da_organization_invitation", "da_organization_invitations"] },
  { entity: "DaAuditEvent", suffix: "AuditEvents", names: ["da_audit_event", "da_audit_events"] },
  { entity: "DaAuditOutbox", suffix: "AuditOutboxes", names: ["da_audit_outbox", "da_audit_outboxes"] },
]
const baseline = () => defineJoinerConfig("dogruadresAccess", { models })
const complete = () => Service.prototype.__joinerConfig()
const repaired = () => {
  const config = complete()
  return { ...config, schema: config.schema.slice(0, -(AUTHORIZATION_SCHEMA.length + 1)),
    alias: aliases(config).filter(a => a.entity !== AUTHORIZATION_ALIAS.entity) }
}
function aliases(config: ReturnType<typeof baseline>) {
  if (!Array.isArray(config.alias)) throw new Error("EXPECTED_ALIAS_ARRAY")
  return config.alias
}

describe("Foundation Query registration metadata", () => {
  it("retains seven entities and the original module identity", () => {
    const config = repaired()
    expect(config.serviceName).toBe("dogruadresAccess")
    expect(aliases(config).map(a => a.entity).sort()).toEqual(models.map(m => m.name).sort())
    expect(config.alias).toHaveLength(7)
  })
  it.each(expected)("maps $entity singular/plural to both generated dispatch methods", ({ entity, suffix, names }) => {
    const alias = aliases(repaired()).find(a => a.entity === entity)!
    expect(alias.name).toEqual(names)
    expect(alias.args?.methodSuffix).toBe(suffix)
    for (const prefix of ["list", "listAndCount"]) {
      const method = prefix + toPascalCase(String(alias.args?.methodSuffix))
      expect(typeof Reflect.get(Service.prototype, method)).toBe("function")
    }
  })
  it("preserves all original aliases and metadata except the seven intended methodSuffix changes", () => {
    const original = baseline(), current = repaired()
    for (const alias of aliases(original)) {
      const actual = aliases(current).find(a => a.entity === alias.entity)!
      expect(actual.name).toEqual(alias.name)
      expect(expected.some(e => e.entity === alias.entity)).toBe(true)
      expect(actual.args).toEqual({ ...alias.args, methodSuffix: expected.find(e => e.entity === alias.entity)!.suffix })
      expect({ ...actual, args: alias.args }).toEqual(alias)
    }
  })
  it("has unique aliases and exactly one mapping per entity", () => {
    const entries = aliases(repaired())
    const names = entries.flatMap(a => typeof a.name === "string" ? [a.name] : a.name)
    expect(names).toHaveLength(14)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(entries.map(a => a.entity)).size).toBe(7)
  })
  it("preserves graph schema, relationships, primary/linkable keys and ID prefixes", () => {
    const original = baseline(), current = repaired()
    expect(current.schema).toBeTruthy()
    expect(current.linkableKeys).toBeDefined()
    expect(current.primaryKeys).toContain("id")
    expect(current.idPrefixToEntityName).toBeDefined()
    const { alias: oldAlias, ...oldMetadata } = original
    const { alias: newAlias, ...newMetadata } = current
    expect(newMetadata).toEqual(oldMetadata)
    // Schema and alias relation metadata are compared with the actual all-model builder,
    // not handwritten graph definitions. Person/Organization relations stay intact.
    for (const model of models) expect(current.schema).toContain(model.name)
  })
  it("contains no module-index import cycle or unrelated integration import", () => {
    const source = readFileSync(resolve(__dirname, "../service.ts"), "utf8")
    expect(source).not.toMatch(/from ["']\.(?:\/index)?["']/)
    expect(source).not.toMatch(/from ["'][^"']*(?:dogruadres-vehicle|dogruadres-audit-index)[^"']*["']/)
    expect(Service.prototype.resolvePersonForActor).toBeDefined()
    expect(Service.prototype.provisionOrganization).toBeDefined()
    expect(Service.prototype.acceptOrganizationInvitation).toBeDefined()
  })
})

it("registers virtual projection with a real list dispatch target and selected schema fields", () => {
  const config = complete()
  expect(aliases(config)).toHaveLength(8)
  expect(aliases(config).find(a => a.entity === AUTHORIZATION_ALIAS.entity)).toEqual(AUTHORIZATION_ALIAS)
  expect(config.schema).toContain(AUTHORIZATION_SCHEMA)
  expect(typeof Service.prototype.listAuthorizationObservations).toBe("function")
  expect(config.idPrefixToEntityName).toEqual(baseline().idPrefixToEntityName)
})
