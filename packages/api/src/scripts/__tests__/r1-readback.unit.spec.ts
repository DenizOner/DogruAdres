/** No SQL, live DB, generated operator key or activation in these tests. */
import {computeCommittedStateDigest} from "../operator-audit-protocol"
import {NativePostgresReadbackAdapter} from "../native-runtime-adapters"
import {verifyR1ReadbackCommission} from "../r1-commit-readback"
describe('R1 readback remains closed without external scope',()=>{
 it('refuses an uncommissioned adapter before a database connection',async()=>{
  await expect(new NativePostgresReadbackAdapter('unused').queryCommittedState('db','arbitrary','ceremony')).rejects.toThrow(/not commissioned/)
 })
 it('rejects unsigned/candidate commissioning before connecting',()=>{
  expect(()=>verifyR1ReadbackCommission({manifest:{manifest:{}},registry:{getApprovedSignerPublicKey:()=>null}} as any,'db','hash','ceremony')).toThrow()
 })
 it('has stable state identity for independent observations at different times',()=>{
  const a={verifierIdentity:'independent_database_readback_adapter' as const,readbackTimestamp:new Date(1000).toISOString(),querySnapshotSha256:'a'.repeat(64)}
  expect(computeCommittedStateDigest([],'db','ARMED',a)).toBe(computeCommittedStateDigest([],'db','ARMED',{...a,readbackTimestamp:new Date(2000).toISOString()}))
  expect(computeCommittedStateDigest([],'db','ARMED',a)).not.toBe(computeCommittedStateDigest([],'db','ARMED',{...a,querySnapshotSha256:'b'.repeat(64)}))
 })
})