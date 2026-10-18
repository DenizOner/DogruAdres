export const VEHICLE_FIELDS = ["plate", "vin", "label", "make", "model", "model_year"] as const
export type VehicleValues = { plate: string | null; plate_key: string | null; vin: string | null; vin_key: string | null;
  label: string | null; make: string | null; model: string | null; model_year: number | null; normalization_version: number }
export class VehicleInputError extends Error { constructor(public readonly code = "INVALID_VEHICLE_INPUT") { super(code) } }
function text(value: unknown, max: number): string | null {
  if (value === null) return null
  if (typeof value !== "string" || [...value].length > max) throw new VehicleInputError()
  return value
}
export function plateP1(value: unknown) {
  const display = text(value, 64)
  if (display === null) return { plate: null, plate_key: null }
  if (!/^[A-Za-z0-9 \u00a0-]*$/.test(display)) throw new VehicleInputError("INVALID_PLATE_P1")
  const key = display.replace(/[ \u00a0-]/g, "").toUpperCase()
  return key ? { plate: display, plate_key: key } : { plate: null, plate_key: null }
}
export function vinC1(value: unknown) {
  const display = text(value, 128)
  if (display === null) return { vin: null, vin_key: null }
  const trimmed = display.replace(/^ +| +$/g, "")
  if (!/^[A-Za-z0-9./-]*$/.test(trimmed)) throw new VehicleInputError("INVALID_VIN_C1")
  return trimmed ? { vin: trimmed, vin_key: trimmed.toUpperCase() } : { vin: null, vin_key: null }
}
function auxiliary(value: unknown): string | null {
  const result = text(value, 100)
  // Validate BEFORE trim: controls/formatting must be rejected, not erased.
  if (result !== null && /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\u034f\u115f\u1160\u17b4\u17b5\u3164\ufe00-\ufe0f\uffa0\u{e0100}-\u{e01ef}]/u.test(result)) throw new VehicleInputError()
  return result?.trim() || null
}
export function vehicleValues(input: unknown, current?: VehicleValues): VehicleValues {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new VehicleInputError()
  const data = input as Record<string, unknown>, keys = Object.keys(data)
  if (keys.some(k => !(VEHICLE_FIELDS as readonly string[]).includes(k)) || (current && !keys.length)) throw new VehicleInputError()
  const result: VehicleValues = current ? { ...current } : { plate: null, plate_key: null, vin: null, vin_key: null,
    label: null, make: null, model: null, model_year: null, normalization_version: 1 }
  if ("plate" in data) Object.assign(result, plateP1(data.plate))
  if ("vin" in data) Object.assign(result, vinC1(data.vin))
  for (const field of ["label", "make", "model"] as const) if (field in data) result[field] = auxiliary(data[field])
  if ("model_year" in data) {
    const year = data.model_year
    if (year !== null && (typeof year !== "number" || !Number.isInteger(year) || year < 1886 || year > 2100)) throw new VehicleInputError()
    result.model_year = year as number | null
  }
  if (!result.plate_key && !result.vin_key) throw new VehicleInputError("VEHICLE_IDENTIFIER_REQUIRED")
  if (current && Object.keys(result).every(k => result[k as keyof VehicleValues] === current[k as keyof VehicleValues])) throw new VehicleInputError("VEHICLE_NO_CHANGE")
  return result
}
export function changedFields(before: VehicleValues | undefined, after: VehicleValues): string[] {
  return VEHICLE_FIELDS.filter(k => !before || before[k] !== after[k])
}
