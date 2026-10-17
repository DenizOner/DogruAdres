import { model } from "@medusajs/framework/utils"

export const Person = model.define("da_person", {
  id: model.id({ prefix: "daprs" }).primaryKey(),
  display_name: model.text().nullable(),
  disabled_at: model.dateTime().nullable(),
})
