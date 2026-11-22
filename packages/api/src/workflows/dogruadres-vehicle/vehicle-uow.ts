import type { Context } from "@medusajs/framework/types"
import type VehicleModuleService from "../../modules/dogruadres-vehicle/service"

// Compatibility dependency: Medusa v2.21.2 runtime baseRepository_ property.
// SOURCE-POSSIBLE / PUBLIC SUPPORT UNPROVEN. Not a generated consumer API.
// Re-review on upgrades; no patched declarations or upstream modifications.
type RepositoryBoundary = {
  transaction<T>(task: (manager: unknown) => Promise<T>, options: { enableNestedTransactions: false }): Promise<T>
}
export type VehicleUowContext = Readonly<Context> & { readonly transactionManager: unknown }
const incompatible = () => new Error("VEHICLE_UOW_RUNTIME_CONTRACT_INVALID")
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** Application-owned orchestration only. Caller must supply the already resolved
 * Vehicle instance, never another module service. Shape checks are NOT provenance
 * authentication. No container resolution, Foundation calls, HTTP or workflow input.
 * Root UOW only: no caller context/manager/options accepted. Vehicle calls inside
 * task must reuse this context instead of opening another transaction.
 * Trusted task must await all work and never save/return managers or contexts.
 * The adapter drops its references and revokes context access on callback exit;
 * it cannot revoke a raw manager deliberately extracted by trusted callback code.
 */
export async function withVehicleUnitOfWork<T>(vehicle: VehicleModuleService,
  task: (context: VehicleUowContext) => Promise<T>): Promise<T> {
  // Sole runtime implementation-property access in this adapter.
  const repository: unknown = (vehicle as unknown as { readonly baseRepository_?: unknown } | null)?.baseRepository_
  if (!object(repository) || typeof repository.transaction !== "function" || typeof task !== "function") throw incompatible()
  const boundary = repository as unknown as RepositoryBoundary
  let accepting = true, invoked = false, finished = false, callbackFailed = false
  let callbackError: unknown
  try {
    const result = await boundary.transaction.call(boundary, async (manager: unknown) => {
      if (!accepting || invoked) throw incompatible()
      invoked = true
      if (!object(manager) || typeof manager.execute !== "function") throw incompatible()
      let activeManager: unknown = manager
      let active = true
      const assertActive = () => {
        if (!accepting || !active) throw new Error("VEHICLE_UOW_CONTEXT_CLOSED")
      }
      // InjectManager forwards enumerable properties, then writes __type through
      // its forwarding setter. Seal keeps accessors non-configurable; constrained
      // setters permit only the framework's expected values, never replacement.
      // Do not add manager/messageAggregator here: InjectManager/InjectIntoContext
      // populate those on their own extensible copy, not this sealed root context.
      const context: VehicleUowContext = Object.seal({
        get __type(): "MedusaContext" { assertActive(); return "MedusaContext" },
        set __type(value: "MedusaContext") {
          assertActive()
          if (value !== "MedusaContext") throw incompatible()
        },
        get enableNestedTransactions(): false { assertActive(); return false },
        set enableNestedTransactions(value: boolean) {
          assertActive()
          if (value !== false) throw incompatible()
        },
        get transactionManager(): unknown { assertActive(); return activeManager },
      })
      try { return await task(context) }
      catch (error) { callbackFailed = true; callbackError = error; throw error }
      finally { active = false; activeManager = undefined; finished = true }
    }, { enableNestedTransactions: false }) as T
    if (callbackFailed) throw callbackError // Refuse success if an incompatible repository swallows a callback failure.
    if (!invoked || !finished) throw incompatible()
    return result
  } finally { accepting = false; callbackError = undefined }
}

// NOT TESTED: actual Vehicle transaction ownership/backend identity, lock duration
// across awaited Foundation operations, independent Foundation managers, physical
// commit/rollback, deadlocks/timeouts, workflow replay/retry/cancellation and engine
// context propagation. No final authorization integration or capability is added.
