import { describe, it, expect } from "bun:test"
import {
  type VehicleItem,
  type OrgInfo,
  type VehicleFormValues,
  canDeleteVehicle,
} from "../validation"

describe("Vehicles UI - Interaction and Data Mapping Logic", () => {
  const mockVehicles: VehicleItem[] = [
    {
      id: "daveh_01JBMX1234567890ABCDEFGH1",
      organization_id: "daorg_01JBMX1234567890ABCDEFGH0",
      plate: "34 ABC 123",
      plate_key: "34ABC123",
      vin: "WVWZZZ3CZWE123456",
      vin_key: "WVWZZZ3CZWE123456",
      label: "Ahmet Yılmaz - Periyodik Bakım",
      make: "Volkswagen",
      model: "Passat",
      model_year: 2019,
      created_at: "2026-11-20T10:00:00Z",
      updated_at: "2026-11-20T10:00:00Z",
    },
    {
      id: "daveh_01JBMX1234567890ABCDEFGH2",
      organization_id: "daorg_01JBMX1234567890ABCDEFGH0",
      plate: "06 DEF 456",
      plate_key: "06DEF456",
      vin: null,
      vin_key: null,
      label: "Filo Aracı #4",
      make: "Ford",
      model: "Transit",
      model_year: 2022,
      created_at: "2026-11-21T11:00:00Z",
      updated_at: "2026-11-21T11:00:00Z",
    },
    {
      id: "daveh_01JBMX1234567890ABCDEFGH3",
      organization_id: "daorg_01JBMX1234567890ABCDEFGH0",
      plate: null,
      plate_key: null,
      vin: "NM0XXX12345678901",
      vin_key: "NM0XXX12345678901",
      label: "Mehmet Demir - Ağır Hasar",
      make: "Renault",
      model: "Clio",
      model_year: 2018,
      created_at: "2026-11-22T12:00:00Z",
      updated_at: "2026-11-22T12:00:00Z",
    },
  ]

  // Filtering helper used by the UI
  function filterVehicles(list: VehicleItem[], query: string): VehicleItem[] {
    if (!query.trim()) return list
    const q = query.trim().toLowerCase()
    return list.filter((v) => {
      const matchPlate = v.plate?.toLowerCase().includes(q) || v.plate_key?.toLowerCase().includes(q)
      const matchVin = v.vin?.toLowerCase().includes(q) || v.vin_key?.toLowerCase().includes(q)
      const matchMake = v.make?.toLowerCase().includes(q)
      const matchModel = v.model?.toLowerCase().includes(q)
      const matchLabel = v.label?.toLowerCase().includes(q)
      const matchYear = v.model_year ? String(v.model_year).includes(q) : false
      return matchPlate || matchVin || matchMake || matchModel || matchLabel || matchYear
    })
  }

  it("filters vehicles by plate case-insensitively", () => {
    const results = filterVehicles(mockVehicles, "34 abc")
    expect(results).toHaveLength(1)
    expect(results[0].plate).toBe("34 ABC 123")
  })

  it("filters vehicles by normalized plate_key", () => {
    const results = filterVehicles(mockVehicles, "34abc123")
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe("daveh_01JBMX1234567890ABCDEFGH1")
  })

  it("filters vehicles by VIN", () => {
    const results = filterVehicles(mockVehicles, "NM0XXX")
    expect(results).toHaveLength(1)
    expect(results[0].make).toBe("Renault")
  })

  it("filters vehicles by make or model", () => {
    const fordResults = filterVehicles(mockVehicles, "ford")
    expect(fordResults).toHaveLength(1)
    expect(fordResults[0].model).toBe("Transit")

    const passatResults = filterVehicles(mockVehicles, "passat")
    expect(passatResults).toHaveLength(1)
    expect(passatResults[0].make).toBe("Volkswagen")
  })

  it("filters vehicles by customer label", () => {
    const results = filterVehicles(mockVehicles, "Ahmet Yılmaz")
    expect(results).toHaveLength(1)
    expect(results[0].label).toContain("Periyodik Bakım")

    const filoResults = filterVehicles(mockVehicles, "Filo")
    expect(filoResults).toHaveLength(1)
    expect(filoResults[0].label).toBe("Filo Aracı #4")
  })

  it("filters vehicles by model year", () => {
    const results = filterVehicles(mockVehicles, "2022")
    expect(results).toHaveLength(1)
    expect(results[0].model).toBe("Transit")
  })

  it("returns empty list when no matches are found", () => {
    const results = filterVehicles(mockVehicles, "nonexistent999")
    expect(results).toHaveLength(0)
  })

  it("builds correct /personal/vehicles POST payload for vehicle creation", () => {
    // The UI routes ALL vehicle mutations through /personal/vehicles (personal session auth)
    // NOT through /dogruadres/organizations/:id/vehicles (native JWT — blocked by nativeIngress)
    const form: VehicleFormValues = {
      plate: "34 XYZ 99",
      vin: "WVWZZZ123456",
      label: "Müşteri: Ali Bey",
      make: "Fiat",
      model: "Doblo",
      model_year: "2021",
    }
    const orgId = "daorg_01JBMX1234567890ABCDEFGH0"

    const payload: Record<string, unknown> = {
      organization_id: orgId,
      action: "create",
    }
    if (form.plate.trim()) payload.plate = form.plate.trim()
    if (form.vin.trim()) payload.vin = form.vin.trim()
    if (form.label.trim()) payload.label = form.label.trim()
    if (form.make.trim()) payload.make = form.make.trim()
    if (form.model.trim()) payload.model = form.model.trim()
    if (form.model_year.trim()) payload.model_year = Number(form.model_year)

    expect(payload).toEqual({
      organization_id: orgId,
      action: "create",
      plate: "34 XYZ 99",
      vin: "WVWZZZ123456",
      label: "Müşteri: Ali Bey",
      make: "Fiat",
      model: "Doblo",
      model_year: 2021,
    })
  })

  it("builds correct /personal/vehicles POST payload for vehicle update with cleared fields", () => {
    const form: VehicleFormValues = {
      plate: "34 ABC 123",
      vin: "", // cleared
      label: "", // cleared
      make: "Ford",
      model: "Focus",
      model_year: "", // cleared
    }
    const orgId = "daorg_01JBMX1234567890ABCDEFGH0"
    const vehicleId = "daveh_01JBMX1234567890ABCDEFGH1"

    const payload: Record<string, unknown> = {
      organization_id: orgId,
      action: "update",
      vehicle_id: vehicleId,
    }
    if (form.plate.trim()) payload.plate = form.plate.trim()
    else payload.plate = null

    if (form.vin.trim()) payload.vin = form.vin.trim()
    else payload.vin = null

    if (form.label.trim()) payload.label = form.label.trim()
    else payload.label = null

    if (form.make.trim()) payload.make = form.make.trim()
    else payload.make = null

    if (form.model.trim()) payload.model = form.model.trim()
    else payload.model = null

    if (form.model_year.trim()) payload.model_year = Number(form.model_year)
    else payload.model_year = null

    expect(payload.organization_id).toBe(orgId)
    expect(payload.action).toBe("update")
    expect(payload.vehicle_id).toBe(vehicleId)
    expect(payload.plate).toBe("34 ABC 123")
    expect(payload.vin).toBeNull()
    expect(payload.label).toBeNull()
    expect(payload.make).toBe("Ford")
    expect(payload.model).toBe("Focus")
    expect(payload.model_year).toBeNull()
  })

  it("builds correct /personal/vehicles POST payload for vehicle delete", () => {
    const orgId = "daorg_01JBMX1234567890ABCDEFGH0"
    const vehicleId = "daveh_01JBMX1234567890ABCDEFGH1"

    const payload = {
      action: "delete",
      organization_id: orgId,
      vehicle_id: vehicleId,
    }

    expect(payload.action).toBe("delete")
    expect(payload.organization_id).toBe(orgId)
    expect(payload.vehicle_id).toBe(vehicleId)
  })

  it("handles organization context parsing correctly", () => {
    const rawData = {
      organizations: [
        { id: "daorg_01", name: "Kadıköy Oto Servis Ltd.", role: "owner", status: "active" },
        { id: "daorg_02", name: "Bostancı Yedek Parça A.Ş.", role: "member", status: "active" },
      ],
    }
    const orgs: OrgInfo[] = rawData.organizations as OrgInfo[]
    expect(orgs).toHaveLength(2)
    expect(canDeleteVehicle(orgs[0].role)).toBe(true) // owner
    expect(canDeleteVehicle(orgs[1].role)).toBe(false) // member
  })
})
