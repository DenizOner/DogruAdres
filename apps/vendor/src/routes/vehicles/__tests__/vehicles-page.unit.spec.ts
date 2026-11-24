import { describe, it, expect } from "bun:test"
import {
  validateVehicleForm,
  canDeleteVehicle,
  initialFormValues,
  type VehicleFormValues,
} from "../validation"

describe("VehiclesPage - validateVehicleForm", () => {
  it("accepts valid plate only", () => {
    const values: VehicleFormValues = {
      plate: "34 ABC 123",
      vin: "",
      label: "Ahmet Yılmaz - Bakım",
      make: "Ford",
      model: "Focus",
      model_year: "2020",
    }
    const errors = validateVehicleForm(values)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it("accepts valid VIN only", () => {
    const values: VehicleFormValues = {
      plate: "",
      vin: "WVWZZZ3CZWE123456",
      label: "Servis Müşterisi",
      make: "Volkswagen",
      model: "Passat",
      model_year: "2019",
    }
    const errors = validateVehicleForm(values)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it("accepts both plate and VIN together", () => {
    const values: VehicleFormValues = {
      plate: "06 DEF 456",
      vin: "NM0XXX12345678901",
      label: "Filo Aracı #12",
      make: "Renault",
      model: "Megane",
      model_year: "2021",
    }
    const errors = validateVehicleForm(values)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it("rejects when both plate and VIN are empty (V-01 requirement)", () => {
    const values: VehicleFormValues = {
      plate: "   ",
      vin: "",
      label: "Test Müşteri",
      make: "Fiat",
      model: "Egea",
      model_year: "2022",
    }
    const errors = validateVehicleForm(values)
    expect(errors.plate).toBeDefined()
    expect(errors.vin).toBeDefined()
    expect(errors.plate).toContain("En az bir kimlikleyici")
  })

  it("rejects plate with invalid characters", () => {
    const values: VehicleFormValues = {
      plate: "34@ABC!123",
      vin: "",
      label: "",
      make: "",
      model: "",
      model_year: "",
    }
    const errors = validateVehicleForm(values)
    expect(errors.plate).toBeDefined()
    expect(errors.plate).toContain("harf, rakam, boşluk ve tire")
  })

  it("rejects plate exceeding 64 characters", () => {
    const values: VehicleFormValues = {
      plate: "A".repeat(65),
      vin: "",
      label: "",
      make: "",
      model: "",
      model_year: "",
    }
    const errors = validateVehicleForm(values)
    expect(errors.plate).toBeDefined()
    expect(errors.plate).toContain("en fazla 64 karakter")
  })

  it("rejects VIN with invalid characters", () => {
    const values: VehicleFormValues = {
      plate: "34 ABC 123",
      vin: "WVW ZZZ!@#",
      label: "",
      make: "",
      model: "",
      model_year: "",
    }
    const errors = validateVehicleForm(values)
    expect(errors.vin).toBeDefined()
    expect(errors.vin).toContain("harf, rakam, nokta, eğik çizgi ve tire")
  })

  it("rejects VIN exceeding 128 characters", () => {
    const values: VehicleFormValues = {
      plate: "34 ABC 123",
      vin: "A".repeat(129),
      label: "",
      make: "",
      model: "",
      model_year: "",
    }
    const errors = validateVehicleForm(values)
    expect(errors.vin).toBeDefined()
    expect(errors.vin).toContain("en fazla 128 karakter")
  })

  it("rejects model_year before 1886", () => {
    const values: VehicleFormValues = {
      plate: "34 ABC 123",
      vin: "",
      label: "",
      make: "Ford",
      model: "Model T",
      model_year: "1885",
    }
    const errors = validateVehicleForm(values)
    expect(errors.model_year).toBeDefined()
    expect(errors.model_year).toContain("1886 ile 2100 arasında")
  })

  it("rejects model_year after 2100", () => {
    const values: VehicleFormValues = {
      plate: "34 ABC 123",
      vin: "",
      label: "",
      make: "Tesla",
      model: "Cybertruck",
      model_year: "2101",
    }
    const errors = validateVehicleForm(values)
    expect(errors.model_year).toBeDefined()
    expect(errors.model_year).toContain("1886 ile 2100 arasında")
  })

  it("rejects non-integer model_year", () => {
    const values: VehicleFormValues = {
      plate: "34 ABC 123",
      vin: "",
      label: "",
      make: "BMW",
      model: "320i",
      model_year: "2020.5",
    }
    const errors = validateVehicleForm(values)
    expect(errors.model_year).toBeDefined()
    expect(errors.model_year).toContain("geçerli bir tam sayı")
  })

  it("accepts empty optional fields", () => {
    const values: VehicleFormValues = {
      plate: "34 ABC 123",
      vin: "",
      label: "",
      make: "",
      model: "",
      model_year: "",
    }
    const errors = validateVehicleForm(values)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it("rejects auxiliary fields (make, model, label) exceeding 100 characters", () => {
    const values: VehicleFormValues = {
      plate: "34 ABC 123",
      vin: "",
      label: "M".repeat(101),
      make: "F".repeat(101),
      model: "M".repeat(101),
      model_year: "2020",
    }
    const errors = validateVehicleForm(values)
    expect(errors.label).toBeDefined()
    expect(errors.make).toBeDefined()
    expect(errors.model).toBeDefined()
  })

  it("verifies initial form values are blank strings", () => {
    expect(initialFormValues.plate).toBe("")
    expect(initialFormValues.vin).toBe("")
    expect(initialFormValues.label).toBe("")
    expect(initialFormValues.make).toBe("")
    expect(initialFormValues.model).toBe("")
    expect(initialFormValues.model_year).toBe("")
  })

  it("supports i18n translator function when provided", () => {
    const mockT = (key: string) => {
      const translations: Record<string, string> = {
        "vehicles.validation.plateOrVinRequired": "Translated: identifier required",
        "vehicles.validation.plateMaxLength": "Translated: plate max 64",
        "vehicles.validation.plateInvalidChars": "Translated: plate invalid chars",
        "vehicles.validation.vinMaxLength": "Translated: vin max 128",
        "vehicles.validation.vinInvalidChars": "Translated: vin invalid chars",
        "vehicles.validation.makeMaxLength": "Translated: make max 100",
        "vehicles.validation.modelMaxLength": "Translated: model max 100",
        "vehicles.validation.labelMaxLength": "Translated: label max 100",
        "vehicles.validation.modelYearInvalid": "Translated: year invalid",
      }
      return translations[key] || key
    }

    const emptyErrors = validateVehicleForm(initialFormValues, mockT)
    expect(emptyErrors.plate).toBe("Translated: identifier required")
    expect(emptyErrors.vin).toBe("Translated: identifier required")

    const invalidYearErrors = validateVehicleForm({ ...initialFormValues, plate: "34 ABC 12", model_year: "999" }, mockT)
    expect(invalidYearErrors.model_year).toBe("Translated: year invalid")
  })
})

describe("VehiclesPage - role-based delete permission logic", () => {
  it("permits delete for owner role", () => {
    expect(canDeleteVehicle("owner")).toBe(true)
  })

  it("permits delete for admin role", () => {
    expect(canDeleteVehicle("admin")).toBe(true)
  })

  it("denies delete for member role (fails closed)", () => {
    expect(canDeleteVehicle("member")).toBe(false)
  })

  it("denies delete for unknown or empty role", () => {
    expect(canDeleteVehicle("")).toBe(false)
    expect(canDeleteVehicle("guest")).toBe(false)
  })
})

describe("i18n Resource Parity and Schema Integrity", () => {
  it("verifies vendor panel i18n key parity between TR and EN", async () => {
    const vendorTr = await import("../../../i18n/tr.json")
    const vendorEn = await import("../../../i18n/en.json")

    const extractKeys = (obj: Record<string, any>, prefix = ""): string[] => {
      let keys: string[] = []
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === "object" && !Array.isArray(v)) {
          keys = keys.concat(extractKeys(v, fullKey))
        } else {
          keys.push(fullKey)
        }
      }
      return keys.sort()
    }

    const trKeys = extractKeys(vendorTr.default || vendorTr)
    const enKeys = extractKeys(vendorEn.default || vendorEn)

    expect(trKeys).toEqual(enKeys)
    expect(trKeys.length).toBeGreaterThan(20)
  })

  it("verifies admin panel i18n key parity between TR and EN", async () => {
    const adminTr = await import("../../../../../admin/src/i18n/tr.json")
    const adminEn = await import("../../../../../admin/src/i18n/en.json")

    const extractKeys = (obj: Record<string, any>, prefix = ""): string[] => {
      let keys: string[] = []
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === "object" && !Array.isArray(v)) {
          keys = keys.concat(extractKeys(v, fullKey))
        } else {
          keys.push(fullKey)
        }
      }
      return keys.sort()
    }

    const trKeys = extractKeys(adminTr.default || adminTr)
    const enKeys = extractKeys(adminEn.default || adminEn)

    expect(trKeys).toEqual(enKeys)
    expect(trKeys.length).toBeGreaterThan(30)
  })
})

