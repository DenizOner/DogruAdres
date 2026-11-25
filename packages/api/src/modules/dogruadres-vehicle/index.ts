import { Module } from "@medusajs/framework/utils"
import VehicleModuleService from "./service"
import { DOGRUADRES_VEHICLE_MODULE } from "./constants"

export { DOGRUADRES_VEHICLE_MODULE }
export default Module(DOGRUADRES_VEHICLE_MODULE, { service: VehicleModuleService })
