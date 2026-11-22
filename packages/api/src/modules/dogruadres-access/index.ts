import { Module } from "@medusajs/framework/utils"
import DogruAdresAccessModuleService from "./service"
import { DOGRUADRES_ACCESS_MODULE } from "./constants"

export { DOGRUADRES_ACCESS_MODULE }

export default Module(DOGRUADRES_ACCESS_MODULE, {
  service: DogruAdresAccessModuleService,
})
