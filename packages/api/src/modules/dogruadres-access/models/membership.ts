import { model } from "@medusajs/framework/utils"
import { Organization } from "./organization"
import { Person } from "./person"

export const Membership = model
  .define("da_organization_membership", {
    id: model.id({ prefix: "daomem" }).primaryKey(),
    organization: model.belongsTo(() => Organization),
    person: model.belongsTo(() => Person),
    role: model.enum(["owner", "admin", "member"]),
    status: model.enum(["active", "revoked"]).default("active"),
    protected_owner: model.boolean().default(false),
    revoked_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["person_id", "organization_id"], unique: true }])
