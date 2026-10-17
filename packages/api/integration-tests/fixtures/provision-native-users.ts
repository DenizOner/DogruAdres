import type { ExecArgs, IAuthModuleService, IWorkflowEngineService, ConfigModule } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// Test-only equivalent of Medusa 2.21.2's supported `user` command. Credentials
// arrive through the child process environment and are never logged or stored.
export default async function provisionNativeUsers({ container }: ExecArgs) {
  const config = container.resolve<ConfigModule>(ContainerRegistrationKeys.CONFIG_MODULE)
  const target = new URL(config.projectConfig.databaseUrl!)
  if (target.hostname !== "127.0.0.1" || target.port !== "55437" || target.pathname !== "/g10k_20261017125120_7d460ec3" ||
      config.projectConfig.redisUrl !== "redis://127.0.0.1:56379" || process.env.NODE_ENV !== "test") {
    throw new Error("Synthetic user provisioning requires the authorized isolated G1 target")
  }
  const credentials = JSON.parse(process.env.DOGRUADRES_TEST_USER_FIXTURES ?? "[]") as Array<{ email: string; password: string }>
  if (credentials.length !== 2 || credentials.some(({ email, password }) => !email.endsWith("@example.invalid") || password.length < 32)) {
    throw new Error("Two synthetic test credentials are required")
  }
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
  const workflows = container.resolve<IWorkflowEngineService>(Modules.WORKFLOW_ENGINE)
  for (const { email, password } of credentials) {
    const { result: users } = await workflows.run("create-users-workflow", { input: { users: [{ email }] } })
    const registration = await auth.register("emailpass", { body: { email, password } })
    if (!registration.success || !registration.authIdentity) throw new Error("Synthetic authentication registration failed")
    await auth.updateAuthIdentities({ id: registration.authIdentity.id, app_metadata: { user_id: users[0].id } })
  }
}
