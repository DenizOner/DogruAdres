import { Module } from "@medusajs/framework/utils"
import AuditIndexModuleService from "./service"

export const DOGRUADRES_AUDIT_INDEX_MODULE = "dogruadresAuditIndex"
export default Module(DOGRUADRES_AUDIT_INDEX_MODULE, { service: AuditIndexModuleService })
