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
  tax_identifier:z.preprocess(v=>v===""?undefined:v,z.string().trim().regex(/^[0-9]{10,11}$/).optional()),
}).strict().superRefine((data,ctx)=>{
  if(!data.declared_activities.includes(data.primary_activity)){
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Primary activity must be declared",path:["primary_activity"]})
  }
  if(data.tax_identifier!==undefined){
    if(data.business_kind==="legal_company"&&data.tax_identifier.length!==10){
      ctx.addIssue({code:z.ZodIssueCode.custom,message:"Legal company requires 10-digit VKN",path:["tax_identifier"]})
    }
    if(data.business_kind==="individual_business"&&![10,11].includes(data.tax_identifier.length)){
      ctx.addIssue({code:z.ZodIssueCode.custom,message:"Individual business requires 10-digit VKN or 11-digit TCKN",path:["tax_identifier"]})
    }
  }
})
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
  const rows=await db.execute(`select id,business_kind,legal_name,landline_phone,tax_identifier,
      declared_activities,primary_activity,status,version,review_notes,organization_id,created_at,updated_at,
      to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time,
      (select mime_type from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_mime,
      (select original_byte_length from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_bytes,
      (select original_sha256 from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_sha256,
      (select version from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_version
    from da_organization_application
    where applicant_person_id=? and status in ('draft','withdrawn','submitted','correction_requested','rejected','approved')
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
      tax_identifier:r.tax_identifier??null,
      declared_activities:r.declared_activities,primary_activity:r.primary_activity,status:r.status,
      version:Number(r.version),
      review_notes:r.review_notes??null,
      organization_id:r.organization_id??null,
      created_at:r.created_at,updated_at:r.updated_at,
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
  if(found.length && !["draft","correction_requested"].includes(found[0].status))return {conflict:true as const}
  if(!found.length){
    if(input.expected_version!==0)return {conflict:true as const}
    await db.execute(`insert into da_organization_application
      (id,applicant_person_id,business_kind,legal_name,landline_phone,tax_identifier,
       declared_activities,primary_activity,status,version)
      values(?,?,?,?,?,?,?::jsonb,?,'draft',1)`,
      [input.application_id,session.person_id,input.business_kind,
        input.legal_name,input.landline_phone,input.tax_identifier??null,
        JSON.stringify(input.declared_activities),input.primary_activity])
  }else{
    if(Number(found[0].version)!==input.expected_version)return {conflict:true as const}
    const updated=await db.execute(`update da_organization_application
      set business_kind=?,legal_name=?,landline_phone=?,tax_identifier=?,
        declared_activities=?::jsonb,primary_activity=?,status='draft',
        version=version+1,updated_at=clock_timestamp()
      where id=? and applicant_person_id=? and status in ('draft','correction_requested') and version=?
      returning id`,
      [input.business_kind,input.legal_name,input.landline_phone,input.tax_identifier??null,
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
 * Requires mandatory completed fields, valid tax identifier (VKN/TCKN) and at least one verified stored document.
 * Transition to 'submitted' locks the draft against further client modification.
 * Duplicate VKN/TCKN is marked for confidential admin review without leaking existence to applicant.
 */
export async function submitOrganizationApplication(
  db:SecuritySql,
  token:string,
  value:unknown,
  overrideRoot?:string
) {
  const parsed=submitApplicationPayload.safeParse(value)
  if(!parsed.success)throw new IdentityAccessDenied()
  const input=parsed.data
  const session=await new IdentitySessions(db).current(token,false,false)
  if(!session)return null

  await db.execute(`select pg_advisory_xact_lock(hashtext('da-org-draft'),hashtext(?))`,
    [input.application_id])

  const rows=await db.execute(`select applicant_person_id, status, version,
      business_kind, legal_name, landline_phone, tax_identifier, declared_activities, primary_activity
    from da_organization_application where id=? for update`,[input.application_id])
  if(rows.length>1)throw new IdentityAccessDenied()
  if(rows.length!==1||rows[0].applicant_person_id!==session.person_id)return null
  if(!["draft","correction_requested"].includes(rows[0].status))return {conflict:true as const, missing_document:false as const, missing_tax_identifier:false as const}
  if(Number(rows[0].version)!==input.expected_version)return {conflict:true as const, missing_document:false as const, missing_tax_identifier:false as const}

  const app=rows[0]
  // 1. Mandatory Türkiye tax identifier (10-digit VKN or 11-digit TCKN per #44/#252)
  if(!app.tax_identifier||!/^[0-9]{10,11}$/.test(app.tax_identifier)){
    return {conflict:false as const, missing_document:false as const, missing_tax_identifier:true as const}
  }
  if(app.business_kind==="legal_company"&&app.tax_identifier.length!==10){
    return {conflict:false as const, missing_document:false as const, missing_tax_identifier:true as const}
  }

  // Prevent duplicate-tax-identifier race conditions across concurrent submissions (#44)
  await db.execute(
    `select pg_advisory_xact_lock(hashtext('da-org-tax-id'), hashtext(?))`,
    [app.tax_identifier]
  )

  // 2. Verify current document metadata
  const docRows=await db.execute(
    `select storage_key, internal_name, mime_type, compression, original_byte_length, original_sha256, stored_byte_length, version
     from da_organization_application_document where application_id=? and is_current=true`,
    [input.application_id]
  )
  if(docRows.length!==1){
    return {missing_document:true as const, missing_tax_identifier:false as const, conflict:false as const}
  }
  const doc=docRows[0]

  // 3. Fail-closed verification of actual immutable private file, size, gzip restoration and SHA-256
  const rootDir=overrideRoot??process.env.DOGRUADRES_TAX_CERTIFICATE_DIR
  if(!rootDir){
    return {missing_document:true as const, missing_tax_identifier:false as const, conflict:false as const}
  }
  try{
    const verified=await readPrivateTaxCertificate(rootDir,{
      storageKey:doc.storage_key,
      internalName:doc.internal_name,
      mimeType:doc.mime_type,
      compression:doc.compression,
      originalByteLength:Number(doc.original_byte_length),
      originalSha256:doc.original_sha256,
      storedByteLength:Number(doc.stored_byte_length),
    })
    if(!verified||verified.length!==Number(doc.original_byte_length)){
      return {missing_document:true as const, missing_tax_identifier:false as const, conflict:false as const}
    }
  }catch{
    return {missing_document:true as const, missing_tax_identifier:false as const, conflict:false as const}
  }

  // 4. Confidential duplicate review check (#44)
  const duplicateApps=await db.execute(
    `select id from da_organization_application
     where tax_identifier=? and status in ('submitted','approved') and id<>?`,
    [app.tax_identifier, input.application_id]
  )
  const duplicateOrgs=await db.execute(
    `select id from da_organization
     where tax_identifier=? and status='active' and deleted_at is null`,
    [app.tax_identifier]
  )
  const duplicateReviewRequired = duplicateApps.length > 0 || duplicateOrgs.length > 0

  // 5. Update status to 'submitted'
  const updated=await db.execute(
    `update da_organization_application
      set status='submitted', duplicate_review_required=?, version=version+1, updated_at=clock_timestamp()
      where id=? and applicant_person_id=? and status in ('draft','correction_requested') and version=?
      returning version`,
    [duplicateReviewRequired, input.application_id, session.person_id, input.expected_version]
  )
  if(updated.length!==1)return {conflict:true as const, missing_document:false as const, missing_tax_identifier:false as const}

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
    missing_tax_identifier:false as const,
    application_id:input.application_id,
    status:"submitted" as const,
    version:Number(updated[0].version)
  }
}

/**
 * Read the current tax certificate document for an application.
 * Permitted only to the authorized applicant Person OR platform Admin with explicit organization.review staff grant.
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
  let isReviewStaff=false
  if(!isApplicant){
    // Strictly organization.review on platform scope (no broad organization.provision bypass)
    const staff=await new IdentitySessions(db).staff(token,"organization.review","platform")
    if(staff)isReviewStaff=true
  }

  if(!isApplicant&&!isReviewStaff)return null

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

/**
 * List submitted applications queue for authorized platform review staff.
 * Permitted only with active organization.review grant on platform scope.
 */
export async function listSubmittedOrganizationApplications(
  db:SecuritySql,
  token:string,
  cursor?:OrganizationDraftCursor
) {
  const staff=await new IdentitySessions(db).staff(token,"organization.review","platform")
  if(!staff)return null

  const rows=await db.execute(
    `select id,applicant_person_id,business_kind,legal_name,landline_phone,tax_identifier,
       declared_activities,primary_activity,status,version,duplicate_review_required,
       created_at,updated_at,
       to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time,
       (select mime_type from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_mime,
       (select original_byte_length from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_bytes,
       (select original_sha256 from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_sha256,
       (select version from da_organization_application_document where application_id=da_organization_application.id and is_current=true limit 1) as doc_version
     from da_organization_application
     where status = 'submitted'
     ${cursor?"and (updated_at < ?::timestamptz or (updated_at = ?::timestamptz and id > ?))":""}
     order by updated_at desc, id asc limit 101`,
    cursor?[cursor.updatedAt,cursor.updatedAt,cursor.id]:[]
  )
  if(!Array.isArray(rows)||rows.length>101)throw new IdentityAccessDenied()
  const page=rows.slice(0,100)
  const last=page[page.length-1]
  if(rows.length>100 && (!last||!draftId.test(last.id)||
      typeof last.cursor_time!=="string"||!cursorTime.test(last.cursor_time)))
    throw new IdentityAccessDenied()
  const next_cursor=rows.length>100
    ? Buffer.from(JSON.stringify({t:last.cursor_time,id:last.id}),"utf8").toString("base64url")
    : null

  return {
    applications:page.map(r=>({
      id:r.id,
      applicant_person_id:r.applicant_person_id,
      business_kind:r.business_kind,
      legal_name:r.legal_name,
      landline_phone:r.landline_phone,
      tax_identifier:r.tax_identifier??null,
      declared_activities:r.declared_activities,
      primary_activity:r.primary_activity,
      status:r.status,
      version:Number(r.version),
      duplicate_review_required:Boolean(r.duplicate_review_required),
      created_at:r.created_at,
      updated_at:r.updated_at,
      has_document: r.doc_mime !== null && r.doc_mime !== undefined,
      document: (r.doc_mime !== null && r.doc_mime !== undefined) ? {
        mime_type: r.doc_mime,
        original_byte_length: Number(r.doc_bytes),
        original_sha256: r.doc_sha256,
        version: Number(r.doc_version),
      } : undefined
    })),
    next_cursor
  }
}

export const reviewApplicationPayload = z.object({
  application_id: z.string().regex(/^daorgapp_[0-9a-f]{32}$/),
  expected_version: z.number().int().positive(),
  decision: z.enum(["request_correction", "reject", "approve"]),
  notes: z.string().trim().min(2).max(1000).optional(),
}).strict()
export type ReviewApplicationPayload = z.infer<typeof reviewApplicationPayload>

/**
 * Perform an authorized review decision on a submitted application.
 * Permitted exclusively to platform review staff with 'organization.review' grant.
 * 'request_correction': requests edits from applicant with mandatory review notes.
 * 'reject': final rejection with mandatory review notes.
 * 'approve': creates da_organization and assigns applicant as protected owner in da_organization_membership.
 * Records complete audit events and security outbox entries in the Foundation transaction.
 */
export async function reviewOrganizationApplication(
  db: SecuritySql,
  token: string,
  value: unknown
) {
  const parsed = reviewApplicationPayload.safeParse(value)
  if (!parsed.success) throw new IdentityAccessDenied()
  const input = parsed.data

  const staff = await new IdentitySessions(db).staff(token, "organization.review", "platform")
  if (!staff) return null

  await db.execute(
    `select pg_advisory_xact_lock(hashtext('da-org-draft'), hashtext(?))`,
    [input.application_id]
  )

  const rows = await db.execute(
    `select id, applicant_person_id, business_kind, legal_name, landline_phone, tax_identifier,
            declared_activities, primary_activity, status, version, duplicate_review_required
     from da_organization_application where id=? for update`,
    [input.application_id]
  )
  if (rows.length !== 1) return null
  const app = rows[0]

  if (app.status !== "submitted") {
    return { conflict: true as const }
  }
  if (Number(app.version) !== input.expected_version) {
    return { conflict: true as const }
  }

  const staffSession = await new IdentitySessions(db).current(token, false, false)
  if (!staffSession) return null

  if (input.decision === "request_correction") {
    if (!input.notes) throw new IdentityAccessDenied()
    const updated = await db.execute(
      `update da_organization_application
       set status='correction_requested', review_notes=?, reviewed_by_person_id=?, reviewed_at=clock_timestamp(),
           version=version+1, updated_at=clock_timestamp()
       where id=? and status='submitted' and version=?
       returning version`,
      [input.notes, staffSession.person_id, input.application_id, input.expected_version]
    )
    if (updated.length !== 1) return { conflict: true as const }

    const auditId = "daaud_" + randomUUID()
    await db.execute(
      `insert into da_audit_event
        (id, actor_person_id, actor_type, actor_id, action, module, resource, target_id, occurred_at, created_at, updated_at)
        values (?,?,?,?,'organization.application_correction_requested','dogruadres-access','organization-application',?,clock_timestamp(),now(),now())`,
      [auditId, staffSession.person_id, staffSession.actor_type, staffSession.actor_id, input.application_id]
    )
    await db.execute(
      `insert into da_security_outbox(id, audit_event_id, created_at) values(?,?,now())`,
      [randomUUID(), auditId]
    )
    return {
      conflict: false as const,
      application_id: input.application_id,
      status: "correction_requested" as const,
      version: Number(updated[0].version)
    }
  }

  if (input.decision === "reject") {
    if (!input.notes) throw new IdentityAccessDenied()
    const updated = await db.execute(
      `update da_organization_application
       set status='rejected', review_notes=?, reviewed_by_person_id=?, reviewed_at=clock_timestamp(),
           version=version+1, updated_at=clock_timestamp()
       where id=? and status='submitted' and version=?
       returning version`,
      [input.notes, staffSession.person_id, input.application_id, input.expected_version]
    )
    if (updated.length !== 1) return { conflict: true as const }

    const auditId = "daaud_" + randomUUID()
    await db.execute(
      `insert into da_audit_event
        (id, actor_person_id, actor_type, actor_id, action, module, resource, target_id, occurred_at, created_at, updated_at)
        values (?,?,?,?,'organization.application_rejected','dogruadres-access','organization-application',?,clock_timestamp(),now(),now())`,
      [auditId, staffSession.person_id, staffSession.actor_type, staffSession.actor_id, input.application_id]
    )
    await db.execute(
      `insert into da_security_outbox(id, audit_event_id, created_at) values(?,?,now())`,
      [randomUUID(), auditId]
    )
    return {
      conflict: false as const,
      application_id: input.application_id,
      status: "rejected" as const,
      version: Number(updated[0].version)
    }
  }

  if (input.decision === "approve") {
    const orgId = "daorg_" + randomUUID().replaceAll("-", "")
    await db.execute(
      `insert into da_organization(id, name, status, tax_identifier, created_at, updated_at)
       values(?,?,'active',?,clock_timestamp(),clock_timestamp())`,
      [orgId, app.legal_name, app.tax_identifier]
    )

    const membershipId = "daom_" + randomUUID().replaceAll("-", "")
    await db.execute(
      `insert into da_organization_membership(id, organization_id, person_id, role, status, protected_owner, created_at, updated_at)
       values(?,?,?,'owner','active',true,clock_timestamp(),clock_timestamp())`,
      [membershipId, orgId, app.applicant_person_id]
    )

    const updated = await db.execute(
      `update da_organization_application
       set status='approved', organization_id=?, review_notes=?, reviewed_by_person_id=?, reviewed_at=clock_timestamp(),
           version=version+1, updated_at=clock_timestamp()
       where id=? and status='submitted' and version=?
       returning version`,
      [orgId, input.notes ?? null, staffSession.person_id, input.application_id, input.expected_version]
    )
    if (updated.length !== 1) return { conflict: true as const }

    const auditIdApprove = "daaud_" + randomUUID()
    const auditIdOrg = "daaud_" + randomUUID()
    const auditIdOwner = "daaud_" + randomUUID()

    await db.execute(
      `insert into da_audit_event
        (id, actor_person_id, actor_type, actor_id, action, module, resource, target_id, organization_id, occurred_at, created_at, updated_at)
        values
        (?,?,?,?,'organization.application_approved','dogruadres-access','organization-application',?,?,clock_timestamp(),now(),now()),
        (?,?,?,?,'organization.provisioned','dogruadres-access','organization',?,?,clock_timestamp(),now(),now()),
        (?,?,?,?,'organization.owner_assigned','dogruadres-access','membership',?,?,clock_timestamp(),now(),now())`,
      [
        auditIdApprove, staffSession.person_id, staffSession.actor_type, staffSession.actor_id, input.application_id, orgId,
        auditIdOrg, staffSession.person_id, staffSession.actor_type, staffSession.actor_id, orgId, orgId,
        auditIdOwner, staffSession.person_id, staffSession.actor_type, staffSession.actor_id, membershipId, orgId
      ]
    )
    await db.execute(
      `insert into da_security_outbox(id, audit_event_id, created_at)
       values (?,?,now()), (?,?,now()), (?,?,now())`,
      [randomUUID(), auditIdApprove, randomUUID(), auditIdOrg, randomUUID(), auditIdOwner]
    )

    return {
      conflict: false as const,
      application_id: input.application_id,
      status: "approved" as const,
      organization_id: orgId,
      version: Number(updated[0].version)
    }
  }

  throw new IdentityAccessDenied()
}
