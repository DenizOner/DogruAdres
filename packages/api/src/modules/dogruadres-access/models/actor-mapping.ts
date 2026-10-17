import { model } from "@medusajs/framework/utils"
import { Person } from "./person"

export const ActorMapping = model
  .define("da_actor_mapping", {
    id: model.id({ prefix: "daact" }).primaryKey(),
    actor_type: model.text(),
    actor_id: model.text(),
    person: model.belongsTo(() => Person),
    created_by_actor_type: model.text(),
    created_by_actor_id: model.text(),
  })
  .indexes([{ on: ["actor_type", "actor_id"], unique: true }])
