import type { ExecArgs } from "@medusajs/framework/types"
import { createApiKeysWorkflow } from "@medusajs/core-flows"
import { access, writeFile } from "node:fs/promises"
import path from "node:path"
export default async function({container}:ExecArgs){
  const u=new URL(process.env.DATABASE_URL??"");const directory=process.env.M0_FIXTURE_EVIDENCE_DIR
  if(u.hostname!=="127.0.0.1"||u.port!=="55631"||u.pathname!=="/m0ssi_a7f1"||!directory||path.resolve(directory).startsWith(path.resolve(process.cwd())))throw new Error("Not authorized synthetic environment")
  let exists=false
  try {await access(path.join(directory,"machine.private.json"));exists=true} catch(error) {if(!(error && typeof error==='object' && 'code' in error && error.code==='ENOENT'))throw error}
  if(exists)throw new Error("Preserved machine fixture already exists; do not recreate")
  const {result}=await createApiKeysWorkflow(container).run({input:{api_keys:[{title:"M0 isolated machine read",type:"secret",created_by:"user_01M5DE1P0NCAJVPCW6DS1DM1F1"}]}})
  await writeFile(path.join(directory,"machine.private.json"),JSON.stringify({token:result[0].token}),{mode:0o600,flag:"wx"})
  console.log("Synthetic machine key created through supported workflow; retained privately")
}
