import { InjectManager, InjectIntoContext, MedusaContext } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import VehicleModuleService from "../../../modules/dogruadres-vehicle/service"
import { withVehicleUnitOfWork, type VehicleUowContext } from "../vehicle-uow"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
// Mocked source contracts only. These do NOT prove PostgreSQL or workflow behavior.
const service = (value: unknown) => value as VehicleModuleService
function fixture() {
  const manager = { execute: jest.fn() }
  const repository = { transaction: jest.fn(async function<T>(this: unknown, task: (manager: unknown) => Promise<T>, options: unknown) {
    expect(this).toBe(repository)
    expect(options).toEqual({ enableNestedTransactions: false })
    return await task(manager)
  }) }
  return { manager, repository, vehicle: service({ baseRepository_: repository }) }
}
describe("Vehicle v2.21.2 application UOW compatibility boundary", () => {
  it.each([null, {}, { baseRepository_: null }, { baseRepository_: {} }, { baseRepository_: { transaction: 1 } }])("rejects missing/incompatible repository %s", async value => {
    const task = jest.fn()
    await expect(withVehicleUnitOfWork(service(value), task)).rejects.toThrow("VEHICLE_UOW_RUNTIME_CONTRACT_INVALID")
    expect(task).not.toHaveBeenCalled()
  })
  it("uses Vehicle repository once, awaits task and preserves result and this binding", async () => {
    const f = fixture(); let release!: () => void, settled = false
    const gate = new Promise<void>(resolve => { release = resolve })
    const result = { value: "completed" }
    const pending = withVehicleUnitOfWork(f.vehicle, async context => {
      expect(context.transactionManager).toBe(f.manager)
      expect(context.enableNestedTransactions).toBe(false)
      await gate; return result
    }).then(value => { settled = true; return value })
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    expect(await pending).toBe(result)
    expect(f.repository.transaction).toHaveBeenCalledTimes(1)
  })
  it("revokes retained context access after callback success or failure", async () => {
    for (const fail of [false, true]) {
      const f = fixture(); let retained: VehicleUowContext | undefined
      const pending = withVehicleUnitOfWork(f.vehicle, async context => { retained = context; if (fail) throw new Error("primary"); return 1 })
      if (fail) await expect(pending).rejects.toThrow("primary")
      else await expect(pending).resolves.toBe(1)
      expect(() => retained!.transactionManager).toThrow("VEHICLE_UOW_CONTEXT_CLOSED")
    }
  })
  it("propagates exact transaction failure without invoking task", async () => {
    const error = new Error("transaction failure"), task = jest.fn()
    const vehicle = service({ baseRepository_: { transaction: async () => { throw error } } })
    await expect(withVehicleUnitOfWork(vehicle, task)).rejects.toBe(error)
    expect(task).not.toHaveBeenCalled()
  })
  it("does not accept silent success after a swallowed callback failure", async () => {
    const primary = new Error("authorization failure")
    const vehicle = service({ baseRepository_: { transaction: async (task: (m: unknown) => Promise<unknown>) => {
      try { await task({ execute: () => undefined }) } catch { /* incompatible synthetic repository */ }
      return "false success"
    } } })
    await expect(withVehicleUnitOfWork(vehicle, async () => { throw primary })).rejects.toBe(primary)
  })
  it("rejects repository success without callback and rejects invalid manager", async () => {
    await expect(withVehicleUnitOfWork(service({ baseRepository_: { transaction: async () => 1 } }), async () => 2)).rejects.toThrow("VEHICLE_UOW_RUNTIME_CONTRACT_INVALID")
    const task = jest.fn()
    await expect(withVehicleUnitOfWork(service({ baseRepository_: { transaction: async (invoke: (m: unknown) => Promise<unknown>) => invoke(null) } }), task)).rejects.toThrow("VEHICLE_UOW_RUNTIME_CONTRACT_INVALID")
    expect(task).not.toHaveBeenCalled()
  })
  it("keeps the dependency isolated and does not resolve modules or introduce a workflow entrypoint", () => {
    const source = readFileSync(resolve(__dirname, "../vehicle-uow.ts"), "utf8")
    expect(source).toContain("PUBLIC SUPPORT UNPROVEN")
    expect(source).not.toMatch(/\.resolve\(|createWorkflow|createStep|dogruadres-access|dogruadres-audit-index/)
    expect(source).toContain("enableNestedTransactions: false")
  })
})

// Actual Medusa 2.21.2 decorator/generated-method contracts with mocked DAL only.
// NOT physical database, application initialization or workflow execution proof.
describe("Vehicle UOW Medusa context compatibility", () => {
  it("permits only expected forwarding writes on the sealed root", async () => {
    const f = fixture()
    let retained: VehicleUowContext | undefined
    await withVehicleUnitOfWork(f.vehicle, async context => {
      retained = context
      expect(Object.isSealed(context)).toBe(true)
      // Accessor setters can work even when Object.isFrozen reports true.
      for (const key of ["__type", "enableNestedTransactions", "transactionManager"]) {
        expect(Object.getOwnPropertyDescriptor(context, key)).toMatchObject({ configurable: false, enumerable: true })
        expect(Reflect.defineProperty(context, key, { get: () => "forged" })).toBe(false)
      }
      expect(Reflect.set(context, "injected", true)).toBe(false)
      expect(context).not.toHaveProperty("injected")
      expect(Object.getOwnPropertyDescriptor(context, "transactionManager")?.set).toBeUndefined()
      expect(Reflect.set(context, "__type", "MedusaContext")).toBe(true)
      expect(Reflect.set(context, "enableNestedTransactions", false)).toBe(true)
      expect(() => Reflect.set(context, "__type", "forged")).toThrow()
      expect(() => Reflect.set(context, "enableNestedTransactions", true)).toThrow()
      expect(Reflect.set(context, "transactionManager", {})).toBe(false)
      expect(Reflect.set(context, "manager", {})).toBe(false)
      expect(() => Object.defineProperty(context, "transactionManager", { value: {} })).toThrow()
      expect(context.transactionManager).toBe(f.manager)
    })
    expect(() => retained!.transactionManager).toThrow("VEHICLE_UOW_CONTEXT_CLOSED")
    expect(() => Reflect.set(retained!, "__type", "MedusaContext")).toThrow("VEHICLE_UOW_CONTEXT_CLOSED")
  })
  it("uses actual InjectManager forwarding and InjectIntoContext augmentation", async () => {
    const f = fixture()
    class Probe {
      baseRepository_ = { getFreshManager: jest.fn(() => ({ fresh: true })) }
      @InjectManager()
      @InjectIntoContext({ preventReleaseEvents: true })
      async inspect(@MedusaContext() context: Context = {}) { return context }
    }
    const probe = new Probe()
    await withVehicleUnitOfWork(f.vehicle, async root => {
      const copied = await probe.inspect(root)
      expect(copied).not.toBe(root)
      expect(copied.__type).toBe("MedusaContext")
      expect(copied.transactionManager).toBe(f.manager)
      expect(copied.preventReleaseEvents).toBe(true)
      expect(copied.manager).toEqual({ fresh: true })
      expect(root).not.toHaveProperty("preventReleaseEvents")
      expect(root).not.toHaveProperty("manager")
    })
  })
  it("passes the same transaction to an actual generated Vehicle list method", async () => {
    const f = fixture()
    const generated = Object.create(VehicleModuleService.prototype) as VehicleModuleService
    const list = jest.fn(async (_filters: unknown, _config: unknown, context: Context) => {
      expect(context.transactionManager).toBe(f.manager)
      expect(context.__type).toBe("MedusaContext")
      // Generated MedusaService applies EmitEvents/InjectIntoContext inside InjectManager.
      expect(context.messageAggregator).toBeDefined()
      return []
    })
    Object.defineProperties(generated, {
      baseRepository_: { value: { getFreshManager: () => ({}), serialize: async (value: unknown) => value } },
      __container__: { value: { daVehicleService: { list } } },
    })
    await withVehicleUnitOfWork(f.vehicle, async context => {
      expect(await generated.listVehicles({}, {}, context)).toEqual([])
    })
    expect(list).toHaveBeenCalledTimes(1)
  })
  it("propagates actual decorated callback failures and closes access afterward", async () => {
    const f = fixture(), primary = new Error("decorated callback failure")
    let retained: VehicleUowContext | undefined
    class Probe {
      baseRepository_ = { getFreshManager: () => ({}) }
      @InjectManager()
      async fail(@MedusaContext() _context: Context = {}): Promise<never> { throw primary }
    }
    await expect(withVehicleUnitOfWork(f.vehicle, async context => {
      retained = context
      return new Probe().fail(context)
    })).rejects.toBe(primary)
    expect(() => retained!.transactionManager).toThrow("VEHICLE_UOW_CONTEXT_CLOSED")
    expect(() => Reflect.set(retained!, "__type", "MedusaContext")).toThrow("VEHICLE_UOW_CONTEXT_CLOSED")
  })
})
