import { randomUUID } from "node:crypto"
import { z } from "@medusajs/framework/zod"
import { IdentityAccessDenied, IdentitySessions, type SecuritySql } from "./identity-session"

// The six activity declarations have no verified status, discount, Organization
// or Store entitlement. The customer's submitted profile is only a draft.
export const declaredActivityCodes=[
  "service_repair","retail_store","wholesale_distribution",
  "manufacturing","fleet_operations","insurance_claims"
] as const

// Technical draft hygiene only; not validation of a legal name, a verified
// landline, jurisdiction, tax identifier or official registration document.
export const draftPayload=z.object({
  application_id:z.string().regex(/^daorgapp_[0-9a-f]{32}$/),
  expected_version:z.number().int().min(0).max(2147483646),
  business_kind:z.enum(["individual_business","legal_company"]),
  declared_activities:z.array(z.enum(declaredActivityCodes)).min(1).max(6)
    .refine(items=>new Set(items).size===items.length),
  primary_activity:z.enum(declaredActivityCodes),
  legal_name:z.string().trim().min(2).max(200)
    .refine(s=>!/[\x00-\x1f\x7f]/.test(s)),
  landline_phone:z.string().trim().min(7).max(40)
    .regex(/^[+0-9 ()-]+$/)
    .refine(s=>(s.match(/[0-9]/g)||[]).length>=7),
}).strict().refine(v=>v.declared_activities.includes(v.primary_activity))
export type DraftPayload=z.infer<typeof draftPayload>

export async function listOrganizationDrafts(db:SecuritySql,token:string) {
  const session=await new IdentitySessions(db).current(token,false,false)
  if(!session)return null
  const rows=await db.execute(`select id,business_kind,legal_name,landline_phone,
      declared_activities,primary_activity,status,version,created_at,updated_at from da_organization_application
    where applicant_person_id=? and status='draft'
    order by updated_at desc,id limit 100`,[session.person_id])
  if(!Array.isArray(rows)||rows.length>100)throw new IdentityAccessDenied()
  return rows.map(r=>({id:r.id,business_kind:r.business_kind,
    legal_name:r.legal_name,landline_phone:r.landline_phone,
    declared_activities:r.declared_activities,primary_activity:r.primary_activity,status:r.status,
    version:Number(r.version),created_at:r.created_at,updated_at:r.updated_at}))
}

export async function saveOrganizationDraft(db:SecuritySql,token:string,value:unknown) {
  const validated=draftPayload.safeParse(value)
  if(!validated.success)throw new IdentityAccessDenied()
  const input=validated.data
  const session=await new IdentitySessions(db).current(token,false,false)
  if(!session)return null
  await db.execute(`select pg_advisory_xact_lock(hashtext('da-org-draft'),hashtext(?))`,
    [input.application_id])
  const found=await db.execute(`select applicant_person_id,status,version
    from da_organization_application where id=? for update`,[input.application_id])
  if(found.length>1)throw new IdentityAccessDenied()
  if(found.length && found[0].applicant_person_id!==session.person_id)return null
  if(found.length && found[0].status!=="draft")return {conflict:true as const}
  if(!found.length){
    if(input.expected_version!==0)return {conflict:true as const}
    await db.execute(`insert into da_organization_application
      (id,applicant_person_id,business_kind,legal_name,landline_phone,
       declared_activities,primary_activity,status,version)
      values(?,?,?,?,?,?::jsonb,?,'draft',1)`,
      [input.application_id,session.person_id,input.business_kind,
        input.legal_name,input.landline_phone,JSON.stringify(input.declared_activities),
        input.primary_activity])
  }else{
    if(Number(found[0].version)!==input.expected_version)return {conflict:true as const}
    const updated=await db.execute(`update da_organization_application
      set business_kind=?,legal_name=?,landline_phone=?,
        declared_activities=?::jsonb,primary_activity=?,
        version=version+1,updated_at=clock_timestamp()
      where id=? and applicant_person_id=? and status='draft' and version=?
      returning id`,
      [input.business_kind,input.legal_name,input.landline_phone,
        JSON.stringify(input.declared_activities),input.primary_activity,
        input.application_id,session.person_id,input.expected_version])
    if(updated.length!==1)return {conflict:true as const}
  }
  // Save only actor+draft identity in the same Foundation transaction.
  // Never include applicant contact, tax identifiers or documents in audit.
  const auditId="daaud_"+randomUUID()
  await db.execute(`insert into da_audit_event
    (id,actor_person_id,actor_type,actor_id,action,module,resource,
      target_id,occurred_at,created_at,updated_at)
    values (?,?,?,?,'organization.application_draft_saved',
      'dogruadres-access','organization-application',?,clock_timestamp(),now(),now())`,
    [auditId,session.person_id,session.actor_type,session.actor_id,input.application_id])
  await db.execute(`insert into da_security_outbox(id,audit_event_id,created_at)
    values(?,?,now())`,[randomUUID(),auditId])
  return {conflict:false as const,application_id:input.application_id,
    status:"draft" as const,version:input.expected_version+1}
}
