import { Module } from "@medusajs/framework/utils"
import VehicleModuleService from "./service"
export const DOGRUADRES_VEHICLE_MODULE = "dogruadresVehicle"
export default Module(DOGRUADRES_VEHICLE_MODULE, { service: VehicleModuleService })
