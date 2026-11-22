import { model } from "@medusajs/framework/utils"
export const Vehicle = model.define("da_vehicle", {
  id: model.id({ prefix: "daveh" }).primaryKey(), organization_id: model.text(),
  plate: model.text().nullable(), plate_key: model.text().nullable(), vin: model.text().nullable(), vin_key: model.text().nullable(),
  label: model.text().nullable(), make: model.text().nullable(), model: model.text().nullable(), model_year: model.number().nullable(),
  normalization_version: model.number().default(1),
}).indexes([
  { name: "IDX_da_vehicle_org_plate_live", on: ["organization_id", "plate_key"], unique: true, where: "deleted_at IS NULL AND plate_key IS NOT NULL" },
  { name: "IDX_da_vehicle_org_vin_live", on: ["organization_id", "vin_key"], unique: true, where: "deleted_at IS NULL AND vin_key IS NOT NULL" },
]).checks([
  { name: "da_vehicle_identifier_required", expression: '"plate_key" IS NOT NULL OR "vin_key" IS NOT NULL' },
  { name: "da_vehicle_normalization_version", expression: '"normalization_version" = 1' },
  { name: "da_vehicle_year_range", expression: '"model_year" IS NULL OR "model_year" BETWEEN 1886 AND 2100' },
  { name: "da_vehicle_identifier_pairs", expression: '("plate" IS NULL) = ("plate_key" IS NULL) AND ("vin" IS NULL) = ("vin_key" IS NULL)' },
])
