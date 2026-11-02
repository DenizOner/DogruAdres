import type {Client} from "@medusajs/framework/pg"
export const MFA_RUNTIME_FLAGS=["DOGRUADRES_IDENTITY_ENABLED","DOGRUADRES_MFA_SETTINGS_ENABLED","DOGRUADRES_MFA_ENROLLMENT_ENABLED","DOGRUADRES_MFA_RUNTIME_ENABLED"] as const
export function observeMfaFlags(env:NodeJS.ProcessEnv) {
  return Object.fromEntries(MFA_RUNTIME_FLAGS.map(k=>[k,env[k]??null]))
}
export function assertActiveMfaRuntime(latch:unknown, env:NodeJS.ProcessEnv) {
  if(latch!==true||MFA_RUNTIME_FLAGS.some(k=>env[k]!=="true"))
    throw Error("REFUSED: committed R1 latch and all four actual runtime flags are required")
}
/** Facts only. Does not commission an operator, activate SQL or issue ARMED evidence. */
export async function readR1Readiness(db:Client) {
  const r=await db.query(`SELECT current_database() AS database,
    (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
    (SELECT count(*)::int FROM mikro_orm_migrations) AS migrations,
    (SELECT mfa_activated FROM da_session_policy WHERE id='current') AS latch,
    (SELECT version FROM da_session_policy WHERE id='current') AS version,
    (SELECT count(*)::int FROM public.user) AS users,
    (SELECT count(*)::int FROM auth_identity) AS identities,
    (SELECT count(*)::int FROM da_person) AS people,
    (SELECT count(*)::int FROM da_actor_mapping) AS mappings,
    (SELECT count(*)::int FROM da_login_binding) AS bindings,
    (SELECT count(*)::int FROM auth_mfa_factor) AS factors,
    (SELECT count(*)::int FROM auth_mfa_recovery_code) AS recovery,
    (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='da_session_policy'::regclass AND NOT tgisinternal AND tgenabled='O'
      AND tgname IN ('da_mfa_activation_guard_rows','da_mfa_activation_guard_truncate')) AS guards,
    (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) AS other_sessions`)
  return r.rows[0]
}
export function assertR1CleanFacts(s:any) {
  if(s?.database!=="da_r0b_e7a1_db"||s.cluster!=="7699743845625188386"||s.migrations!==234||
    s.latch!==false||s.guards!==2||s.other_sessions!==0||s.factors!==0||s.recovery!==0||
    [s.users,s.identities,s.people,s.mappings,s.bindings].some(n=>n!==2))throw Error("REFUSED: R1 clean target facts mismatch")
}
/** Commit-bound fact validation proposal for #238; NOT a commissioned readback adapter.
 * PG xid8 status plus row xmin defeat a caller's arbitrary transaction hash.
 * A separately scoped signed intent/receipt and source review remain necessary.
 */
export function verifyR1CommitFacts(actual:{transactionStatus:string;rowXmin:string;latch:boolean;version:number}, receipt:{transactionId:string;expectedVersion:number}) {
  if(!/^[1-9][0-9]*$/.test(receipt.transactionId)||BigInt(receipt.transactionId)>18446744073709551615n||
    actual.transactionStatus!=="committed"||actual.rowXmin!==(BigInt(receipt.transactionId)&4294967295n).toString()||
    actual.latch!==true||!Number.isSafeInteger(receipt.expectedVersion)||actual.version!==receipt.expectedVersion)
    throw Error("REFUSED: commit-bound R1 readback mismatch")
  return actual
}