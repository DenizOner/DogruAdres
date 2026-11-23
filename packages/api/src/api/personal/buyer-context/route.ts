import type {MedusaRequest,MedusaResponse} from "@medusajs/framework/http"
// 410 Gone — moved to /organization/buyer-context (#482 Phase 4)
export const AUTHENTICATE=false
const gone=(res:MedusaResponse)=>res.status(410).json({message:"Moved to /organization/buyer-context"})
export const GET=async(_req:MedusaRequest,res:MedusaResponse)=>gone(res)
export const POST=async(_req:MedusaRequest,res:MedusaResponse)=>gone(res)