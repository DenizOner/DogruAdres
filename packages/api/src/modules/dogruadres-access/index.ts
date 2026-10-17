import { Module } from "@medusajs/framework/utils"
import DogruAdresAccessModuleService from "./service"

export const DOGRUADRES_ACCESS_MODULE = "dogruadresAccess"

export default Module(DOGRUADRES_ACCESS_MODULE, {
  service: DogruAdresAccessModuleService,
})
