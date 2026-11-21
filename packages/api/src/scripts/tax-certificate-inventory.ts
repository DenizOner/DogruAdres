import type { ExecArgs } from "@medusajs/framework/types"
import { Client } from "@medusajs/framework/pg"
import {
  inspectPrivateTaxCertificateInventory,
  type PrivateTaxCertificateInventory,
  type PrivateTaxCertificateRecord,
} from "../modules/dogruadres-access/private-tax-certificate-store"

/**
 * Medusa 2.22 native exec entry: private document + PostgreSQL inventory.
 * For an authorized operator ONLY, with their existing protected DB and
 * private-root access. No API endpoint, scheduler, SQL writes, file mutation,
 * document names, identities, paths, credentials or error text in the report.
 *
 * A PG read-only snapshot cannot atomically freeze filesystem writes.
 * Run during an authorized quiescent window; never use zero discrepancies
 * alone as proof that a production backup can be recovered.
 */
const MAX_ROWS=100_000
export const PRIVATE_TAX_DOCUMENT_READ_SQL=`
  select
    storage_key as "storageKey",
    internal_name as "internalName",
    mime_type as "mimeType",
    compression,
    original_byte_length as "originalByteLength",
    original_sha256 as "originalSha256",
    stored_byte_length as "storedByteLength"
  from da_organization_application_document
  order by storage_key
  limit 100001
`

type ReadOnlyQuery = {
  query(sql:string):Promise<{rows:any[]}>
}

export async function inspectTaxCertificateSnapshot(
  client:ReadOnlyQuery,
  privateRoot:string,
):Promise<PrivateTaxCertificateInventory>{
  let transactionStarted=false
  try{
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    transactionStarted=true
    const check=await client.query("SHOW transaction_read_only")
    if(check.rows.length!==1||check.rows[0]?.transaction_read_only!=="on")
      throw Error("Read-only database transaction not verified")
    const rows=(await client.query(PRIVATE_TAX_DOCUMENT_READ_SQL)).rows
    if(!Array.isArray(rows)||rows.length>MAX_ROWS)
      throw Error("Complete private-document inventory unavailable")
    return await inspectPrivateTaxCertificateInventory(
      privateRoot,rows as PrivateTaxCertificateRecord[])
  }finally{
    if(transactionStarted)await client.query("ROLLBACK")
  }
}

export default async function taxCertificateInventory(_args:ExecArgs):Promise<void>{
  const databaseUrl=process.env.DATABASE_URL
  const privateRoot=process.env.DOGRUADRES_TAX_CERTIFICATE_DIR
  if(!databaseUrl||!privateRoot)
    throw Error("Private tax certificate inspection unavailable")

  const client=new Client({connectionString:databaseUrl})
  let connected=false
  try{
    await client.connect()
    connected=true
    const report=await inspectTaxCertificateSnapshot(client,privateRoot)
    // Deliberately aggregate numbers only. No document IDs or filenames.
    process.stdout.write(
      `PRIVATE TAX INVENTORY: referenced=${report.referenced}, intact=${report.intact}, missing_or_corrupted=${report.missingOrCorrupted}, unreferenced=${report.unreferenced}, unexpected_entries=${report.unexpectedEntries}\n`
    )
    if(report.missingOrCorrupted||report.unreferenced||report.unexpectedEntries||
       report.intact!==report.referenced)
      throw Error("Private tax certificate inspection found inconsistencies")
  }catch{
    // Driver/OS errors might contain protected identifiers, paths or DB URLs.
    throw Error("Private tax certificate inspection unavailable or inconsistent")
  }finally{
    if(connected)await client.end().catch(()=>undefined)
  }
}
