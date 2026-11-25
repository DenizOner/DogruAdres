import { GET as listVehicles, POST as createVehicle } from "../organizations/[id]/vehicles/route"
import { GET as getVehicle, PATCH as updateVehicle, DELETE as deleteVehicle } from "../organizations/[id]/vehicles/[vehicle_id]/route"
import { MedusaError, createMedusaContainer } from "@medusajs/framework/utils"
import { DOGRUADRES_ACCESS_MODULE } from "../../../modules/dogruadres-access/constants"
import { DOGRUADRES_VEHICLE_MODULE } from "../../../modules/dogruadres-vehicle/constants"

function mockReq(opts: {
  orgId: string
  vehicleId?: string
  actorId?: string
  actorType?: "user" | "member" | "customer"
  personId?: string
  role?: "owner" | "admin" | "member"
  body?: any
  membershipStatus?: "active" | "revoked"
  vehicleInDb?: any
}) {
  const orgId = opts.orgId
  const actorId = opts.actorId || "user_1"
  const actorType = opts.actorType || "user"
  const personId = opts.personId || "person_1"
  const role = opts.role || "owner"
  const membershipStatus = opts.membershipStatus || "active"

  const mockAccessService = {
    resolvePersonForActor: jest.fn(async () => ({ id: personId })),
    getActiveMembership: jest.fn(async (pId: string, oId: string) => {
      if (pId === personId && oId === orgId && membershipStatus === "active") {
        return {
          id: "damem_1",
          organization_id: orgId,
          person_id: personId,
          role,
          status: "active",
          protected_owner: role === "owner",
        }
      }
      return null
    }),
    getOrganization: jest.fn(async (oId: string) => {
      if (oId === orgId) return { id: orgId, status: "active" }
      return null
    }),
    currentProtectedOwner: jest.fn(async () => true),
  }

  const defaultVehicle = opts.vehicleInDb !== undefined ? opts.vehicleInDb : {
    id: opts.vehicleId || "daveh_1",
    organization_id: orgId,
    plate: "34 ABC 123",
    plate_key: "34ABC123",
    vin: "WVWZZZ1JZXW000001",
    vin_key: "WVWZZZ1JZXW000001",
    label: "Company Van",
    make: "VW",
    model: "Transporter",
    model_year: 2022,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  }

  const mockVehicleService = {
    baseRepository_: {
      transaction: jest.fn(async (task: any) => {
        const mockManager = { execute: jest.fn() }
        return await task(mockManager)
      }),
    },
    listLiveVehicles: jest.fn(async (oId: string) => (oId === orgId ? [defaultVehicle] : [])),
    getLiveVehicle: jest.fn(async (oId: string, vId: string) => {
      if (oId === orgId && defaultVehicle && defaultVehicle.id === vId) return defaultVehicle
      return null
    }),
    createVehicle: jest.fn(async (oId: string, data: any) => ({
      id: "daveh_created",
      organization_id: oId,
      ...data,
      plate_key: data.plate?.replace(/\s+/g, "").toUpperCase() || null,
      vin_key: data.vin?.trim().toUpperCase() || null,
      created_at: new Date(),
      updated_at: new Date(),
    })),
    updateVehicle: jest.fn(async (oId: string, vId: string, data: any) => ({
      ...defaultVehicle,
      ...data,
      updated_at: new Date(),
    })),
    deleteVehicle: jest.fn(async (_oId: string, _vId: string) => undefined),
  }

  const scope = createMedusaContainer()
  scope.register({
    [DOGRUADRES_ACCESS_MODULE]: { resolve: () => mockAccessService },
    [DOGRUADRES_VEHICLE_MODULE]: { resolve: () => mockVehicleService },
  })

  const req: any = {
    params: { id: orgId, vehicle_id: opts.vehicleId },
    auth_context: { actor_id: actorId, actor_type: actorType },
    body: opts.body,
    validatedBody: opts.body,
    scope,
  }

  const res: any = {
    statusCode: 200,
    setHeader: jest.fn(),
    status(code: number) {
      this.statusCode = code
      return this
    },
    json: jest.fn((payload) => payload),
  }

  return { req, res, mockAccessService, mockVehicleService }
}

describe("Vehicle HTTP API Routes and Policy Enforcement", () => {
  describe("GET /dogruadres/organizations/:id/vehicles (List)", () => {
    it.each(["owner", "admin", "member"] as const)("allows active %s to list vehicles", async (role) => {
      const { req, res } = mockReq({ orgId: "daorg_abc", role })
      await listVehicles(req, res)
      expect(res.json).toHaveBeenCalledTimes(1)
      const data = res.json.mock.calls[0][0]
      expect(data.vehicles).toHaveLength(1)
      expect(data.vehicles[0].plate).toBe("34 ABC 123")
    })

    it("rejects an actor who is not a member of the organization", async () => {
      const { req, res } = mockReq({ orgId: "daorg_abc", membershipStatus: "revoked" })
      await expect(listVehicles(req, res)).rejects.toThrow(MedusaError)
    })
  })

  describe("POST /dogruadres/organizations/:id/vehicles (Create)", () => {
    it.each(["owner", "admin", "member"] as const)("allows active %s to create a vehicle", async (role) => {
      const { req, res } = mockReq({
        orgId: "daorg_abc",
        role,
        body: { plate: "34 DEF 456", make: "Toyota", model: "Corolla", model_year: 2021 },
      })
      await createVehicle(req, res)
      expect(res.statusCode).toBe(201)
      expect(res.json).toHaveBeenCalledTimes(1)
      const data = res.json.mock.calls[0][0]
      expect(data.vehicle.id).toBe("daveh_created")
      expect(data.vehicle.organization_id).toBe("daorg_abc")
    })

    it("rejects cross-organization vehicle creation", async () => {
      const { req, res } = mockReq({ orgId: "daorg_other", membershipStatus: "revoked", body: { plate: "34" } })
      await expect(createVehicle(req, res)).rejects.toThrow(MedusaError)
    })
  })

  describe("GET /dogruadres/organizations/:id/vehicles/:vehicle_id (Detail)", () => {
    it.each(["owner", "admin", "member"] as const)("allows active %s to view vehicle detail", async (role) => {
      const { req, res } = mockReq({ orgId: "daorg_abc", vehicleId: "daveh_1", role })
      await getVehicle(req, res)
      expect(res.json).toHaveBeenCalledTimes(1)
      const data = res.json.mock.calls[0][0]
      expect(data.vehicle.id).toBe("daveh_1")
    })

    it("returns 404 when vehicle is not found in the organization", async () => {
      const { req, res } = mockReq({ orgId: "daorg_abc", vehicleId: "daveh_999", vehicleInDb: null })
      await expect(getVehicle(req, res)).rejects.toThrow("Vehicle not found")
    })
  })

  describe("PATCH /dogruadres/organizations/:id/vehicles/:vehicle_id (Update)", () => {
    it.each(["owner", "admin", "member"] as const)("allows active %s to update vehicle", async (role) => {
      const { req, res } = mockReq({
        orgId: "daorg_abc",
        vehicleId: "daveh_1",
        role,
        body: { label: "Updated Fleet Name" },
      })
      await updateVehicle(req, res)
      expect(res.json).toHaveBeenCalledTimes(1)
      const data = res.json.mock.calls[0][0]
      expect(data.vehicle.label).toBe("Updated Fleet Name")
    })
  })

  describe("DELETE /dogruadres/organizations/:id/vehicles/:vehicle_id (Soft-delete)", () => {
    it("allows active Owner to delete vehicle", async () => {
      const { req, res } = mockReq({ orgId: "daorg_abc", vehicleId: "daveh_1", role: "owner" })
      await deleteVehicle(req, res)
      expect(res.json).toHaveBeenCalledWith({ deleted: true, id: "daveh_1" })
    })

    it("allows active Admin to delete vehicle", async () => {
      const { req, res } = mockReq({ orgId: "daorg_abc", vehicleId: "daveh_1", role: "admin" })
      await deleteVehicle(req, res)
      expect(res.json).toHaveBeenCalledWith({ deleted: true, id: "daveh_1" })
    })

    it("STRICTLY DENIES active Member from deleting vehicle (V-03 / DA-AUTO-006)", async () => {
      const { req, res } = mockReq({ orgId: "daorg_abc", vehicleId: "daveh_1", role: "member" })
      await expect(deleteVehicle(req, res)).rejects.toThrow(MedusaError)
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
    })
  })
})
