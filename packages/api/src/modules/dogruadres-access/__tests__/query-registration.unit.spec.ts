import { defineJoinerConfig, toPascalCase } from "@medusajs/framework/utils"
import Service from "../service"
import { Person, ActorMapping, Organization, Membership, Invitation, AuditEvent, AuditOutbox } from "../models"
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
]
const baseline = () => defineJoinerConfig("dogruadresAccess", { models })
const repaired = () => Service.prototype.__joinerConfig()
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
  it("preserves all original entry aliases and unchanged metadata for the other entities", () => {
    const original = baseline(), current = repaired()
    for (const alias of aliases(original)) {
      const actual = aliases(current).find(a => a.entity === alias.entity)!
      expect(actual.name).toEqual(alias.name)
      const mapped = expected.some(e => e.entity === alias.entity)
      if (!mapped) expect(actual).toEqual(alias)
      else expect({ ...actual, args: alias.args }).toEqual(alias)
    }
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
