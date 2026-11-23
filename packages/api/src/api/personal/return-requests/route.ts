import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
// 410 Gone — moved to /organization/return-requests (#482 Phase 4)
export const AUTHENTICATE=false
const gone=(res:MedusaResponse)=>res.status(410).json({message:"Moved to /organization/return-requests"})
export const GET=async(_req:MedusaRequest,res:MedusaResponse)=>gone(res)