import { randomUUID } from "node:crypto"
import { z } from "@medusajs/framework/zod"
import { IdentityAccessDenied, IdentitySessions, type SecuritySql } from "./identity-session"
import {
  InvalidTaxCertificate,
  TAX_CERTIFICATE_MAX_BYTES,
  prepareTaxCertificate,
  type TaxCertificateFormat,
} from "./tax-certificate-policy"
import {
  readPrivateTaxCertificate,
  writePrivateTaxCertificate,
} from "./private-tax-certificate-store"

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

export const withdrawDraftPayload=z.object({
  action:z.literal("withdraw"),
  application_id:z.string().regex(/^daorgapp_[0-9a-f]{32}$/),
  expected_version:z.number().int().min(1).max(2147483646),
}).strict()
export type WithdrawDraftPayload=z.infer<typeof withdrawDraftPayload>

export const uploadDocumentPayload=z.object({
  action:z.literal("upload_document"),
  application_id:z.string().regex(/^daorgapp_[0-9a-f]{32}$/),
  expected_version:z.number().int().min(1).max(2147483646),
  filename:z.string().trim().min(5).max(160),
  file_base64:z.string().min(11),
}).strict()
export type UploadDocumentPayload=z.infer<typeof uploadDocumentPayload>

export const submitApplicationPayload=z.object({
  action:z.literal("submit"),
  application_id:z.string().regex(/^daorgapp_[0-9a-f]{32}$/),
  expected_version:z.number().int().min(1).max(2147483646),
}).strict()
export type SubmitApplicationPayload=z.infer<typeof submitApplicationPayload>

// Cursor is an untrusted position, never an authority or Person selector.
export type OrganizationDraftCursor=Readonly<{updatedAt:string;id:string}>
const cursorTime=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const draftId=/^daorgapp_[0-9a-f]{32}$/
export function decodeOrganizationDraftCursor(value:unknown):OrganizationDraftCursor|null {
  if(typeof value!=="string"||value.length<1||value.length>256||
     !/^[A-Za-z0-9_-]+$/.test(value))return null
  try {
    const decoded=Buffer.from(value,"base64url").toString("utf8")
    if(Buffer.from(decoded,"utf8").toString("base64url")!==value)return null
    const item=JSON.parse(decoded)
    if(!item||typeof item!=="object"||Array.isArray(item)||
       Object.keys(item).sort().join(",")!=="id,t"||
       typeof item.t!=="string"||!cursorTime.test(item.t)||
       !Number.isFinite(Date.parse(item.t))||
       typeof item.id!=="string"||!draftId.test(item.id))return null
    return {updatedAt:item.t,id:item.id}
  }catch{return null}
}

export async function listOrganizationDrafts(
  db:SecuritySql,token:string,cursor?:OrganizationDraftCursor
) {
  const session=await new IdentitySessions(db).current(token,false,false)
  if(!session)return null
  // Stable keyset: newest first, IDs break equal-timestamp ties.
  // PostgreSQL microseconds must not be truncated to JS Date milliseconds.
  const rows=await db.execute(`select id,business_kind,legal_name,landline_phone,
      declared_activities,primary_activity,status,version,created_at,updated_at,
      to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time,
      (select mime_type from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_mime,
      (select original_byte_length from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_bytes,
      (select original_sha256 from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_sha256,
      (select version from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_version
    from da_organization_application
    where applicant_person_id=? and status in ('draft','withdrawn','submitted')
    ${cursor?"and (updated_at < ?::timestamptz or (updated_at = ?::timestamptz and id > ?))":""}
    order by updated_at desc,id asc limit 101`,
    cursor?[session.person_id,cursor.updatedAt,cursor.updatedAt,cursor.id]:
      [session.person_id])
  if(!Array.isArray(rows)||rows.length>101)throw new IdentityAccessDenied()
  const page=rows.slice(0,100)
  const last=page[page.length-1]
  if(rows.length>100 && (!last||!draftId.test(last.id)||
      typeof last.cursor_time!=="string"||!cursorTime.test(last.cursor_time)))
    throw new IdentityAccessDenied()
  const next_cursor=rows.length>100
    ? Buffer.from(JSON.stringify({t:last.cursor_time,id:last.id}),"utf8").toString("base64url")
    : null
  return {drafts:page.map(r=>({
      id:r.id,business_kind:r.business_kind,
      legal_name:r.legal_name,landline_phone:r.landline_phone,
      declared_activities:r.declared_activities,primary_activity:r.primary_activity,status:r.status,
      version:Number(r.version),created_at:r.created_at,updated_at:r.updated_at,
      has_document: r.doc_mime !== null && r.doc_mime !== undefined,
      document: (r.doc_mime !== null && r.doc_mime !== undefined) ? {
        mime_type: r.doc_mime,
        original_byte_length: Number(r.doc_bytes),
        original_sha256: r.doc_sha256,
        version: Number(r.doc_version),
      } : undefined
    })),next_cursor}
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

/** Withdraw only this Person's saved draft; retain the private row and audit.
 * Caller runs this within the same Foundation transaction as the audit/outbox.
 * A withdrawal never creates a commercial Organization or any Owner rights.
 */
export async function withdrawOrganizationDraft(
  db:SecuritySql,token:string,value:unknown
) {
  const parsed=withdrawDraftPayload.safeParse(value)
  if(!parsed.success)throw new IdentityAccessDenied()
  const input=parsed.data
  const session=await new IdentitySessions(db).current(token,false,false)
  if(!session)return null
  // Serialize against both draft save and another withdrawal of the same ID.
  await db.execute(`select pg_advisory_xact_lock(hashtext('da-org-draft'),hashtext(?))`,
    [input.application_id])
  const rows=await db.execute(`select applicant_person_id,status,version
    from da_organization_application where id=? for update`,[input.application_id])
  if(rows.length>1)throw new IdentityAccessDenied()
  // Do not disclose existence or status of another Person's application.
  if(rows.length!==1||rows[0].applicant_person_id!==session.person_id)return null
  if(rows[0].status!=="draft"||
     Number(rows[0].version)!==input.expected_version)
    return {conflict:true as const}
  const updated=await db.execute(`update da_organization_application
    set status='withdrawn',version=version+1,updated_at=clock_timestamp()
    where id=? and applicant_person_id=? and status='draft' and version=?
    returning version`,[input.application_id,session.person_id,input.expected_version])
  if(updated.length!==1) return {conflict:true as const}
  const auditId="daaud_"+randomUUID()
  await db.execute(`insert into da_audit_event
    (id,actor_person_id,actor_type,actor_id,action,module,resource,
      target_id,occurred_at,created_at,updated_at)
    values (?,?,?,?,'organization.application_draft_withdrawn',
      'dogruadres-access','organization-application',?,clock_timestamp(),now(),now())`,
    [auditId,session.person_id,session.actor_type,session.actor_id,input.application_id])
  await db.execute(`insert into da_security_outbox(id,audit_event_id,created_at)
    values(?,?,now())`,[randomUUID(),auditId])
  return {conflict:false as const,application_id:input.application_id,
    status:"withdrawn" as const,version:Number(updated[0].version)}
}

/**
 * Upload and link a tax certificate document to an active Person draft.
 * Actual file bytes are written exclusively to the durable private directory.
 * Metadata and version lineage are linked atomically in the Foundation transaction.
 */
export async function saveOrganizationDocument(
  db:SecuritySql,
  token:string,
  value:unknown,
  overrideRoot?:string
) {
  const parsed=uploadDocumentPayload.safeParse(value)
  if(!parsed.success)throw new IdentityAccessDenied()
  const input=parsed.data
  const session=await new IdentitySessions(db).current(token,false,false)
  if(!session)return null

  // Refuse excessive base64 strings early before Buffer allocation
  if(input.file_base64.length>Math.ceil(TAX_CERTIFICATE_MAX_BYTES*4/3)+64){
    throw new InvalidTaxCertificate()
  }
  const fileBytes=Buffer.from(input.file_base64,"base64")
  if(fileBytes.length<8||fileBytes.length>TAX_CERTIFICATE_MAX_BYTES){
    throw new InvalidTaxCertificate()
  }

  // Pre-validate file bytes format (PDF/JPEG/PNG) and prepare record
  const prepared=prepareTaxCertificate(input.filename,fileBytes)

  // Serialize application writes
  await db.execute(`select pg_advisory_xact_lock(hashtext('da-org-draft'),hashtext(?))`,
    [input.application_id])

  const rows=await db.execute(`select applicant_person_id,status,version
    from da_organization_application where id=? for update`,[input.application_id])
  if(rows.length>1)throw new IdentityAccessDenied()
  if(rows.length!==1||rows[0].applicant_person_id!==session.person_id)return null
  if(rows[0].status!=="draft")return {conflict:true as const}
  if(Number(rows[0].version)!==input.expected_version)return {conflict:true as const}

  // Persist to private directory outside checkout and public static
  const rootDir=overrideRoot??process.env.DOGRUADRES_TAX_CERTIFICATE_DIR
  if(!rootDir)throw new InvalidTaxCertificate()
  const stored=await writePrivateTaxCertificate(rootDir,prepared)

  // Find max document version
  const docVerRows=await db.execute(
    `select coalesce(max(version), 0) as max_v from da_organization_application_document where application_id=?`,
    [input.application_id]
  )
  const nextDocVer=Number(docVerRows[0]?.max_v??0)+1

  // Mark all previous documents for this application as not current (preserves historical versions)
  await db.execute(
    `update da_organization_application_document set is_current=false, updated_at=clock_timestamp() where application_id=? and is_current=true`,
    [input.application_id]
  )

  // Insert new document record
  const docId="da_doc_"+randomUUID().replaceAll("-","")
  await db.execute(
    `insert into da_organization_application_document
      (id, application_id, applicant_person_id, storage_key, internal_name, mime_type, compression, original_byte_length, original_sha256, stored_byte_length, version, is_current)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)`,
    [
      docId,
      input.application_id,
      session.person_id,
      stored.storageKey,
      stored.internalName,
      stored.mimeType,
      stored.compression,
      stored.originalByteLength,
      stored.originalSha256,
      stored.storedByteLength,
      nextDocVer,
    ]
  )

  // Bump application version
  const updated=await db.execute(
    `update da_organization_application
      set version=version+1, updated_at=clock_timestamp()
      where id=? and applicant_person_id=? and status='draft' and version=?
      returning version`,
    [input.application_id, session.person_id, input.expected_version]
  )
  if(updated.length!==1)return {conflict:true as const}

  const auditId="daaud_"+randomUUID()
  await db.execute(
    `insert into da_audit_event
      (id, actor_person_id, actor_type, actor_id, action, module, resource, target_id, occurred_at, created_at, updated_at)
      values (?,?,?,?,'organization.application_document_uploaded','dogruadres-access','organization-application',?,clock_timestamp(),now(),now())`,
    [auditId,session.person_id,session.actor_type,session.actor_id,input.application_id]
  )
  await db.execute(
    `insert into da_security_outbox(id, audit_event_id, created_at) values(?,?,now())`,
    [randomUUID(), auditId]
  )

  return {
    conflict:false as const,
    application_id:input.application_id,
    status:"draft" as const,
    version:Number(updated[0].version),
    document:{
      mime_type:stored.mimeType,
      original_byte_length:stored.originalByteLength,
      original_sha256:stored.originalSha256,
      version:nextDocVer,
    }
  }
}

/**
 * Submit the application for platform review.
 * Requires mandatory completed fields and at least one uploaded document.
 * Transition to 'submitted' locks the draft against further client modification.
 */
export async function submitOrganizationApplication(
  db:SecuritySql,
  token:string,
  value:unknown
) {
  const parsed=submitApplicationPayload.safeParse(value)
  if(!parsed.success)throw new IdentityAccessDenied()
  const input=parsed.data
  const session=await new IdentitySessions(db).current(token,false,false)
  if(!session)return null

  await db.execute(`select pg_advisory_xact_lock(hashtext('da-org-draft'),hashtext(?))`,
    [input.application_id])

  const rows=await db.execute(`select applicant_person_id, status, version,
      business_kind, legal_name, landline_phone, declared_activities, primary_activity
    from da_organization_application where id=? for update`,[input.application_id])
  if(rows.length>1)throw new IdentityAccessDenied()
  if(rows.length!==1||rows[0].applicant_person_id!==session.person_id)return null
  if(rows[0].status!=="draft")return {conflict:true as const, missing_document:false as const}
  if(Number(rows[0].version)!==input.expected_version)return {conflict:true as const, missing_document:false as const}

  // Verify mandatory current document
  const docs=await db.execute(
    `select id from da_organization_application_document where application_id=? and is_current=true`,
    [input.application_id]
  )
  if(!docs.length){
    return {missing_document:true as const, conflict:false as const}
  }

  // Update status to 'submitted'
  const updated=await db.execute(
    `update da_organization_application
      set status='submitted', version=version+1, updated_at=clock_timestamp()
      where id=? and applicant_person_id=? and status='draft' and version=?
      returning version`,
    [input.application_id, session.person_id, input.expected_version]
  )
  if(updated.length!==1)return {conflict:true as const, missing_document:false as const}

  const auditId="daaud_"+randomUUID()
  await db.execute(
    `insert into da_audit_event
      (id, actor_person_id, actor_type, actor_id, action, module, resource, target_id, occurred_at, created_at, updated_at)
      values (?,?,?,?,'organization.application_submitted','dogruadres-access','organization-application',?,clock_timestamp(),now(),now())`,
    [auditId,session.person_id,session.actor_type,session.actor_id,input.application_id]
  )
  await db.execute(
    `insert into da_security_outbox(id, audit_event_id, created_at) values(?,?,now())`,
    [randomUUID(), auditId]
  )

  return {
    conflict:false as const,
    missing_document:false as const,
    application_id:input.application_id,
    status:"submitted" as const,
    version:Number(updated[0].version)
  }
}

/**
 * Read the current tax certificate document for an application.
 * Permitted only to the authorized applicant Person OR platform Admin with a staff grant.
 */
export async function readOrganizationApplicationDocument(
  db:SecuritySql,
  token:string,
  applicationId:string,
  overrideRoot?:string
) {
  if(typeof applicationId!=="string"||!draftId.test(applicationId))return null
  const session=await new IdentitySessions(db).current(token,false,false)
  if(!session)return null

  // Fetch application
  const appRows=await db.execute(
    `select applicant_person_id, status from da_organization_application where id=?`,
    [applicationId]
  )
  if(appRows.length!==1)return null

  const isApplicant=appRows[0].applicant_person_id===session.person_id
  let isAdmin=false
  if(!isApplicant){
    const staff=await new IdentitySessions(db).staff(token,"organization.review","platform")??
                await new IdentitySessions(db).staff(token,"organization.provision","platform")
    if(staff)isAdmin=true
  }

  if(!isApplicant&&!isAdmin)return null

  // Fetch current document record
  const docRows=await db.execute(
    `select storage_key, internal_name, mime_type, compression, original_byte_length, original_sha256, stored_byte_length, version
     from da_organization_application_document where application_id=? and is_current=true`,
    [applicationId]
  )
  if(docRows.length!==1)return null
  const doc=docRows[0]

  const rootDir=overrideRoot??process.env.DOGRUADRES_TAX_CERTIFICATE_DIR
  if(!rootDir)throw new InvalidTaxCertificate()

  const restored=await readPrivateTaxCertificate(rootDir,{
    storageKey:doc.storage_key,
    internalName:doc.internal_name,
    mimeType:doc.mime_type,
    compression:doc.compression,
    originalByteLength:Number(doc.original_byte_length),
    originalSha256:doc.original_sha256,
    storedByteLength:Number(doc.stored_byte_length),
  })

  const extension=doc.mime_type==="application/pdf"?"pdf":
                  doc.mime_type==="image/png"?"png":"jpg"
  return {
    content:restored,
    mimeType:doc.mime_type as TaxCertificateFormat["mimeType"],
    filename:`vergi-levhasi-${doc.version}.${extension}`,
    version:Number(doc.version),
  }
}
