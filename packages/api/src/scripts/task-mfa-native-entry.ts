/** Run directly with node -r ts-node/register, NEVER medusa exec. */
import taskMfaBootstrap from "./task-mfa-bootstrap"
import { initializeFixtureModules } from "./native-fixture-runtime"
import { redactSensitiveData } from "./operator-audit-protocol"
async function main() {
  // No module/container/database initialization before taskMfaBootstrap's controller.
  await taskMfaBootstrap({container:undefined as any,args:[]}, initializeFixtureModules)
}
if (require.main === module) main().catch(error => {
  console.error(redactSensitiveData(error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})