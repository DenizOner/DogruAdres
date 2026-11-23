export interface VehicleItem {
  id: string
  organization_id: string
  plate: string | null
  plate_key: string | null
  vin: string | null
  vin_key: string | null
  label: string | null
  make: string | null
  model: string | null
  model_year: number | null
  created_at: string
  updated_at: string
}

export interface OrgInfo {
  id: string
  name: string
  role: "owner" | "admin" | "member"
  status: string
}

export interface VehicleFormValues {
  plate: string
  vin: string
  label: string
  make: string
  model: string
  model_year: string
}

export const initialFormValues: VehicleFormValues = {
  plate: "",
  vin: "",
  label: "",
  make: "",
  model: "",
  model_year: "",
}

// Client-side validation helpers matching server rules V-01 to V-06
export function validateVehicleForm(values: VehicleFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  const trimmedPlate = values.plate.trim()
  const trimmedVin = values.vin.trim()

  if (!trimmedPlate && !trimmedVin) {
    errors.plate = "En az bir kimlikleyici (Plaka veya Şasi No) girilmelidir."
    errors.vin = "En az bir kimlikleyici (Plaka veya Şasi No) girilmelidir."
  }

  if (trimmedPlate) {
    if (trimmedPlate.length > 64) {
      errors.plate = "Plaka en fazla 64 karakter olabilir."
    } else if (!/^[A-Za-z0-9 \u00a0-]*$/.test(trimmedPlate)) {
      errors.plate = "Plaka yalnızca harf, rakam, boşluk ve tire içerebilir."
    }
  }

  if (trimmedVin) {
    if (trimmedVin.length > 128) {
      errors.vin = "Şasi numarası (VIN) en fazla 128 karakter olabilir."
    } else if (!/^[A-Za-z0-9./-]*$/.test(trimmedVin)) {
      errors.vin = "Şasi numarası yalnızca harf, rakam, nokta, eğik çizgi ve tire içerebilir."
    }
  }

  if (values.make && values.make.length > 100) {
    errors.make = "Marka en fazla 100 karakter olabilir."
  }

  if (values.model && values.model.length > 100) {
    errors.model = "Model en fazla 100 karakter olabilir."
  }

  if (values.label && values.label.length > 100) {
    errors.label = "Müşteri notu / etiketi en fazla 100 karakter olabilir."
  }

  if (values.model_year && values.model_year.trim()) {
    const yearNum = Number(values.model_year)
    if (!Number.isInteger(yearNum) || yearNum < 1886 || yearNum > 2100) {
      errors.model_year = "Model yılı 1886 ile 2100 arasında geçerli bir tam sayı olmalıdır."
    }
  }

  return errors
}

export function canDeleteVehicle(role: "owner" | "admin" | "member" | string): boolean {
  return role === "owner" || role === "admin"
}
