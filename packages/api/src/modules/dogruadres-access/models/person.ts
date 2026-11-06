import { model } from "@medusajs/framework/utils"

export const Person = model.define("da_person", {
  id: model.id({ prefix: "daprs" }).primaryKey(),
  display_name: model.text().nullable(),
  // Self-declared contact, not verified proof of identity or an auth credential.
  mobile_phone: model.text().nullable(),
  mobile_version: model.number().default(0),
  disabled_at: model.dateTime().nullable(),
})
