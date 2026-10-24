import { NativeMfaStateUnavailable, readNativeMfaSummary, findResumablePendingTotpId } from "../native-mfa-summary"

describe("Medusa v2.21.2 native MFA read-only factor state", () => {
  const identity="auth_identity_self"
  const factor=(id:string,status:unknown,owner=identity):any=>({
    id, status, auth_identity_id:owner, provider:"totp",
    metadata:{secret:"NEVER_EXPOSE",otpauth_url:"otpauth://private"},
  })
  const service=(rows:unknown):any=>({listAuthMfa:jest.fn(async()=>rows)})
  it("reports no factor only from a complete, scoped, empty native result",async()=>{
    const native=service([])
    expect(await readNativeMfaSummary(native,identity)).toEqual({
      enabled:false,state:"not_enrolled",
    })
    expect(native.listAuthMfa).toHaveBeenCalledWith(
      {auth_identity_id:identity},{take:101,skip:0}
    )
  })
  it("selects only one pending, owned TOTP factor for password-proof resume",async()=>{
    expect(await findResumablePendingTotpId(service([factor("pending_old","pending")]),identity))
      .toBe("pending_old")
    expect(await findResumablePendingTotpId(service([factor("old","disabled")]),identity))
      .toBeNull()
  })
  it.each([
    [factor("p1","pending"),factor("p2","pending")],
    [factor("p1","pending"),{...factor("other","pending"),provider:"other"}],
    [{...factor("other","pending"),provider:"other"},factor("p1","pending")],
    [factor("p1","pending"),factor("live","enabled")],
    [factor("p1","pending","not_me")],
    [factor("p1","pending")].map(f=>({...f,provider:"unknown_provider"})),
  ])("rejects unsafe existing MFA factors during resumption: %p",async(...factors)=>{
    await expect(findResumablePendingTotpId(service(factors),identity))
      .rejects.toBeInstanceOf(NativeMfaStateUnavailable)
  })
  it("does not treat pending enrollment as verified",async()=>{
    expect(await readNativeMfaSummary(service([factor("mfa_pending","pending")]),identity))
      .toEqual({enabled:false,state:"pending"})
  })
  it("an enabled factor overrides pending and disabled native factors",async()=>{
    expect(await readNativeMfaSummary(service([
      factor("mfa_old","disabled"),factor("mfa_pending","pending"),
      factor("mfa_current","enabled"),
    ]),identity)).toEqual({enabled:true,state:"enabled"})
  })
  it("does not serialize native factor IDs, provider metadata, secrets or codes",async()=>{
    const result=await readNativeMfaSummary(service([factor("mfa_secret","enabled")]),identity)
    expect(Object.keys(result).sort()).toEqual(["enabled","state"])
    expect(JSON.stringify(result)).not.toContain("mfa_secret")
    expect(JSON.stringify(result)).not.toContain("NEVER_EXPOSE")
    expect(Object.isFrozen(result)).toBe(true)
  })
  it.each([
    undefined,null,{},[null],
    [factor("other","enabled","another_person")],
    [factor("mfa_doubled","enabled"),factor("mfa_doubled","enabled")],
    [factor("unknown","totally_new")],
    [factor("unknown",null)],
    [factor("unknown","enabled")].map(({auth_identity_id,...rest}:any)=>rest),
    [factor("unknown","enabled")].map(({id,...rest}:any)=>rest),
    [factor("unknown","enabled")].map(({provider,...rest}:any)=>rest),
    Array.from({length:101},(_,n)=>factor("mfa_"+n,"disabled")),
  ])("fails closed on corrupt, cross-identity or truncated factor results: %#",async rows=>{
    await expect(readNativeMfaSummary(service(rows),identity)).rejects
      .toBeInstanceOf(NativeMfaStateUnavailable)
  })
  it("fails closed if Medusa throws instead of guessing the factor is absent",async()=>{
    const native:any={listAuthMfa:jest.fn(async()=>{throw Error("Medusa offline")})}
    await expect(readNativeMfaSummary(native,identity)).rejects.toThrow("Medusa offline")
  })
  it.each(["",undefined,null] as unknown[])("rejects empty current identity: %p",async id=>{
    const native=service([])
    await expect(readNativeMfaSummary(native,id as string)).rejects
      .toBeInstanceOf(NativeMfaStateUnavailable)
    expect(native.listAuthMfa).not.toHaveBeenCalled()
  })
})
