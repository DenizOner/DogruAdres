import { model } from "@medusajs/framework/utils"
import { Organization } from "./organization"
import { Person } from "./person"

export const Invitation = model
  .define("da_organization_invitation", {
    id: model.id({ prefix: "dainv" }).primaryKey(),
    organization: model.belongsTo(() => Organization),
    created_by_person: model.belongsTo(() => Person),
    recipient_email: model.text(),
    role: model.enum(["admin", "member"]),
    token_hash: model.text(),
    status: model.enum(["pending", "accepted", "revoked"]).default("pending"),
    expires_at: model.dateTime(),
    accepted_at: model.dateTime().nullable(),
    revoked_at: model.dateTime().nullable(),
    accepted_by_person_id: model.text().nullable(),
  })
  .indexes([{ on: ["token_hash"], unique: true }])
