/** Test-only supported MFA enrollment. Never run against an existing/shared DB.
 * The operator was created using `medusa user`; no authentication-table inserts.
 */
import type { ExecArgs,IAuthModuleService } from "@medusajs/framework/types"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { createHmac } from "node:crypto"
export default async function({container}:ExecArgs) {
  const url=new URL(process.env.DATABASE_URL??"")
  const target=process.env.M0_FIXTURE_EVIDENCE_DIR
  if(url.hostname!=="127.0.0.1" || url.port!=="55631" || url.pathname!=="/m0ssi_a7f1" ||
    !target || path.resolve(target).toLowerCase().startsWith(path.resolve(process.cwd()).toLowerCase()))throw new Error("Not the authorized synthetic environment")
  const auth:IAuthModuleService=container.resolve("auth")
  const identities=await auth.listAuthIdentities({},{relations:["provider_identities"]})
  if(identities.length!==1)throw new Error("Unexpected synthetic identity inventory")
  const enrollment=await auth.startAuthMfa({auth_identity_id:identities[0].id,provider:"totp",issuer:"DogruAdres isolated test"})
  if(!enrollment.secret)throw new Error("No TOTP seed")
  // RFC 6238 generator in test harness ONLY; production verification is Medusa's.
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits=""
  for(const char of enrollment.secret.toUpperCase().replace(/=+$/, ""))bits+=alphabet.indexOf(char).toString(2).padStart(5,"0")
  const bytes=Buffer.from((bits.match(/.{8}/g)??[]).map(b=>parseInt(b,2)))
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const h=createHmac("sha1",bytes).update(counter).digest();const offset=h[h.length-1]&15
  const code=((h.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,"0")
  await auth.verifyAuthMfa({id:enrollment.mfa.id,auth_identity_id:identities[0].id,code})
  await writeFile(path.join(target,"totp.private.json"),JSON.stringify({secret:enrollment.secret}),{mode:0o600,flag:"wx"})
  console.log("Synthetic MFA enrollment verified; seed retained privately")
}
