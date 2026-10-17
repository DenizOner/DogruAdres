import { model } from "@medusajs/framework/utils"

export const Organization = model.define("da_organization", {
  id: model.id({ prefix: "daorg" }).primaryKey(),
  name: model.text(),
  status: model.enum(["active", "suspended"]).default("active"),
})
