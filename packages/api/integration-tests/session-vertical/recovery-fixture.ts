/** Supported native workflow; only the disposable task actor may be reset. */
import type { ExecArgs, IAuthModuleService } from "@medusajs/framework/types"
import { generateResetPasswordTokenWorkflow } from "@medusajs/core-flows"
import { randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import path from "node:path"
export default async function({container}:ExecArgs){
  const u=new URL(process.env.DATABASE_URL??""),directory=process.env.M0_FIXTURE_EVIDENCE_DIR
  if(u.hostname!=="127.0.0.1"||u.port!=="55631"||u.pathname!=="/m0ssi_a7f1"||!directory||path.resolve(directory).startsWith(path.resolve(process.cwd())))throw new Error("Not authorized synthetic environment")
  const {projectConfig:{http}}=container.resolve("configModule")
  const {result}=await generateResetPasswordTokenWorkflow(container).run({input:{entityId:"m0ssi-adversary-a7f1@example.invalid",actorType:"user",provider:"emailpass",secret:http.jwtSecret,jwtOptions:http.jwtOptions}})
  const auth:IAuthModuleService=container.resolve("auth")
  const providers=await auth.listProviderIdentities({provider:"emailpass",entity_id:"m0ssi-adversary-a7f1@example.invalid"})
  if(providers.length!==1 || !providers[0].auth_identity_id)throw new Error("Ambiguous synthetic identity")
  const verification=await auth.requestAuthVerification({auth_identity_id:providers[0].auth_identity_id,entity_id:`verify-${randomUUID()}@example.invalid`,entity_type:"email",code_provider:"token"})
  const filename=`recovery-${randomUUID()}.private.json`
  await writeFile(path.join(directory,filename),JSON.stringify({token:result,verification}),{mode:0o600,flag:"wx"})
  console.log("Synthetic reset workflow completed; private credential file: "+filename)
}
