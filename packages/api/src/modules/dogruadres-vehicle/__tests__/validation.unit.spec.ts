import { plateP1, vinC1, vehicleValues } from "../validation"
describe("Vehicle P1/C1 and partial POST values", () => {
  it.each(["34 ABC 123", "34ABC123", "34-ABC-123", "34 abc 123", "34 ABC 123"])("P1 equivalent %s", v => expect(plateP1(v).plate_key).toBe("34ABC123"))
  it.each(["34/ABC/123", "34–ABC123", "34İBC123", "34ıBC123", "３４ABC", "34\u200bABC", "34\tABC", "34\nABC", "34.ABC", "34_ABC"])("P1 rejects %s", v => expect(() => plateP1(v)).toThrow())
  it("preserves display and only removes approved P1 separators", () => {
    expect(plateP1("34 abc-123")).toEqual({ plate: "34 abc-123", plate_key: "34ABC123" })
    expect(plateP1(" -  ")).toEqual({ plate: null, plate_key: null })
    expect(plateP1("34").plate_key).toBe("34")
  })
  it("C1 is ASCII case insensitive and preserves distinct punctuation", () => {
    expect(vinC1("  wvwzzz1jzxw000001  ").vin_key).toBe("WVWZZZ1JZXW000001")
    expect(new Set(["AB-123", "AB.123", "AB/123", "AB123"].map(v => vinC1(v).vin_key)).size).toBe(4)
    expect(vinC1("I0OQ1").vin_key).toBe("I0OQ1")
    expect(vinC1("   ").vin_key).toBeNull()
  })
  it.each(["AB 123", "AB 123", "ＡＢ123", "AB\u200b123", "AB\n123", "AB_123"])("C1 rejects %s", v => expect(() => vinC1(v)).toThrow())
  it("checks original lengths and Unicode auxiliary code points", () => {
    expect(() => plateP1("A".repeat(65))).toThrow()
    expect(() => vinC1("A".repeat(129))).toThrow()
    expect(() => vehicleValues({ plate: "1", label: "😀".repeat(100) })).not.toThrow()
    expect(() => vehicleValues({ plate: "1", label: "😀".repeat(101) })).toThrow()
    for (const label of ["\tname", "a\u200bb", "a\u202eb", "a\u034fb"]) expect(() => vehicleValues({ plate: "1", label })).toThrow()
  })
  it("retains omitted values, clears null/empty, rejects no-op and immutable/unknown fields", () => {
    const before = vehicleValues({ plate: "34 ABC", vin: "abc", label: "  daily  ", model_year: 2000 })
    expect(vehicleValues({ plate: null, label: " " }, before)).toMatchObject({ plate: null, plate_key: null, vin_key: "ABC", label: null, model_year: 2000 })
    expect(() => vehicleValues({}, before)).toThrow()
    expect(() => vehicleValues({ label: "daily" }, before)).toThrow("VEHICLE_NO_CHANGE")
    for (const data of [{ organization_id: "other" }, { plate_key: "fake" }, { actor_id: "fake" }, { owner: "fake" }]) expect(() => vehicleValues(data, before)).toThrow()
  })
  it("enforces V-01 after merge and never ignores invalid supplied identifiers", () => {
    expect(() => vehicleValues({ plate: " - ", vin: " " })).toThrow("VEHICLE_IDENTIFIER_REQUIRED")
    expect(() => vehicleValues({ plate: "bad/plate", vin: "valid" })).toThrow()
    expect(() => vehicleValues({ vin: "bad vin", plate: "34" })).toThrow()
    expect(() => vehicleValues({ plate: null }, vehicleValues({ plate: "34" }))).toThrow()
  })
  it.each([1885, 2101, 2000.5, "2000"])("rejects model year %s", model_year => expect(() => vehicleValues({ vin: "X", model_year })).toThrow())
  it.each([1886, 2100, null])("accepts model year %s", model_year => expect(vehicleValues({ vin: "X", model_year }).model_year).toBe(model_year))
})
