import {createRequire} from "node:module"
import path from "node:path"
import {randomUUID} from "node:crypto"
import type {MedusaContainer} from "@medusajs/framework"
/** Unbound HTTP app factory. Native modules must already pass read-only startup.
 * Does not call Medusa application loaders, defaults, plugins, jobs or subscribers.
 * A runtime launcher must verify committed R1/flags and resources BEFORE binding.
 */
export async function createPersonalHttpApp(container:MedusaContainer) {
  const frameworkRequire=createRequire(require.resolve("@medusajs/framework"))
  const express=frameworkRequire("express")
  const {ApiLoader,expressLoader}=await import("@medusajs/framework/http")
  const app=express()
  app.disable("x-powered-by")
  app.use((req:any,_res:any,next:any)=>{req.scope=container.createScope();req.requestId=randomUUID();next()})
  const http=await expressLoader({app,container})
  try {
    const nativeApi=path.join(path.dirname(require.resolve("@medusajs/medusa")),"api")
    await new ApiLoader({app,container,sourceDir:[path.join(process.cwd(),"src/api"),nativeApi]}).load()
    return {app,close:http.shutdown}
  }catch(error){await http.shutdown();throw error}
}