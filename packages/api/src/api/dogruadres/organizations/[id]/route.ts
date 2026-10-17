import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { requireOrganizationAccess } from "../../authorization"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { service } = await requireOrganizationAccess(req, req.params.id, "organization.read")
  const organization = await service.getOrganization(req.params.id)
  if (!organization || organization.status !== "active") {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Organization not found")
  }
  res.json({ organization: { id: organization.id, name: organization.name, status: organization.status } })
}
