console.log("[AUDIT-RELAY-FILE] Job file imported at:", new Date().toISOString())
import type { MedusaContainer } from "@medusajs/framework/types"
import { relayFoundationAuditWorkflow } from "../workflows/dogruadres-audit-relay"

const MAX_RELAY_BATCH_PER_RUN = 25

export async function runAuditRelayBatch(
  container: MedusaContainer,
  max = MAX_RELAY_BATCH_PER_RUN
): Promise<{ delivered: number; idle: boolean; lastOutcome: string }> {
  let delivered = 0
  let lastOutcome = "idle"
  for (let i = 0; i < max; i++) {
    const { result } = await relayFoundationAuditWorkflow(container).run()
    lastOutcome = result
    if (result === "delivered") {
      delivered++
    } else if (result === "idle" || result === "source_unavailable" || result === "ack_unconfirmed") {
      return { delivered, idle: result === "idle", lastOutcome }
    }
  }
  return { delivered, idle: false, lastOutcome }
}

export default async function dogruadresAuditRelayJob(container: MedusaContainer) {
  console.log("[AUDIT-RELAY-EXEC] Scheduled job executing at:", new Date().toISOString())
  await runAuditRelayBatch(container)
}

export const config = {
  name: "dogruadres-audit-relay",
  schedule: "* * * * *", // Every minute in Medusa scheduled job loader
}
